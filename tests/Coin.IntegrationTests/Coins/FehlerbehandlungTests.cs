using System.Net;
using Coin.Domain.Katalog;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Coin.IntegrationTests.Coins;

/// <summary>AK-19: Unerwartete Fehler liefern 500 als ProblemDetails ohne interne Details.</summary>
public class FehlerbehandlungTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const string GeheimeMeldung = "Interner Datenbankfehler XYZ-4711";

    private HttpClient ClientMitDefektemRepository() =>
        Fixture.Factory
            .WithWebHostBuilder(b => b.ConfigureTestServices(s =>
                s.AddScoped(_ => WerfenderProxy<ICoinKatalogRepository>.Erzeugen(GeheimeMeldung))))
            .CreateClient();

    [Fact]
    public async Task Unerwarteter_Fehler_liefert_500_als_ProblemDetails()
    {
        using var client = ClientMitDefektemRepository();

        using var antwort = await client.GetAsync(CoinsUrl);

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.InternalServerError);
    }

    [Fact]
    public async Task Unerwarteter_Fehler_gibt_keine_Ausnahmemeldung_preis()
    {
        using var client = ClientMitDefektemRepository();

        using var antwort = await client.GetAsync(CoinsUrl);
        var body = await antwort.Content.ReadAsStringAsync();

        Assert.DoesNotContain(GeheimeMeldung, body);
        Assert.DoesNotContain(nameof(InvalidOperationException), body);
    }

    [Fact]
    public async Task Unerwarteter_Fehler_gibt_keinen_Stacktrace_preis()
    {
        using var client = ClientMitDefektemRepository();

        using var antwort = await client.PostAsync(CoinsUrl,
            System.Net.Http.Json.JsonContent.Create(new { name = "Coin Alpha", herausgeber = "Herausgeber Beta" }));
        var body = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, antwort.StatusCode);
        Assert.DoesNotContain("   at ", body);
        Assert.DoesNotContain("Coin.Domain", body);
        Assert.DoesNotContain("Coin.Infrastructure", body);
        Assert.DoesNotContain("Coin.Api", body);
        Assert.DoesNotContain(GeheimeMeldung, body);
    }
}
