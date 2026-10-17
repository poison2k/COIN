using System.Net;
using Coin.IntegrationTests.Infrastruktur;
using Npgsql;

namespace Coin.IntegrationTests.Ausgaben;

/// <summary>
/// Feature coin-ausgaben, AK-9, AK-13 und AK-18 (ADR-0020 Punkt 1, 5, 9, 10): Constraints und Trigger direkt per SQL,
/// Audit-Einträge zu Erfassen und Storno (gleiche Transaktion, ohne Empfängerdaten, unveränderlich).
/// </summary>
public class AusgabeDatenbankTests(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    private static string SqlState(Exception? fehler) => Assert.IsType<PostgresException>(fehler).SqlState;

    // ---------- AK-9: partieller eindeutiger Index ----------

    [Fact]
    public async Task Zweite_aktive_Ausgabe_per_SQL_scheitert_mit_23505()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var adminId = await AdminIdAsync();
        await AusgabeDb.AktiveAusgabeEinfuegenAsync(coinId, 3, adminId);

        var fehler = await Record.ExceptionAsync(() => AusgabeDb.AktiveAusgabeEinfuegenAsync(coinId, 3, adminId));

        var postgres = Assert.IsType<PostgresException>(fehler);
        Assert.Equal((PostgresErrorCodes.UniqueViolation, "ux_ausgabe_exemplar_aktiv"), (postgres.SqlState, postgres.ConstraintName));
    }

    [Fact]
    public async Task Nach_Storno_ist_eine_neue_aktive_Ausgabe_per_SQL_moeglich()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var adminId = await AdminIdAsync();
        var erste = await ErfasseAsync(coinId, 3);
        await StornierenAsync(coinId, erste.GetProperty("id").GetGuid());

        var fehler = await Record.ExceptionAsync(() => AusgabeDb.AktiveAusgabeEinfuegenAsync(coinId, 3, adminId));

        Assert.Null(fehler);
    }

    [Fact]
    public async Task Ausgabe_fuer_ein_nicht_existierendes_Exemplar_scheitert_am_Fremdschluessel()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var adminId = await AdminIdAsync();

        var fehler = await Record.ExceptionAsync(() => AusgabeDb.AktiveAusgabeEinfuegenAsync(coinId, 6, adminId));

        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Exemplar_mit_Nummer_0_scheitert_am_Check_Constraint()
    {
        var coinId = await CoinMitAuflageAsync(5);

        var fehler = await AusgabeDb.RohAusfuehrenAsync($"INSERT INTO exemplar (coin_id, nummer) VALUES ('{coinId}', 0)");

        Assert.Equal(PostgresErrorCodes.CheckViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Exemplar_gibt_es_je_Coin_und_Nummer_nur_einmal()
    {
        var coinId = await CoinMitAuflageAsync(5);

        var fehler = await AusgabeDb.RohAusfuehrenAsync($"INSERT INTO exemplar (coin_id, nummer) VALUES ('{coinId}', 1)");

        Assert.Equal(PostgresErrorCodes.UniqueViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Exemplar_mit_Ausgabe_kann_nicht_geloescht_werden()
    {
        var coinId = await CoinMitAuflageAsync(5);
        await ErfasseAsync(coinId, 2);

        var fehler = await AusgabeDb.RohAusfuehrenAsync($"DELETE FROM exemplar WHERE coin_id = '{coinId}' AND nummer = 2");

        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Storno_Spalten_nur_teilweise_gesetzt_scheitert_am_Check_Constraint()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var adminId = await AdminIdAsync();

        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO ausgabe (id, coin_id, exemplar_nummer, zertifikatsnummer, empfaenger_name, datum, gelegenheit,
                                 begruendung, ausgebende_stelle, erfasst_am, erfasst_von, storniert_am)
            VALUES (gen_random_uuid(), '{coinId}', 1, 'T-Check-0001', 'Test', DATE '2026-10-01', 'G', 'B', 'S', now(),
                    '{adminId}', now())
            """);

        Assert.Equal(PostgresErrorCodes.CheckViolation, SqlState(fehler));
    }

    // ---------- AK-13: Trigger trg_ausgabe_nur_storno ----------

    [Fact]
    public async Task DELETE_einer_Ausgabe_per_SQL_scheitert()
    {
        var coinId = await CoinMitAuflageAsync(5);
        await ErfasseAsync(coinId);

        var fehler = await AusgabeDb.RohAusfuehrenAsync("DELETE FROM ausgabe");

        Assert.IsType<PostgresException>(fehler);
        Assert.Single(await AusgabeDb.AusgabenAsync());
    }

    [Fact]
    public async Task Aendern_des_Empfaengernamens_per_SQL_scheitert()
    {
        var coinId = await CoinMitAuflageAsync(5);
        await ErfasseAsync(coinId);

        var fehler = await AusgabeDb.RohAusfuehrenAsync("UPDATE ausgabe SET empfaenger_name = 'Test Geaendert'");

        Assert.IsType<PostgresException>(fehler);
        Assert.Equal("Max Beispiel", Assert.Single(await AusgabeDb.AusgabenAsync()).EmpfaengerName);
    }

    [Fact]
    public async Task Storno_zusammen_mit_einer_anderen_Spalte_per_SQL_scheitert()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var adminId = await AdminIdAsync();
        await ErfasseAsync(coinId);

        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            $"UPDATE ausgabe SET storniert_am = now(), storniert_von = '{adminId}', storno_grund = 'G', gelegenheit = 'Test Neu'");

        Assert.IsType<PostgresException>(fehler);
    }

    [Fact]
    public async Task Einfaches_Storno_per_SQL_ist_erlaubt()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var adminId = await AdminIdAsync();
        await ErfasseAsync(coinId);

        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            $"UPDATE ausgabe SET storniert_am = now(), storniert_von = '{adminId}', storno_grund = 'Test Grund'");

        Assert.Null(fehler);
    }

    [Fact]
    public async Task Zweites_Storno_per_SQL_scheitert()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var adminId = await AdminIdAsync();
        var ausgabe = await ErfasseAsync(coinId);
        await StornierenAsync(coinId, ausgabe.GetProperty("id").GetGuid(), "Erster Grund");

        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            $"UPDATE ausgabe SET storniert_am = now(), storniert_von = '{adminId}', storno_grund = 'Zweiter Grund'");

        Assert.IsType<PostgresException>(fehler);
        Assert.Equal("Erster Grund", Assert.Single(await AusgabeDb.AusgabenAsync()).StornoGrund);
    }

    [Fact]
    public async Task Zuruecknehmen_eines_Stornos_per_SQL_scheitert()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var ausgabe = await ErfasseAsync(coinId);
        await StornierenAsync(coinId, ausgabe.GetProperty("id").GetGuid());

        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            "UPDATE ausgabe SET storniert_am = NULL, storniert_von = NULL, storno_grund = NULL");

        Assert.IsType<PostgresException>(fehler);
    }

    // ---------- AK-18: Audit ----------

    [Fact]
    public async Task Erfassen_schreibt_genau_einen_Audit_Eintrag_Erfasst()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var adminId = await AdminIdAsync();

        var ausgabe = await ErfasseAsync(coinId, 4);

        var eintrag = Assert.Single(await AusgabeDb.AuditAsync());
        Assert.Equal(
            ("Erfasst", adminId, ausgabe.GetProperty("id").GetGuid(), coinId, 4, (string?)null),
            (eintrag.Art, eintrag.AkteurId, eintrag.AusgabeId, eintrag.CoinId, eintrag.ExemplarNummer, eintrag.Grund));
    }

    [Fact]
    public async Task Audit_Zeitpunkt_ist_die_Serverzeit()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var vorher = DateTimeOffset.UtcNow.AddSeconds(-5);

        await ErfasseAsync(coinId);

        Assert.InRange(Assert.Single(await AusgabeDb.AuditAsync()).Zeitpunkt, vorher, DateTimeOffset.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task Storno_schreibt_genau_einen_Audit_Eintrag_Storniert_mit_Grund_und_Akteur()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var ausgabe = await ErfasseAsync(coinId, 2);
        var konto = await KontoAsync("Sachbearbeiter");

        await StornierenAsync(coinId, ausgabe.GetProperty("id").GetGuid(), "Doppelt erfasst", konto.Client);

        var eintrag = Assert.Single(await AusgabeDb.AuditAsync(), z => z.Art == "Storniert");
        Assert.Equal(
            (konto.Id, ausgabe.GetProperty("id").GetGuid(), coinId, 2, "Doppelt erfasst"),
            (eintrag.AkteurId, eintrag.AusgabeId, eintrag.CoinId, eintrag.ExemplarNummer, eintrag.Grund));
    }

    [Fact]
    public async Task Fehlgeschlagene_Anfragen_schreiben_kein_Audit()
    {
        var coinId = await CoinMitAuflageAsync(1);
        var ausgabe = await ErfasseAsync(coinId);
        var ausgabeId = ausgabe.GetProperty("id").GetGuid();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using (await PostAusgabeAsync(coinId, GueltigeAusgabe(empfaengerName: "")))
        using (await PostAusgabeAsync(coinId, GueltigeAusgabe()))
        using (await PostAusgabeAsync(coinId, GueltigeAusgabe(1)))
        using (await PostAusgabeAsync(Guid.NewGuid(), GueltigeAusgabe()))
        using (await PostAusgabeAsync(betrachter, coinId, GueltigeAusgabe()))
        using (await PostStornoAsync(Client, coinId, ausgabeId, ""))
        using (await PostStornoAsync(betrachter, coinId, ausgabeId, "Grund"))
        using (await PostStornoAsync(Client, coinId, Guid.NewGuid(), "Grund"))
        {
        }

        Assert.Equal(["Erfasst"], (await AusgabeDb.AuditAsync()).Select(z => z.Art));
    }

    [Fact]
    public async Task Scheitert_der_Audit_Eintrag_wird_die_Ausgabe_nicht_gespeichert()
    {
        var coinId = await CoinMitAuflageAsync(5);
        await AdminIdAsync();

        HttpResponseMessage antwort;
        await using (await AusgabeDb.AuditEinfuegenScheitertAsync())
        {
            antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe());
        }

        using (antwort)
        {
            Assert.False(antwort.IsSuccessStatusCode, $"Erwartet: Fehler, erhalten {(int)antwort.StatusCode}.");
        }

        Assert.Empty(await AusgabeDb.AusgabenAsync());
    }

    [Fact]
    public async Task Scheitert_der_Audit_Eintrag_bleibt_die_Ausgabe_aktiv()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var ausgabe = await ErfasseAsync(coinId);

        HttpResponseMessage antwort;
        await using (await AusgabeDb.AuditEinfuegenScheitertAsync())
        {
            antwort = await PostStornoAsync(Client, coinId, ausgabe.GetProperty("id").GetGuid(), "Grund");
        }

        antwort.Dispose();
        Assert.Null(Assert.Single(await AusgabeDb.AusgabenAsync()).StorniertAm);
    }

    [Fact]
    public async Task Audit_Tabelle_hat_keine_Spalten_fuer_Empfaengerdaten()
    {
        var spalten = await AusgabeDb.SpaltenAsync("ausgabe_audit");

        Assert.Equal(
            ["akteur_id", "art", "ausgabe_id", "coin_id", "exemplar_nummer", "grund", "id", "zeitpunkt"],
            spalten);
    }

    [Fact]
    public async Task Audit_enthaelt_keine_Empfaengerdaten()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var body = GueltigeAusgabe(
            empfaengerName: "Test Audit Name 31a",
            empfaengerDienstgrad: "Test Audit Dienstgrad 31a",
            empfaengerDienststelle: "Test Audit Dienststelle 31a",
            gelegenheit: "Test Audit Gelegenheit 31a",
            begruendung: "Test Audit Begruendung 31a",
            ausgebendeStelle: "Test Audit Stelle 31a");
        using (var antwort = await PostAusgabeAsync(coinId, body))
        {
            Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
        }

        var text = await AusgabeDb.AuditAlsTextAsync();

        Assert.DoesNotContain("31a", text);
    }

    [Fact]
    public async Task UPDATE_auf_ausgabe_audit_scheitert()
    {
        var coinId = await CoinMitAuflageAsync(5);
        await ErfasseAsync(coinId);
        var vorher = await AusgabeDb.AuditAsync();

        var fehler = await AusgabeDb.RohAusfuehrenAsync("UPDATE ausgabe_audit SET exemplar_nummer = 5");

        Assert.IsType<PostgresException>(fehler);
        Assert.Equal(vorher, await AusgabeDb.AuditAsync());
    }

    [Fact]
    public async Task DELETE_auf_ausgabe_audit_scheitert()
    {
        var coinId = await CoinMitAuflageAsync(5);
        await ErfasseAsync(coinId);

        var fehler = await AusgabeDb.RohAusfuehrenAsync("DELETE FROM ausgabe_audit");

        Assert.IsType<PostgresException>(fehler);
        Assert.Single(await AusgabeDb.AuditAsync());
    }

    [Fact]
    public async Task Audit_Check_Constraint_verlangt_Grund_genau_bei_Storniert()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var adminId = await AdminIdAsync();
        var ausgabeId = (await ErfasseAsync(coinId, 1)).GetProperty("id").GetGuid();

        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO ausgabe_audit (id, zeitpunkt, akteur_id, ausgabe_id, coin_id, exemplar_nummer, art, grund)
            VALUES (gen_random_uuid(), now(), '{adminId}', '{ausgabeId}', '{coinId}', 1, 'Storniert', NULL)
            """);

        Assert.Equal(PostgresErrorCodes.CheckViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Audit_Check_Constraint_verbietet_Grund_bei_Erfasst()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var adminId = await AdminIdAsync();
        var ausgabeId = (await ErfasseAsync(coinId, 1)).GetProperty("id").GetGuid();

        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO ausgabe_audit (id, zeitpunkt, akteur_id, ausgabe_id, coin_id, exemplar_nummer, art, grund)
            VALUES (gen_random_uuid(), now(), '{adminId}', '{ausgabeId}', '{coinId}', 1, 'Erfasst', 'Test')
            """);

        Assert.Equal(PostgresErrorCodes.CheckViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Benutzer_mit_Ausgaben_kann_nicht_geloescht_werden()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var konto = await KontoAsync("Sachbearbeiter");
        await ErfasseAsync(coinId, client: konto.Client);

        var fehler = await AusgabeDb.RohAusfuehrenAsync($"DELETE FROM benutzer WHERE id = '{konto.Id}'");

        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Es_gibt_keinen_Lese_Endpunkt_fuer_das_Ausgabe_Audit()
    {
        var coinId = await CoinMitAuflageAsync(5);

        using var global = await Client.GetAsync("/api/ausgaben/audit");
        using var jeCoin = await Client.GetAsync($"{AusgabenUrl(coinId)}/audit");

        Assert.Equal((HttpStatusCode.NotFound, HttpStatusCode.NotFound), (global.StatusCode, jeCoin.StatusCode));
    }
}
