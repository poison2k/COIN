using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Startseite;

/// <summary>Ein Dateiteil im Multipart-Request von <c>PUT /api/startseite/konfiguration</c> (Abschnitt 5.4).</summary>
public sealed record LogoTeil(string Feld, byte[] Inhalt, string Dateiname = "logo.png", string ContentType = "image/png");

/// <summary>
/// Gemeinsame Hilfen für Feature startseite (Abschnitt 5): URLs, Konfiguration als JSON, Multipart-Speichern, Fehler,
/// Tabellenzugriff. Standard-Client ist der Bootstrap-Administrator (hat <c>startpage.manage</c>).
/// </summary>
public abstract class StartseiteTestBasis(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    protected const string StartseiteUrl = "/api/startseite";
    protected const string KopfUrl = "/api/startseite/kopf";
    protected const string KonfigurationUrl = "/api/startseite/konfiguration";

    protected const string StandardTitel = "C.O.I.N.";
    protected const string StandardUntertitel = "Certified Official Issue Numbering";

    protected const string StandardInfotext =
        "C.O.I.N. verwaltet die Gedenk-Coins der Bundeswehr: den Katalog der Coins, ihre nummerierten Exemplare und die Echtheitszertifikate.";

    protected const int ZweiMiB = 2 * 1024 * 1024;

    // ---------- Meldungen aus 5.5 (wörtlich) ----------

    protected const string MeldungSvg = "SVG-Dateien sind nicht erlaubt. Bitte das Logo als PNG, JPEG oder WebP hochladen.";
    protected const string MeldungKeinBild = "Die Datei ist kein Bild im Format PNG, JPEG oder WebP.";
    protected const string MeldungBeschaedigt = "Die Bilddatei ist beschädigt oder unvollständig.";
    protected const string MeldungAnimiert = "Animierte Bilder sind nicht erlaubt.";
    protected const string MeldungLeer = "Die Datei ist leer.";
    protected const string MeldungAlttextBereitsteller = "Bitte einen Alternativtext für das Logo des Bereitstellers eingeben.";
    protected const string MeldungAlttextSoftware = "Bitte einen Alternativtext für das Logo der Software eingeben.";
    protected const string MeldungDateiBereitsteller = "Bitte eine Bilddatei für das Logo des Bereitstellers auswählen.";
    protected const string MeldungDateiSoftware = "Bitte eine Bilddatei für das Logo der Software auswählen.";

    protected static string MeldungPixel(int breite, int hoehe) =>
        $"Das Logo ist {breite} × {hoehe} Pixel groß; erlaubt sind höchstens 2048 × 2048 Pixel.";

    protected static readonly string[] StandardReihenfolge = ["kopf", "infotext", "kennzahlen", "neueste", "meistausgegeben"];

    protected StartseiteTabelle StartseiteDb => new(Fixture.ConnectionString);

    protected static string LogoUrl(string platz) => $"/api/startseite/logos/{platz}";

    protected static string Sha256(byte[] inhalt) => Convert.ToHexStringLower(SHA256.HashData(inhalt));

    // ---------- Konfiguration als JSON (Abschnitt 5.4) ----------

    /// <summary>Request-Teil <c>konfiguration</c> mit den Werten der Standardkonfiguration (AK-1).</summary>
    protected static JsonObject StandardKonfiguration(int version = 0) => new()
    {
        ["version"] = version,
        ["reihenfolge"] = new JsonArray([.. StandardReihenfolge.Select(r => (JsonNode)r)]),
        ["kopf"] = new JsonObject
        {
            ["aktiv"] = false,
            ["titel"] = StandardTitel,
            ["untertitel"] = StandardUntertitel,
            ["logoBereitsteller"] = null,
            ["logoSoftware"] = null,
        },
        ["infotext"] = new JsonObject { ["aktiv"] = true, ["text"] = StandardInfotext },
        ["kennzahlen"] = new JsonObject { ["aktiv"] = true },
        ["neueste"] = new JsonObject { ["aktiv"] = true, ["anzahl"] = 6 },
        ["meistausgegeben"] = new JsonObject { ["aktiv"] = true, ["anzahl"] = 5 },
    };

    /// <summary>Kopie der Konfiguration mit Änderungen.</summary>
    protected static JsonObject Mit(JsonObject konfiguration, Action<JsonObject> aendern)
    {
        var kopie = (JsonObject)konfiguration.DeepClone();
        aendern(kopie);
        return kopie;
    }

    protected static JsonObject Kopf(JsonObject k) => (JsonObject)k["kopf"]!;

    protected static void Reihenfolge(JsonObject k, params string[] folge) =>
        k["reihenfolge"] = new JsonArray([.. folge.Select(r => (JsonNode)r)]);

    /// <summary>Konfiguration mit aktivem Kopfbereich und den angegebenen Logo-Plätzen (Alternativtexte gesetzt).</summary>
    protected static JsonObject MitKopf(
        int version = 0,
        string titel = "Titel Test",
        string untertitel = "Untertitel Test",
        string? alttextBereitsteller = null,
        string? alttextSoftware = null) =>
        Mit(StandardKonfiguration(version), k =>
        {
            Kopf(k)["aktiv"] = true;
            Kopf(k)["titel"] = titel;
            Kopf(k)["untertitel"] = untertitel;
            Kopf(k)["logoBereitsteller"] = alttextBereitsteller is null ? null : new JsonObject { ["alternativtext"] = alttextBereitsteller };
            Kopf(k)["logoSoftware"] = alttextSoftware is null ? null : new JsonObject { ["alternativtext"] = alttextSoftware };
        });

    // ---------- Requests ----------

    /// <summary>Multipart-Request nach 5.4: Teil <c>konfiguration</c> (JSON, ohne Dateiname) und Dateiteile.</summary>
    protected static MultipartFormDataContent KonfigurationsInhalt(JsonNode? konfiguration, params LogoTeil[] logos)
    {
        var inhalt = new MultipartFormDataContent();
        if (konfiguration is not null)
        {
            inhalt.Add(new StringContent(konfiguration.ToJsonString(), Encoding.UTF8, "application/json"), "konfiguration");
        }

        foreach (var logo in logos)
        {
            var datei = new ByteArrayContent(logo.Inhalt);
            datei.Headers.ContentType = MediaTypeHeaderValue.Parse(logo.ContentType);
            inhalt.Add(datei, logo.Feld, logo.Dateiname);
        }

        return inhalt;
    }

    protected static Task<HttpResponseMessage> PutKonfigurationAsync(HttpClient client, JsonNode? konfiguration, params LogoTeil[] logos) =>
        client.PutAsync(KonfigurationUrl, KonfigurationsInhalt(konfiguration, logos));

    protected Task<HttpResponseMessage> PutKonfigurationAsync(JsonNode? konfiguration, params LogoTeil[] logos) =>
        PutKonfigurationAsync(Client, konfiguration, logos);

    /// <summary>Speichert als Administrator (erwartet 200) und liefert die Antwort (Format 5.3).</summary>
    protected async Task<JsonElement> SpeichernAsync(JsonNode konfiguration, params LogoTeil[] logos)
    {
        using var antwort = await PutKonfigurationAsync(konfiguration, logos);
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Speichern: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await JsonAsync(antwort);
    }

    /// <summary><c>GET /api/startseite/konfiguration</c> (erwartet 200).</summary>
    protected async Task<JsonElement> KonfigurationAsync(HttpClient? client = null)
    {
        using var antwort = await (client ?? Client).GetAsync(KonfigurationUrl);
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Konfiguration: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await JsonAsync(antwort);
    }

    /// <summary><c>GET /api/startseite</c> (erwartet 200).</summary>
    protected async Task<JsonElement> StartseiteAsync(HttpClient? client = null)
    {
        using var antwort = await (client ?? Client).GetAsync(StartseiteUrl);
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Startseite: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await JsonAsync(antwort);
    }

    /// <summary><c>GET /api/startseite/kopf</c> anonym (erwartet 200).</summary>
    protected async Task<JsonElement> KopfAsync(HttpClient? client = null)
    {
        using var antwort = await (client ?? Anonym).GetAsync(KopfUrl);
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Kopf: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await JsonAsync(antwort);
    }

    /// <summary>Arten der Blöcke in der Reihenfolge der Antwort.</summary>
    protected static string[] Arten(JsonElement startseite) =>
        startseite.GetProperty("bloecke").EnumerateArray().Select(b => b.GetProperty("art").GetString()!).ToArray();

    /// <summary>Der Block einer Art (genau einer erwartet).</summary>
    protected static JsonElement Block(JsonElement startseite, string art) =>
        Assert.Single(startseite.GetProperty("bloecke").EnumerateArray(), b => b.GetProperty("art").GetString() == art);

    protected static string[] Feldnamen(JsonElement json) =>
        json.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray();

    /// <summary>Alle Fehler einer 400-Antwort („Eingaben ungültig“) als Feld → Meldungen.</summary>
    protected static async Task<Dictionary<string, string[]>> FehlerAsync(HttpResponseMessage antwort)
    {
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
        Assert.Equal("Eingaben ungültig", json.GetProperty("title").GetString());
        return json.GetProperty("errors").EnumerateObject()
            .ToDictionary(p => p.Name, p => p.Value.EnumerateArray().Select(m => m.GetString()!).ToArray(), StringComparer.Ordinal);
    }

    /// <summary>Meldungen zu genau einem Feld einer 400-Antwort.</summary>
    protected static async Task<string[]> FehlerZuAsync(HttpResponseMessage antwort, string feld)
    {
        var fehler = await FehlerAsync(antwort);
        Assert.True(fehler.TryGetValue(feld, out var meldungen), $"Kein Fehler für „{feld}“, sondern für: {string.Join(", ", fehler.Keys)}");
        return meldungen;
    }

    /// <summary>Lädt ein Logo als Administrator hoch (Kopf aktiv) und liefert die Antwort.</summary>
    protected Task<JsonElement> LogoHochladenAsync(string platz, byte[] inhalt, string alternativtext = "Wappen Test", int version = 0) =>
        SpeichernAsync(
            platz == "bereitsteller"
                ? MitKopf(version, alttextBereitsteller: alternativtext)
                : MitKopf(version, alttextSoftware: alternativtext),
            new LogoTeil(platz == "bereitsteller" ? "logoBereitsteller" : "logoSoftware", inhalt));

    /// <summary>Speichert Konfiguration mit einem abgelehnten Logo und liefert die Meldungen am Logo-Feld (erwartet 400).</summary>
    protected async Task<string[]> LogoAbgelehntAsync(byte[] inhalt, string dateiname = "logo.png", string contentType = "image/png")
    {
        using var antwort = await PutKonfigurationAsync(
            MitKopf(alttextBereitsteller: "Wappen Test"),
            new LogoTeil("logoBereitsteller", inhalt, dateiname, contentType));
        return await FehlerZuAsync(antwort, "logoBereitsteller");
    }

    protected Task<HttpClient> BetrachterAsync() => ClientMitRolleAsync("Betrachter");
}
