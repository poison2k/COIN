using Npgsql;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>Eine Zeile der Tabelle <c>ausgabe</c> (coin-ausgaben, Abschnitt 4).</summary>
public sealed record AusgabeZeile(
    Guid Id,
    Guid CoinId,
    int ExemplarNummer,
    string EmpfaengerName,
    Guid ErfasstVon,
    DateTimeOffset? StorniertAm,
    Guid? StorniertVon,
    string? StornoGrund);

/// <summary>Eine Zeile der Tabelle <c>ausgabe_audit</c> (coin-ausgaben, Abschnitt 4, ADR-0020 Punkt 10).</summary>
public sealed record AusgabeAuditZeile(
    Guid Id,
    DateTimeOffset Zeitpunkt,
    Guid AkteurId,
    Guid AusgabeId,
    Guid CoinId,
    int ExemplarNummer,
    string Art,
    string? Grund);

/// <summary>
/// Direkter Zugriff auf <c>exemplar</c>, <c>ausgabe</c> und <c>ausgabe_audit</c> der Test-Datenbank, unabhängig von
/// den Typen der Infrastruktur (coin-ausgaben AK-1, AK-2, AK-9, AK-13, AK-18). Rohes SQL für Constraint- und
/// Trigger-Prüfungen.
/// </summary>
public sealed class AusgabeTabelle(string connectionString)
{
    /// <summary>Exemplar-Nummern eines Coins, aufsteigend.</summary>
    public async Task<IReadOnlyList<int>> ExemplarNummernAsync(Guid coinId)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            "SELECT nummer FROM exemplar WHERE coin_id = @coin ORDER BY nummer", verbindung);
        befehl.Parameters.AddWithValue("coin", coinId);
        await using var leser = await befehl.ExecuteReaderAsync();
        var nummern = new List<int>();
        while (await leser.ReadAsync())
        {
            nummern.Add(leser.GetInt32(0));
        }

        return nummern;
    }

    public async Task<long> AnzahlExemplareAsync(Guid coinId)
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand("SELECT count(*) FROM exemplar WHERE coin_id = @coin", verbindung);
        befehl.Parameters.AddWithValue("coin", coinId);
        return (long)(await befehl.ExecuteScalarAsync())!;
    }

    /// <summary>Alle Ausgaben, nach Erfassungszeit und Id.</summary>
    public async Task<IReadOnlyList<AusgabeZeile>> AusgabenAsync()
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            """
            SELECT id, coin_id, exemplar_nummer, empfaenger_name, erfasst_von, storniert_am, storniert_von, storno_grund
            FROM ausgabe ORDER BY erfasst_am, id
            """,
            verbindung);
        await using var leser = await befehl.ExecuteReaderAsync();
        var zeilen = new List<AusgabeZeile>();
        while (await leser.ReadAsync())
        {
            zeilen.Add(new AusgabeZeile(
                leser.GetGuid(0),
                leser.GetGuid(1),
                leser.GetInt32(2),
                leser.GetString(3),
                leser.GetGuid(4),
                leser.IsDBNull(5) ? null : leser.GetFieldValue<DateTimeOffset>(5),
                leser.IsDBNull(6) ? null : leser.GetGuid(6),
                leser.IsDBNull(7) ? null : leser.GetString(7)));
        }

        return zeilen;
    }

    /// <summary>Alle Audit-Einträge zu Ausgaben, nach Zeitpunkt und Id.</summary>
    public async Task<IReadOnlyList<AusgabeAuditZeile>> AuditAsync()
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            """
            SELECT id, zeitpunkt, akteur_id, ausgabe_id, coin_id, exemplar_nummer, art, grund
            FROM ausgabe_audit ORDER BY zeitpunkt, id
            """,
            verbindung);
        await using var leser = await befehl.ExecuteReaderAsync();
        var zeilen = new List<AusgabeAuditZeile>();
        while (await leser.ReadAsync())
        {
            zeilen.Add(new AusgabeAuditZeile(
                leser.GetGuid(0),
                leser.GetFieldValue<DateTimeOffset>(1),
                leser.GetGuid(2),
                leser.GetGuid(3),
                leser.GetGuid(4),
                leser.GetInt32(5),
                leser.GetString(6),
                leser.IsDBNull(7) ? null : leser.GetString(7)));
        }

        return zeilen;
    }

    /// <summary>Alle Spaltennamen einer Tabelle (für „keine Empfängerdaten im Audit“, AK-18).</summary>
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

    /// <summary>Gesamter Inhalt von <c>ausgabe_audit</c> als Text (für die Suche nach Testwerten).</summary>
    public async Task<string> AuditAlsTextAsync()
    {
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            "SELECT coalesce(string_agg(a::text, E'\\n'), '') FROM ausgabe_audit a", verbindung);
        return (string)(await befehl.ExecuteScalarAsync())!;
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

    /// <summary>
    /// Fügt eine aktive Ausgabe per SQL ein (an der API vorbei, AK-9). Wirft bei Constraint-Verletzung.
    /// </summary>
    public async Task<Guid> AktiveAusgabeEinfuegenAsync(Guid coinId, int nummer, Guid erfasstVon, string empfaenger = "Test Direkt")
    {
        var id = Guid.CreateVersion7();
        await using var verbindung = await OeffnenAsync();
        await using var befehl = new NpgsqlCommand(
            """
            INSERT INTO ausgabe (id, coin_id, exemplar_nummer, empfaenger_name, datum, gelegenheit, begruendung,
                                 ausgebende_stelle, erfasst_am, erfasst_von)
            VALUES (@id, @coin, @nr, @name, DATE '2026-10-01', 'Test Gelegenheit', 'Test Begründung', 'Test Stelle',
                    now(), @von)
            """,
            verbindung);
        befehl.Parameters.AddWithValue("id", id);
        befehl.Parameters.AddWithValue("coin", coinId);
        befehl.Parameters.AddWithValue("nr", nummer);
        befehl.Parameters.AddWithValue("name", empfaenger);
        befehl.Parameters.AddWithValue("von", erfasstVon);
        await befehl.ExecuteNonQueryAsync();
        return id;
    }

    /// <summary>
    /// Lässt das nächste INSERT einer Ausgabe am Index <c>ux_ausgabe_exemplar_aktiv</c> scheitern: Ein Test-Trigger
    /// fügt vorher eine Kopie mit anderer Id ein, sodass das eigentliche INSERT trotz Sperre <c>23505</c> erhält
    /// (AK-9: „nie 500“). Die Kopie wird mit der Transaktion zurückgerollt.
    /// </summary>
    public async Task<IAsyncDisposable> EinfuegenVerletztIndexAsync()
    {
        await AusfuehrenAsync(
            """
            CREATE OR REPLACE FUNCTION test_ausgabe_doppelt() RETURNS trigger LANGUAGE plpgsql AS $$
            DECLARE kopie ausgabe;
            BEGIN
                IF pg_trigger_depth() = 1 THEN
                    kopie := NEW;
                    kopie.id := gen_random_uuid();
                    INSERT INTO ausgabe SELECT (kopie).*;
                END IF;
                RETURN NEW;
            END $$;
            CREATE TRIGGER test_ausgabe_doppelt BEFORE INSERT ON ausgabe
                FOR EACH ROW EXECUTE FUNCTION test_ausgabe_doppelt();
            """);
        return new Aufraeumen(this,
            "DROP TRIGGER IF EXISTS test_ausgabe_doppelt ON ausgabe; DROP FUNCTION IF EXISTS test_ausgabe_doppelt();");
    }

    /// <summary>Lässt jedes INSERT in <c>ausgabe_audit</c> scheitern (Transaktion, AK-18).</summary>
    public async Task<IAsyncDisposable> AuditEinfuegenScheitertAsync()
    {
        await AusfuehrenAsync(
            """
            CREATE OR REPLACE FUNCTION test_ausgabe_audit_scheitert() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'Testfehler: Audit-Eintrag kann nicht geschrieben werden'; END $$;
            CREATE TRIGGER test_ausgabe_audit_scheitert BEFORE INSERT ON ausgabe_audit
                FOR EACH ROW EXECUTE FUNCTION test_ausgabe_audit_scheitert();
            """);
        return new Aufraeumen(this,
            "DROP TRIGGER IF EXISTS test_ausgabe_audit_scheitert ON ausgabe_audit; DROP FUNCTION IF EXISTS test_ausgabe_audit_scheitert();");
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

    private sealed class Aufraeumen(AusgabeTabelle tabelle, string sql) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync() => await tabelle.AusfuehrenAsync(sql);
    }
}
