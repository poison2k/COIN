using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>Ein angelegter Testbenutzer mit eigenem Client (rollen-benutzerverwaltung, Abschnitt 6.2).</summary>
public sealed record TestKonto(HttpClient Client, Guid Id, string Subject, string Name, string? Email);

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

    protected const string BenutzerUrl = "/api/benutzer";

    protected const string AuditUrl = "/api/audit";

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
    /// Legt einen Benutzer per /api/me an und setzt Rolle und Status direkt in der Test-DB (Testdaten).
    /// <c>null</c> = keine Rolle. <paramref name="aktiv"/> = false deaktiviert ihn nach dem Anlegen.
    /// </summary>
    protected async Task<HttpClient> ClientMitRolleAsync(string? rolle, bool aktiv = true) =>
        (await KontoAsync(rolle, aktiv)).Client;

    /// <summary>
    /// Wie <see cref="ClientMitRolleAsync"/>, liefert zusätzlich Id, Subject, Name und E-Mail (rollen-benutzerverwaltung).
    /// Name und E-Mail sind synthetisch und ohne Angabe eindeutig.
    /// </summary>
    protected async Task<TestKonto> KontoAsync(string? rolle, bool aktiv = true, string? name = null, string? email = null)
    {
        var kennung = Guid.NewGuid().ToString("N")[..8];
        var daten = new TokenDaten
        {
            Subject = $"sub-{rolle ?? "keine"}-{Guid.NewGuid():N}",
            Email = email ?? $"{(rolle ?? "keine").ToLowerInvariant()}.{kennung}@coin-test.invalid",
            Name = name ?? $"Test {rolle ?? "Ohne Rolle"} {kennung}",
        };
        var client = ClientMit(daten);
        using var me = await client.GetAsync(MeUrl);
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var id = (await JsonAsync(me)).GetProperty("id").GetGuid();
        if (rolle is not null)
        {
            await BenutzerDb.RolleSetzenAsync(daten.Subject!, rolle);
        }

        if (!aktiv)
        {
            await BenutzerDb.StatusSetzenAsync(daten.Subject!, false);
        }

        return new TestKonto(client, id, daten.Subject!, daten.Name!, daten.Email);
    }

    /// <summary>Weiterer aktiver Administrator (Rolle direkt in der Test-DB gesetzt).</summary>
    protected Task<TestKonto> ZweiterAdminAsync(string name = "Test Zweitadministrator") =>
        KontoAsync("Administrator", name: name);

    /// <summary>Id des Bootstrap-Administrators (legt ihn bei Bedarf per /api/me an).</summary>
    protected async Task<Guid> AdminIdAsync()
    {
        using var me = await Client.GetAsync(MeUrl);
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        return (await JsonAsync(me)).GetProperty("id").GetGuid();
    }

    protected AuditTabelle AuditDb => new(Fixture.ConnectionString);

    protected static string RolleUrl(Guid id) => $"{BenutzerUrl}/{id}/rolle";

    protected static string StatusUrl(Guid id) => $"{BenutzerUrl}/{id}/status";

    protected static Task<HttpResponseMessage> PutRolleAsync(HttpClient client, Guid id, string? rolle) =>
        client.PutAsJsonAsync(RolleUrl(id), new { rolle });

    protected static Task<HttpResponseMessage> PutStatusAsync(HttpClient client, Guid id, bool aktiv) =>
        client.PutAsJsonAsync(StatusUrl(id), new { aktiv });

    protected static Task<HttpResponseMessage> PutRohAsync(HttpClient client, string url, string json) =>
        client.PutAsync(url, new StringContent(json, Encoding.UTF8, "application/json"));

    /// <summary>Prüft eine 403-Antwort laut AK-6: ProblemDetails, title „Kein Zugriff“, <c>code</c>.</summary>
    protected static async Task<JsonElement> AssertKeinZugriffAsync(HttpResponseMessage antwort, string code)
    {
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.Forbidden);
        Assert.Equal("Kein Zugriff", json.GetProperty("title").GetString());
        Assert.True(json.TryGetProperty("code", out var wert), "403 ohne Feld code.");
        Assert.Equal(code, wert.GetString());
        return json;
    }

    /// <summary>Prüft eine 409-Antwort laut AK-15/AK-16: ProblemDetails, title „Änderung nicht möglich“, <c>code</c>.</summary>
    protected static async Task<JsonElement> AssertKonfliktAsync(HttpResponseMessage antwort, string code)
    {
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.Conflict);
        Assert.Equal("Änderung nicht möglich", json.GetProperty("title").GetString());
        Assert.True(json.TryGetProperty("code", out var wert), "409 ohne Feld code.");
        Assert.Equal(code, wert.GetString());
        return json;
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
