using Npgsql;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>Eine Zeile der Tabelle <c>benutzer_audit</c> (Entwurf rollen-benutzerverwaltung, Abschnitt 5.4).</summary>
public sealed record AuditZeile(
    Guid Id,
    DateTimeOffset Zeitpunkt,
    Guid? AkteurId,
    Guid BenutzerId,
    string Art,
    string Alt,
    string Neu);

/// <summary>
/// Direkter Zugriff auf <c>benutzer_audit</c> der Test-Datenbank: Lesen, rohe UPDATE/DELETE-Versuche (AK-21) und
/// eine vorübergehende Fehler-Injektion beim Einfügen (AK-19, Transaktion).
/// </summary>
public sealed class AuditTabelle(string connectionString)
{
    public async Task<IReadOnlyList<AuditZeile>> AlleAsync()
    {
        await using var verbindung = new NpgsqlConnection(connectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(
            "SELECT id, zeitpunkt, akteur_id, benutzer_id, art, alt, neu FROM benutzer_audit ORDER BY zeitpunkt, id",
            verbindung);
        await using var leser = await befehl.ExecuteReaderAsync();
        var zeilen = new List<AuditZeile>();
        while (await leser.ReadAsync())
        {
            zeilen.Add(new AuditZeile(
                leser.GetGuid(0),
                leser.GetFieldValue<DateTimeOffset>(1),
                leser.IsDBNull(2) ? null : leser.GetGuid(2),
                leser.GetGuid(3),
                leser.GetString(4),
                leser.GetString(5),
                leser.GetString(6)));
        }

        return zeilen;
    }

    public async Task<int> AnzahlAsync() => (await AlleAsync()).Count;

    /// <summary>Führt rohes SQL aus und liefert die Ausnahme (oder <c>null</c>, wenn es durchlief).</summary>
    public async Task<Exception?> RohAusfuehrenAsync(string sql)
    {
        await using var verbindung = new NpgsqlConnection(connectionString);
        await verbindung.OpenAsync();
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
    /// Lässt jedes INSERT in <c>benutzer_audit</c> scheitern, bis das Ergebnis entsorgt wird (Fehler-Injektion,
    /// AK-19). Tests laufen in einer Collection nacheinander, die Injektion wirkt also nur im eigenen Test.
    /// </summary>
    public async Task<IAsyncDisposable> EinfuegenScheitertAsync()
    {
        await AusfuehrenAsync(
            """
            CREATE OR REPLACE FUNCTION test_audit_einfuegen_scheitert() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'Testfehler: Audit-Eintrag kann nicht geschrieben werden'; END $$;
            CREATE TRIGGER test_audit_einfuegen_scheitert BEFORE INSERT ON benutzer_audit
                FOR EACH ROW EXECUTE FUNCTION test_audit_einfuegen_scheitert();
            """);
        return new Aufraeumen(this,
            "DROP TRIGGER IF EXISTS test_audit_einfuegen_scheitert ON benutzer_audit; DROP FUNCTION IF EXISTS test_audit_einfuegen_scheitert();");
    }

    /// <summary>
    /// Lässt jedes INSERT in <c>benutzer_audit</c> warten, solange jemand die Advisory-Sperre <paramref name="schluessel"/>
    /// hält (zum Beobachten der Sperre einer laufenden Änderung, ADR-0018).
    /// </summary>
    public async Task<IAsyncDisposable> EinfuegenWartetAufAsync(long schluessel)
    {
        await AusfuehrenAsync(
            $"""
            CREATE OR REPLACE FUNCTION test_audit_einfuegen_wartet() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN PERFORM pg_advisory_xact_lock_shared({schluessel}); RETURN NEW; END $$;
            CREATE TRIGGER test_audit_einfuegen_wartet BEFORE INSERT ON benutzer_audit
                FOR EACH ROW EXECUTE FUNCTION test_audit_einfuegen_wartet();
            """);
        return new Aufraeumen(this,
            "DROP TRIGGER IF EXISTS test_audit_einfuegen_wartet ON benutzer_audit; DROP FUNCTION IF EXISTS test_audit_einfuegen_wartet();");
    }

    private async Task AusfuehrenAsync(string sql)
    {
        await using var verbindung = new NpgsqlConnection(connectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        await befehl.ExecuteNonQueryAsync();
    }

    private sealed class Aufraeumen(AuditTabelle tabelle, string sql) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync() => await tabelle.AusfuehrenAsync(sql);
    }
}
