using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using Coin.IntegrationTests.Infrastruktur;
using Coin.Testdaten;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-19 (Muster <c>LogTests</c>, ADR-0019): Weder Texte der Konfiguration noch Dateinamen, Logo-Bytes,
/// Maße aus Meldungen oder Ausnahmetexte des Formularlesers erscheinen im Log. Das Request-Protokoll enthält nur die
/// Routen-Templates <c>/api/startseite…</c>. Alle Logs ab Trace werden im Speicher abgefangen.
/// </summary>
public class StartseiteLogTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    private const string AnfrageKategorie = "Coin.Api.Http.AnfrageProtokoll";

    private const string Titel = "Logtitel Sx71";
    private const string Untertitel = "Loguntertitel Sx72";
    private const string Infotext = "Loginfotext Sx73";
    private const string Alttext = "Logalttext Sx74";
    private const string Dateiname = "Logdatei-Sx75.png";
    private const string LogoMetadaten = "Logmetadaten Sx76";
    private const string Boundary = "----SxGrenze";

    private static readonly string[] Testwerte = [Titel, Untertitel, Infotext, Alttext, Dateiname, LogoMetadaten, "Sx7"];

    private sealed record Szenario(SammelLoggerProvider Logs, IReadOnlyList<string> Requests);

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

        async Task MerkeAsync(string name, Task<HttpResponseMessage> anfrage)
        {
            using var antwort = await anfrage;
            requests.Add($"{name} -> {(int)antwort.StatusCode}");
        }

        var konfiguration = Mit(MitKopf(titel: Titel, untertitel: Untertitel, alttextBereitsteller: Alttext), k => k["infotext"]!["text"] = Infotext);
        var gueltig = new LogoTeil("logoBereitsteller", LogoBilder.PngMitMetadaten(30, 30, LogoMetadaten), Dateiname);

        await MerkeAsync("Speichern", admin.PutAsync(KonfigurationUrl, KonfigurationsInhalt(konfiguration, gueltig)));
        await MerkeAsync("Konflikt", admin.PutAsync(KonfigurationUrl, KonfigurationsInhalt(konfiguration, gueltig)));
        await MerkeAsync("SVG", admin.PutAsync(KonfigurationUrl, KonfigurationsInhalt(
            Mit(konfiguration, k => k["version"] = 1), new LogoTeil("logoBereitsteller", LogoBilder.Svg(), Dateiname))));
        await MerkeAsync("Pixel", admin.PutAsync(KonfigurationUrl, KonfigurationsInhalt(
            Mit(konfiguration, k => k["version"] = 1), new LogoTeil("logoBereitsteller", LogoBilder.Png(4321, 1234), Dateiname))));
        await MerkeAsync("Zu lang", admin.PutAsync(KonfigurationUrl, KonfigurationsInhalt(
            Mit(konfiguration, k => k["infotext"]!["text"] = Infotext + new string('x', 5000)))));
        await MerkeAsync("Kaputtes JSON", admin.PutAsync(KonfigurationUrl, new MultipartFormDataContent
        {
            { new StringContent($"{{\"titel\": \"{Titel}\", ", Encoding.UTF8, "application/json"), "konfiguration" },
        }));
        var abgeschnitten = new ByteArrayContent(Encoding.UTF8.GetBytes(
            $"--{Boundary}\r\nContent-Disposition: form-data; name=\"logoBereitsteller\"; filename=\"{Dateiname}\"\r\n\r\n{Untertitel}"));
        abgeschnitten.Headers.ContentType = MediaTypeHeaderValue.Parse($"multipart/form-data; boundary={Boundary}");
        await MerkeAsync("Abgeschnitten", admin.PutAsync(KonfigurationUrl, abgeschnitten));
        await MerkeAsync("Anonym", anonym.PutAsync(KonfigurationUrl, KonfigurationsInhalt(konfiguration, gueltig)));
        await MerkeAsync("Startseite", admin.GetAsync(StartseiteUrl));
        await MerkeAsync("Konfiguration", admin.GetAsync(KonfigurationUrl));
        await MerkeAsync("Kopf", anonym.GetAsync(KopfUrl));
        await MerkeAsync("Logo", anonym.GetAsync(LogoUrl("bereitsteller")));
        await MerkeAsync("Logo 404", anonym.GetAsync(LogoUrl("software")));

        return new Szenario(logs, requests);
    }

    [Fact]
    public async Task Szenario_ruft_die_Endpunkte_mit_den_erwarteten_Status_auf()
    {
        var szenario = await SzenarioAsync();

        Assert.Equal(
            [
                "Speichern -> 200", "Konflikt -> 409", "SVG -> 400", "Pixel -> 400", "Zu lang -> 400", "Kaputtes JSON -> 400",
                "Abgeschnitten -> 400", "Anonym -> 401", "Startseite -> 200", "Konfiguration -> 200", "Kopf -> 200", "Logo -> 200",
                "Logo 404 -> 404",
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
    public async Task Logs_enthalten_keine_Maße_aus_Meldungen()
    {
        var szenario = await SzenarioAsync();

        Assert.DoesNotContain("4321", szenario.Logs.Gesamt, StringComparison.Ordinal);
        Assert.DoesNotContain("Pixel groß", szenario.Logs.Gesamt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Logs_enthalten_keine_Meldungen_der_Logopruefung_oder_des_Formularlesers()
    {
        var szenario = await SzenarioAsync();

        Assert.DoesNotContain("SVG-Dateien", szenario.Logs.Gesamt, StringComparison.Ordinal);
        Assert.DoesNotContain("JsonException", szenario.Logs.Gesamt, StringComparison.Ordinal);
        Assert.DoesNotContain("InvalidDataException", szenario.Logs.Gesamt, StringComparison.Ordinal);
        Assert.DoesNotContain("IOException", szenario.Logs.Gesamt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Logs_enthalten_keine_Logo_Bytes_als_Base64()
    {
        var szenario = await SzenarioAsync();
        var png = Convert.ToBase64String(LogoBilder.PngMitMetadaten(30, 30, LogoMetadaten))[..24];

        Assert.DoesNotContain(png, szenario.Logs.Gesamt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Request_Protokoll_nennt_fuer_die_Startseite_nur_Routen_Templates()
    {
        var szenario = await SzenarioAsync();

        var routen = szenario.Logs.Strukturiert
            .Where(e => e.Kategorie == AnfrageKategorie)
            .Select(e => Convert.ToString(e.Werte.GetValueOrDefault("Route"), CultureInfo.InvariantCulture) ?? string.Empty)
            .Where(r => r.StartsWith("/api/startseite", StringComparison.Ordinal))
            .ToHashSet(StringComparer.Ordinal);

        Assert.Equal(
            new HashSet<string>(
                ["/api/startseite", "/api/startseite/kopf", "/api/startseite/konfiguration", "/api/startseite/logos/{platz}"],
                StringComparer.Ordinal),
            routen);
    }

    [Fact]
    public async Task Request_Protokoll_nennt_keinen_konkreten_Logo_Platz()
    {
        var szenario = await SzenarioAsync();

        var routen = szenario.Logs.Strukturiert
            .Where(e => e.Kategorie == AnfrageKategorie)
            .Select(e => Convert.ToString(e.Werte.GetValueOrDefault("Route"), CultureInfo.InvariantCulture) ?? string.Empty);

        Assert.DoesNotContain(routen, r => r.Contains("bereitsteller", StringComparison.Ordinal) || r.Contains("software", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Request_Protokoll_hat_je_Startseiten_Request_genau_einen_Eintrag()
    {
        var szenario = await SzenarioAsync();

        var anzahl = szenario.Logs.Strukturiert
            .Where(e => e.Kategorie == AnfrageKategorie)
            .Count(e => (Convert.ToString(e.Werte.GetValueOrDefault("Route"), CultureInfo.InvariantCulture) ?? string.Empty)
                .StartsWith("/api/startseite", StringComparison.Ordinal));

        Assert.Equal(szenario.Requests.Count, anzahl);
    }
}
