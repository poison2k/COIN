using System.Data.Common;
using Coin.Domain.Katalog;
using Coin.Domain.Startseite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;

namespace Coin.Infrastructure.Persistenz;

/// <summary>
/// Datenzugriff der Startseite (Feature startseite Abschnitt 4 und 6, ADR-0030). Jede Leseoperation ist genau ein
/// SQL-Befehl (AK-6): Konfiguration mit Logo-Metadaten ohne Bytes, Kennzahlen als Aggregation, Neueste über
/// <c>ix_coin_typ_erstellt</c>, Meistausgegebene über den partiellen Index der aktiven Ausgaben. Die Tabelle
/// <c>exemplar</c> und Empfängerspalten werden nie gelesen. Schreiben per SQL in einer Transaktion mit Sperre.
/// </summary>
internal sealed class StartseiteRepository(CoinDbContext db) : IStartseiteRepository
{
    private const string StandSql =
        """
        SELECT k.version, k.reihenfolge, k.kopf_aktiv, k.kopf_titel, k.kopf_untertitel, k.infotext_aktiv, k.infotext,
               k.kennzahlen_aktiv, k.neueste_aktiv, k.neueste_anzahl, k.meistausgegeben_aktiv, k.meistausgegeben_anzahl,
               k.geaendert_am, g.anzeigename,
               lb.sha256, lb.alternativtext, lb.format, lb.breite, lb.hoehe, lb.groesse_bytes,
               ls.sha256, ls.alternativtext, ls.format, ls.breite, ls.hoehe, ls.groesse_bytes
        FROM (SELECT 1) AS d
        LEFT JOIN startseite_konfiguration k ON k.id = 1
        LEFT JOIN benutzer g ON g.id = k.geaendert_von
        LEFT JOIN startseite_logo lb ON lb.platz = 'bereitsteller'
        LEFT JOIN startseite_logo ls ON ls.platz = 'software'
        """;

    public Task<StartseiteStand> StandAsync(CancellationToken ct) => StandLesenAsync(ct);

    public async Task<StartseiteKennzahlen> KennzahlenAsync(CancellationToken ct)
    {
        await using var befehl = await BefehlAsync(
            """
            SELECT count(*)::int, coalesce(sum(c.auflage), 0)::bigint,
                   (SELECT count(*)::int FROM ausgabe a WHERE a.storniert_am IS NULL)
            FROM coin_typ c
            """,
            ct);
        await using var leser = await befehl.ExecuteReaderAsync(ct);
        await leser.ReadAsync(ct);
        return new StartseiteKennzahlen(leser.GetInt32(0), leser.GetInt64(1), leser.GetInt32(2));
    }

    public async Task<IReadOnlyList<NeuerCoin>> NeuesteAsync(int anzahl, CancellationToken ct)
    {
        await using var befehl = await BefehlAsync(
            """
            SELECT c.id, c.name, c.herausgeber, b.sha256
            FROM coin_typ c
            LEFT JOIN coin_bild b ON b.coin_id = c.id
            ORDER BY c.erstellt_am DESC, c.id DESC
            LIMIT @anzahl
            """,
            ct);
        befehl.Parameters.Add(new NpgsqlParameter("anzahl", anzahl));
        await using var leser = await befehl.ExecuteReaderAsync(ct);
        var liste = new List<NeuerCoin>();
        while (await leser.ReadAsync(ct))
        {
            liste.Add(new NeuerCoin(
                leser.GetGuid(0),
                leser.GetString(1),
                leser.GetString(2),
                leser.IsDBNull(3) ? null : leser.GetString(3).Trim()));
        }

        return liste;
    }

    public async Task<IReadOnlyList<AusgegebenerCoin>> MeistausgegebeneAsync(int anzahl, CancellationToken ct)
    {
        await using var befehl = await BefehlAsync(
            """
            SELECT c.id, c.name, c.herausgeber, z.anzahl
            FROM (SELECT a.coin_id, count(*)::int AS anzahl FROM ausgabe a WHERE a.storniert_am IS NULL GROUP BY a.coin_id) z
            JOIN coin_typ c ON c.id = z.coin_id
            ORDER BY z.anzahl DESC, lower(c.name), c.id
            LIMIT @anzahl
            """,
            ct);
        befehl.Parameters.Add(new NpgsqlParameter("anzahl", anzahl));
        await using var leser = await befehl.ExecuteReaderAsync(ct);
        var liste = new List<AusgegebenerCoin>();
        while (await leser.ReadAsync(ct))
        {
            liste.Add(new AusgegebenerCoin(leser.GetGuid(0), leser.GetString(1), leser.GetString(2), leser.GetInt32(3)));
        }

        return liste;
    }

    public async Task<LogoDatei?> LogoAsync(LogoPlatz platz, CancellationToken ct)
    {
        await using var befehl = await BefehlAsync("SELECT inhalt, format, sha256 FROM startseite_logo WHERE platz = @platz", ct);
        befehl.Parameters.Add(new NpgsqlParameter("platz", platz.Name()));
        await using var leser = await befehl.ExecuteReaderAsync(ct);
        if (!await leser.ReadAsync(ct))
        {
            return null;
        }

        return new LogoDatei(leser.GetFieldValue<byte[]>(0), Format(leser.GetString(1)), leser.GetString(2).Trim());
    }

    public async Task<IStartseiteSperre> SperrenAsync(CancellationToken ct)
    {
        var transaktion = await db.Database.BeginTransactionAsync(ct);
        try
        {
            await using (var sperre = await BefehlAsync("SELECT version FROM startseite_konfiguration WHERE id = 1 FOR UPDATE", ct))
            {
                await sperre.ExecuteScalarAsync(ct);
            }

            return new Sperre(db, transaktion, await StandLesenAsync(ct));
        }
        catch
        {
            await transaktion.DisposeAsync();
            throw;
        }
    }

    private async Task<StartseiteStand> StandLesenAsync(CancellationToken ct)
    {
        await using var befehl = await BefehlAsync(StandSql, ct);
        await using var leser = await befehl.ExecuteReaderAsync(ct);
        await leser.ReadAsync(ct);
        if (leser.IsDBNull(0))
        {
            return StartseiteStand.Standard;
        }

        var reihenfolge = leser.GetFieldValue<string[]>(1)
            .Select(n => StartseiteNamen.BlockAus(n) ?? throw new InvalidOperationException("Unbekannter Block in startseite_konfiguration."))
            .ToArray();
        var konfiguration = new StartseiteKonfiguration(
            reihenfolge,
            KopfAktiv: leser.GetBoolean(2),
            Titel: leser.GetString(3),
            Untertitel: leser.GetString(4),
            LogoBereitsteller: LogoLesen(leser, 14),
            LogoSoftware: LogoLesen(leser, 20),
            InfotextAktiv: leser.GetBoolean(5),
            Infotext: leser.GetString(6),
            KennzahlenAktiv: leser.GetBoolean(7),
            NeuesteAktiv: leser.GetBoolean(8),
            NeuesteAnzahl: leser.GetInt16(9),
            MeistausgegebeneAktiv: leser.GetBoolean(10),
            MeistausgegebeneAnzahl: leser.GetInt16(11));
        return new StartseiteStand(
            konfiguration,
            leser.GetInt32(0),
            leser.GetFieldValue<DateTimeOffset>(12).ToUniversalTime(),
            leser.IsDBNull(13) ? null : leser.GetString(13));
    }

    private static StartseiteLogo? LogoLesen(DbDataReader leser, int start) =>
        leser.IsDBNull(start)
            ? null
            : new StartseiteLogo(
                leser.GetString(start).Trim(),
                leser.GetString(start + 1),
                Format(leser.GetString(start + 2)),
                leser.GetInt32(start + 3),
                leser.GetInt32(start + 4),
                leser.GetInt32(start + 5));

    /// <summary>Unbekanntes Format bedeutet inkonsistente Daten: sichtbar machen (500 + Log) statt zu verschleiern.</summary>
    private static BildFormat Format(string name) =>
        StartseiteNamen.FormatAus(name) ?? throw new InvalidOperationException("Unbekanntes Bildformat in startseite_logo.");

    /// <summary>Befehl auf der Verbindung des Kontexts, in der laufenden Transaktion (falls vorhanden).</summary>
    private async Task<DbCommand> BefehlAsync(string sql, CancellationToken ct)
    {
        await db.Database.OpenConnectionAsync(ct);
        var befehl = db.Database.GetDbConnection().CreateCommand();
        befehl.CommandText = sql;
        befehl.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
        return befehl;
    }

    private sealed class Sperre(CoinDbContext db, IDbContextTransaction transaktion, StartseiteStand stand) : IStartseiteSperre
    {
        public StartseiteStand Stand { get; } = stand;

        public async Task<bool> SchreibenAsync(StartseiteSchreibvorgang vorgang, CancellationToken ct)
        {
            ArgumentNullException.ThrowIfNull(vorgang);
            var k = vorgang.Konfiguration;
            var reihenfolge = k.Reihenfolge.Select(b => b.Name()).ToArray();

            int zeilen;
            if (vorgang.AlteVersion == 0)
            {
                // Fehlt die Zeile, entscheidet der Primärschlüssel: ein gleichzeitiges erstes Speichern wartet hier und
                // fügt nichts ein (ADR-0030 Punkt 5).
                zeilen = await db.Database.ExecuteSqlInterpolatedAsync(
                    $"""
                    INSERT INTO startseite_konfiguration (id, version, reihenfolge, kopf_aktiv, kopf_titel, kopf_untertitel,
                        infotext_aktiv, infotext, kennzahlen_aktiv, neueste_aktiv, neueste_anzahl, meistausgegeben_aktiv,
                        meistausgegeben_anzahl, geaendert_am, geaendert_von)
                    VALUES (1, {vorgang.NeueVersion}, {reihenfolge}::varchar(20)[], {k.KopfAktiv}, {k.Titel}, {k.Untertitel},
                        {k.InfotextAktiv}, {k.Infotext}, {k.KennzahlenAktiv}, {k.NeuesteAktiv}, {(short)k.NeuesteAnzahl},
                        {k.MeistausgegebeneAktiv}, {(short)k.MeistausgegebeneAnzahl}, {vorgang.Zeitpunkt}, {vorgang.AkteurId})
                    ON CONFLICT (id) DO NOTHING
                    """,
                    ct);
            }
            else
            {
                zeilen = await db.Database.ExecuteSqlInterpolatedAsync(
                    $"""
                    UPDATE startseite_konfiguration SET version = {vorgang.NeueVersion}, reihenfolge = {reihenfolge}::varchar(20)[],
                        kopf_aktiv = {k.KopfAktiv}, kopf_titel = {k.Titel}, kopf_untertitel = {k.Untertitel},
                        infotext_aktiv = {k.InfotextAktiv}, infotext = {k.Infotext}, kennzahlen_aktiv = {k.KennzahlenAktiv},
                        neueste_aktiv = {k.NeuesteAktiv}, neueste_anzahl = {(short)k.NeuesteAnzahl},
                        meistausgegeben_aktiv = {k.MeistausgegebeneAktiv}, meistausgegeben_anzahl = {(short)k.MeistausgegebeneAnzahl},
                        geaendert_am = {vorgang.Zeitpunkt}, geaendert_von = {vorgang.AkteurId}
                    WHERE id = 1 AND version = {vorgang.AlteVersion}
                    """,
                    ct);
            }

            if (zeilen != 1)
            {
                return false;
            }

            foreach (var logo in vorgang.Logos)
            {
                await LogoSchreibenAsync(logo, vorgang, ct);
            }

            foreach (var aenderung in vorgang.Aenderungen)
            {
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"""
                    INSERT INTO startseite_audit (id, zeitpunkt, akteur_id, version, art, ziel, alt, neu)
                    VALUES ({Guid.CreateVersion7()}, {vorgang.Zeitpunkt}, {vorgang.AkteurId}, {vorgang.NeueVersion},
                        {aenderung.Art.ToString()}, {aenderung.Ziel}, {aenderung.Alt}, {aenderung.Neu})
                    """,
                    ct);
            }

            await transaktion.CommitAsync(ct);
            return true;
        }

        public ValueTask DisposeAsync() => transaktion.DisposeAsync();

        private Task LogoSchreibenAsync(LogoSchreiben logo, StartseiteSchreibvorgang vorgang, CancellationToken ct) => logo switch
        {
            LogoSchreiben.Setzen setzen => db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                INSERT INTO startseite_logo (platz, inhalt, format, groesse_bytes, breite, hoehe, sha256, alternativtext,
                    hochgeladen_am, hochgeladen_von)
                VALUES ({setzen.Platz.Name()}, {setzen.Inhalt}, {setzen.Logo.Format.Name()}, {setzen.Inhalt.Length},
                    {setzen.Logo.Breite}, {setzen.Logo.Hoehe}, {setzen.Logo.Sha256}, {setzen.Logo.Alternativtext},
                    {vorgang.Zeitpunkt}, {vorgang.AkteurId})
                ON CONFLICT (platz) DO UPDATE SET inhalt = EXCLUDED.inhalt, format = EXCLUDED.format,
                    groesse_bytes = EXCLUDED.groesse_bytes, breite = EXCLUDED.breite, hoehe = EXCLUDED.hoehe,
                    sha256 = EXCLUDED.sha256, alternativtext = EXCLUDED.alternativtext,
                    hochgeladen_am = EXCLUDED.hochgeladen_am, hochgeladen_von = EXCLUDED.hochgeladen_von
                """,
                ct),
            LogoSchreiben.Alternativtext text => db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE startseite_logo SET alternativtext = {text.Text} WHERE platz = {text.Platz.Name()}",
                ct),
            LogoSchreiben.Entfernen entfernen => db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM startseite_logo WHERE platz = {entfernen.Platz.Name()}",
                ct),
            _ => throw new InvalidOperationException("Unbekannte Logo-Änderung."),
        };
    }
}
