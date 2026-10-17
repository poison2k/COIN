using System.Net;
using System.Text.RegularExpressions;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Coin.IntegrationTests.Anmeldung;

/// <summary>
/// Feature anmeldung-keycloak, AK-10: Inventar der Endpunkte über <see cref="EndpointDataSource"/>.
/// Anonym erreichbar sind genau die drei Lese-Endpunkte des Katalogs (ADR-0014), in Development zusätzlich nur OpenAPI.
/// Angepasst durch rollen-benutzerverwaltung (AK-3): Policy <c>coins.write</c> statt <c>KatalogSchreiben</c>.
/// </summary>
public partial class EndpunktInventarTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private static readonly string[] OeffentlicheKatalogEndpunkte =
    [
        "GET /api/coins",
        "GET /api/coins/{id}",
        "GET /api/coins/{id}/bild",
    ];

    [GeneratedRegex(@"\{(\w+)(:[^}]*)?\}")]
    private static partial Regex RoutenParameter();

    private static IReadOnlyList<(string Name, RouteEndpoint Endpunkt)> Endpunkte(CoinApiFactory factory) =>
        factory.Services.GetServices<EndpointDataSource>()
            .SelectMany(q => q.Endpoints)
            .OfType<RouteEndpoint>()
            .SelectMany(e =>
            {
                var methoden = e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["*"];
                var muster = "/" + RoutenParameter().Replace(e.RoutePattern.RawText ?? string.Empty, "{$1}").TrimStart('/');
                return methoden.Select(m => ($"{m} {muster}", e));
            })
            .ToList();

    private static string[] AnonymeEndpunkte(CoinApiFactory factory) =>
        Endpunkte(factory)
            .Where(e => e.Endpunkt.Metadata.GetMetadata<IAllowAnonymous>() is not null)
            .Select(e => e.Name)
            .Distinct()
            .Order(StringComparer.Ordinal)
            .ToArray();

    [Fact]
    public void In_Testing_sind_genau_die_drei_Katalog_Lese_Endpunkte_anonym_erreichbar()
    {
        Assert.Equal(OeffentlicheKatalogEndpunkte, AnonymeEndpunkte(Fixture.Factory));
    }

    [Fact]
    public void Die_FallbackPolicy_verlangt_einen_angemeldeten_Benutzer()
    {
        var optionen = Fixture.Factory.Services.GetRequiredService<IOptions<AuthorizationOptions>>().Value;

        Assert.NotNull(optionen.FallbackPolicy);
        Assert.Contains(optionen.FallbackPolicy!.Requirements, r => r is DenyAnonymousAuthorizationRequirement);
    }

    [Fact]
    public void Es_gibt_eine_Policy_coins_write()
    {
        // rollen-benutzerverwaltung AK-3: Policy „KatalogSchreiben“ heißt jetzt wie die Berechtigung.
        var optionen = Fixture.Factory.Services.GetRequiredService<IOptions<AuthorizationOptions>>().Value;

        Assert.NotNull(optionen.GetPolicy("coins.write"));
    }

    [Theory]
    [InlineData("POST /api/coins")]
    [InlineData("PUT /api/coins/{id}/bild")]
    // zertifikatsvorlagen AK-24, AK-25: neue Endpunkte, alle mit coins.write und nicht anonym.
    [InlineData("PUT /api/coins/{id}")]
    [InlineData("GET /api/zertifikatsvorlagen/standard")]
    [InlineData("GET /api/coins/{id}/zertifikatsvorlage")]
    [InlineData("GET /api/coins/{id}/zertifikatsvorlage/datei")]
    [InlineData("GET /api/coins/{id}/zertifikatsvorlage/versionen/{version}/datei")]
    [InlineData("POST /api/coins/{id}/zertifikatsvorlage/versionen")]
    [InlineData("POST /api/coins/{id}/zertifikatsvorlage/zuruecksetzen")]
    public void Schreibende_Endpunkte_verlangen_die_Policy_coins_write(string name)
    {
        var endpunkt = Assert.Single(Endpunkte(Fixture.Factory), e => e.Name == name).Endpunkt;

        var authorize = endpunkt.Metadata.GetOrderedMetadata<IAuthorizeData>();
        Assert.Contains(authorize, a => a.Policy == "coins.write");
        Assert.Null(endpunkt.Metadata.GetMetadata<IAllowAnonymous>());
    }

    [Theory]
    [InlineData("PUT /api/coins/{id}/auflage", "coins.write")]
    [InlineData("GET /api/coins/{id}/exemplare", "coins.read")]
    [InlineData("GET /api/coins/{id}/ausgaben", "issues.read")]
    [InlineData("POST /api/coins/{id}/ausgaben", "issues.write")]
    [InlineData("POST /api/coins/{id}/ausgaben/{ausgabeId}/storno", "issues.write")]
    // zertifikat-erzeugen (Abschnitt 5.1, AK-19, AK-22): Ausgabe lesen und Zertifikat herunterladen.
    [InlineData("GET /api/coins/{id}/ausgaben/{ausgabeId}", "issues.read")]
    [InlineData("GET /api/coins/{id}/ausgaben/{ausgabeId}/zertifikat", "issues.write")]
    public void Endpunkte_der_Coin_Ausgaben_verlangen_ihre_Policy_und_sind_nicht_anonym(string name, string policy)
    {
        // coin-ausgaben AK-15, AK-32 (ADR-0021 Punkt 2 und 5).
        var endpunkt = Assert.Single(Endpunkte(Fixture.Factory), e => e.Name == name).Endpunkt;

        var authorize = endpunkt.Metadata.GetOrderedMetadata<IAuthorizeData>();
        Assert.Contains(authorize, a => a.Policy == policy);
        Assert.Null(endpunkt.Metadata.GetMetadata<IAllowAnonymous>());
    }

    [Fact]
    public void Api_me_ist_nicht_anonym_erreichbar()
    {
        var endpunkt = Assert.Single(Endpunkte(Fixture.Factory), e => e.Name == "GET /api/me").Endpunkt;

        Assert.Null(endpunkt.Metadata.GetMetadata<IAllowAnonymous>());
    }

    [Fact]
    public async Task Jeder_nicht_oeffentliche_Endpunkt_liefert_ohne_Token_401()
    {
        var geschuetzt = Endpunkte(Fixture.Factory)
            .Where(e => e.Endpunkt.Metadata.GetMetadata<IAllowAnonymous>() is null)
            .Select(e => e.Name)
            .Distinct()
            .ToList();
        Assert.NotEmpty(geschuetzt);

        var ergebnisse = new List<string>();
        foreach (var name in geschuetzt)
        {
            var (methode, muster) = (name.Split(' ')[0], name.Split(' ')[1]);
            // coin-ausgaben: mehrere Routenparameter ({id}, {ausgabeId}) – jeder wird durch eine GUID ersetzt.
            // zertifikatsvorlagen: {version} ist eine Zahl (Route-Constraint int), sonst passt die Route nicht.
            var url = RoutenParameter().Replace(muster, m => m.Groups[1].Value == "version" ? "1" : Guid.NewGuid().ToString());
            using var anfrage = new HttpRequestMessage(new HttpMethod(methode == "*" ? "GET" : methode), url);
            using var antwort = await Anonym.SendAsync(anfrage);
            ergebnisse.Add($"{name} -> {(int)antwort.StatusCode}");
        }

        Assert.All(ergebnisse, e => Assert.EndsWith("-> 401", e));
    }

    [Fact]
    public async Task In_Development_kommt_nur_der_OpenAPI_Endpunkt_hinzu()
    {
        // Development lädt User-Secrets mit der Entwicklungs-DB; die Factory überschreibt den Connection-String
        // per In-Memory-Konfiguration mit höchstem Vorrang (siehe CoinApiFactory).
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { Umgebung = "Development" });

        var zusaetzlich = AnonymeEndpunkte(factory).Except(OeffentlicheKatalogEndpunkte).ToArray();

        var openApi = Assert.Single(zusaetzlich);
        Assert.Matches(@"^GET /openapi/\{documentName\}\.json$", openApi);
    }

    [Fact]
    public async Task In_Development_ist_openapi_v1_json_ohne_Token_abrufbar()
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { Umgebung = "Development" });
        using var client = factory.ClientOhneToken();

        using var antwort = await client.GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task In_Testing_gibt_es_keinen_OpenAPI_Endpunkt()
    {
        using var antwort = await Client.GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Theory]
    [InlineData("/api/gibt-es-nicht")]
    [InlineData("/gibt-es-nicht")]
    public async Task Pfade_ohne_Endpunkt_liefern_auch_ohne_Token_404(string pfad)
    {
        using var antwort = await Anonym.GetAsync(pfad);

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }
}
