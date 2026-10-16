using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Gemeinsame Hilfen für zertifikatsvorlagen (Abschnitt 5): URLs, Upload, Status, Downloads, Fehlermeldungen.
/// Standard-Client ist der Bootstrap-Administrator.
/// </summary>
public abstract class VorlagenTestBasis(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    protected const string DocxContentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    protected const string StandardUrl = "/api/zertifikatsvorlagen/standard";

    protected const int FuenfMiB = 5_242_880;

    protected const string KeinDocx = "Die Datei ist kein Word-Dokument im Format .docx.";

    protected const string AltesWord =
        "Die Datei ist ein älteres Word-Dokument (.doc) oder mit einem Kennwort geschützt. Bitte als Word-Dokument (.docx) ohne Kennwort speichern.";

    protected const string Makros = "Die Datei enthält Makros. Bitte als Word-Dokument ohne Makros (.docx) speichern.";

    protected const string ZuGrossEntpackt = "Die Datei ist entpackt zu groß oder enthält zu viele Bestandteile.";

    protected const string NachverfolgteAenderungen =
        "Die Vorlage enthält nachverfolgte Änderungen. Bitte alle Änderungen annehmen oder ablehnen und erneut hochladen.";

    protected const string Kommentare = "Die Vorlage enthält Kommentare. Bitte alle Kommentare löschen und erneut hochladen.";

    /// <summary>Rev. 7 (AK-10, F14/O7): Meldung für nicht erlaubte, nicht strikte Namespaces („Erweiterungsmeldung“).</summary>
    protected const string Erweiterungen =
        "Die Datei enthält nicht unterstützte Word-Erweiterungen, z. B. Diagramme, SmartArt, Freihandzeichnungen oder Add-ins. Bitte diese Inhalte entfernen und erneut hochladen.";

    /// <summary>Rev. 7 (AK-10, F15): Meldung für SVG-Grafiken.</summary>
    protected const string SvgGrafiken = "Die Vorlage enthält SVG-Grafiken. Bitte Bilder als PNG oder JPEG einfügen und erneut hochladen.";

    protected const string UnbekanntHinweis = " Erlaubt sind nur die Platzhalter aus der Standardvorlage.";

    protected VorlageTabelle VorlageDb => new(Fixture.ConnectionString);

    protected static string VorlageUrl(Guid coinId) => $"{CoinsUrl}/{coinId}/zertifikatsvorlage";

    protected static string AktiveDateiUrl(Guid coinId) => $"{VorlageUrl(coinId)}/datei";

    protected static string VersionenUrl(Guid coinId) => $"{VorlageUrl(coinId)}/versionen";

    protected static string VersionDateiUrl(Guid coinId, int version) => $"{VersionenUrl(coinId)}/{version}/datei";

    protected static string ZuruecksetzenUrl(Guid coinId) => $"{VorlageUrl(coinId)}/zuruecksetzen";

    protected static string Unzulaessig(params string[] arten) => $"Die Datei enthält unzulässige Inhalte: {string.Join(", ", arten)}.";

    /// <summary>Multipart mit genau einer Datei im Feld <c>datei</c>.</summary>
    protected static MultipartFormDataContent DocxMultipart(byte[] inhalt, string dateiname = "vorlage.docx", string contentType = DocxContentType) =>
        Multipart(inhalt, contentType: contentType, dateiname: dateiname);

    protected static Task<HttpResponseMessage> PostVersionAsync(HttpClient client, Guid coinId, byte[] inhalt, string dateiname = "vorlage.docx") =>
        client.PostAsync(VersionenUrl(coinId), DocxMultipart(inhalt, dateiname));

    protected Task<HttpResponseMessage> PostVersionAsync(Guid coinId, byte[] inhalt, string dateiname = "vorlage.docx") =>
        PostVersionAsync(Client, coinId, inhalt, dateiname);

    /// <summary>Lädt eine Vorlage hoch (erwartet 201) und liefert den Vorlagenstatus.</summary>
    protected async Task<JsonElement> LadeVorlageHochAsync(Guid coinId, byte[]? inhalt = null, HttpClient? client = null)
    {
        using var antwort = await PostVersionAsync(client ?? Client, coinId, inhalt ?? DocxBauer.Gueltig().Bytes());
        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"Upload: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await JsonAsync(antwort);
    }

    protected static Task<HttpResponseMessage> PostZuruecksetzenAsync(HttpClient client, Guid coinId) =>
        client.PostAsync(ZuruecksetzenUrl(coinId), null);

    /// <summary><c>GET …/zertifikatsvorlage</c> als Administrator (erwartet 200).</summary>
    protected async Task<JsonElement> StatusAsync(Guid coinId)
    {
        using var antwort = await Client.GetAsync(VorlageUrl(coinId));
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Status: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await JsonAsync(antwort);
    }

    /// <summary>Lädt eine Datei als Administrator (erwartet 200) und liefert die Bytes.</summary>
    protected async Task<byte[]> LadeAsync(string url)
    {
        using var antwort = await Client.GetAsync(url);
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Download {url}: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await antwort.Content.ReadAsByteArrayAsync();
    }

    protected Task<byte[]> StandardvorlageAsync() => LadeAsync(StandardUrl);

    /// <summary>Meldungen unter <c>errors.datei</c> einer 400-Antwort („Eingaben ungültig“).</summary>
    protected static async Task<string[]> DateiFehlerAsync(HttpResponseMessage antwort)
    {
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
        Assert.Equal("Eingaben ungültig", json.GetProperty("title").GetString());
        var errors = json.GetProperty("errors");
        Assert.Equal(["datei"], errors.EnumerateObject().Select(p => p.Name).ToArray());
        return errors.GetProperty("datei").EnumerateArray().Select(m => m.GetString()!).ToArray();
    }

    /// <summary>Lädt hoch und liefert die Meldungen unter <c>errors.datei</c> (erwartet 400).</summary>
    protected async Task<string[]> AbgelehntAsync(Guid coinId, byte[] inhalt)
    {
        using var antwort = await PostVersionAsync(coinId, inhalt);
        return await DateiFehlerAsync(antwort);
    }

    /// <summary>Beobachtbarer Speicherzustand: Versionen (alle Coins), Zeiger des Coins, Audit-Einträge.</summary>
    protected async Task<string> SpeicherZustandAsync(Guid coinId) =>
        $"{await VorlageDb.AnzahlVersionenAsync()}|{await VorlageDb.AktiveVersionAsync(coinId)}|{(await VorlageDb.AuditAsync()).Count}";

    protected async Task<Guid> CoinAsync(string? name = null) =>
        await LegeCoinAnUndLiefereIdAsync(name ?? $"Coin Vorlage {Guid.NewGuid():N}");

    protected static void AssertDownloadHeader(HttpResponseMessage antwort, string dateiname)
    {
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(DocxContentType, antwort.Content.Headers.ContentType?.MediaType);
        var disposition = antwort.Content.Headers.ContentDisposition;
        Assert.NotNull(disposition);
        Assert.Equal("attachment", disposition!.DispositionType);
        Assert.Equal(dateiname, disposition.FileName?.Trim('"'));
        Assert.Equal("nosniff", string.Join(",", antwort.Headers.GetValues("X-Content-Type-Options")));
        Assert.Equal("default-src 'none'; sandbox", string.Join(",", antwort.Headers.GetValues("Content-Security-Policy")));
        Assert.Contains("no-store", antwort.Headers.CacheControl?.ToString() ?? string.Empty, StringComparison.Ordinal);
    }

    protected static MediaTypeHeaderValue Typ(string wert) => MediaTypeHeaderValue.Parse(wert);
}
