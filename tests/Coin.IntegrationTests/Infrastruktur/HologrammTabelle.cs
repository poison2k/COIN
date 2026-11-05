using Npgsql;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>Eine Zeile der Tabelle <c>ausgabe_hologramm</c> (hologrammnummer, Abschnitt 6).</summary>
public sealed record HologrammZeile(
    Guid Id,
    Guid AusgabeId,
    string Nummer,
    string NummerNormalisiert,
    DateTimeOffset GesetztAm,
    Guid GesetztVon,
    DateTimeOffset? AbgeloestAm);

/// <summary>Eine Zeile der Tabelle <c>hologramm_audit</c> (hologrammnummer, Abschnitt 6, ADR-0033 Punkt 6).</summary>
public sealed record HologrammAuditZeile(
    Guid Id,
    DateTimeOffset Zeitpunkt,
    Guid AkteurId,
    Guid AusgabeId,
    Guid CoinId,
    string Art,
    string? NummerAlt,
    string NummerNeu,
    string? Grund);

/// <summary>Eine Zeile der Tabelle <c>pruefung_audit</c> (hologrammnummer, Abschnitt 6, ADR-0034 Punkt 5).</summary>
public sealed record PruefAuditZeile(
    Guid Id,
    DateTimeOffset Zeitpunkt,
    Guid AkteurId,
    string Nummer,
    Guid? CoinIdGewaehlt,
    string Ergebnis,
    Guid? AusgabeId,
    bool MitEmpfaenger);

/// <summary>
/// Direkter Zugriff auf <c>ausgabe_hologramm</c>, <c>hologramm_audit</c> und <c>pruefung_audit</c> der Test-Datenbank,
/// unabhängig von den Typen der Infrastruktur (hologrammnummer AK-2, AK-3, AK-15, AK-20). Rohes SQL für Constraint- und
/// Trigger-Prüfungen.
/// </summary>
public sealed class HologrammTabelle(string connectionString)
{
    /// <summary>Alle Zuordnungen (optional nur einer Ausgabe), nach Zeitpunkt und Id.</summary>
    public async Task<IReadOnlyList<HologrammZeile>> ZeilenAsync(Guid? ausgabeId = null)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            """
            SELECT id, ausgabe_id, nummer, nummer_normalisiert, gesetzt_am, gesetzt_von, abgeloest_am
            FROM ausgabe_hologramm WHERE @ausgabe::uuid IS NULL OR ausgabe_id = @ausgabe ORDER BY gesetzt_am, id
            """,
            verbindung);
        befehl.Parameters.Add(new NpgsqlParameter("ausgabe", NpgsqlTypes.NpgsqlDbType.Uuid) { Value = (object?)ausgabeId ?? DBNull.Value });
        await using var leser = await befehl.ExecuteReaderAsync();
        var zeilen = new List<HologrammZeile>();
        while (await leser.ReadAsync())
        {
            zeilen.Add(new HologrammZeile(
                leser.GetGuid(0),
                leser.GetGuid(1),
                leser.GetString(2),
                leser.GetString(3),
                leser.GetFieldValue<DateTimeOffset>(4),
                leser.GetGuid(5),
                leser.IsDBNull(6) ? null : leser.GetFieldValue<DateTimeOffset>(6)));
        }

        return zeilen;
    }

    /// <summary>Alle Einträge von <c>hologramm_audit</c>, nach Zeitpunkt und Id.</summary>
    public async Task<IReadOnlyList<HologrammAuditZeile>> AuditAsync()
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            """
            SELECT id, zeitpunkt, akteur_id, ausgabe_id, coin_id, art, nummer_alt, nummer_neu, grund
            FROM hologramm_audit ORDER BY zeitpunkt, id
            """,
            verbindung);
        await using var leser = await befehl.ExecuteReaderAsync();
        var zeilen = new List<HologrammAuditZeile>();
        while (await leser.ReadAsync())
        {
            zeilen.Add(new HologrammAuditZeile(
                leser.GetGuid(0),
                leser.GetFieldValue<DateTimeOffset>(1),
                leser.GetGuid(2),
                leser.GetGuid(3),
                leser.GetGuid(4),
                leser.GetString(5),
                leser.IsDBNull(6) ? null : leser.GetString(6),
                leser.GetString(7),
                leser.IsDBNull(8) ? null : leser.GetString(8)));
        }

        return zeilen;
    }

    /// <summary>Alle Einträge von <c>pruefung_audit</c> (optional nur eines Akteurs), nach Zeitpunkt und Id.</summary>
    public async Task<IReadOnlyList<PruefAuditZeile>> PruefAuditAsync(Guid? akteurId = null)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            """
            SELECT id, zeitpunkt, akteur_id, nummer, coin_id_gewaehlt, ergebnis, ausgabe_id, mit_empfaenger
            FROM pruefung_audit WHERE @akteur::uuid IS NULL OR akteur_id = @akteur ORDER BY zeitpunkt, id
            """,
            verbindung);
        befehl.Parameters.Add(new NpgsqlParameter("akteur", NpgsqlTypes.NpgsqlDbType.Uuid) { Value = (object?)akteurId ?? DBNull.Value });
        await using var leser = await befehl.ExecuteReaderAsync();
        var zeilen = new List<PruefAuditZeile>();
        while (await leser.ReadAsync())
        {
            zeilen.Add(new PruefAuditZeile(
                leser.GetGuid(0),
                leser.GetFieldValue<DateTimeOffset>(1),
                leser.GetGuid(2),
                leser.GetString(3),
                leser.IsDBNull(4) ? null : leser.GetGuid(4),
                leser.GetString(5),
                leser.IsDBNull(6) ? null : leser.GetGuid(6),
                leser.GetBoolean(7)));
        }

        return zeilen;
    }

    /// <summary>Gesamter Inhalt einer Tabelle als Text (für die Suche nach Testwerten).</summary>
    public async Task<string> AlsTextAsync(string tabelle)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            $"SELECT coalesce(string_agg(t::text, E'\\n'), '') FROM {tabelle} t", verbindung);
        return (string)(await befehl.ExecuteScalarAsync())!;
    }

    /// <summary>Spaltennamen einer Tabelle.</summary>
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

    /// <summary>
    /// Fügt eine Zuordnung per SQL ein (an der API vorbei) und liefert die Id. Wirft bei Constraint-Verletzung.
    /// <paramref name="abgeloest"/> legt die Zeile gleich abgelöst an.
    /// </summary>
    public async Task<Guid> EinfuegenAsync(Guid ausgabeId, string nummer, Guid gesetztVon, bool abgeloest = false)
    {
        var id = Guid.CreateVersion7();
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            """
            INSERT INTO ausgabe_hologramm (id, ausgabe_id, nummer, gesetzt_am, gesetzt_von, abgeloest_am)
            VALUES (@id, @ausgabe, @nummer, now(), @von, CASE WHEN @abgeloest THEN now() END)
            """,
            verbindung);
        befehl.Parameters.AddWithValue("id", id);
        befehl.Parameters.AddWithValue("ausgabe", ausgabeId);
        befehl.Parameters.AddWithValue("nummer", nummer);
        befehl.Parameters.AddWithValue("von", gesetztVon);
        befehl.Parameters.AddWithValue("abgeloest", abgeloest);
        await befehl.ExecuteNonQueryAsync();
        return id;
    }

    /// <summary>Wie <see cref="EinfuegenAsync"/>, liefert aber die Ausnahme (oder <c>null</c>).</summary>
    public async Task<Exception?> VersucheEinfuegenAsync(Guid ausgabeId, string nummer, Guid gesetztVon, bool abgeloest = false)
    {
        try
        {
            await EinfuegenAsync(ausgabeId, nummer, gesetztVon, abgeloest);
            return null;
        }
        catch (Exception ex)
        {
            return ex;
        }
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

    /// <summary>Einzelwert einer Abfrage.</summary>
    public async Task<object?> WertAsync(string sql)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        return await befehl.ExecuteScalarAsync();
    }

    /// <summary>Lässt jedes INSERT in <c>pruefung_audit</c> scheitern (AK-20: „Scheitert der Insert, → 500“).</summary>
    public async Task<IAsyncDisposable> PruefAuditScheitertAsync()
    {
        await AusfuehrenAsync(
            """
            CREATE OR REPLACE FUNCTION test_pruefung_audit_scheitert() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'Testfehler: Pruef-Audit kann nicht geschrieben werden'; END $$;
            CREATE TRIGGER test_pruefung_audit_scheitert BEFORE INSERT ON pruefung_audit
                FOR EACH ROW EXECUTE FUNCTION test_pruefung_audit_scheitert();
            """);
        return new Aufraeumen(this,
            "DROP TRIGGER IF EXISTS test_pruefung_audit_scheitert ON pruefung_audit; DROP FUNCTION IF EXISTS test_pruefung_audit_scheitert();");
    }

    private async Task<NpgsqlConnection> OeffnenAsync()
    {
        var verbindung = new NpgsqlConnection(connectionString);
        await verbindung.OpenAsync();
        return verbindung;
    }

    private async Task AusfuehrenAsync(string sql)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        await befehl.ExecuteNonQueryAsync();
    }

    private sealed class Aufraeumen(HologrammTabelle tabelle, string sql) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync() => await tabelle.AusfuehrenAsync(sql);
    }
}
