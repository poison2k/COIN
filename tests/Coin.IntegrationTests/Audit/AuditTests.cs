using System.Net;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;
using Npgsql;

namespace Coin.IntegrationTests.Audit;

/// <summary>
/// Feature rollen-benutzerverwaltung, AK-14, AK-19 bis AK-21, ADR-0017: Audit-Log für Rollen und Status.
/// <c>GET /api/audit?benutzerId=&amp;seite=1&amp;groesse=25</c> (audit.read), Einträge in derselben Transaktion,
/// Bootstrap mit Akteur „System“ (null), Tabelle per Trigger unveränderlich.
/// </summary>
public class AuditTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private async Task<JsonElement> AuditAsync(string query = "")
    {
        using var antwort = await Client.GetAsync($"{AuditUrl}{query}");
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        return await JsonAsync(antwort);
    }

    private static JsonElement[] Eintraege(JsonElement seite) => seite.GetProperty("eintraege").EnumerateArray().ToArray();

    private async Task<HttpStatusCode> RolleAsync(HttpClient client, Guid id, string rolle)
    {
        using var antwort = await PutRolleAsync(client, id, rolle);
        return antwort.StatusCode;
    }

    // ---------- AK-14: Antwortform ----------

    [Fact]
    public async Task Audit_liefert_200_als_JSON_mit_no_store()
    {
        using var antwort = await Client.GetAsync(AuditUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("application/json", antwort.Content.Headers.ContentType?.MediaType);
        Assert.True(antwort.Headers.CacheControl?.NoStore, $"Cache-Control: {antwort.Headers.CacheControl}");
    }

    [Fact]
    public async Task Audit_hat_genau_die_Felder_eintraege_gesamt_seite_groesse()
    {
        var json = await AuditAsync();

        Assert.Equal(["eintraege", "gesamt", "groesse", "seite"], json.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal));
        Assert.Equal(1, json.GetProperty("seite").GetInt32());
        Assert.Equal(25, json.GetProperty("groesse").GetInt32());
    }

    [Fact]
    public async Task Eintrag_hat_genau_die_Felder_laut_Entwurf()
    {
        var json = await AuditAsync();

        var eintrag = Eintraege(json)[0];
        Assert.Equal(
            ["akteur", "alt", "art", "benutzer", "id", "neu", "zeitpunkt"],
            eintrag.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal));
        Assert.Equal(["id", "name"], eintrag.GetProperty("benutzer").EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal));
    }

    // ---------- AK-19: Inhalt ----------

    [Fact]
    public async Task Rollenwechsel_keine_nach_Betrachter_erzeugt_Eintrag_mit_Akteur_Ziel_Art_Alt_Neu_und_Zeitpunkt()
    {
        await AdminIdAsync();
        var x = await ZweiterAdminAsync("Test Akteur Audit");
        var ziel = await KontoAsync(null, name: "Test Ziel Audit");
        var vorher = DateTimeOffset.UtcNow;

        Assert.Equal(HttpStatusCode.OK, await RolleAsync(x.Client, ziel.Id, "Betrachter"));

        var nachher = DateTimeOffset.UtcNow;
        var eintrag = Eintraege(await AuditAsync())[0];
        Assert.Equal(x.Id, eintrag.GetProperty("akteur").GetProperty("id").GetGuid());
        Assert.Equal("Test Akteur Audit", eintrag.GetProperty("akteur").GetProperty("name").GetString());
        Assert.Equal(ziel.Id, eintrag.GetProperty("benutzer").GetProperty("id").GetGuid());
        Assert.Equal("Test Ziel Audit", eintrag.GetProperty("benutzer").GetProperty("name").GetString());
        Assert.Equal("Rolle", eintrag.GetProperty("art").GetString());
        Assert.Equal("keine", eintrag.GetProperty("alt").GetString());
        Assert.Equal("Betrachter", eintrag.GetProperty("neu").GetString());
        Assert.InRange(eintrag.GetProperty("zeitpunkt").GetDateTimeOffset(), vorher.AddSeconds(-1), nachher.AddSeconds(1));
    }

    [Fact]
    public async Task Deaktivieren_erzeugt_Eintrag_Status_aktiv_nach_deaktiviert()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Betrachter");

        using (await PutStatusAsync(Client, ziel.Id, false))
        {
        }

        var eintrag = Eintraege(await AuditAsync())[0];
        Assert.Equal("Status", eintrag.GetProperty("art").GetString());
        Assert.Equal("aktiv", eintrag.GetProperty("alt").GetString());
        Assert.Equal("deaktiviert", eintrag.GetProperty("neu").GetString());
    }

    [Fact]
    public async Task Rolle_entziehen_erzeugt_Eintrag_mit_neu_keine()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Sachbearbeiter");

        Assert.Equal(HttpStatusCode.OK, await RolleAsync(Client, ziel.Id, "keine"));

        var eintrag = Eintraege(await AuditAsync())[0];
        Assert.Equal("Sachbearbeiter", eintrag.GetProperty("alt").GetString());
        Assert.Equal("keine", eintrag.GetProperty("neu").GetString());
    }

    [Fact]
    public async Task Jede_wirksame_Aenderung_schreibt_genau_einen_Eintrag()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null);
        var vorher = await AuditDb.AnzahlAsync();

        await RolleAsync(Client, ziel.Id, "Betrachter");
        await RolleAsync(Client, ziel.Id, "Sachbearbeiter");
        using (await PutStatusAsync(Client, ziel.Id, false))
        {
        }

        Assert.Equal(vorher + 3, await AuditDb.AnzahlAsync());
    }

    [Fact]
    public async Task Gespeicherte_Zeile_hat_GUID_v7_Akteur_Ziel_und_Zeitpunkt_in_UTC()
    {
        var adminId = await AdminIdAsync();
        var ziel = await KontoAsync(null);

        await RolleAsync(Client, ziel.Id, "Betrachter");

        var zeile = (await AuditDb.AlleAsync()).Single(z => z.BenutzerId == ziel.Id);
        Assert.Equal(7, zeile.Id.Version);
        Assert.Equal(adminId, zeile.AkteurId);
        Assert.Equal("Rolle", zeile.Art);
        Assert.Equal(TimeSpan.Zero, zeile.Zeitpunkt.Offset);
    }

    [Fact]
    public async Task Audit_speichert_keine_Namen_oder_Emails()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null, name: "Test Nur Per Join", email: "nurperjoin@coin-test.invalid");
        await RolleAsync(Client, ziel.Id, "Betrachter");

        await using var verbindung = new NpgsqlConnection(Fixture.ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand("SELECT string_agg(t::text, '|') FROM benutzer_audit t", verbindung);
        var inhalt = (string?)await befehl.ExecuteScalarAsync() ?? string.Empty;

        Assert.DoesNotContain("Test Nur Per Join", inhalt);
        Assert.DoesNotContain("nurperjoin", inhalt);
    }

    [Fact]
    public async Task Scheitert_das_Schreiben_des_Audits_bleibt_die_Rolle_unveraendert()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null);

        HttpStatusCode status;
        await using (await AuditDb.EinfuegenScheitertAsync())
        {
            using var antwort = await PutRolleAsync(Client, ziel.Id, "Betrachter");
            status = antwort.StatusCode;
        }

        Assert.Equal(HttpStatusCode.InternalServerError, status);
        Assert.Null((await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Rolle);
    }

    [Fact]
    public async Task Scheitert_das_Schreiben_des_Audits_bleibt_der_Status_unveraendert()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Betrachter");

        HttpStatusCode status;
        await using (await AuditDb.EinfuegenScheitertAsync())
        {
            using var antwort = await PutStatusAsync(Client, ziel.Id, false);
            status = antwort.StatusCode;
        }

        Assert.Equal(HttpStatusCode.InternalServerError, status);
        Assert.True((await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Aktiv);
    }

    [Fact]
    public async Task Scheitert_das_Audit_gibt_die_500_Antwort_keine_Details_preis()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null);

        string body;
        await using (await AuditDb.EinfuegenScheitertAsync())
        {
            using var antwort = await PutRolleAsync(Client, ziel.Id, "Betrachter");
            body = await antwort.Content.ReadAsStringAsync();
        }

        Assert.DoesNotContain("Testfehler", body);
        Assert.DoesNotContain("benutzer_audit", body);
    }

    // ---------- AK-14: Sortierung, Filter, Paging ----------

    [Fact]
    public async Task Eintraege_sind_nach_Zeitpunkt_absteigend_sortiert()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null);
        await RolleAsync(Client, ziel.Id, "Betrachter");
        await RolleAsync(Client, ziel.Id, "Sachbearbeiter");

        var neu = Eintraege(await AuditAsync()).Select(e => e.GetProperty("neu").GetString()!).ToArray();

        Assert.Equal(["Sachbearbeiter", "Betrachter", "Administrator"], neu);
    }

    [Fact]
    public async Task Bei_gleichem_Zeitpunkt_wird_nach_id_absteigend_sortiert()
    {
        var adminId = await AdminIdAsync();
        var ziel = await KontoAsync(null);
        await using (var verbindung = new NpgsqlConnection(Fixture.ConnectionString))
        {
            await verbindung.OpenAsync();
            await using var befehl = new NpgsqlCommand(
                """
                INSERT INTO benutzer_audit (id, zeitpunkt, akteur_id, benutzer_id, art, alt, neu) VALUES
                ('0199a1b2-0000-7000-8000-000000000001', '2030-01-01T00:00:00Z', @akteur, @ziel, 'Rolle', 'keine', 'Betrachter'),
                ('0199a1b2-0000-7000-8000-000000000002', '2030-01-01T00:00:00Z', @akteur, @ziel, 'Rolle', 'Betrachter', 'Sachbearbeiter')
                """,
                verbindung);
            befehl.Parameters.AddWithValue("akteur", adminId);
            befehl.Parameters.AddWithValue("ziel", ziel.Id);
            await befehl.ExecuteNonQueryAsync();
        }

        var ids = Eintraege(await AuditAsync()).Take(2).Select(e => e.GetProperty("id").GetGuid().ToString()).ToArray();

        Assert.Equal(["0199a1b2-0000-7000-8000-000000000002", "0199a1b2-0000-7000-8000-000000000001"], ids);
    }

    [Fact]
    public async Task Filter_benutzerId_liefert_nur_Eintraege_des_Zielbenutzers()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null);
        var anderer = await KontoAsync(null);
        await RolleAsync(Client, ziel.Id, "Betrachter");
        await RolleAsync(Client, anderer.Id, "Betrachter");

        var json = await AuditAsync($"?benutzerId={ziel.Id}");

        var eintrag = Assert.Single(Eintraege(json));
        Assert.Equal(ziel.Id, eintrag.GetProperty("benutzer").GetProperty("id").GetGuid());
        Assert.Equal(1, json.GetProperty("gesamt").GetInt32());
    }

    [Fact]
    public async Task Filter_mit_unbekannter_benutzerId_liefert_eine_leere_Liste()
    {
        await AdminIdAsync();

        var json = await AuditAsync($"?benutzerId={Guid.NewGuid()}");

        Assert.Empty(Eintraege(json));
        Assert.Equal(0, json.GetProperty("gesamt").GetInt32());
    }

    [Fact]
    public async Task Filter_mit_ungueltiger_GUID_liefert_400()
    {
        using var antwort = await Client.GetAsync($"{AuditUrl}?benutzerId=keine-guid");

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Paging_liefert_die_angeforderte_Seite_und_gesamt()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null);
        await RolleAsync(Client, ziel.Id, "Betrachter");
        await RolleAsync(Client, ziel.Id, "Sachbearbeiter");

        var json = await AuditAsync("?seite=2&groesse=1");

        Assert.Equal("Betrachter", Assert.Single(Eintraege(json)).GetProperty("neu").GetString());
        Assert.Equal(3, json.GetProperty("gesamt").GetInt32());
        Assert.Equal(2, json.GetProperty("seite").GetInt32());
        Assert.Equal(1, json.GetProperty("groesse").GetInt32());
    }

    [Theory]
    [InlineData("?seite=0", "seite")]
    [InlineData("?groesse=0", "groesse")]
    [InlineData("?groesse=101", "groesse")]
    public async Task Ungueltiges_Paging_liefert_400(string query, string feld)
    {
        using var antwort = await Client.GetAsync($"{AuditUrl}{query}");

        Assert.Contains(feld, await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task Audit_enthaelt_keine_Emails()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null, email: "audit.ziel@coin-test.invalid");
        await RolleAsync(Client, ziel.Id, "Betrachter");

        using var antwort = await Client.GetAsync(AuditUrl);
        var body = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.DoesNotContain("audit.ziel@coin-test.invalid", body);
        Assert.DoesNotContain(Testbenutzer.AdminEmail, body);
        Assert.DoesNotContain("@", body);
    }

    // ---------- AK-20: Bootstrap ----------

    [Fact]
    public async Task Neuanlage_des_Bootstrap_Admins_erzeugt_genau_einen_Eintrag_mit_Akteur_System()
    {
        var adminId = await AdminIdAsync();

        var zeile = Assert.Single(await AuditDb.AlleAsync());
        Assert.Null(zeile.AkteurId);
        Assert.Equal(adminId, zeile.BenutzerId);
        Assert.Equal("Rolle", zeile.Art);
        Assert.Equal("keine", zeile.Alt);
        Assert.Equal("Administrator", zeile.Neu);
    }

    [Fact]
    public async Task Bootstrap_Eintrag_erscheint_in_der_API_mit_akteur_null()
    {
        var adminId = await AdminIdAsync();

        var eintrag = Assert.Single(Eintraege(await AuditAsync()));
        Assert.Equal(JsonValueKind.Null, eintrag.GetProperty("akteur").ValueKind);
        Assert.Equal(adminId, eintrag.GetProperty("benutzer").GetProperty("id").GetGuid());
        Assert.Equal(Testbenutzer.AdminName, eintrag.GetProperty("benutzer").GetProperty("name").GetString());
    }

    [Fact]
    public async Task Weitere_Logins_des_Bootstrap_Admins_erzeugen_keinen_Eintrag()
    {
        await AdminIdAsync();
        await AdminIdAsync();
        using (await ClientMit(Testbenutzer.Admin with { Name = "Test Administrator Umbenannt" }).GetAsync(MeUrl))
        {
        }

        Assert.Single(await AuditDb.AlleAsync());
    }

    [Fact]
    public async Task Neuanlage_ohne_Bootstrap_erzeugt_keinen_Eintrag()
    {
        using (await ClientMit(Testbenutzer.OhneRolle()).GetAsync(MeUrl))
        {
        }

        Assert.Empty(await AuditDb.AlleAsync());
    }

    [Fact]
    public async Task Zehn_parallele_Erstaufrufe_des_Bootstrap_Admins_erzeugen_einen_Benutzer_und_einen_Eintrag()
    {
        var antworten = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => Client.GetAsync(MeUrl)));
        foreach (var antwort in antworten)
        {
            Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
            antwort.Dispose();
        }

        Assert.Single(await BenutzerDb.AlleAsync());
        Assert.Single(await AuditDb.AlleAsync());
    }

    // ---------- AK-21: unveränderlich ----------

    [Fact]
    public async Task UPDATE_auf_benutzer_audit_scheitert_mit_einer_Exception()
    {
        await AdminIdAsync();

        var fehler = await AuditDb.RohAusfuehrenAsync("UPDATE benutzer_audit SET neu = 'Betrachter'");

        var postgres = Assert.IsType<PostgresException>(fehler);
        Assert.Contains("benutzer_audit ist unveränderlich", postgres.MessageText);
    }

    [Fact]
    public async Task DELETE_auf_benutzer_audit_scheitert_mit_einer_Exception()
    {
        await AdminIdAsync();

        var fehler = await AuditDb.RohAusfuehrenAsync("DELETE FROM benutzer_audit");

        var postgres = Assert.IsType<PostgresException>(fehler);
        Assert.Contains("benutzer_audit ist unveränderlich", postgres.MessageText);
    }

    [Fact]
    public async Task Nach_UPDATE_und_DELETE_Versuch_sind_die_Zeilen_unveraendert()
    {
        await AdminIdAsync();
        var vorher = await AuditDb.AlleAsync();

        await AuditDb.RohAusfuehrenAsync("UPDATE benutzer_audit SET neu = 'Betrachter'");
        await AuditDb.RohAusfuehrenAsync("DELETE FROM benutzer_audit");

        Assert.Equal(vorher, await AuditDb.AlleAsync());
    }

    [Fact]
    public async Task Check_Constraint_verhindert_ungueltige_Werte()
    {
        var adminId = await AdminIdAsync();

        var fehler = await AuditDb.RohAusfuehrenAsync(
            $"INSERT INTO benutzer_audit (id, zeitpunkt, akteur_id, benutzer_id, art, alt, neu) VALUES (gen_random_uuid(), now(), NULL, '{adminId}', 'Rolle', 'keine', 'Superuser')");

        Assert.Equal(PostgresErrorCodes.CheckViolation, Assert.IsType<PostgresException>(fehler).SqlState);
    }

    [Fact]
    public async Task Check_Constraint_verhindert_gleiche_Werte_fuer_alt_und_neu()
    {
        var adminId = await AdminIdAsync();

        var fehler = await AuditDb.RohAusfuehrenAsync(
            $"INSERT INTO benutzer_audit (id, zeitpunkt, akteur_id, benutzer_id, art, alt, neu) VALUES (gen_random_uuid(), now(), NULL, '{adminId}', 'Status', 'aktiv', 'aktiv')");

        Assert.Equal(PostgresErrorCodes.CheckViolation, Assert.IsType<PostgresException>(fehler).SqlState);
    }

    [Fact]
    public async Task Benutzer_mit_Audit_Eintraegen_koennen_nicht_geloescht_werden()
    {
        var adminId = await AdminIdAsync();

        var fehler = await AuditDb.RohAusfuehrenAsync($"DELETE FROM benutzer WHERE id = '{adminId}'");

        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, Assert.IsType<PostgresException>(fehler).SqlState);
    }
}
