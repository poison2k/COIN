using System.Net;
using System.Net.Http.Json;
using System.Text;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Anmeldung;

/// <summary>
/// Feature anmeldung-keycloak, AK-11 und AK-19: Policy coins.write (Administrator, Sachbearbeiter; bis
/// rollen-benutzerverwaltung „KatalogSchreiben“), 403 für Betrachter und Benutzer ohne Rolle, 401 ohne Token;
/// 401/403 gehen vor 400/404/415. rollen-benutzerverwaltung AK-6: 403-Body zusätzlich mit code=keine_berechtigung.
/// Sachbearbeiter und Betrachter werden direkt in der Test-DB gesetzt (nur Testdaten).
/// </summary>
public class SchreibrechteTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const string KeinZugriffDetail = "Ihr Benutzerkonto ist nicht berechtigt, den Coin-Katalog zu ändern.";

    private async Task<HttpClient> ClientFuerAsync(string wer) => wer switch
    {
        "Administrator" => Client,
        "anonym" => Anonym,
        "keine" => await ClientMitRolleAsync(null),
        _ => await ClientMitRolleAsync(wer),
    };

    // ---------- erlaubt ----------

    [Theory]
    [InlineData("Administrator")]
    [InlineData("Sachbearbeiter")]
    public async Task Post_ist_fuer_Schreibrollen_erlaubt(string rolle)
    {
        var client = await ClientFuerAsync(rolle);

        using var antwort = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin());

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Theory]
    [InlineData("Administrator")]
    [InlineData("Sachbearbeiter")]
    public async Task Put_Bild_ist_fuer_Schreibrollen_erlaubt(string rolle)
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var client = await ClientFuerAsync(rolle);

        using var antwort = await client.PutAsync(BildUrl(id), Multipart(Testbilder.Png()));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    // ---------- 403 ----------

    [Theory]
    [InlineData("Betrachter")]
    [InlineData("keine")]
    public async Task Post_liefert_403_fuer_Benutzer_ohne_Schreibrolle(string rolle)
    {
        var client = await ClientFuerAsync(rolle);

        using var antwort = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin());

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.Forbidden);
    }

    [Theory]
    [InlineData("Betrachter")]
    [InlineData("keine")]
    public async Task Put_Bild_liefert_403_fuer_Benutzer_ohne_Schreibrolle(string rolle)
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var client = await ClientFuerAsync(rolle);

        using var antwort = await client.PutAsync(BildUrl(id), Multipart(Testbilder.Png()));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.Forbidden);
    }

    [Theory]
    [InlineData("Betrachter")]
    [InlineData("keine")]
    public async Task Die_403_Antwort_hat_Titel_Kein_Zugriff_den_festen_Detailtext_und_code_keine_berechtigung(string rolle)
    {
        var client = await ClientFuerAsync(rolle);

        using var antwort = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin());

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.Forbidden);
        Assert.Equal("Kein Zugriff", json.GetProperty("title").GetString());
        Assert.Equal(KeinZugriffDetail, json.GetProperty("detail").GetString());
        Assert.Equal("keine_berechtigung", json.GetProperty("code").GetString());
    }

    [Theory]
    [InlineData("Betrachter")]
    [InlineData("keine")]
    public async Task Die_403_Antwort_auf_Put_Bild_hat_den_festen_Detailtext_und_code_keine_berechtigung(string rolle)
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var client = await ClientFuerAsync(rolle);

        using var antwort = await client.PutAsync(BildUrl(id), Multipart(Testbilder.Png()));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.Forbidden);
        Assert.Equal("Kein Zugriff", json.GetProperty("title").GetString());
        Assert.Equal(KeinZugriffDetail, json.GetProperty("detail").GetString());
        Assert.Equal("keine_berechtigung", json.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Abgelehnter_Post_speichert_keinen_Coin()
    {
        var client = await ClientFuerAsync("Betrachter");

        using var antwort = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin());

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
        Assert.Empty(await LadeListeAsync());
    }

    [Fact]
    public async Task Abgelehnter_Put_speichert_kein_Bild()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var client = await ClientFuerAsync("Betrachter");

        using var antwort = await client.PutAsync(BildUrl(id), Multipart(Testbilder.Png()));

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
        using var abruf = await Anonym.GetAsync(BildUrl(id));
        Assert.Equal(HttpStatusCode.NotFound, abruf.StatusCode);
    }

    // ---------- 401 ----------

    [Fact]
    public async Task Post_ohne_Token_liefert_401_und_speichert_nichts()
    {
        using var antwort = await Anonym.PostAsJsonAsync(CoinsUrl, GueltigerCoin());

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
        Assert.Empty(await LadeListeAsync());
    }

    [Fact]
    public async Task Put_Bild_ohne_Token_liefert_401_und_speichert_nichts()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await Anonym.PutAsync(BildUrl(id), Multipart(Testbilder.Png()));

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
        using var abruf = await Anonym.GetAsync(BildUrl(id));
        Assert.Equal(HttpStatusCode.NotFound, abruf.StatusCode);
    }

    // ---------- AK-11: Rollen aus dem Token werden ignoriert ----------

    private static TokenDaten MitTokenRollen() => Testbenutzer.OhneRolle() with
    {
        Zusatz = new Dictionary<string, object?>
        {
            ["realm_access"] = new { roles = new[] { "Administrator" } },
            ["resource_access"] = new Dictionary<string, object> { [TestIdentitaetsanbieter.ClientId] = new { roles = new[] { "Administrator" } } },
            ["roles"] = "Administrator",
            ["role"] = "Administrator",
            ["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] = "Administrator",
        },
    };

    [Fact]
    public async Task Rollen_im_Token_berechtigen_nicht_zum_Schreiben()
    {
        var client = ClientMit(MitTokenRollen());

        using var antwort = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin());

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Rollen_im_Token_erscheinen_nicht_in_api_me()
    {
        var client = ClientMit(MitTokenRollen());

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal("keine", (await JsonAsync(antwort)).GetProperty("rolle").GetString());
    }

    // ---------- Reihenfolge: 401/403 vor 400/404/415 ----------

    public static TheoryData<string, string> Reihenfolge => new()
    {
        { "anonym", "401" },
        { "Betrachter", "403" },
        { "keine", "403" },
    };

    [Theory]
    [MemberData(nameof(Reihenfolge))]
    public async Task Post_mit_ungueltigen_Daten_liefert_401_oder_403_statt_400(string wer, string erwartet)
    {
        var client = await ClientFuerAsync(wer);

        using var antwort = await client.PostAsJsonAsync(CoinsUrl, new { name = "", herausgeber = "" });

        Assert.Equal(erwartet, ((int)antwort.StatusCode).ToString());
    }

    [Theory]
    [MemberData(nameof(Reihenfolge))]
    public async Task Post_mit_kaputtem_JSON_liefert_401_oder_403_statt_400(string wer, string erwartet)
    {
        var client = await ClientFuerAsync(wer);

        using var antwort = await client.PostAsync(CoinsUrl, new StringContent("{ kaputt", Encoding.UTF8, "application/json"));

        Assert.Equal(erwartet, ((int)antwort.StatusCode).ToString());
    }

    [Theory]
    [MemberData(nameof(Reihenfolge))]
    public async Task Post_mit_falschem_Content_Type_liefert_401_oder_403_statt_415(string wer, string erwartet)
    {
        var client = await ClientFuerAsync(wer);

        using var antwort = await client.PostAsync(CoinsUrl, new StringContent("name=Coin", Encoding.UTF8, "text/plain"));

        Assert.Equal(erwartet, ((int)antwort.StatusCode).ToString());
    }

    [Theory]
    [MemberData(nameof(Reihenfolge))]
    public async Task Put_Bild_fuer_unbekannten_Coin_liefert_401_oder_403_statt_404(string wer, string erwartet)
    {
        var client = await ClientFuerAsync(wer);

        using var antwort = await client.PutAsync(BildUrl(Guid.NewGuid()), Multipart(Testbilder.Png()));

        Assert.Equal(erwartet, ((int)antwort.StatusCode).ToString());
    }

    [Theory]
    [MemberData(nameof(Reihenfolge))]
    public async Task Put_Bild_mit_nicht_unterstuetztem_Format_liefert_401_oder_403_statt_415(string wer, string erwartet)
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var client = await ClientFuerAsync(wer);

        using var antwort = await client.PutAsync(BildUrl(id), Multipart(Testbilder.Gif()));

        Assert.Equal(erwartet, ((int)antwort.StatusCode).ToString());
    }

    [Theory]
    [MemberData(nameof(Reihenfolge))]
    public async Task Put_Bild_ohne_Datei_liefert_401_oder_403_statt_400(string wer, string erwartet)
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var client = await ClientFuerAsync(wer);

        using var antwort = await client.PutAsync(BildUrl(id), Multipart(Testbilder.Png(), feld: "falsches_feld"));

        Assert.Equal(erwartet, ((int)antwort.StatusCode).ToString());
    }

    [Theory]
    [MemberData(nameof(Reihenfolge))]
    public async Task Put_Bild_mit_falschem_Content_Type_liefert_401_oder_403_statt_415(string wer, string erwartet)
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var client = await ClientFuerAsync(wer);

        using var antwort = await client.PutAsync(BildUrl(id), new ByteArrayContent(Testbilder.Png()) { Headers = { ContentType = new("image/png") } });

        Assert.Equal(erwartet, ((int)antwort.StatusCode).ToString());
    }

    // ---------- Upload-Body wird bei 401/403 nicht gelesen ----------

    [Theory]
    [InlineData("anonym")]
    [InlineData("Betrachter")]
    public async Task Bei_401_oder_403_liest_die_API_den_Upload_Body_nicht(string wer)
    {
        var zaehler = new KoerperLeseZaehler();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { KoerperZaehler = zaehler });
        using var admin = factory.CreateClient();
        using var anlegen = await admin.PostAsJsonAsync(CoinsUrl, GueltigerCoin());
        var id = (await JsonAsync(anlegen)).GetProperty("id").GetGuid();
        using var client = wer == "anonym" ? factory.ClientOhneToken() : await BetrachterAsync(factory);
        zaehler.Zuruecksetzen();

        using var antwort = await client.PutAsync(BildUrl(id), Multipart(Testbilder.Png(1024 * 1024)));

        Assert.True(antwort.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden, $"Status {antwort.StatusCode}");
        Assert.Equal(0, zaehler.GelesenBytes);
    }

    [Fact]
    public async Task Kontrolle_der_Body_Messung_Admin_Upload_liest_den_Body()
    {
        var zaehler = new KoerperLeseZaehler();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { KoerperZaehler = zaehler });
        using var admin = factory.CreateClient();
        using var anlegen = await admin.PostAsJsonAsync(CoinsUrl, GueltigerCoin());
        var id = (await JsonAsync(anlegen)).GetProperty("id").GetGuid();
        zaehler.Zuruecksetzen();

        using var antwort = await admin.PutAsync(BildUrl(id), Multipart(Testbilder.Png(1024 * 1024)));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.True(zaehler.GelesenBytes >= 1024 * 1024, $"gelesen: {zaehler.GelesenBytes}");
    }

    private async Task<HttpClient> BetrachterAsync(CoinApiFactory factory)
    {
        var daten = Testbenutzer.OhneRolle();
        var client = factory.ClientMitToken(Idp.ErzeugeToken(daten));
        using var me = await client.GetAsync(MeUrl);
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        await BenutzerDb.RolleSetzenAsync(daten.Subject!, "Betrachter");
        return client;
    }
}
