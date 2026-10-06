using System.Net;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Benutzer;

/// <summary>
/// Feature rollen-benutzerverwaltung, AK-9, AK-13, AK-16, AK-18: <c>PUT /api/benutzer/{id}/status</c> und Spalte
/// <c>benutzer.aktiv</c>. Der Login-Abgleich ändert weder <c>aktiv</c> noch <c>rolle</c>.
/// </summary>
public class StatusSetzenTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const string AktivFehlt = "Bitte angeben, ob der Benutzer aktiv ist.";

    // ---------- AK-9: Spalte aktiv ----------

    [Fact]
    public async Task Neue_Benutzer_sind_aktiv()
    {
        var konto = await KontoAsync(null);

        Assert.True((await BenutzerDb.RolleUndStatusAsync(konto.Id)).Aktiv);
    }

    [Fact]
    public async Task Neu_angelegter_Bootstrap_Admin_ist_aktiv()
    {
        var adminId = await AdminIdAsync();

        Assert.True((await BenutzerDb.RolleUndStatusAsync(adminId)).Aktiv);
    }

    [Fact]
    public async Task Login_Abgleich_eines_Deaktivierten_liefert_403_aktualisiert_den_Namen_und_laesst_aktiv_und_rolle_unveraendert()
    {
        await AdminIdAsync();
        var konto = await KontoAsync("Sachbearbeiter", name: "Test Vorher");
        using (var deaktivieren = await PutStatusAsync(Client, konto.Id, false))
        {
            Assert.Equal(HttpStatusCode.OK, deaktivieren.StatusCode);
        }

        using var me = await ClientMit(new TokenDaten { Subject = konto.Subject, Email = konto.Email, Name = "Test Nachher" }).GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.Forbidden, me.StatusCode);
        var zeile = await BenutzerDb.EinzigerAsync(konto.Subject);
        Assert.Equal("Test Nachher", zeile.Anzeigename);
        var (rolle, aktiv, _) = await BenutzerDb.RolleUndStatusAsync(konto.Id);
        Assert.False(aktiv);
        Assert.Equal("Sachbearbeiter", rolle);
    }

    [Fact]
    public async Task Deaktivierter_Bootstrap_Admin_bleibt_beim_naechsten_Login_deaktiviert()
    {
        var adminId = await AdminIdAsync();
        var zweiter = await ZweiterAdminAsync();
        using (var antwort = await PutStatusAsync(zweiter.Client, adminId, false))
        {
            Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        }

        using var me = await Client.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.Forbidden, me.StatusCode);
        Assert.False((await BenutzerDb.RolleUndStatusAsync(adminId)).Aktiv);
        Assert.Equal("Administrator", (await BenutzerDb.RolleUndStatusAsync(adminId)).Rolle);
    }

    // ---------- AK-13 ----------

    [Fact]
    public async Task Deaktivieren_liefert_200_mit_dem_Eintrag_aktiv_false()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Betrachter");

        using var antwort = await PutStatusAsync(Client, ziel.Id, false);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        var json = await JsonAsync(antwort);
        Assert.Equal(
            ["aktiv", "email", "erstelltAm", "id", "name", "rolle"],
            json.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal));
        Assert.False(json.GetProperty("aktiv").GetBoolean());
        Assert.Equal(ziel.Id, json.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Deaktivieren_speichert_aktiv_false()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Betrachter");

        using (await PutStatusAsync(Client, ziel.Id, false))
        {
        }

        Assert.False((await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Aktiv);
    }

    [Fact]
    public async Task Deaktivieren_entzieht_keine_Rolle()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Sachbearbeiter");

        using var antwort = await PutStatusAsync(Client, ziel.Id, false);

        Assert.Equal("Sachbearbeiter", (await JsonAsync(antwort)).GetProperty("rolle").GetString());
        Assert.Equal("Sachbearbeiter", (await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Rolle);
    }

    [Fact]
    public async Task Reaktivieren_liefert_200_und_speichert_aktiv_true()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Betrachter", aktiv: false);

        using var antwort = await PutStatusAsync(Client, ziel.Id, true);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.True((await JsonAsync(antwort)).GetProperty("aktiv").GetBoolean());
        Assert.True((await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Aktiv);
    }

    [Fact]
    public async Task Status_setzen_sendet_Cache_Control_no_store()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Betrachter");

        using var antwort = await PutStatusAsync(Client, ziel.Id, false);

        Assert.True(antwort.Headers.CacheControl?.NoStore, $"Cache-Control: {antwort.Headers.CacheControl}");
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Gleicher_Status_liefert_200_ohne_Schreiben_und_ohne_Audit(bool aktiv)
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Betrachter", aktiv: aktiv);
        var vorher = await BenutzerDb.RolleUndStatusAsync(ziel.Id);
        var auditVorher = await AuditDb.AnzahlAsync();

        using var antwort = await PutStatusAsync(Client, ziel.Id, aktiv);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(vorher.Xmin, (await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Xmin);
        Assert.Equal(auditVorher, await AuditDb.AnzahlAsync());
    }

    [Theory]
    [InlineData("{ }")]
    [InlineData("{ \"aktiv\": null }")]
    public async Task Fehlendes_aktiv_liefert_400_mit_deutscher_Meldung_an_aktiv(string body)
    {
        await AdminIdAsync();
        var ziel = await KontoAsync("Betrachter");

        using var antwort = await PutRohAsync(Client, StatusUrl(ziel.Id), body);

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
        var meldungen = json.GetProperty("errors").GetProperty("aktiv").EnumerateArray().Select(m => m.GetString()!).ToArray();
        Assert.Equal([AktivFehlt], meldungen);
    }

    [Fact]
    public async Task Unbekannte_Id_liefert_404_Benutzer_nicht_gefunden()
    {
        await AdminIdAsync();

        using var antwort = await PutStatusAsync(Client, Guid.NewGuid(), false);

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Benutzer nicht gefunden", json.GetProperty("title").GetString());
    }

    // ---------- AK-16: sich selbst deaktivieren ----------

    [Fact]
    public async Task Sich_selbst_deaktivieren_liefert_409_eigenes_konto()
    {
        var adminId = await AdminIdAsync();

        using var antwort = await PutStatusAsync(Client, adminId, false);

        var json = await AssertKonfliktAsync(antwort, "eigenes_konto");
        Assert.Equal(
            "Sie können sich nicht selbst die Administratorrolle entziehen oder Ihr eigenes Konto deaktivieren.",
            json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Sich_selbst_deaktivieren_liefert_409_auch_mit_weiteren_Admins_und_schreibt_nichts()
    {
        var adminId = await AdminIdAsync();
        await ZweiterAdminAsync();
        var auditVorher = await AuditDb.AnzahlAsync();

        using var antwort = await PutStatusAsync(Client, adminId, false);

        await AssertKonfliktAsync(antwort, "eigenes_konto");
        Assert.True((await BenutzerDb.RolleUndStatusAsync(adminId)).Aktiv);
        Assert.Equal(auditVorher, await AuditDb.AnzahlAsync());
    }

    [Fact]
    public async Task Sich_selbst_aktiv_setzen_liefert_200()
    {
        var adminId = await AdminIdAsync();

        using var antwort = await PutStatusAsync(Client, adminId, true);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    // ---------- AK-18 ----------

    [Fact]
    public async Task Admin_deaktiviert_einen_anderen_Admin_wenn_ein_aktiver_Admin_bleibt()
    {
        await AdminIdAsync();
        var zweiter = await ZweiterAdminAsync();

        using var antwort = await PutStatusAsync(Client, zweiter.Id, false);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(1, await BenutzerDb.AnzahlAktiverAdministratorenAsync());
    }

    [Fact]
    public async Task Reaktivierter_Admin_ist_wieder_aktiver_Administrator()
    {
        await AdminIdAsync();
        var zweiter = await KontoAsync("Administrator", aktiv: false);

        using (var antwort = await PutStatusAsync(Client, zweiter.Id, true))
        {
            Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        }

        Assert.Equal(2, await BenutzerDb.AnzahlAktiverAdministratorenAsync());
        using var liste = await zweiter.Client.GetAsync(BenutzerUrl);
        Assert.Equal(HttpStatusCode.OK, liste.StatusCode);
    }
}
