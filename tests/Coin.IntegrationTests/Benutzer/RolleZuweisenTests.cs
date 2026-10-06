using System.Net;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Benutzer;

/// <summary>
/// Feature rollen-benutzerverwaltung, AK-12, AK-15, AK-16, AK-18: <c>PUT /api/benutzer/{id}/rolle</c>.
/// AK-15 („letzter aktiver Administrator“) ist über die API mit konsistenten Daten nicht erreichbar, weil der Akteur
/// selbst aktiver Administrator sein muss und AK-16 vorgeht; die Regel prüfen SchutzregelnTests und
/// BenutzerverwaltungServiceTests, hier wird die Vorrangregel AK-16 vor AK-15 beim einzigen Admin geprüft.
/// </summary>
public class RolleZuweisenTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const string DetailEigenesKonto =
        "Sie können sich nicht selbst die Administratorrolle entziehen oder Ihr eigenes Konto deaktivieren.";

    private const string RolleUngueltig = "Bitte eine gültige Rolle wählen.";

    // ---------- Erfolg ----------

    [Theory]
    [InlineData("Administrator")]
    [InlineData("Sachbearbeiter")]
    [InlineData("Betrachter")]
    public async Task Rolle_setzen_liefert_200_und_speichert_die_Rolle(string rolle)
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null);

        using var antwort = await PutRolleAsync(Client, ziel.Id, rolle);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(rolle, (await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Rolle);
    }

    [Fact]
    public async Task Antwort_ist_der_geaenderte_Eintrag_in_der_Form_der_Liste()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null, name: "Test Rollenziel", email: "rollenziel@coin-test.invalid");

        using var antwort = await PutRolleAsync(Client, ziel.Id, "Sachbearbeiter");
        var json = await JsonAsync(antwort);

        Assert.Equal(
            ["aktiv", "email", "erstelltAm", "id", "name", "rolle"],
            json.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal));
        Assert.Equal(ziel.Id, json.GetProperty("id").GetGuid());
        Assert.Equal("Test Rollenziel", json.GetProperty("name").GetString());
        Assert.Equal("rollenziel@coin-test.invalid", json.GetProperty("email").GetString());
        Assert.Equal("Sachbearbeiter", json.GetProperty("rolle").GetString());
        Assert.True(json.GetProperty("aktiv").GetBoolean());
    }

    [Fact]
    public async Task Rolle_setzen_sendet_Cache_Control_no_store()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null);

        using var antwort = await PutRolleAsync(Client, ziel.Id, "Betrachter");

        Assert.True(antwort.Headers.CacheControl?.NoStore, $"Cache-Control: {antwort.Headers.CacheControl}");
    }

    [Fact]
    public async Task Rolle_keine_entzieht_die_Rolle_und_speichert_NULL()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Sachbearbeiter");

        using var antwort = await PutRolleAsync(Client, ziel.Id, "keine");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("keine", (await JsonAsync(antwort)).GetProperty("rolle").GetString());
        Assert.Null((await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Rolle);
    }

    [Fact]
    public async Task Rolle_setzen_aendert_den_Status_nicht()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Betrachter", aktiv: false);

        using var antwort = await PutRolleAsync(Client, ziel.Id, "Sachbearbeiter");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.False((await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Aktiv);
    }

    [Fact]
    public async Task Gleiche_Rolle_liefert_200_ohne_Schreiben_und_ohne_Audit()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Betrachter");
        var vorher = await BenutzerDb.RolleUndStatusAsync(ziel.Id);
        var auditVorher = await AuditDb.AnzahlAsync();

        using var antwort = await PutRolleAsync(Client, ziel.Id, "Betrachter");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("Betrachter", (await JsonAsync(antwort)).GetProperty("rolle").GetString());
        Assert.Equal(vorher.Xmin, (await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Xmin);
        Assert.Equal(auditVorher, await AuditDb.AnzahlAsync());
    }

    [Fact]
    public async Task Gleiche_Rolle_keine_liefert_200_ohne_Audit()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null);
        var auditVorher = await AuditDb.AnzahlAsync();

        using var antwort = await PutRolleAsync(Client, ziel.Id, "keine");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(auditVorher, await AuditDb.AnzahlAsync());
    }

    // ---------- 400 ----------

    [Theory]
    [InlineData("{ \"rolle\": \"Superuser\" }")]
    [InlineData("{ \"rolle\": \"administrator\" }")]
    [InlineData("{ \"rolle\": \"Keine\" }")]
    [InlineData("{ \"rolle\": \"0\" }")]
    [InlineData("{ \"rolle\": \"\" }")]
    [InlineData("{ \"rolle\": null }")]
    [InlineData("{ }")]
    public async Task Ungueltige_oder_fehlende_Rolle_liefert_400_mit_deutscher_Meldung_an_rolle(string body)
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null);

        using var antwort = await PutRohAsync(Client, RolleUrl(ziel.Id), body);

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
        var meldungen = json.GetProperty("errors").GetProperty("rolle").EnumerateArray().Select(m => m.GetString()!).ToArray();
        Assert.Equal([RolleUngueltig], meldungen);
    }

    [Fact]
    public async Task Ungueltige_Rolle_aendert_nichts()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Betrachter");
        var auditVorher = await AuditDb.AnzahlAsync();

        using var antwort = await PutRohAsync(Client, RolleUrl(ziel.Id), "{ \"rolle\": \"Superuser\" }");

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        Assert.Equal("Betrachter", (await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Rolle);
        Assert.Equal(auditVorher, await AuditDb.AnzahlAsync());
    }

    // ---------- 404 ----------

    [Fact]
    public async Task Unbekannte_Id_liefert_404_Benutzer_nicht_gefunden()
    {
        await AdminIdAsync();

        using var antwort = await PutRolleAsync(Client, Guid.NewGuid(), "Betrachter");

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Benutzer nicht gefunden", json.GetProperty("title").GetString());
    }

    // ---------- AK-16: Selbstschutz ----------

    [Theory]
    [InlineData("Sachbearbeiter")]
    [InlineData("Betrachter")]
    [InlineData("keine")]
    public async Task Eigene_Adminrolle_entziehen_liefert_409_eigenes_konto(string rolle)
    {
        var adminId = await AdminIdAsync();

        using var antwort = await PutRolleAsync(Client, adminId, rolle);

        var json = await AssertKonfliktAsync(antwort, "eigenes_konto");
        Assert.Equal(DetailEigenesKonto, json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Eigene_Adminrolle_entziehen_liefert_409_auch_wenn_weitere_Admins_existieren()
    {
        var adminId = await AdminIdAsync();
        await ZweiterAdminAsync();

        using var antwort = await PutRolleAsync(Client, adminId, "Betrachter");

        await AssertKonfliktAsync(antwort, "eigenes_konto");
    }

    [Fact]
    public async Task Eigenes_Konto_wird_vor_letzter_Administrator_geprueft()
    {
        // Einziger aktiver Admin entzieht sich selbst die Rolle: beide Regeln greifen, AK-16 geht vor.
        var adminId = await AdminIdAsync();

        using var antwort = await PutRolleAsync(Client, adminId, "Betrachter");

        await AssertKonfliktAsync(antwort, "eigenes_konto");
    }

    [Fact]
    public async Task Abgelehnte_Selbstherabstufung_schreibt_nichts_und_kein_Audit()
    {
        var adminId = await AdminIdAsync();
        await ZweiterAdminAsync();
        var vorher = await BenutzerDb.RolleUndStatusAsync(adminId);
        var auditVorher = await AuditDb.AnzahlAsync();

        using var antwort = await PutRolleAsync(Client, adminId, "Sachbearbeiter");

        Assert.Equal(HttpStatusCode.Conflict, antwort.StatusCode);
        Assert.Equal(vorher, await BenutzerDb.RolleUndStatusAsync(adminId));
        Assert.Equal(auditVorher, await AuditDb.AnzahlAsync());
    }

    [Fact]
    public async Task Eigene_Adminrolle_erneut_setzen_liefert_200()
    {
        var adminId = await AdminIdAsync();

        using var antwort = await PutRolleAsync(Client, adminId, "Administrator");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    // ---------- AK-18 ----------

    [Theory]
    [InlineData("Sachbearbeiter")]
    [InlineData("Betrachter")]
    [InlineData("keine")]
    public async Task Admin_stuft_einen_anderen_Admin_herab_wenn_ein_aktiver_Admin_bleibt(string rolle)
    {
        await AdminIdAsync();
        var zweiter = await ZweiterAdminAsync();

        using var antwort = await PutRolleAsync(Client, zweiter.Id, rolle);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(1, await BenutzerDb.AnzahlAktiverAdministratorenAsync());
    }

    [Fact]
    public async Task Herabgestufter_Admin_verliert_sofort_users_manage()
    {
        await AdminIdAsync();
        var zweiter = await ZweiterAdminAsync();
        using (await PutRolleAsync(Client, zweiter.Id, "Sachbearbeiter"))
        {
        }

        using var antwort = await zweiter.Client.GetAsync(BenutzerUrl);

        await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
    }

    [Fact]
    public async Task Deaktivierter_Admin_kann_herabgestuft_werden()
    {
        await AdminIdAsync();
        var deaktiviert = await KontoAsync("Administrator", aktiv: false);

        using var antwort = await PutRolleAsync(Client, deaktiviert.Id, "Betrachter");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Neu_ernannter_Admin_kann_sofort_Benutzer_verwalten()
    {
        await AdminIdAsync();
        var konto = await KontoAsync("Sachbearbeiter");
        using (await PutRolleAsync(Client, konto.Id, "Administrator"))
        {
        }

        using var antwort = await konto.Client.GetAsync(BenutzerUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    // ---------- AK-9: Login-Abgleich ändert die Rolle nie, Bootstrap nur bei Neuanlage ----------

    [Fact]
    public async Task Herabgestufter_Bootstrap_Admin_wird_beim_naechsten_Login_nicht_wieder_Administrator()
    {
        var adminId = await AdminIdAsync();
        var zweiter = await ZweiterAdminAsync();
        using (var antwort = await PutRolleAsync(zweiter.Client, adminId, "Sachbearbeiter"))
        {
            Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        }

        using var me = await ClientMit(Testbenutzer.Admin with { Name = "Test Administrator Neu" }).GetAsync(MeUrl);

        Assert.Equal("Sachbearbeiter", (await JsonAsync(me)).GetProperty("rolle").GetString());
        Assert.Equal("Sachbearbeiter", (await BenutzerDb.RolleUndStatusAsync(adminId)).Rolle);
    }

    [Fact]
    public async Task Per_API_gesetzte_Rolle_bleibt_nach_Login_mit_geaenderten_Claims_erhalten()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null, name: "Test Alter Name");
        using (await PutRolleAsync(Client, ziel.Id, "Betrachter"))
        {
        }

        using var me = await ClientMit(new TokenDaten { Subject = ziel.Subject, Name = "Test Neuer Name", Email = "neu.mail@coin-test.invalid" })
            .GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Equal("Betrachter", (await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Rolle);
    }
}
