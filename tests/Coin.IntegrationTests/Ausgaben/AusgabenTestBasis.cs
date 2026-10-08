using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Ausgaben;

/// <summary>
/// Gemeinsame Hilfen für coin-ausgaben (Abschnitt 5): URLs, gültige Ausgabe, Erfassen, Stornieren, Exemplare,
/// Historie und Auflage ändern. Standard-Client ist der Bootstrap-Administrator.
/// </summary>
public abstract class AusgabenTestBasis(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    /// <summary>Gültiges Datum in der Vergangenheit (unabhängig vom Testtag).</summary>
    protected const string Datum = "2026-10-01";

    protected AusgabeTabelle AusgabeDb => new(Fixture.ConnectionString);

    protected static string ExemplareUrl(Guid coinId) => $"{CoinsUrl}/{coinId}/exemplare";

    protected static string AusgabenUrl(Guid coinId) => $"{CoinsUrl}/{coinId}/ausgaben";

    protected static string StornoUrl(Guid coinId, Guid ausgabeId) => $"{CoinsUrl}/{coinId}/ausgaben/{ausgabeId}/storno";

    protected static string AuflageUrl(Guid coinId) => $"{CoinsUrl}/{coinId}/auflage";

    /// <summary>Request-Body laut Abschnitt 5.2; <paramref name="exemplarNummer"/> <c>null</c> = nächste freie.</summary>
    protected static Dictionary<string, object?> GueltigeAusgabe(
        int? exemplarNummer = null,
        string empfaengerName = "Max Beispiel",
        string? empfaengerDienstgrad = "Hauptmann",
        string? empfaengerDienststelle = "Beispielbataillon 1",
        string datum = Datum,
        string gelegenheit = "Truppenbesuch",
        string begruendung = "Herausragende Leistung",
        string ausgebendeStelle = "Kommandeur Beispielbataillon 1") =>
        new()
        {
            ["exemplarNummer"] = exemplarNummer,
            ["empfaengerName"] = empfaengerName,
            ["empfaengerDienstgrad"] = empfaengerDienstgrad,
            ["empfaengerDienststelle"] = empfaengerDienststelle,
            ["datum"] = datum,
            ["gelegenheit"] = gelegenheit,
            ["begruendung"] = begruendung,
            ["ausgebendeStelle"] = ausgebendeStelle,
        };

    protected static Task<HttpResponseMessage> PostAusgabeAsync(HttpClient client, Guid coinId, object body) =>
        client.PostAsJsonAsync(AusgabenUrl(coinId), body);

    protected Task<HttpResponseMessage> PostAusgabeAsync(Guid coinId, object body) => PostAusgabeAsync(Client, coinId, body);

    protected static Task<HttpResponseMessage> PostRohAsync(HttpClient client, string url, string json) =>
        client.PostAsync(url, new StringContent(json, Encoding.UTF8, "application/json"));

    /// <summary>Erfasst eine Ausgabe (erwartet 201) und liefert die Antwort.</summary>
    protected async Task<JsonElement> ErfasseAsync(Guid coinId, int? exemplarNummer = null, HttpClient? client = null, string empfaengerName = "Max Beispiel")
    {
        using var antwort = await PostAusgabeAsync(client ?? Client, coinId, GueltigeAusgabe(exemplarNummer, empfaengerName: empfaengerName));
        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"Erfassen: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await JsonAsync(antwort);
    }

    protected static Task<HttpResponseMessage> PostStornoAsync(HttpClient client, Guid coinId, Guid ausgabeId, string? grund) =>
        client.PostAsJsonAsync(StornoUrl(coinId, ausgabeId), new { grund });

    /// <summary>Storniert eine Ausgabe (erwartet 200) und liefert die Antwort.</summary>
    protected async Task<JsonElement> StornierenAsync(Guid coinId, Guid ausgabeId, string grund = "Falsch erfasst", HttpClient? client = null)
    {
        using var antwort = await PostStornoAsync(client ?? Client, coinId, ausgabeId, grund);
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Storno: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await JsonAsync(antwort);
    }

    protected static Task<HttpResponseMessage> PutAuflageAsync(HttpClient client, Guid coinId, int? auflage) =>
        client.PutAsJsonAsync(AuflageUrl(coinId), new { auflage });

    /// <summary>Setzt die Auflage als Administrator (erwartet 200).</summary>
    protected async Task AuflageSetzenAsync(Guid coinId, int auflage)
    {
        using var antwort = await PutAuflageAsync(Client, coinId, auflage);
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Auflage: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
    }

    /// <summary>Legt einen Coin mit Auflage an und liefert die Id.</summary>
    protected async Task<Guid> CoinMitAuflageAsync(int? auflage, string? name = null)
    {
        var coin = await LegeCoinAnAsync(name ?? $"Coin {Guid.NewGuid():N}", auflage: auflage);
        return coin.GetProperty("id").GetGuid();
    }

    /// <summary><c>GET …/exemplare</c> als Administrator (erwartet 200).</summary>
    protected async Task<JsonElement> ExemplareAsync(Guid coinId, string query = "")
    {
        using var antwort = await Client.GetAsync(ExemplareUrl(coinId) + query);
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Exemplare: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await JsonAsync(antwort);
    }

    /// <summary>Kennzahlen als (auflage, ausgegeben, verfuegbar); <c>auflage</c> <c>null</c> → -1.</summary>
    protected async Task<(int Auflage, int Ausgegeben, int Verfuegbar)> KennzahlenAsync(Guid coinId)
    {
        var k = (await ExemplareAsync(coinId)).GetProperty("kennzahlen");
        var auflage = k.GetProperty("auflage");
        return (auflage.ValueKind == JsonValueKind.Null ? -1 : auflage.GetInt32(),
            k.GetProperty("ausgegeben").GetInt32(), k.GetProperty("verfuegbar").GetInt32());
    }

    /// <summary><c>GET …/ausgaben</c> als Administrator (erwartet 200).</summary>
    protected async Task<JsonElement> HistorieAsync(Guid coinId, string query = "")
    {
        using var antwort = await Client.GetAsync(AusgabenUrl(coinId) + query);
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Historie: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await JsonAsync(antwort);
    }

    protected static string[] Feldnamen(JsonElement json) =>
        json.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray();

    /// <summary>Meldungen zu einem Feld einer 400-Antwort.</summary>
    protected static async Task<string[]> FehlerZuFeldAsync(HttpResponseMessage antwort, string feld)
    {
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
        Assert.Equal("Eingaben ungültig", json.GetProperty("title").GetString());
        Assert.True(json.GetProperty("errors").TryGetProperty(feld, out var meldungen), $"Kein Fehler für „{feld}“: {json}");
        return meldungen.EnumerateArray().Select(m => m.GetString()!).ToArray();
    }

    /// <summary>Prüft eine fachliche 409 beim Erfassen (AK-8): title „Ausgabe nicht möglich“, <c>code</c>, <c>detail</c>.</summary>
    protected static async Task<JsonElement> AssertAusgabeKonfliktAsync(HttpResponseMessage antwort, string code, string detail)
    {
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.Conflict);
        Assert.Equal("Ausgabe nicht möglich", json.GetProperty("title").GetString());
        Assert.Equal(code, json.GetProperty("code").GetString());
        Assert.Equal(detail, json.GetProperty("detail").GetString());
        return json;
    }
}
