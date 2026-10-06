using System.Net;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Anmeldung;

/// <summary>
/// Feature anmeldung-keycloak, AK-18 (ADR-0014): Die drei Lese-Endpunkte des Katalogs sind öffentlich,
/// ihre Antworten hängen nicht vom Token ab, und sie lösen keinen Benutzerabgleich aus.
/// </summary>
public class OeffentlichLesenTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private static readonly string[] CoinFelder = ["auflage", "beschreibung", "bildUrl", "erstelltAm", "herausgeber", "id", "name"];

    /// <summary>Bild-Header aus docs/api.md, die mit und ohne Token gleich sein müssen.</summary>
    private static readonly string[] BildHeader =
        ["Cache-Control", "Content-Type", "Content-Length", "ETag", "X-Content-Type-Options", "Content-Security-Policy", "Content-Disposition"];

    /// <summary>Token-Varianten, mit denen öffentliche GETs identisch antworten müssen.</summary>
    public static TheoryData<string> TokenVarianten => new() { "gueltig", "ungueltig", "abgelaufen", "fremder_Issuer", "kein_JWT" };

    private static string TokenFuer(string variante) => variante switch
    {
        "gueltig" => Idp.ErzeugeToken(new TokenDaten()),
        "ungueltig" => Idp.ErzeugeToken(new TokenDaten { Audience = "fremde-api" }),
        "abgelaufen" => Idp.ErzeugeToken(new TokenDaten { AblaufIn = TimeSpan.FromHours(-1), AusgestelltVersatz = TimeSpan.FromHours(-2) }),
        "fremder_Issuer" => TestIdentitaetsanbieter.Fremd.ErzeugeToken(new TokenDaten()),
        _ => "kein-jwt",
    };

    private async Task<Guid> CoinMitBildAsync()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        await LadeBildHochAsync(id, Testbilder.Png(1500));
        return id;
    }

    private static async Task<(HttpStatusCode Status, string Body)> AbrufAsync(HttpClient client, string url)
    {
        using var antwort = await client.GetAsync(url);
        return (antwort.StatusCode, await antwort.Content.ReadAsStringAsync());
    }

    // ---------- anonym ----------

    [Fact]
    public async Task Liste_ist_ohne_Token_abrufbar()
    {
        await LegeCoinAnAsync();

        using var antwort = await Anonym.GetAsync(CoinsUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Einzelner_Coin_ist_ohne_Token_abrufbar()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await Anonym.GetAsync($"{CoinsUrl}/{id}");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Bild_ist_ohne_Token_abrufbar()
    {
        var id = await CoinMitBildAsync();

        using var antwort = await Anonym.GetAsync(BildUrl(id));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(Testbilder.Png(1500), await antwort.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Bild_hat_ohne_Token_weiterhin_Cache_Control_private_immutable()
    {
        var id = await CoinMitBildAsync();

        using var antwort = await Anonym.GetAsync(BildUrl(id));

        var cache = antwort.Headers.CacheControl;
        Assert.NotNull(cache);
        Assert.True(cache!.Private);
        Assert.Equal(TimeSpan.FromSeconds(31536000), cache.MaxAge);
        Assert.Contains(cache.Extensions, e => e.Name == "immutable");
    }

    [Fact]
    public async Task Unbekannter_Coin_liefert_ohne_Token_404()
    {
        using var antwort = await Anonym.GetAsync($"{CoinsUrl}/{Guid.NewGuid()}");

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Fehlendes_Bild_liefert_ohne_Token_404()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await Anonym.GetAsync(BildUrl(id));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
    }

    // ---------- Feldmenge ohne Personendaten ----------

    [Fact]
    public async Task Coin_in_der_Liste_hat_genau_die_sieben_oeffentlichen_Felder()
    {
        var id = await CoinMitBildAsync();

        var coin = Assert.Single(await LadeListeAsync());

        Assert.Equal(id, coin.GetProperty("id").GetGuid());
        Assert.Equal(CoinFelder, coin.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Einzelner_Coin_hat_genau_die_sieben_oeffentlichen_Felder()
    {
        var id = await CoinMitBildAsync();

        using var antwort = await Anonym.GetAsync($"{CoinsUrl}/{id}");
        var coin = await JsonAsync(antwort);

        Assert.Equal(CoinFelder, coin.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Coin_Antworten_enthalten_keine_Angaben_zum_anlegenden_Benutzer()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        var (_, body) = await AbrufAsync(Anonym, $"{CoinsUrl}/{id}");

        Assert.DoesNotContain(Testbenutzer.AdminEmail, body);
        Assert.DoesNotContain(Testbenutzer.AdminName, body);
        Assert.DoesNotContain(Testbenutzer.AdminSubject, body);
    }

    // ---------- Antwort unabhängig vom Token ----------

    [Theory]
    [MemberData(nameof(TokenVarianten))]
    public async Task Liste_ist_mit_Token_identisch_zur_anonymen_Antwort(string variante)
    {
        await LegeCoinAnAsync();
        var anonym = await AbrufAsync(Anonym, CoinsUrl);

        var mitToken = await AbrufAsync(ClientMitToken(TokenFuer(variante)), CoinsUrl);

        Assert.Equal(anonym, mitToken);
    }

    [Theory]
    [MemberData(nameof(TokenVarianten))]
    public async Task Einzelner_Coin_ist_mit_Token_identisch_zur_anonymen_Antwort(string variante)
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var anonym = await AbrufAsync(Anonym, $"{CoinsUrl}/{id}");

        var mitToken = await AbrufAsync(ClientMitToken(TokenFuer(variante)), $"{CoinsUrl}/{id}");

        Assert.Equal(anonym, mitToken);
    }

    [Theory]
    [MemberData(nameof(TokenVarianten))]
    public async Task Bild_ist_mit_Token_identisch_zur_anonymen_Antwort(string variante)
    {
        var id = await CoinMitBildAsync();
        using var anonym = await Anonym.GetAsync(BildUrl(id));

        using var mitToken = await ClientMitToken(TokenFuer(variante)).GetAsync(BildUrl(id));

        Assert.Equal(anonym.StatusCode, mitToken.StatusCode);
        Assert.Equal(await anonym.Content.ReadAsByteArrayAsync(), await mitToken.Content.ReadAsByteArrayAsync());
        foreach (var header in BildHeader)
        {
            Assert.Equal(HeaderWert(anonym, header), HeaderWert(mitToken, header));
        }
    }

    [Theory]
    [MemberData(nameof(TokenVarianten))]
    public async Task Unbekannter_Coin_liefert_auch_mit_Token_404(string variante)
    {
        using var antwort = await ClientMitToken(TokenFuer(variante)).GetAsync($"{CoinsUrl}/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Theory]
    [InlineData("liste")]
    [InlineData("einzeln")]
    [InlineData("bild")]
    public async Task Oeffentliche_Antworten_variieren_nicht_nach_Authorization(string art)
    {
        var id = await CoinMitBildAsync();
        var url = art switch { "liste" => CoinsUrl, "einzeln" => $"{CoinsUrl}/{id}", _ => BildUrl(id) };

        using var antwort = await ClientMitToken(TokenFuer("ungueltig")).GetAsync(url);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.DoesNotContain(antwort.Headers.Vary, v => v.Equals("Authorization", StringComparison.OrdinalIgnoreCase));
        Assert.False(antwort.Headers.Contains("WWW-Authenticate"));
    }

    // ---------- kein Benutzerabgleich ----------

    [Fact]
    public async Task Oeffentliche_GETs_mit_gueltigem_Token_legen_keinen_Benutzer_an()
    {
        var id = await CoinMitBildAsync();
        await DatenbankNurBenutzerLeerenAsync();
        var client = ClientMit(new TokenDaten { Subject = "sub-nur-lesend" });

        using (await client.GetAsync(CoinsUrl))
        using (await client.GetAsync($"{CoinsUrl}/{id}"))
        using (await client.GetAsync(BildUrl(id)))
        {
        }

        Assert.Equal(0, await BenutzerDb.AnzahlAsync());
    }

    [Fact]
    public async Task Oeffentliche_GETs_aendern_einen_vorhandenen_Benutzer_nicht()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var vorher = await BenutzerDb.EinzigerAsync(Testbenutzer.AdminSubject);
        var client = ClientMit(Testbenutzer.Admin with { Email = "geaendert@coin-test.invalid", Name = "Geänderter Name" });

        using (await client.GetAsync(CoinsUrl))
        using (await client.GetAsync($"{CoinsUrl}/{id}"))
        {
        }

        Assert.Equal(vorher, await BenutzerDb.EinzigerAsync(Testbenutzer.AdminSubject));
    }

    private async Task DatenbankNurBenutzerLeerenAsync()
    {
        await using var verbindung = new Npgsql.NpgsqlConnection(Fixture.ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new Npgsql.NpgsqlCommand("TRUNCATE benutzer CASCADE", verbindung);
        await befehl.ExecuteNonQueryAsync();
    }

    private static string? HeaderWert(HttpResponseMessage antwort, string name) =>
        antwort.Headers.TryGetValues(name, out var werte) || antwort.Content.Headers.TryGetValues(name, out werte)
            ? string.Join(",", werte)
            : null;
}
