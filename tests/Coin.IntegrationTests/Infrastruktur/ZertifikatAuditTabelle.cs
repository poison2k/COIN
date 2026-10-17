using Npgsql;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>Eine Zeile der Tabelle <c>zertifikat_audit</c> (zertifikat-erzeugen, Abschnitt 6, ADR-0029).</summary>
public sealed record ZertifikatAuditZeile(
    Guid Id,
    DateTimeOffset Zeitpunkt,
    Guid AkteurId,
    Guid AusgabeId,
    Guid CoinId,
    string Zertifikatsnummer,
    int? VorlageVersion,
    string Art);

/// <summary>
/// Direkter Zugriff auf <c>zertifikat_audit</c> der Test-Datenbank, unabhängig von den Typen der Infrastruktur
/// (zertifikat-erzeugen AK-20). Rohes SQL für Trigger-Prüfungen.
/// </summary>
public sealed class ZertifikatAuditTabelle(string connectionString)
{
    /// <summary>Alle Einträge, nach Zeitpunkt und Id.</summary>
    public async Task<IReadOnlyList<ZertifikatAuditZeile>> AuditAsync()
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            """
            SELECT id, zeitpunkt, akteur_id, ausgabe_id, coin_id, zertifikatsnummer, vorlage_version, art
            FROM zertifikat_audit ORDER BY zeitpunkt, id
            """,
            verbindung);
        await using var leser = await befehl.ExecuteReaderAsync();
        var zeilen = new List<ZertifikatAuditZeile>();
        while (await leser.ReadAsync())
        {
            zeilen.Add(new ZertifikatAuditZeile(
                leser.GetGuid(0),
                leser.GetFieldValue<DateTimeOffset>(1),
                leser.GetGuid(2),
                leser.GetGuid(3),
                leser.GetGuid(4),
                leser.GetString(5),
                leser.IsDBNull(6) ? null : leser.GetInt32(6),
                leser.GetString(7)));
        }

        return zeilen;
    }

    /// <summary>Anzahl der Einträge; <c>-1</c>, wenn die Tabelle (noch) fehlt.</summary>
    public async Task<long> AnzahlAsync()
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            "SELECT CASE WHEN to_regclass('zertifikat_audit') IS NULL THEN -1 ELSE (SELECT count(*) FROM zertifikat_audit) END",
            verbindung);
        return (long)(await befehl.ExecuteScalarAsync())!;
    }

    /// <summary>Gesamter Inhalt der Tabelle als Text (für die Suche nach Testwerten).</summary>
    public async Task<string> AlsTextAsync()
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            "SELECT coalesce(string_agg(a::text, E'\\n'), '') FROM zertifikat_audit a", verbindung);
        return (string)(await befehl.ExecuteScalarAsync())!;
    }

    /// <summary>Spaltennamen, alphabetisch.</summary>
    public async Task<IReadOnlyList<string>> SpaltenAsync()
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'zertifikat_audit' ORDER BY column_name", verbindung);
        await using var leser = await befehl.ExecuteReaderAsync();
        var spalten = new List<string>();
        while (await leser.ReadAsync())
        {
            spalten.Add(leser.GetString(0));
        }

        return spalten;
    }

    /// <summary>Führt rohes SQL aus und liefert die Ausnahme (oder <c>null</c>, wenn es durchlief).</summary>
    public async Task<Exception?> RohAusfuehrenAsync(string sql)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        try
        {
            await befehl.ExecuteNonQueryAsync();
            return null;
        }
        catch (Exception ex)
        {
            return ex;
        }
    }

    /// <summary>Führt eine Abfrage mit einem Wert aus.</summary>
    public async Task<object?> WertAsync(string sql)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        return await befehl.ExecuteScalarAsync();
    }

    private async Task<NpgsqlConnection> OeffnenAsync()
    {
        var verbindung = new NpgsqlConnection(connectionString);
        await verbindung.OpenAsync();
        return verbindung;
    }
}
