using Coin.Domain.Ausgaben;
using Coin.Domain.Gemeinsam;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;

namespace Coin.Infrastructure.Persistenz;

/// <summary>
/// Exemplare und Ausgaben (ADR-0020). Schreiben per SQL in einer Transaktion mit gesperrter Coin-Zeile, Lesen ohne
/// Tracking. Der Exemplar-Status wird aus der aktiven Ausgabe abgeleitet.
/// </summary>
internal sealed class AusgabeRepository(CoinDbContext db) : IAusgabeRepository
{
    public async Task<ICoinSperre?> SperrenAsync(Guid coinId, CancellationToken ct)
    {
        var transaktion = await db.Database.BeginTransactionAsync(ct);
        try
        {
            var zeilen = await db.Database
                .SqlQuery<int?>($"SELECT auflage AS \"Value\" FROM coin_typ WHERE id = {coinId} FOR UPDATE")
                .ToListAsync(ct);
            if (zeilen.Count == 0)
            {
                await transaktion.DisposeAsync();
                return null;
            }

            // Die Kennung ist unveränderlich (Trigger); gelesen unter derselben Sperre (zertifikat-erzeugen AK-3).
            var kennung = await db.Database
                .SqlQuery<string>($"SELECT kennung AS \"Value\" FROM coin_typ WHERE id = {coinId}")
                .SingleAsync(ct);
            return new CoinSperre(db, transaktion, coinId, zeilen[0], kennung);
        }
        catch
        {
            await transaktion.DisposeAsync();
            throw;
        }
    }

    public async Task<ExemplarUebersicht?> ExemplareAsync(
        Guid coinId, ExemplarStatus? status, int seite, int groesse, CancellationToken ct)
    {
        var aktive = db.Ausgaben.AsNoTracking().Where(a => a.CoinId == coinId && a.StorniertAm == null);
        var alle = db.Exemplare.AsNoTracking().Where(e => e.CoinId == coinId);

        // Auflage und beide Zählungen aus einer Abfrage (ein Snapshot), damit die Kennzahlen zueinander passen.
        var zahlen = await db.Coins.AsNoTracking().Where(c => c.Id == coinId)
            .Select(c => new
            {
                c.Auflage,
                Exemplare = alle.Count(),
                Ausgegeben = aktive.Count(),
            })
            .FirstOrDefaultAsync(ct);
        if (zahlen is null)
        {
            return null;
        }

        var kennzahlen = new Kennzahlen(zahlen.Auflage, zahlen.Ausgegeben, zahlen.Exemplare - zahlen.Ausgegeben);

        var abfrage = alle.Select(e => new
        {
            e.Nummer,
            Ausgegeben = aktive.Any(a => a.ExemplarNummer == e.Nummer),
        });
        abfrage = status switch
        {
            ExemplarStatus.Ausgegeben => abfrage.Where(e => e.Ausgegeben),
            ExemplarStatus.Verfuegbar => abfrage.Where(e => !e.Ausgegeben),
            _ => abfrage,
        };

        var gesamt = await abfrage.CountAsync(ct);
        if (Suchmuster.Versatz(seite, groesse) is not { } versatz)
        {
            return new ExemplarUebersicht(kennzahlen, new Seite<Exemplar>([], gesamt, seite, groesse));
        }

        var eintraege = await abfrage.OrderBy(e => e.Nummer).Skip(versatz).Take(groesse).ToListAsync(ct);
        return new ExemplarUebersicht(
            kennzahlen,
            new Seite<Exemplar>(
                [.. eintraege.Select(e => new Exemplar(e.Nummer, e.Ausgegeben ? ExemplarStatus.Ausgegeben : ExemplarStatus.Verfuegbar))],
                gesamt,
                seite,
                groesse));
    }

    public async Task<Seite<AusgabeEintrag>?> HistorieAsync(
        Guid coinId, bool? storniert, int seite, int groesse, CancellationToken ct)
    {
        if (!await db.Coins.AsNoTracking().AnyAsync(c => c.Id == coinId, ct))
        {
            return null;
        }

        var abfrage = db.Ausgaben.AsNoTracking().Where(a => a.CoinId == coinId);
        abfrage = storniert switch
        {
            true => abfrage.Where(a => a.StorniertAm != null),
            false => abfrage.Where(a => a.StorniertAm == null),
            null => abfrage,
        };

        var gesamt = await abfrage.CountAsync(ct);
        if (Suchmuster.Versatz(seite, groesse) is not { } versatz)
        {
            return new Seite<AusgabeEintrag>([], gesamt, seite, groesse);
        }

        var zeilen = await Lesesicht(abfrage.OrderByDescending(a => a.ErfasstAm).ThenByDescending(a => a.Id))
            .Skip(versatz)
            .Take(groesse)
            .ToListAsync(ct);
        return new Seite<AusgabeEintrag>([.. zeilen.Select(Eintrag)], gesamt, seite, groesse);
    }

    public async Task<AusgabeEintrag?> FindenAsync(Guid ausgabeId, CancellationToken ct)
    {
        var zeile = await Lesesicht(db.Ausgaben.AsNoTracking().Where(a => a.Id == ausgabeId)).FirstOrDefaultAsync(ct);
        return zeile is null ? null : Eintrag(zeile);
    }

    public async Task<AusgabeEintrag?> FindenAsync(Guid coinId, Guid ausgabeId, CancellationToken ct)
    {
        var zeile = await Lesesicht(db.Ausgaben.AsNoTracking().Where(a => a.Id == ausgabeId && a.CoinId == coinId))
            .FirstOrDefaultAsync(ct);
        return zeile is null ? null : Eintrag(zeile);
    }

    private static IQueryable<AusgabeZeile> Lesesicht(IQueryable<AusgabeDatensatz> abfrage) =>
        abfrage.Select(a => new AusgabeZeile(
            a,
            a.Erfasser.Anzeigename,
            a.Stornierer != null ? a.Stornierer.Anzeigename : null));

    private static AusgabeEintrag Eintrag(AusgabeZeile zeile) =>
        Eintrag(zeile.Ausgabe, zeile.ErfasserName, zeile.StorniererName);

    /// <summary>Lesesicht einer Ausgabe aus Datensatz und Akteursnamen (auch für <see cref="ZertifikatRepository"/>).</summary>
    internal static AusgabeEintrag Eintrag(AusgabeDatensatz a, string erfasserName, string? storniererName)
    {
        return new AusgabeEintrag(
            a.Id,
            a.ExemplarNummer,
            a.Zertifikatsnummer,
            Angaben(a),
            a.ErfasstAm.ToUniversalTime(),
            new Akteur(a.ErfasstVon, erfasserName),
            a is { StorniertAm: { } am, StorniertVon: { } von, StornoGrund: { } grund }
                ? new StornoEintrag(am.ToUniversalTime(), new Akteur(von, storniererName ?? string.Empty), grund)
                : null);
    }

    internal static AusgabeAngaben Angaben(AusgabeDatensatz a) => new(
        a.EmpfaengerName, a.EmpfaengerDienstgrad, a.EmpfaengerDienststelle, a.Datum, a.Gelegenheit, a.Begruendung,
        a.AusgebendeStelle);

    private sealed record AusgabeZeile(AusgabeDatensatz Ausgabe, string ErfasserName, string? StorniererName);

    /// <summary>Transaktion mit gesperrter Coin-Zeile; Entsorgen ohne Abschließen rollt zurück.</summary>
    private sealed class CoinSperre(CoinDbContext db, IDbContextTransaction transaktion, Guid coinId, int? auflage, string kennung)
        : ICoinSperre
    {
        public int? Auflage { get; } = auflage;

        public string Kennung { get; } = kennung;

        public async Task<int?> NaechsteFreieNummerAsync(CancellationToken ct)
        {
            var nummern = await db.Database.SqlQuery<int>(
                    $"""
                    SELECT e.nummer AS "Value" FROM exemplar e
                    WHERE e.coin_id = {coinId}
                      AND NOT EXISTS (SELECT 1 FROM ausgabe a
                                      WHERE a.coin_id = e.coin_id AND a.exemplar_nummer = e.nummer AND a.storniert_am IS NULL)
                    ORDER BY e.nummer
                    LIMIT 1
                    """)
                .ToListAsync(ct);
            return nummern.Count == 0 ? null : nummern[0];
        }

        public Task<bool> IstAusgegebenAsync(int nummer, CancellationToken ct) =>
            db.Ausgaben.AnyAsync(a => a.CoinId == coinId && a.ExemplarNummer == nummer && a.StorniertAm == null, ct);

        public Task<int?> HoechsteJeAusgegebeneNummerAsync(CancellationToken ct) =>
            db.Ausgaben.Where(a => a.CoinId == coinId).MaxAsync(a => (int?)a.ExemplarNummer, ct);

        public async Task<bool> AusgabeHinzufuegenAsync(Ausgabe ausgabe, CancellationToken ct)
        {
            var g = ausgabe.Angaben;
            var nummer = ausgabe.Zertifikatsnummer
                ?? throw new InvalidOperationException("Eine Ausgabe ohne Zertifikatsnummer kann nicht gespeichert werden.");
            try
            {
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"""
                    INSERT INTO ausgabe (id, coin_id, exemplar_nummer, zertifikatsnummer, empfaenger_name,
                                         empfaenger_dienstgrad, empfaenger_dienststelle, datum, gelegenheit, begruendung,
                                         ausgebende_stelle, erfasst_am, erfasst_von)
                    VALUES ({ausgabe.Id}, {ausgabe.CoinId}, {ausgabe.ExemplarNummer}, {nummer}, {g.EmpfaengerName},
                            {g.EmpfaengerDienstgrad}, {g.EmpfaengerDienststelle}, {g.Datum}, {g.Gelegenheit},
                            {g.Begruendung}, {g.AusgebendeStelle}, {ausgabe.ErfasstAm}, {ausgabe.ErfasstVon})
                    """,
                    ct);
            }
            // Beide partiellen Indizes trotz Sperre verletzt → 409 exemplar_ausgegeben, nie 500 (AK-4).
            catch (PostgresException ex) when (ex is
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: AusgabeKonfiguration.IndexAktiv or AusgabeKonfiguration.IndexZertifikatsnummerAktiv,
            })
            {
                return false;
            }

            await AuditAsync(ausgabe, AusgabeAuditKonfiguration.Erfasst, ausgabe.ErfasstVon, ausgabe.ErfasstAm, null, ct);
            return true;
        }

        public async Task<Ausgabe?> AusgabeLadenAsync(Guid ausgabeId, CancellationToken ct)
        {
            var a = await db.Ausgaben.AsNoTracking().FirstOrDefaultAsync(x => x.Id == ausgabeId && x.CoinId == coinId, ct);
            if (a is null)
            {
                return null;
            }

            var storno = a is { StorniertAm: { } am, StorniertVon: { } von, StornoGrund: { } grund }
                ? new Storno(am, von, grund)
                : null;
            return Ausgabe.Wiederherstellen(
                a.Id, a.CoinId, a.ExemplarNummer, a.Zertifikatsnummer, Angaben(a), a.ErfasstVon, a.ErfasstAm, storno);
        }

        public async Task StornoSpeichernAsync(Ausgabe ausgabe, CancellationToken ct)
        {
            var storno = ausgabe.Storno ?? throw new InvalidOperationException("Die Ausgabe ist nicht storniert.");
            var geaendert = await db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                UPDATE ausgabe SET storniert_am = {storno.Am}, storniert_von = {storno.Von}, storno_grund = {storno.Grund}
                WHERE id = {ausgabe.Id} AND storniert_am IS NULL
                """,
                ct);
            if (geaendert != 1)
            {
                throw new InvalidOperationException("Das Storno konnte nicht gespeichert werden.");
            }

            await AuditAsync(ausgabe, AusgabeAuditKonfiguration.Storniert, storno.Von, storno.Am, storno.Grund, ct);
        }

        public async Task AuflageErhoehenAsync(int auflage, int von, int bis, CancellationToken ct)
        {
            await AuflageSetzenAsync(auflage, ct);
            await ExemplareErzeugenAsync(db, coinId, von, bis, ct);
        }

        public async Task AuflageSenkenAsync(int auflage, int von, int bis, CancellationToken ct)
        {
            await MitLangemTimeoutAsync(
                db,
                () => db.Database.ExecuteSqlInterpolatedAsync(
                    $"DELETE FROM exemplar WHERE coin_id = {coinId} AND nummer BETWEEN {von} AND {bis}", ct));
            await AuflageSetzenAsync(auflage, ct);
        }

        public async Task<bool> NameVergebenAsync(string name, string herausgeber, CancellationToken ct)
        {
            // Vergleich mit lower() in PostgreSQL, dieselbe Semantik wie ux_coin_typ_name_herausgeber.
            var treffer = await db.Database.SqlQuery<int>(
                    $"""
                    SELECT 1 AS "Value" FROM coin_typ
                    WHERE id <> {coinId} AND lower(name) = lower({name}) AND lower(herausgeber) = lower({herausgeber})
                    LIMIT 1
                    """)
                .ToListAsync(ct);
            return treffer.Count > 0;
        }

        public async Task<bool> StammdatenSetzenAsync(string name, string herausgeber, string? beschreibung, CancellationToken ct)
        {
            try
            {
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"UPDATE coin_typ SET name = {name}, herausgeber = {herausgeber}, beschreibung = {beschreibung} WHERE id = {coinId}",
                    ct);
                return true;
            }
            catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                return false;
            }
        }

        public Task AbschliessenAsync(CancellationToken ct) => transaktion.CommitAsync(ct);

        public ValueTask DisposeAsync() => transaktion.DisposeAsync();

        private Task AuflageSetzenAsync(int wert, CancellationToken ct) =>
            db.Database.ExecuteSqlInterpolatedAsync($"UPDATE coin_typ SET auflage = {wert} WHERE id = {coinId}", ct);

        private Task AuditAsync(Ausgabe ausgabe, string art, Guid akteur, DateTimeOffset zeitpunkt, string? grund, CancellationToken ct) =>
            db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                INSERT INTO ausgabe_audit (id, zeitpunkt, akteur_id, ausgabe_id, coin_id, exemplar_nummer, art, grund)
                VALUES ({Guid.CreateVersion7()}, {zeitpunkt}, {akteur}, {ausgabe.Id}, {ausgabe.CoinId},
                        {ausgabe.ExemplarNummer}, {art}, {grund})
                """,
                ct);
    }

    /// <summary>
    /// Bewusst längeres Timeout für das Erzeugen und Löschen von Exemplaren: bei Auflagen bis 1.000.000 betrifft ein
    /// Befehl entsprechend viele Zeilen (QA-Review coin-ausgaben, Runde 1).
    /// </summary>
    internal static readonly TimeSpan ExemplarBefehlTimeout = TimeSpan.FromSeconds(120);

    /// <summary>Erzeugt die Exemplare <paramref name="von"/> bis <paramref name="bis"/> per <c>generate_series</c> (ADR-0020 Punkt 2).</summary>
    internal static Task ExemplareErzeugenAsync(CoinDbContext db, Guid coinId, int von, int bis, CancellationToken ct) =>
        MitLangemTimeoutAsync(
            db,
            () => db.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO exemplar (coin_id, nummer) SELECT {coinId}, generate_series({von}, {bis})", ct));

    /// <summary>Setzt <see cref="ExemplarBefehlTimeout"/> nur für <paramref name="befehl"/> und stellt danach den vorherigen Wert wieder her.</summary>
    private static async Task MitLangemTimeoutAsync(CoinDbContext db, Func<Task<int>> befehl)
    {
        var vorher = db.Database.GetCommandTimeout();
        db.Database.SetCommandTimeout(ExemplarBefehlTimeout);
        try
        {
            await befehl();
        }
        finally
        {
            db.Database.SetCommandTimeout(vorher);
        }
    }
}
