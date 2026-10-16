using Npgsql;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>Eine Zeile der Tabelle <c>zertifikat_vorlage</c> (zertifikatsvorlagen, Abschnitt 6).</summary>
public sealed record VorlageZeile(
    Guid Id,
    Guid CoinId,
    int Version,
    byte[] Inhalt,
    int GroesseBytes,
    string Sha256,
    DateTimeOffset HochgeladenAm,
    Guid HochgeladenVon);

/// <summary>Eine Zeile der Tabelle <c>vorlage_audit</c> (zertifikatsvorlagen, AK-21, ADR-0023 Punkt 7).</summary>
public sealed record VorlageAuditZeile(
    Guid Id,
    DateTimeOffset Zeitpunkt,
    Guid AkteurId,
    Guid CoinId,
    string Art,
    int? Version,
    int? VorherigeVersion);

/// <summary>
/// Direkter Zugriff auf <c>zertifikat_vorlage</c>, <c>vorlage_audit</c> und <c>coin_typ.aktive_vorlage_version</c>
/// der Test-Datenbank, unabhängig von den Typen der Infrastruktur. Rohes SQL für Constraint- und Trigger-Prüfungen.
/// </summary>
public sealed class VorlageTabelle(string connectionString)
{
    /// <summary>Alle Versionen eines Coins, aufsteigend.</summary>
    public async Task<IReadOnlyList<VorlageZeile>> VersionenAsync(Guid coinId)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            """
            SELECT id, coin_id, version, inhalt, groesse_bytes, sha256, hochgeladen_am, hochgeladen_von
            FROM zertifikat_vorlage WHERE coin_id = @coin ORDER BY version
            """,
            verbindung);
        befehl.Parameters.AddWithValue("coin", coinId);
        await using var leser = await befehl.ExecuteReaderAsync();
        var zeilen = new List<VorlageZeile>();
        while (await leser.ReadAsync())
        {
            zeilen.Add(new VorlageZeile(
                leser.GetGuid(0),
                leser.GetGuid(1),
                leser.GetInt32(2),
                leser.GetFieldValue<byte[]>(3),
                leser.GetInt32(4),
                leser.GetString(5).Trim(),
                leser.GetFieldValue<DateTimeOffset>(6),
                leser.GetGuid(7)));
        }

        return zeilen;
    }

    /// <summary>Anzahl aller Versionen (alle Coins).</summary>
    public async Task<long> AnzahlVersionenAsync()
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand("SELECT count(*) FROM zertifikat_vorlage", verbindung);
        return (long)(await befehl.ExecuteScalarAsync())!;
    }

    /// <summary><c>coin_typ.aktive_vorlage_version</c> eines Coins.</summary>
    public async Task<int?> AktiveVersionAsync(Guid coinId)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand("SELECT aktive_vorlage_version FROM coin_typ WHERE id = @coin", verbindung);
        befehl.Parameters.AddWithValue("coin", coinId);
        var wert = await befehl.ExecuteScalarAsync();
        return wert is DBNull or null ? null : (int)wert;
    }

    /// <summary>Alle Audit-Einträge, nach Zeitpunkt und Id.</summary>
    public async Task<IReadOnlyList<VorlageAuditZeile>> AuditAsync()
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            """
            SELECT id, zeitpunkt, akteur_id, coin_id, art, version, vorherige_version
            FROM vorlage_audit ORDER BY zeitpunkt, id
            """,
            verbindung);
        await using var leser = await befehl.ExecuteReaderAsync();
        var zeilen = new List<VorlageAuditZeile>();
        while (await leser.ReadAsync())
        {
            zeilen.Add(new VorlageAuditZeile(
                leser.GetGuid(0),
                leser.GetFieldValue<DateTimeOffset>(1),
                leser.GetGuid(2),
                leser.GetGuid(3),
                leser.GetString(4),
                leser.IsDBNull(5) ? null : leser.GetInt32(5),
                leser.IsDBNull(6) ? null : leser.GetInt32(6)));
        }

        return zeilen;
    }

    /// <summary>Gesamter Inhalt von <c>vorlage_audit</c> als Text (für die Suche nach Testwerten).</summary>
    public async Task<string> AuditAlsTextAsync()
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            "SELECT coalesce(string_agg(a::text, E'\\n'), '') FROM vorlage_audit a", verbindung);
        return (string)(await befehl.ExecuteScalarAsync())!;
    }

    /// <summary>Spaltennamen einer Tabelle, alphabetisch.</summary>
    public async Task<IReadOnlyList<string>> SpaltenAsync(string tabelle)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            "SELECT column_name FROM information_schema.columns WHERE table_name = @t ORDER BY column_name", verbindung);
        befehl.Parameters.AddWithValue("t", tabelle);
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

    private async Task<NpgsqlConnection> OeffnenAsync()
    {
        var verbindung = new NpgsqlConnection(connectionString);
        await verbindung.OpenAsync();
        return verbindung;
    }
}
