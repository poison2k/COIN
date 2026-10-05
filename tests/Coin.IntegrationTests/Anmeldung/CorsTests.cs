using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Anmeldung;

/// <summary>Feature anmeldung-keycloak, AK-12: CORS nur für den einen konfigurierten Ursprung, ohne Credentials.</summary>
public class CorsTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const string Erlaubt = CoinApiFactory.FrontendUrsprung;
    private const string Fremd = "http://localhost:5999";

    private static HttpRequestMessage Preflight(string origin, string methode = "POST", string url = CoinsUrl)
    {
        var anfrage = new HttpRequestMessage(HttpMethod.Options, url);
        anfrage.Headers.Add("Origin", origin);
        anfrage.Headers.Add("Access-Control-Request-Method", methode);
        anfrage.Headers.Add("Access-Control-Request-Headers", "authorization,content-type");
        return anfrage;
    }

    private static string[] Werte(HttpResponseMessage antwort, string header) =>
        antwort.Headers.TryGetValues(header, out var werte)
            ? werte.SelectMany(w => w.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)).ToArray()
            : [];

    [Fact]
    public async Task Preflight_vom_konfigurierten_Ursprung_erlaubt_genau_diesen_Ursprung()
    {
        using var anfrage = Preflight(Erlaubt);

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.True(antwort.IsSuccessStatusCode, $"Status {antwort.StatusCode}");
        Assert.Equal([Erlaubt], Werte(antwort, "Access-Control-Allow-Origin"));
    }

    [Theory]
    [InlineData("GET")]
    [InlineData("POST")]
    [InlineData("PUT")]
    public async Task Preflight_erlaubt_die_Methode(string methode)
    {
        using var anfrage = Preflight(Erlaubt, methode);

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.Contains(methode, Werte(antwort, "Access-Control-Allow-Methods"), StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Preflight_erlaubt_keine_weiteren_Methoden()
    {
        using var anfrage = Preflight(Erlaubt, "DELETE");

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.DoesNotContain("DELETE", Werte(antwort, "Access-Control-Allow-Methods"), StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain("*", Werte(antwort, "Access-Control-Allow-Methods"));
    }

    [Theory]
    [InlineData("authorization")]
    [InlineData("content-type")]
    public async Task Preflight_erlaubt_den_Header(string header)
    {
        using var anfrage = Preflight(Erlaubt);

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.Contains(header, Werte(antwort, "Access-Control-Allow-Headers"), StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Preflight_erlaubt_keine_beliebigen_Header()
    {
        using var anfrage = Preflight(Erlaubt);
        anfrage.Headers.Remove("Access-Control-Request-Headers");
        anfrage.Headers.Add("Access-Control-Request-Headers", "x-beliebig");

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.DoesNotContain("x-beliebig", Werte(antwort, "Access-Control-Allow-Headers"), StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain("*", Werte(antwort, "Access-Control-Allow-Headers"));
    }

    [Fact]
    public async Task Preflight_sendet_kein_Allow_Credentials()
    {
        using var anfrage = Preflight(Erlaubt);

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.False(antwort.Headers.Contains("Access-Control-Allow-Credentials"));
    }

    [Fact]
    public async Task Preflight_von_fremdem_Ursprung_bekommt_keinen_ACAO_Header()
    {
        using var anfrage = Preflight(Fremd);

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.False(antwort.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Einfache_Anfrage_vom_konfigurierten_Ursprung_bekommt_den_ACAO_Header()
    {
        using var anfrage = new HttpRequestMessage(HttpMethod.Get, CoinsUrl);
        anfrage.Headers.Add("Origin", Erlaubt);

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.Equal([Erlaubt], Werte(antwort, "Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Einfache_Anfrage_von_fremdem_Ursprung_bekommt_keinen_ACAO_Header()
    {
        using var anfrage = new HttpRequestMessage(HttpMethod.Get, CoinsUrl);
        anfrage.Headers.Add("Origin", Fremd);

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.False(antwort.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Ursprung_mit_anderem_Port_gilt_als_fremd()
    {
        using var anfrage = Preflight("http://localhost:5174");

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.False(antwort.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Ohne_Frontend_Ursprung_werden_keine_CORS_Header_gesendet()
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Einstellungen = new Dictionary<string, string?> { ["Frontend:Ursprung"] = null },
        });
        using var client = factory.ClientOhneToken();
        using var anfrage = Preflight(Erlaubt);

        using var antwort = await client.SendAsync(anfrage);

        Assert.DoesNotContain(antwort.Headers, h => h.Key.StartsWith("Access-Control-", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData("*")]
    [InlineData("http://localhost:5173/pfad")]
    [InlineData("http://localhost:5173/")]
    [InlineData("kein-ursprung")]
    [InlineData("http://localhost:5173,http://localhost:5174")]
    public async Task Ungueltiger_Frontend_Ursprung_bricht_den_Start_ab(string wert)
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Einstellungen = new Dictionary<string, string?> { ["Frontend:Ursprung"] = wert },
        });

        var fehler = Record.Exception(() => factory.Services);

        Assert.NotNull(fehler);
        Assert.Contains("Frontend:Ursprung", StartKonfigurationTests.Meldungen(fehler));
    }
}
