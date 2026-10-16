using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen, Abschnitt 8 „Logs“ (Muster <c>LogTests</c>, ADR-0019, ADR-0024 Punkt 5): Uploads mit
/// eindeutigem Dateinamen, Autorennamen, Titel und unbekanntem Platzhalter – angenommen und abgelehnt – bringen weder
/// diese Werte noch Ausnahmetexte des Parsers ins Log. Das Request-Protokoll nennt nur Routen-Templates. Rev. 8: auch
/// der Autorname einer Konfliktmarkierung und der Wert eines unqualifizierten Attributs stehen nicht im Log.
/// </summary>
public class VorlagenLogTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string AnfrageKategorie = "Coin.Api.Http.AnfrageProtokoll";

    private const string Dateiname = "Logdatei-Lg91.docx";
    private const string Autor = "Logautor Lg92";
    private const string Platzhalter = "{{Logplatzhalter.Lg93}}";
    private const string Titel = "Logtitel Lg94";
    private const string Dokumenttext = "Logtext Lg95";
    private const string CoinName = "Coin Logname Lg96";

    /// <summary>Rev. 7 (A25): eindeutiger Fremd-Namespace; der Server loggt den abgelehnten Namespace nicht.</summary>
    private const string FremdNamespace = "urn:coin:lognamespace:Lg97";

    /// <summary>Rev. 8 (AK-14): eindeutiger Autorname an einer Konfliktmarkierung <c>w14:conflictIns</c>.</summary>
    private const string KonfliktAutor = "Logkonflikt Lg98";

    /// <summary>Rev. 8 (AK-10 Punkt 8): eindeutiger Wert eines unqualifizierten Attributs an einem <c>w:</c>-Element.</summary>
    private const string AttributWert = "Logattribut Lg99";

    /// <summary>F16 (AK-10 Punkt 10): eindeutiger Unterzeichner und E-Mail-Adresse an einer Signaturzeile <c>o:signatureline</c>.</summary>
    private const string Unterzeichner = "Logsigner Lg9A";

    private const string UnterzeichnerEmail = "lg9b@example.invalid";

    private static readonly string[] Testwerte =
        [Dateiname, Autor, Platzhalter, "Logplatzhalter", Titel, Dokumenttext, CoinName, FremdNamespace, "lognamespace", KonfliktAutor, AttributWert, Unterzeichner, UnterzeichnerEmail];

    private sealed record Szenario(SammelLoggerProvider Logs, IReadOnlyList<string> Requests);

    private static byte[] MitMetadaten(params string[] zusatz)
    {
        var bauer = Gueltig().Absaetze([Text(Dokumenttext), .. zusatz]);
        bauer.KernEigenschaften($"<dc:creator>{Autor}</dc:creator><dc:title>{Titel}</dc:title><cp:lastModifiedBy>{Autor}</cp:lastModifiedBy>");
        return bauer.Bytes();
    }

    private async Task<Szenario> SzenarioAsync()
    {
        var logs = new SammelLoggerProvider();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Logger = logs,
            Einstellungen = new Dictionary<string, string?>
            {
                ["Logging:LogLevel:Default"] = "Trace",
                ["Logging:LogLevel:Microsoft"] = "Trace",
                ["Logging:LogLevel:Microsoft.AspNetCore"] = "Trace",
            },
        });
        using var admin = factory.CreateClient();
        using var anonym = factory.ClientOhneToken();
        var requests = new List<string>();

        async Task<HttpResponseMessage> MerkeAsync(string name, Task<HttpResponseMessage> anfrage)
        {
            var antwort = await anfrage;
            requests.Add($"{name} -> {(int)antwort.StatusCode}");
            return antwort;
        }

        Task<HttpResponseMessage> Hochladen(HttpClient client, Guid coinId, byte[] inhalt)
        {
            var datei = new ByteArrayContent(inhalt);
            datei.Headers.ContentType = MediaTypeHeaderValue.Parse(DocxContentType);
            return client.PostAsync(VersionenUrl(coinId), new MultipartFormDataContent { { datei, "datei", Dateiname } });
        }

        using var coin = await admin.PostAsJsonAsync(CoinsUrl, GueltigerCoin(CoinName));
        var coinId = (await JsonAsync(coin)).GetProperty("id").GetGuid();

        using (await MerkeAsync("Upload", Hochladen(admin, coinId, MitMetadaten())))
        using (await MerkeAsync("Upload unbekannt", Hochladen(admin, coinId, MitMetadaten(Text(Platzhalter)))))
        using (await MerkeAsync("Upload XXE", Hochladen(admin, coinId, Testvorlagen.Xxe())))
        using (await MerkeAsync("Upload kaputt", Hochladen(admin, coinId, Testvorlagen.Beschaedigt())))
        using (await MerkeAsync("Upload Kommentar", Hochladen(admin, coinId, Testvorlagen.MitKommentarTeil().Bytes())))
        using (await MerkeAsync("Upload Fremd-Namespace", Hochladen(admin, coinId,
            MitMetadaten($"<w:p><lgns:zusatz xmlns:lgns=\"{FremdNamespace}\"/></w:p>"))))
        using (await MerkeAsync("Upload Konflikt", Hochladen(admin, coinId, MitMetadaten(
            P($"<w14:conflictIns w:id=\"1\" w:author=\"{KonfliktAutor}\" w:date=\"2026-10-01T00:00:00Z\">{Run("eingefügt")}</w14:conflictIns>")))))
        using (await MerkeAsync("Upload Signaturzeile", Hochladen(admin, coinId, MitMetadaten(P(
            $"<w:r><w:pict><v:shape id=\"Signatur1\" style=\"width:192pt;height:96pt\"><o:signatureline v:ext=\"edit\" o:suggestedsigner=\"{Unterzeichner}\" " +
            $"o:suggestedsigneremail=\"{UnterzeichnerEmail}\" issignatureline=\"t\"/></v:shape></w:pict></w:r>")))))
        using (await MerkeAsync("Upload unqualifiziert", Hochladen(admin, coinId, MitMetadaten($"<w:p foo=\"{AttributWert}\">{Run("Text")}</w:p>"))))
        using (await MerkeAsync("Upload anonym", Hochladen(anonym, coinId, MitMetadaten())))
        using (await MerkeAsync("Status", admin.GetAsync(VorlageUrl(coinId))))
        using (await MerkeAsync("Aktive Datei", admin.GetAsync(AktiveDateiUrl(coinId))))
        using (await MerkeAsync("Version", admin.GetAsync(VersionDateiUrl(coinId, 1))))
        using (await MerkeAsync("Version 404", admin.GetAsync(VersionDateiUrl(coinId, 9))))
        using (await MerkeAsync("Standard", admin.GetAsync(StandardUrl)))
        using (await MerkeAsync("Zuruecksetzen", admin.PostAsync(ZuruecksetzenUrl(coinId), null)))
        using (await MerkeAsync("Bearbeiten", admin.PutAsJsonAsync($"{CoinsUrl}/{coinId}", GueltigerCoin(CoinName, beschreibung: Dokumenttext))))
        {
        }

        return new Szenario(logs, requests);
    }

    [Fact]
    public async Task Szenario_ruft_die_Endpunkte_mit_den_erwarteten_Status_auf()
    {
        var szenario = await SzenarioAsync();

        Assert.Equal(
            [
                "Upload -> 201", "Upload unbekannt -> 400", "Upload XXE -> 400", "Upload kaputt -> 400", "Upload Kommentar -> 400",
                "Upload Fremd-Namespace -> 400", "Upload Konflikt -> 400", "Upload Signaturzeile -> 400", "Upload unqualifiziert -> 400", "Upload anonym -> 401", "Status -> 200", "Aktive Datei -> 200", "Version -> 200", "Version 404 -> 404",
                "Standard -> 200", "Zuruecksetzen -> 200", "Bearbeiten -> 200",
            ],
            szenario.Requests);
    }

    [Fact]
    public async Task Logs_werden_tatsaechlich_abgefangen()
    {
        var szenario = await SzenarioAsync();

        Assert.NotEmpty(szenario.Logs.Eintraege);
    }

    public static TheoryData<string> Werte => [.. Testwerte];

    [Theory]
    [MemberData(nameof(Werte))]
    public async Task Logs_enthalten_den_Testwert_nicht(string wert)
    {
        var szenario = await SzenarioAsync();

        Assert.DoesNotContain(wert, szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Logs_enthalten_keine_Teilwerte_der_Testwerte()
    {
        var szenario = await SzenarioAsync();

        Assert.DoesNotContain("Lg9", szenario.Logs.Gesamt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Logs_enthalten_keine_Ausnahmetexte_des_XML_Parsers()
    {
        var szenario = await SzenarioAsync();

        Assert.DoesNotContain("DtdProcessing", szenario.Logs.Gesamt, StringComparison.Ordinal);
        Assert.DoesNotContain("win.ini", szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("XmlException", szenario.Logs.Gesamt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Request_Protokoll_nennt_fuer_die_Vorlagen_Endpunkte_das_Routen_Template()
    {
        var szenario = await SzenarioAsync();

        var routen = szenario.Logs.Strukturiert
            .Where(e => e.Kategorie == AnfrageKategorie)
            .Select(e => Convert.ToString(e.Werte.GetValueOrDefault("Route"), CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);

        Assert.Superset(
            new HashSet<string?>(
            [
                "/api/coins/{id}/zertifikatsvorlage", "/api/coins/{id}/zertifikatsvorlage/datei",
                "/api/coins/{id}/zertifikatsvorlage/versionen", "/api/coins/{id}/zertifikatsvorlage/versionen/{version}/datei",
                "/api/coins/{id}/zertifikatsvorlage/zuruecksetzen", "/api/zertifikatsvorlagen/standard", "/api/coins/{id}",
            ]),
            routen);
    }

    [Fact]
    public async Task Request_Protokoll_nennt_keine_konkrete_Coin_Id()
    {
        var szenario = await SzenarioAsync();

        var pfade = szenario.Logs.Strukturiert
            .Where(e => e.Kategorie == AnfrageKategorie)
            .Select(e => Convert.ToString(e.Werte.GetValueOrDefault("Route"), CultureInfo.InvariantCulture) ?? string.Empty);

        Assert.All(pfade, p => Assert.DoesNotMatch("[0-9a-f]{8}-[0-9a-f]{4}-", p));
    }
}
