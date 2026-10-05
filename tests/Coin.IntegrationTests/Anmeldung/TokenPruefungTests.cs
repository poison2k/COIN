using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Anmeldung;

/// <summary>Feature anmeldung-keycloak: AK-7 (401 ohne gültiges Token) und AK-8 (Ablehnungsfälle).</summary>
public class TokenPruefungTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    // ---------- AK-7: ohne Token ----------

    public static TheoryData<string, string> GeschuetzteEndpunkte => new()
    {
        { "POST", CoinsUrl },
        { "PUT", $"{CoinsUrl}/{Guid.NewGuid()}/bild" },
        { "GET", MeUrl },
    };

    private static HttpRequestMessage Anfrage(string methode, string url)
    {
        var anfrage = new HttpRequestMessage(new HttpMethod(methode), url);
        anfrage.Content = methode switch
        {
            "POST" => JsonContent.Create(GueltigerCoin()),
            "PUT" => Multipart(Testbilder.Png()),
            _ => null,
        };
        return anfrage;
    }

    [Theory]
    [MemberData(nameof(GeschuetzteEndpunkte))]
    public async Task Ohne_Token_liefert_geschuetzter_Endpunkt_401_als_ProblemDetails(string methode, string url)
    {
        using var anfrage = Anfrage(methode, url);

        using var antwort = await Anonym.SendAsync(anfrage);

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.Unauthorized);
    }

    [Theory]
    [MemberData(nameof(GeschuetzteEndpunkte))]
    public async Task Ohne_Token_hat_die_401_Antwort_den_Titel_Nicht_angemeldet(string methode, string url)
    {
        using var anfrage = Anfrage(methode, url);

        using var antwort = await Anonym.SendAsync(anfrage);

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.Unauthorized);
        Assert.Equal("Nicht angemeldet", json.GetProperty("title").GetString());
    }

    [Theory]
    [MemberData(nameof(GeschuetzteEndpunkte))]
    public async Task Ohne_Token_sendet_die_401_Antwort_WWW_Authenticate_Bearer(string methode, string url)
    {
        using var anfrage = Anfrage(methode, url);

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
        var challenge = Assert.Single(antwort.Headers.WwwAuthenticate);
        Assert.Equal("Bearer", challenge.Scheme);
    }

    [Fact]
    public async Task Ungueltiges_Token_liefert_WWW_Authenticate_ohne_error_description()
    {
        var token = Idp.ErzeugeToken(new TokenDaten { AblaufIn = TimeSpan.FromHours(-2), AusgestelltVersatz = TimeSpan.FromHours(-3) });
        var client = ClientMitToken(token);

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
        var header = string.Join(", ", antwort.Headers.WwwAuthenticate.Select(h => h.ToString()));
        Assert.StartsWith("Bearer", header);
        Assert.DoesNotContain("error_description", header);
    }

    [Fact]
    public async Task Ungueltiges_Token_liefert_keine_Fehlerdetails_im_Body()
    {
        var token = Idp.ErzeugeToken(new TokenDaten { Audience = "fremde-api" });
        var client = ClientMitToken(token);

        using var antwort = await client.GetAsync(MeUrl);
        var body = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
        Assert.DoesNotContain("IDX", body);
        Assert.DoesNotContain("audience", body, StringComparison.OrdinalIgnoreCase);
    }

    // ---------- AK-8: gültiges Token ----------

    [Fact]
    public async Task Gueltiges_Token_liefert_200_auf_api_me()
    {
        var client = ClientMit(new TokenDaten());

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Gueltiges_Token_mit_typ_at_jwt_wird_akzeptiert()
    {
        var client = ClientMit(new TokenDaten { Typ = "at+jwt" });

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Token_mit_aud_als_Liste_inklusive_Audience_wird_akzeptiert()
    {
        var client = ClientMit(new TokenDaten { Audience = new[] { "account", TestIdentitaetsanbieter.Audience } });

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Token_das_vor_10_Sekunden_abgelaufen_ist_liegt_in_der_ClockSkew_und_wird_akzeptiert()
    {
        var client = ClientMit(new TokenDaten { AblaufIn = TimeSpan.FromSeconds(-10), AusgestelltVersatz = TimeSpan.FromMinutes(-5) });

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Das_Admin_Token_des_Standard_Clients_ist_gueltig()
    {
        using var antwort = await Client.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    // ---------- AK-8: Ablehnungsfälle ----------

    /// <summary>Fall-Bezeichnung → Token. Geprüft an GET /api/me und POST /api/coins.</summary>
    public static IReadOnlyDictionary<string, Func<string>> UngueltigeTokens { get; } = new Dictionary<string, Func<string>>
    {
        ["a_fremder_Issuer_mit_fremdem_Schluessel"] = () => TestIdentitaetsanbieter.Fremd.ErzeugeToken(new TokenDaten()),
        ["a_fremder_Schluessel_mit_eigenem_iss"] = () => TestIdentitaetsanbieter.Fremd.ErzeugeToken(new TokenDaten { Issuer = TestIdentitaetsanbieter.StandardAuthority }),
        ["b_richtiger_Schluessel_aber_fremdes_iss"] = () => Idp.ErzeugeToken(new TokenDaten { Issuer = TestIdentitaetsanbieter.FremdAuthority }),
        ["b_iss_mit_abschliessendem_Schraegstrich"] = () => Idp.ErzeugeToken(new TokenDaten { Issuer = TestIdentitaetsanbieter.StandardAuthority + "/" }),
        ["b_ohne_iss"] = () => Idp.ErzeugeToken(new TokenDaten { IssuerWeglassen = true }),
        ["c_ohne_aud"] = () => Idp.ErzeugeToken(new TokenDaten { Audience = null }),
        ["c_falsche_aud"] = () => Idp.ErzeugeToken(new TokenDaten { Audience = "account" }),
        ["c_aud_ist_ClientId"] = () => Idp.ErzeugeToken(new TokenDaten { Audience = TestIdentitaetsanbieter.ClientId }),
        ["d_exp_60_Sekunden_vorbei"] = () => Idp.ErzeugeToken(new TokenDaten { AblaufIn = TimeSpan.FromSeconds(-60), AusgestelltVersatz = TimeSpan.FromMinutes(-6) }),
        ["d_exp_lange_vorbei"] = () => Idp.ErzeugeToken(new TokenDaten { AblaufIn = TimeSpan.FromDays(-1), AusgestelltVersatz = TimeSpan.FromDays(-2) }),
        ["e_nbf_in_der_Zukunft"] = () => Idp.ErzeugeToken(new TokenDaten { NichtVorIn = TimeSpan.FromMinutes(5) }),
        ["f_alg_none"] = () => Idp.ErzeugeToken(new TokenDaten { Algorithmus = "none" }),
        ["f_RS256_ohne_Signatur"] = () => OhneSignatur(Idp.ErzeugeToken(new TokenDaten())),
        ["g_HS256_mit_oeffentlichem_Schluessel"] = () => Idp.ErzeugeToken(new TokenDaten { Algorithmus = "HS256" }),
        ["g_HS256_mit_beliebigem_Geheimnis"] = () => Idp.ErzeugeToken(new TokenDaten { Algorithmus = "HS256", HmacSchluessel = Encoding.UTF8.GetBytes(new string('x', 64)) }),
        ["h_typ_ID"] = () => Idp.ErzeugeToken(new TokenDaten { Typ = "ID" }),
        ["h_typ_Refresh"] = () => Idp.ErzeugeToken(new TokenDaten { Typ = "Refresh" }),
        ["i_ohne_sub"] = () => Idp.ErzeugeToken(new TokenDaten { Subject = null }),
        ["i_leeres_sub"] = () => Idp.ErzeugeToken(new TokenDaten { Subject = "" }),
        ["j_ohne_azp"] = () => Idp.ErzeugeToken(new TokenDaten { Azp = null }),
        ["j_fremdes_azp"] = () => Idp.ErzeugeToken(new TokenDaten { Azp = "anderer-client" }),
        ["l_manipuliertes_sub"] = () => ManipuliereClaim(Idp.ErzeugeToken(Testbenutzer.OhneRolle()), "sub", Testbenutzer.AdminSubject),
        ["l_manipulierte_email"] = () => ManipuliereClaim(Idp.ErzeugeToken(Testbenutzer.OhneRolle()), "email", Testbenutzer.AdminEmail),
        ["kein_JWT"] = () => "kein-jwt",
    };

    public static TheoryData<string> UngueltigeTokenFaelle => new(UngueltigeTokens.Keys);

    [Theory]
    [MemberData(nameof(UngueltigeTokenFaelle))]
    public async Task Ungueltiges_Token_liefert_401_auf_api_me(string fall)
    {
        var client = ClientMitToken(UngueltigeTokens[fall]());

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Theory]
    [MemberData(nameof(UngueltigeTokenFaelle))]
    public async Task Ungueltiges_Token_liefert_401_auf_POST_api_coins(string fall)
    {
        var client = ClientMitToken(UngueltigeTokens[fall]());

        using var antwort = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin());

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Theory]
    [MemberData(nameof(UngueltigeTokenFaelle))]
    public async Task Ungueltiges_Token_legt_keinen_Benutzer_an(string fall)
    {
        var client = ClientMitToken(UngueltigeTokens[fall]());

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal(0, await BenutzerDb.AnzahlAsync());
    }

    [Fact]
    public async Task k_Token_nur_im_Query_Parameter_access_token_liefert_401_auf_api_me()
    {
        var token = Idp.ErzeugeToken(new TokenDaten());

        using var antwort = await Anonym.GetAsync($"{MeUrl}?access_token={token}");

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task k_Token_nur_im_Query_Parameter_access_token_liefert_401_auf_POST_api_coins()
    {
        var token = Idp.ErzeugeToken(Testbenutzer.Admin);

        using var antwort = await Anonym.PostAsJsonAsync($"{CoinsUrl}?access_token={token}", GueltigerCoin());

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Token_als_Cookie_wird_nicht_ausgewertet()
    {
        using var anfrage = new HttpRequestMessage(HttpMethod.Get, MeUrl);
        anfrage.Headers.Add("Cookie", $"access_token={Idp.ErzeugeToken(new TokenDaten())}");

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Anderes_Authentifizierungsschema_als_Bearer_liefert_401()
    {
        using var anfrage = new HttpRequestMessage(HttpMethod.Get, MeUrl);
        anfrage.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String("admin:geheim"u8.ToArray()));

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Abgelehntes_Token_auf_POST_speichert_keinen_Coin()
    {
        var client = ClientMitToken(UngueltigeTokens["c_falsche_aud"]());

        using var antwort = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin());

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
        Assert.Empty(await LadeListeAsync());
    }

    private static string OhneSignatur(string token) => token[..(token.LastIndexOf('.') + 1)];

    /// <summary>Ändert einen Claim im Payload, Header und Signatur bleiben (AK-8 l).</summary>
    private static string ManipuliereClaim(string token, string claim, string wert)
    {
        var teile = token.Split('.');
        var payload = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(TestIdentitaetsanbieter.AusBase64Url(teile[1]))!;
        payload[claim] = JsonSerializer.SerializeToElement(wert);
        teile[1] = TestIdentitaetsanbieter.Base64Url(JsonSerializer.SerializeToUtf8Bytes(payload));
        return string.Join('.', teile);
    }
}
