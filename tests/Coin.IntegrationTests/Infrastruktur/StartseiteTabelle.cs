using Npgsql;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>Eine Zeile der Tabelle <c>startseite_audit</c> (Feature startseite, Abschnitt 4.3).</summary>
public sealed record StartseiteAuditZeile(
    Guid Id,
    DateTimeOffset Zeitpunkt,
    Guid AkteurId,
    int Version,
    string Art,
    string? Ziel,
    string? Alt,
    string? Neu);

/// <summary>Eine Zeile der Tabelle <c>startseite_logo</c> (Abschnitt 4.2), ohne Bytes.</summary>
public sealed record StartseiteLogoZeile(
    string Platz,
    string Format,
    int GroesseBytes,
    int Breite,
    int Hoehe,
    string Sha256,
    string Alternativtext,
    Guid HochgeladenVon);

/// <summary>
/// Direkter Zugriff auf <c>startseite_konfiguration</c>, <c>startseite_logo</c> und <c>startseite_audit</c> der
/// Test-Datenbank, unabhängig von den Typen der Infrastruktur. Rohes SQL für Constraint- und Trigger-Prüfungen.
/// Fehlt eine Tabelle (Migration noch nicht da), scheitern die Aufrufe mit „relation … does not exist“.
/// </summary>
public sealed class StartseiteTabelle(string connectionString)
{
    /// <summary>Anzahl der Zeilen in <c>startseite_konfiguration</c> (höchstens eine).</summary>
    public Task<long> AnzahlKonfigurationenAsync() => SkalarAsync<long>("SELECT count(*) FROM startseite_konfiguration");

    /// <summary>Gespeicherte Version (oder <c>null</c> ohne Zeile).</summary>
    public async Task<int?> VersionAsync()
    {
        var wert = await SkalarAsync<object?>("SELECT version FROM startseite_konfiguration WHERE id = 1");
        return wert is null or DBNull ? null : Convert.ToInt32(wert);
    }

    /// <summary>Alle Logo-Zeilen, nach Platz.</summary>
    public async Task<IReadOnlyList<StartseiteLogoZeile>> LogosAsync()
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            """
            SELECT platz, format, groesse_bytes, breite, hoehe, sha256, alternativtext, hochgeladen_von
            FROM startseite_logo ORDER BY platz
            """,
            verbindung);
        await using var leser = await befehl.ExecuteReaderAsync();
        var zeilen = new List<StartseiteLogoZeile>();
        while (await leser.ReadAsync())
        {
            zeilen.Add(new StartseiteLogoZeile(
                leser.GetString(0),
                leser.GetString(1),
                leser.GetInt32(2),
                leser.GetInt32(3),
                leser.GetInt32(4),
                leser.GetString(5).Trim(),
                leser.GetString(6),
                leser.GetGuid(7)));
        }

        return zeilen;
    }

    /// <summary>Gespeicherte Bytes eines Logos (oder <c>null</c>).</summary>
    public async Task<byte[]?> LogoInhaltAsync(string platz)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand("SELECT inhalt FROM startseite_logo WHERE platz = @p", verbindung);
        befehl.Parameters.AddWithValue("p", platz);
        return await befehl.ExecuteScalarAsync() as byte[];
    }

    /// <summary>Alle Audit-Einträge, nach Zeitpunkt und Id (uuid v7 ist zeitlich sortiert).</summary>
    public async Task<IReadOnlyList<StartseiteAuditZeile>> AuditAsync()
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            "SELECT id, zeitpunkt, akteur_id, version, art, ziel, alt, neu FROM startseite_audit ORDER BY zeitpunkt, id",
            verbindung);
        await using var leser = await befehl.ExecuteReaderAsync();
        var zeilen = new List<StartseiteAuditZeile>();
        while (await leser.ReadAsync())
        {
            zeilen.Add(new StartseiteAuditZeile(
                leser.GetGuid(0),
                leser.GetFieldValue<DateTimeOffset>(1),
                leser.GetGuid(2),
                leser.GetInt32(3),
                leser.GetString(4),
                leser.IsDBNull(5) ? null : leser.GetString(5),
                leser.IsDBNull(6) ? null : leser.GetString(6),
                leser.IsDBNull(7) ? null : leser.GetString(7)));
        }

        return zeilen;
    }

    /// <summary>Gesamter Inhalt von <c>startseite_audit</c> als Text (für die Suche nach Testwerten).</summary>
    public Task<string> AuditAlsTextAsync() =>
        SkalarAsync<string>("SELECT coalesce(string_agg(a::text, E'\\n'), '') FROM startseite_audit a");

    /// <summary>Beobachtbarer Speicherzustand: Konfiguration (als Text), Logos (Platz und Hash), Anzahl Audit-Zeilen.</summary>
    public async Task<string> ZustandAsync()
    {
        var konfiguration = await SkalarAsync<string>(
            "SELECT coalesce((SELECT k::text FROM startseite_konfiguration k), '-')");
        var logos = string.Join(",", (await LogosAsync()).Select(l => $"{l.Platz}:{l.Sha256}:{l.Alternativtext}"));
        var audit = await SkalarAsync<long>("SELECT count(*) FROM startseite_audit");
        return $"{konfiguration}|{logos}|{audit}";
    }

    /// <summary>Ob ein Trigger mit dem Namen existiert.</summary>
    public async Task<bool> TriggerExistiertAsync(string name) =>
        await SkalarAsync<long>($"SELECT count(*) FROM pg_trigger WHERE tgname = '{name}' AND NOT tgisinternal") == 1;

    /// <summary>Ob ein Index mit dem Namen existiert.</summary>
    public async Task<bool> IndexExistiertAsync(string name) =>
        await SkalarAsync<long>($"SELECT count(*) FROM pg_indexes WHERE indexname = '{name}'") == 1;

    /// <summary>
    /// Fügt <paramref name="anzahl"/> aktive Ausgaben für die Exemplare 1…anzahl eines Coins per SQL ein (an der API vorbei,
    /// Leistungstest AK-6).
    /// </summary>
    public Task<Exception?> AusgabenEinfuegenAsync(Guid coinId, int anzahl, Guid erfasstVon) =>
        RohAusfuehrenAsync(
            $"""
            INSERT INTO ausgabe (id, coin_id, exemplar_nummer, zertifikatsnummer, empfaenger_name, datum, gelegenheit,
                                 begruendung, ausgebende_stelle, erfasst_am, erfasst_von)
            SELECT gen_random_uuid(), '{coinId}', n, 'L' || lpad(n::text, 12, '0') || substr(md5('{coinId}'), 1, 6),
                   'Test Leistung ' || n, DATE '2026-10-01', 'Test Gelegenheit', 'Test Begründung', 'Test Stelle', now(), '{erfasstVon}'
            FROM generate_series(1, {anzahl}) AS n
            """);

    /// <summary>Führt rohes SQL aus und liefert die Ausnahme (oder <c>null</c>, wenn es durchlief).</summary>
    public async Task<Exception?> RohAusfuehrenAsync(string sql)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        befehl.CommandTimeout = 300;
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

    private async Task<T> SkalarAsync<T>(string sql)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        var wert = await befehl.ExecuteScalarAsync();
        return wert is DBNull ? default! : (T)wert!;
    }

    private async Task<NpgsqlConnection> OeffnenAsync()
    {
        var verbindung = new NpgsqlConnection(connectionString);
        await verbindung.OpenAsync();
        return verbindung;
    }
}
