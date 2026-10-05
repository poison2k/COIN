using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>Gemeinsame Basis: leert die Datenbank vor jedem Test und bietet HTTP-Hilfen.</summary>
[Collection(PostgresCollection.Name)]
public abstract class IntegrationTestBasis(PostgresFixture fixture) : IAsyncLifetime
{
    protected const string CoinsUrl = "/api/coins";

    protected PostgresFixture Fixture { get; } = fixture;

    protected HttpClient Client { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await Fixture.DatenbankLeerenAsync();
        Client = Fixture.Factory.CreateClient();
    }

    public Task DisposeAsync()
    {
        Client.Dispose();
        return Task.CompletedTask;
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
        using var antwort = await Client.GetAsync(CoinsUrl);
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
