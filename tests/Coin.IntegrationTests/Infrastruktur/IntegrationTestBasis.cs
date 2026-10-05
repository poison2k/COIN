using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>
/// Gemeinsame Basis: leert die Datenbank vor jedem Test und bietet HTTP-Hilfen.
/// <see cref="Client"/> sendet das Token des Bootstrap-Administrators (schreibende Aufrufe),
/// <see cref="Anonym"/> sendet kein Token (öffentliches Lesen, ADR-0014).
/// </summary>
[Collection(PostgresCollection.Name)]
public abstract class IntegrationTestBasis(PostgresFixture fixture) : IAsyncLifetime
{
    protected const string CoinsUrl = "/api/coins";

    protected const string MeUrl = "/api/me";

    protected PostgresFixture Fixture { get; } = fixture;

    /// <summary>Standard-Client mit dem Token des Bootstrap-Administrators.</summary>
    protected HttpClient Client { get; private set; } = null!;

    /// <summary>Client ohne Token.</summary>
    protected HttpClient Anonym { get; private set; } = null!;

    protected BenutzerTabelle BenutzerDb => new(Fixture.ConnectionString);

    protected static TestIdentitaetsanbieter Idp => TestIdentitaetsanbieter.Standard;

    private readonly List<HttpClient> _weitereClients = [];

    public async Task InitializeAsync()
    {
        await Fixture.DatenbankLeerenAsync();
        Client = Fixture.Factory.CreateClient();
        Anonym = Fixture.Factory.ClientOhneToken();
    }

    public Task DisposeAsync()
    {
        Client.Dispose();
        Anonym.Dispose();
        foreach (var client in _weitereClients)
        {
            client.Dispose();
        }

        return Task.CompletedTask;
    }

    /// <summary>Client ohne Token (wird am Testende entsorgt).</summary>
    protected HttpClient ClientOhneToken() => Merken(Fixture.Factory.ClientOhneToken());

    /// <summary>Client mit beliebigem (auch ungültigem) Bearer-Token.</summary>
    protected HttpClient ClientMitToken(string token) => Merken(Fixture.Factory.ClientMitToken(token));

    /// <summary>Client mit einem gültigen Token zu den angegebenen Daten.</summary>
    protected HttpClient ClientMit(TokenDaten daten) => ClientMitToken(Idp.ErzeugeToken(daten));

    /// <summary>
    /// Legt einen Benutzer per /api/me an und setzt seine Rolle direkt in der Test-DB (Sachbearbeiter, Betrachter
    /// werden erst in einem späteren Feature vergeben, AK-19). <c>null</c> = keine Rolle.
    /// </summary>
    protected async Task<HttpClient> ClientMitRolleAsync(string? rolle)
    {
        var daten = new TokenDaten
        {
            Subject = $"sub-{rolle ?? "keine"}-{Guid.NewGuid():N}",
            Email = $"{(rolle ?? "keine").ToLowerInvariant()}@coin-test.invalid",
            Name = $"Test {rolle ?? "Ohne Rolle"}",
        };
        var client = ClientMit(daten);
        using var me = await client.GetAsync(MeUrl);
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        if (rolle is not null)
        {
            await BenutzerDb.RolleSetzenAsync(daten.Subject!, rolle);
        }

        return client;
    }

    private HttpClient Merken(HttpClient client)
    {
        _weitereClients.Add(client);
        return client;
    }

    protected static string BildUrl(Guid id) => $"{CoinsUrl}/{id}/bild";

    protected static object GueltigerCoin(
        string name = "Coin Alpha",
        string herausgeber = "Herausgeber Beta",
        int? auflage = null,
        string? beschreibung = null) =>
        new { name, herausgeber, auflage, beschreibung };

    protected Task<HttpResponseMessage> PostCoinAsync(object daten) =>
        Client.PostAsJsonAsync(CoinsUrl, daten);

    protected Task<HttpResponseMessage> PostRohJsonAsync(string json) =>
        Client.PostAsync(CoinsUrl, new StringContent(json, Encoding.UTF8, "application/json"));

    protected async Task<JsonElement> LegeCoinAnAsync(
        string name = "Coin Alpha",
        string herausgeber = "Herausgeber Beta",
        int? auflage = null,
        string? beschreibung = null)
    {
        using var antwort = await PostCoinAsync(GueltigerCoin(name, herausgeber, auflage, beschreibung));
        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
        return await JsonAsync(antwort);
    }

    protected async Task<Guid> LegeCoinAnUndLiefereIdAsync(string name = "Coin Alpha", string herausgeber = "Herausgeber Beta")
    {
        var coin = await LegeCoinAnAsync(name, herausgeber);
        return coin.GetProperty("id").GetGuid();
    }

    protected static MultipartFormDataContent Multipart(
        byte[] inhalt,
        string feld = "datei",
        string dateiname = "motiv.bin",
        string contentType = "application/octet-stream")
    {
        var datei = new ByteArrayContent(inhalt);
        datei.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        return new MultipartFormDataContent { { datei, feld, dateiname } };
    }

    protected Task<HttpResponseMessage> PutBildAsync(Guid id, byte[] inhalt, string contentType = "application/octet-stream", string dateiname = "motiv.bin") =>
        Client.PutAsync(BildUrl(id), Multipart(inhalt, contentType: contentType, dateiname: dateiname));

    protected async Task<JsonElement> LadeBildHochAsync(Guid id, byte[] inhalt)
    {
        using var antwort = await PutBildAsync(id, inhalt);
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        return await JsonAsync(antwort);
    }

    protected async Task<JsonElement[]> LadeListeAsync()
    {
        using var antwort = await Anonym.GetAsync(CoinsUrl);
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        var json = await JsonAsync(antwort);
        Assert.Equal(JsonValueKind.Array, json.ValueKind);
        return json.EnumerateArray().ToArray();
    }

    protected static async Task<JsonElement> JsonAsync(HttpResponseMessage antwort)
    {
        var text = await antwort.Content.ReadAsStringAsync();
        using var dokument = JsonDocument.Parse(text);
        return dokument.RootElement.Clone();
    }

    /// <summary>Prüft, dass die Antwort RFC-9457-ProblemDetails mit dem erwarteten Status ist.</summary>
    protected static async Task<JsonElement> AssertProblemDetailsAsync(HttpResponseMessage antwort, HttpStatusCode erwartet)
    {
        Assert.Equal(erwartet, antwort.StatusCode);
        Assert.Equal("application/problem+json", antwort.Content.Headers.ContentType?.MediaType);
        var json = await JsonAsync(antwort);
        Assert.Equal((int)erwartet, json.GetProperty("status").GetInt32());
        return json;
    }

    /// <summary>Prüft ValidationProblemDetails (400) und liefert die Schlüssel von <c>errors</c>.</summary>
    protected static async Task<string[]> AssertValidierungsfehlerAsync(HttpResponseMessage antwort)
    {
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
        var errors = json.GetProperty("errors");
        return errors.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray();
    }
}
