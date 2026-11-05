using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coin.IntegrationTests.Ausgaben;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Hologramm;

/// <summary>Coin und Ausgabe mit ihrer Hologrammnummer (Anzeigeform oder <c>null</c>).</summary>
public sealed record HologrammAusgabe(Guid CoinId, Guid AusgabeId, int ExemplarNummer, string? Hologrammnummer);

/// <summary>
/// Gemeinsame Hilfen für hologrammnummer (Abschnitt 5): URLs, Erfassen mit Nummer, Ergänzen/Korrigieren, Prüfen und
/// die Texte aus Abschnitt 5.3. Standard-Client ist der Bootstrap-Administrator. Prüfungen laufen immer über eigens
/// angelegte Konten (<see cref="PrueferAsync"/>), weil die Ratenbegrenzung je Benutzer und API-Instanz gilt und sich
/// alle Tests eine API-Instanz teilen (AK-19).
/// </summary>
public abstract class HologrammTestBasis(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    protected const string PruefungUrl = "/api/pruefung";

    protected const string PruefungMitEmpfaengerUrl = "/api/pruefung/mit-empfaenger";

    protected const string TitelErfassen = "Ausgabe nicht möglich";

    protected const string TitelHologramm = "Hologrammnummer nicht möglich";

    protected const string DetailVergeben = "Diese Hologrammnummer ist bereits vergeben. Bitte die Nummer prüfen.";

    protected const string DetailGeaendert = "Die Hologrammnummer wurde inzwischen geändert. Bitte die Seite neu laden.";

    protected const string DetailStorniert = "Die Hologrammnummer einer stornierten Ausgabe kann nicht geändert werden.";

    protected const string MeldungLeer = "Bitte eine Hologrammnummer eingeben.";

    protected const string MeldungZeichen =
        "Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.";

    protected const string MeldungLaenge = "Die Hologrammnummer darf höchstens 40 Zeichen lang sein.";

    protected const string MeldungNurTrenner = "Die Hologrammnummer muss mindestens einen Buchstaben oder eine Ziffer enthalten.";

    protected const string MeldungGrundFehlt = "Bitte einen Grund für die Korrektur angeben.";

    protected const string MeldungGrundZuLang = "Der Grund darf höchstens 500 Zeichen lang sein.";

    protected HologrammTabelle HologrammDb => new(Fixture.ConnectionString);

    protected static string AusgabeUrl(Guid coinId, Guid ausgabeId) => $"{AusgabenUrl(coinId)}/{ausgabeId}";

    protected static string HologrammUrl(Guid coinId, Guid ausgabeId) => $"{AusgabeUrl(coinId, ausgabeId)}/hologrammnummer";

    /// <summary>Request-Body einer Ausgabe mit Hologrammnummer (Abschnitt 5.2).</summary>
    protected static Dictionary<string, object?> AusgabeMit(string? hologrammnummer, int? exemplarNummer = null, string empfaengerName = "Max Beispiel")
    {
        var body = GueltigeAusgabe(exemplarNummer, empfaengerName: empfaengerName);
        body["hologrammnummer"] = hologrammnummer;
        return body;
    }

    /// <summary>Erfasst eine Ausgabe mit Nummer (erwartet 201).</summary>
    protected async Task<HologrammAusgabe> ErfasseMitNummerAsync(Guid coinId, string? hologrammnummer, int? exemplarNummer = null, HttpClient? client = null)
    {
        using var antwort = await PostAusgabeAsync(client ?? Client, coinId, AusgabeMit(hologrammnummer, exemplarNummer));
        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"Erfassen: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        var json = await JsonAsync(antwort);
        return new HologrammAusgabe(
            coinId,
            json.GetProperty("id").GetGuid(),
            json.GetProperty("exemplarNummer").GetInt32(),
            json.TryGetProperty("hologrammnummer", out var nummer) && nummer.ValueKind == JsonValueKind.String ? nummer.GetString() : null);
    }

    /// <summary>
    /// Legt einen Coin mit Auflage an und erfasst eine Ausgabe mit Nummer. Mit Nummer wird geprüft, dass sie tatsächlich
    /// gespeichert wurde, damit Folgetests („Nummer vergeben“) nicht ohne vergebene Nummer laufen.
    /// </summary>
    protected async Task<HologrammAusgabe> NeueAusgabeAsync(string? hologrammnummer, int auflage = 20)
    {
        var coinId = await CoinMitAuflageAsync(auflage);
        var ausgabe = await ErfasseMitNummerAsync(coinId, hologrammnummer);
        if (!string.IsNullOrWhiteSpace(hologrammnummer))
        {
            Assert.True(ausgabe.Hologrammnummer is not null, "Die Ausgabe wurde ohne Hologrammnummer gespeichert (AK-5).");
        }

        return ausgabe;
    }

    protected static Task<HttpResponseMessage> PutHologrammAsync(HttpClient client, Guid coinId, Guid ausgabeId, object body) =>
        client.PutAsJsonAsync(HologrammUrl(coinId, ausgabeId), body);

    protected Task<HttpResponseMessage> PutHologrammAsync(Guid coinId, Guid ausgabeId, string? hologrammnummer, string? grund = null, string? bisherige = null) =>
        PutHologrammAsync(Client, coinId, ausgabeId, new { hologrammnummer, grund, bisherige });

    /// <summary>Ergänzt oder korrigiert als Administrator (erwartet 200) und liefert die Antwort.</summary>
    protected async Task<JsonElement> AendereAsync(HologrammAusgabe a, string hologrammnummer, string? grund = null, string? bisherige = null)
    {
        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, hologrammnummer, grund, bisherige ?? a.Hologrammnummer);
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"PUT hologrammnummer: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await JsonAsync(antwort);
    }

    /// <summary>Neues Konto mit Rolle für Prüfungen (eigenes Kontingent der Ratenbegrenzung).</summary>
    protected Task<TestKonto> PrueferAsync(string rolle = "Sachbearbeiter") => KontoAsync(rolle);

    protected static Task<HttpResponseMessage> PostPruefungAsync(HttpClient client, string? hologrammnummer, Guid? coinId = null, bool mitEmpfaenger = false) =>
        client.PostAsJsonAsync(mitEmpfaenger ? PruefungMitEmpfaengerUrl : PruefungUrl, new { hologrammnummer, coinId });

    /// <summary>Prüft (erwartet 200) und liefert die Antwort.</summary>
    protected static async Task<JsonElement> PruefeAsync(HttpClient client, string hologrammnummer, Guid? coinId = null, bool mitEmpfaenger = false)
    {
        using var antwort = await PostPruefungAsync(client, hologrammnummer, coinId, mitEmpfaenger);
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Prüfung: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await JsonAsync(antwort);
    }

    protected static string Ergebnis(JsonElement pruefung) => pruefung.GetProperty("ergebnis").GetString()!;

    /// <summary>Prüft eine 409 (Erfassen oder PUT): ProblemDetails mit <c>title</c>, <c>code</c> und <c>detail</c>.</summary>
    protected static async Task<JsonElement> AssertKonfliktAsync(HttpResponseMessage antwort, string titel, string code, string detail)
    {
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.Conflict);
        Assert.Equal(
            (titel, code, detail),
            (json.GetProperty("title").GetString(), json.TryGetProperty("code", out var c) ? c.GetString() : null, json.GetProperty("detail").GetString()));
        return json;
    }

    /// <summary><c>code</c> einer Antwort oder <c>null</c>.</summary>
    protected static async Task<string?> CodeAsync(HttpResponseMessage antwort)
    {
        var text = await antwort.Content.ReadAsStringAsync();
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        using var dokument = JsonDocument.Parse(text);
        return dokument.RootElement.ValueKind == JsonValueKind.Object && dokument.RootElement.TryGetProperty("code", out var code)
            ? code.GetString()
            : null;
    }

    /// <summary>Die aktuelle (nicht abgelöste) Zuordnung einer Ausgabe oder <c>null</c>.</summary>
    protected async Task<HologrammZeile?> AktuelleZeileAsync(Guid ausgabeId) =>
        (await HologrammDb.ZeilenAsync(ausgabeId)).SingleOrDefault(z => z.AbgeloestAm is null);

    /// <summary>Alle Schlüssel eines JSON-Werts, rekursiv (für „keine Empfängerfelder“).</summary>
    protected static IEnumerable<string> AlleSchluessel(JsonElement json) => json.ValueKind switch
    {
        JsonValueKind.Object => json.EnumerateObject().SelectMany(p => AlleSchluessel(p.Value).Prepend(p.Name)),
        JsonValueKind.Array => json.EnumerateArray().SelectMany(AlleSchluessel),
        _ => [],
    };
}
