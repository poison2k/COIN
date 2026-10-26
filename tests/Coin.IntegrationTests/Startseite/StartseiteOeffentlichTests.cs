using System.Net;
using Coin.IntegrationTests.Infrastruktur;
using Coin.Testdaten;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-12, AK-15 und AK-37 (Rev. 2, ADR-0032): <c>…/kopf</c> und <c>…/logos/{platz}</c> sind öffentlich
/// und tokenunabhängig – ohne Token, mit gültigem, ungültigem oder abgelaufenem Token, ohne Rolle, als Betrachter und als
/// deaktivierter Benutzer dieselben Bytes und <c>200</c>, kein <c>Vary: Authorization</c>, kein Benutzerabgleich.
/// Gegenprobe: Besucher ohne <c>coins.read</c> erhalten auf <c>GET /api/startseite</c> keine Kennzahlen und keine Coins.
/// </summary>
public class StartseiteOeffentlichTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    /// <summary>Header, die mit und ohne Token gleich sein müssen.</summary>
    private static readonly string[] Header =
        ["Cache-Control", "Content-Type", "Content-Length", "ETag", "X-Content-Type-Options", "Content-Security-Policy", "Content-Disposition", "Vary"];

    public static TheoryData<string> Varianten => new()
    {
        "gueltig", "ungueltig", "abgelaufen", "fremder_Issuer", "kein_JWT", "ohne_Rolle", "Betrachter", "Sachbearbeiter", "Administrator", "deaktiviert",
    };

    private async Task<HttpClient> ClientFuerAsync(string variante) => variante switch
    {
        "gueltig" => ClientMitToken(Idp.ErzeugeToken(new TokenDaten())),
        "ungueltig" => ClientMitToken(Idp.ErzeugeToken(new TokenDaten { Audience = "fremde-api" })),
        "abgelaufen" => ClientMitToken(Idp.ErzeugeToken(new TokenDaten { AblaufIn = TimeSpan.FromHours(-1), AusgestelltVersatz = TimeSpan.FromHours(-2) })),
        "fremder_Issuer" => ClientMitToken(TestIdentitaetsanbieter.Fremd.ErzeugeToken(new TokenDaten())),
        "kein_JWT" => ClientMitToken("kein-jwt"),
        "ohne_Rolle" => await ClientMitRolleAsync(null),
        "deaktiviert" => await ClientMitRolleAsync("Administrator", aktiv: false),
        _ => await ClientMitRolleAsync(variante),
    };

    private static async Task<(HttpStatusCode Status, byte[] Body, string?[] Header)> AbrufAsync(HttpClient client, string url)
    {
        using var antwort = await client.GetAsync(url);
        return (antwort.StatusCode, await antwort.Content.ReadAsByteArrayAsync(), Header.Select(h => HeaderWert(antwort, h)).ToArray());
    }

    private static string? HeaderWert(HttpResponseMessage antwort, string name) =>
        antwort.Headers.TryGetValues(name, out var werte) || antwort.Content.Headers.TryGetValues(name, out werte)
            ? string.Join(",", werte)
            : null;

    private async Task<string> MitLogoAsync()
    {
        var antwort = await LogoHochladenAsync("bereitsteller", LogoBilder.Png(40, 20), "Wappen öffentlich");
        return antwort.GetProperty("kopf").GetProperty("logoBereitsteller").GetProperty("url").GetString()!;
    }

    // ---------- byte-gleich ----------

    [Theory]
    [MemberData(nameof(Varianten))]
    public async Task Kopf_ist_fuer_jede_Variante_byte_gleich_zur_anonymen_Antwort(string variante)
    {
        await MitLogoAsync();
        var anonym = await AbrufAsync(Anonym, KopfUrl);

        var mitToken = await AbrufAsync(await ClientFuerAsync(variante), KopfUrl);

        Assert.Equal(HttpStatusCode.OK, mitToken.Status);
        Assert.Equal(anonym.Body, mitToken.Body);
        Assert.Equal(anonym.Header, mitToken.Header);
    }

    [Theory]
    [MemberData(nameof(Varianten))]
    public async Task Logo_ist_fuer_jede_Variante_byte_gleich_zur_anonymen_Antwort(string variante)
    {
        var url = await MitLogoAsync();
        var anonym = await AbrufAsync(Anonym, url);

        var mitToken = await AbrufAsync(await ClientFuerAsync(variante), url);

        Assert.Equal(HttpStatusCode.OK, mitToken.Status);
        Assert.Equal(anonym.Body, mitToken.Body);
        Assert.Equal(anonym.Header, mitToken.Header);
    }

    [Theory]
    [InlineData("kopf")]
    [InlineData("logo")]
    public async Task Oeffentliche_Antworten_variieren_nicht_nach_Authorization(string art)
    {
        var url = await MitLogoAsync();

        using var antwort = await ClientMitToken("kein-jwt").GetAsync(art == "kopf" ? KopfUrl : url);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.DoesNotContain(antwort.Headers.Vary, v => v.Equals("Authorization", StringComparison.OrdinalIgnoreCase));
        Assert.False(antwort.Headers.Contains("WWW-Authenticate"));
    }

    [Fact]
    public async Task Fehlendes_Logo_liefert_auch_mit_ungueltigem_Token_404_statt_401()
    {
        using var antwort = await ClientMitToken("kein-jwt").GetAsync(LogoUrl("software"));

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    // ---------- kein Benutzerabgleich ----------

    [Fact]
    public async Task Oeffentliche_Abrufe_mit_gueltigem_Token_legen_keinen_Benutzer_an()
    {
        var url = await MitLogoAsync();
        var vorher = await BenutzerDb.AnzahlAsync();
        var client = ClientMit(new TokenDaten { Subject = "sub-nur-startseite" });

        using (await client.GetAsync(KopfUrl))
        using (await client.GetAsync(url))
        {
        }

        Assert.Equal(vorher, await BenutzerDb.AnzahlAsync());
    }

    [Fact]
    public async Task Oeffentliche_Abrufe_aendern_einen_vorhandenen_Benutzer_nicht()
    {
        var url = await MitLogoAsync();
        var vorher = await BenutzerDb.EinzigerAsync(Testbenutzer.AdminSubject);
        var client = ClientMit(Testbenutzer.Admin with { Email = "geaendert@coin-test.invalid", Name = "Geänderter Name" });

        using (await client.GetAsync(KopfUrl))
        using (await client.GetAsync(url))
        {
        }

        Assert.Equal(vorher, await BenutzerDb.EinzigerAsync(Testbenutzer.AdminSubject));
    }

    // ---------- Gegenprobe ohne coins.read ----------

    public static TheoryData<string, HttpStatusCode> OhneLeserecht => new()
    {
        { "anonym", HttpStatusCode.Unauthorized },
        { "ohne_Rolle", HttpStatusCode.Forbidden },
        { "deaktiviert", HttpStatusCode.Forbidden },
    };

    [Theory]
    [MemberData(nameof(OhneLeserecht))]
    public async Task Ohne_coins_read_liefert_Get_startseite_keine_Kennzahlen_und_keine_Coins(string wer, HttpStatusCode erwartet)
    {
        const string coinName = "Coin-Gegenprobe-6612";
        await LegeCoinAnAsync(coinName, auflage: 77);
        var client = wer == "anonym" ? Anonym : await ClientFuerAsync(wer);

        using var antwort = await client.GetAsync(StartseiteUrl);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(erwartet, antwort.StatusCode);
        Assert.DoesNotContain(coinName, text);
        Assert.DoesNotContain("\"kennzahlen\"", text);
        Assert.DoesNotContain("\"bloecke\"", text);
    }
}
