using System.Net;
using Coin.Domain.Katalog;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Coin.IntegrationTests.Coins;

/// <summary>AK-19: Unerwartete Fehler liefern 500 als ProblemDetails ohne interne Details.</summary>
public class FehlerbehandlungTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const string GeheimeMeldung = "Interner Datenbankfehler XYZ-4711";

    private const string DeutscherTitel = "Ein unerwarteter Fehler ist aufgetreten.";

    /// <summary>Englische Standardtitel von ASP.NET Core (ProblemDetailsDefaults / Reason-Phrases).</summary>
    private static readonly string[] EnglischeStandardtitel =
    [
        "An error occurred while processing your request.",
        "Internal Server Error",
        "Not Found",
        "Method Not Allowed",
        "Bad Request",
        "Unauthorized",
        "Forbidden",
        "Unsupported Media Type",
    ];

    private HttpClient ClientMitDefektemRepository() =>
        ClientMitWerfendemRepository(() => new InvalidOperationException(GeheimeMeldung));

    private HttpClient ClientMitWerfendemRepository(Func<Exception> ausnahme) =>
        Fixture.Factory
            .WithWebHostBuilder(b => b.ConfigureTestServices(s =>
                s.AddScoped(_ => WerfenderProxy<ICoinKatalogRepository>.Erzeugen(ausnahme))))
            .CreateClient();

    private static void AssertKeinEnglischerStandardtext(string body)
    {
        foreach (var englisch in EnglischeStandardtitel)
        {
            Assert.DoesNotContain(englisch, body);
        }
    }

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

    [Fact]
    public async Task Unerwarteter_Fehler_hat_deutschen_Titel()
    {
        using var client = ClientMitDefektemRepository();

        using var antwort = await client.GetAsync(CoinsUrl);

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.InternalServerError);
        Assert.Equal(DeutscherTitel, json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Unerwarteter_Fehler_enthaelt_keinen_englischen_Standardtext()
    {
        using var client = ClientMitDefektemRepository();

        using var antwort = await client.GetAsync(CoinsUrl);
        var body = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, antwort.StatusCode);
        AssertKeinEnglischerStandardtext(body);
    }

    [Fact]
    public async Task Unerwarteter_Fehler_enthaelt_keine_Ausnahmefelder()
    {
        using var client = ClientMitDefektemRepository();

        using var antwort = await client.GetAsync(CoinsUrl);

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.InternalServerError);
        Assert.False(json.TryGetProperty("exception", out _), "500 enthält Feld exception.");
        Assert.False(json.TryGetProperty("stackTrace", out _), "500 enthält Feld stackTrace.");
        Assert.False(json.TryGetProperty("detail", out var detail) && detail.GetString()?.Contains(GeheimeMeldung) == true,
            "500 enthält die Ausnahmemeldung in detail.");
    }

    [Fact]
    public async Task Datenbank_Timeout_liefert_500_mit_deutschem_Titel()
    {
        using var client = ClientMitWerfendemRepository(
            () => new NpgsqlException(GeheimeMeldung, new TimeoutException("Timeout XYZ-0815")));

        using var antwort = await client.GetAsync(CoinsUrl);

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.InternalServerError);
        Assert.Equal(DeutscherTitel, json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Datenbank_Timeout_gibt_keine_Ausnahmedetails_preis()
    {
        using var client = ClientMitWerfendemRepository(
            () => new NpgsqlException(GeheimeMeldung, new TimeoutException("Timeout XYZ-0815")));

        using var antwort = await client.GetAsync(CoinsUrl);
        var body = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, antwort.StatusCode);
        Assert.DoesNotContain(GeheimeMeldung, body);
        Assert.DoesNotContain("XYZ-0815", body);
        Assert.DoesNotContain(nameof(NpgsqlException), body);
        Assert.DoesNotContain(nameof(TimeoutException), body);
        AssertKeinEnglischerStandardtext(body);
    }

    /// <summary>
    /// Fehlerantworten ohne eigenen fachlichen Titel (unbekannte Route, Route-Constraint verfehlt, falsche Methode):
    /// Liefert die API einen ProblemDetails-Body, darf dessen Titel kein englischer Standardtitel sein.
    /// </summary>
    [Theory]
    [InlineData("GET", "/api/gibtsnicht")]
    [InlineData("GET", "/api/coins/keine-guid")]
    [InlineData("DELETE", CoinsUrl)]
    [InlineData("PATCH", MeUrl)]
    public async Task Fehlerantwort_ohne_fachlichen_Titel_hat_keinen_englischen_Standardtitel(string methode, string url)
    {
        using var anfrage = new HttpRequestMessage(new HttpMethod(methode), url);

        using var antwort = await Client.SendAsync(anfrage);
        var body = await antwort.Content.ReadAsStringAsync();

        Assert.False(antwort.IsSuccessStatusCode, $"{methode} {url} lieferte {(int)antwort.StatusCode}.");
        if (antwort.Content.Headers.ContentType?.MediaType == "application/problem+json")
        {
            var json = System.Text.Json.JsonDocument.Parse(body).RootElement;
            var titel = json.TryGetProperty("title", out var t) ? t.GetString() : null;
            Assert.False(titel is not null && EnglischeStandardtitel.Contains(titel),
                $"{methode} {url} ({(int)antwort.StatusCode}) hat englischen Titel „{titel}“.");
        }
    }
}
