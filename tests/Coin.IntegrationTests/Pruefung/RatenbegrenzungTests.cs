using System.Net;
using System.Text.RegularExpressions;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Coin.IntegrationTests.Pruefung;

/// <summary>
/// Feature hologrammnummer, AK-19 (H8, ADR-0034 Punkt 4): Je Benutzer (Claim <c>sub</c>) höchstens 20 Prüfungen je
/// 60 s über beide Endpunkte zusammen; die 21. Anfrage → <c>429</c> mit <c>code</c> <c>zu_viele_pruefungen</c>,
/// <c>Retry-After</c> 1–60 und <c>Cache-Control: no-store</c>, ohne Audit. Ein zweiter Benutzer ist unberührt; 401/403
/// verbrauchen nichts und kommen vor 429; 400 verbraucht Kontingent (A8). Andere Endpunkte sind nicht begrenzt. Die
/// Grenzen stehen fest im Code (Policy <c>pruefung</c>, <c>UseRateLimiter</c> nach <c>UseAuthorization</c>).
/// Jeder Test nutzt eigene Konten, weil sich alle Tests eine API-Instanz und damit den Zähler im Speicher teilen.
/// </summary>
public partial class RatenbegrenzungTests(PostgresFixture fixture) : PruefungTestBasis(fixture)
{
    private const int Grenze = 20;

    private const string Titel429 = "Zu viele Prüfungen";

    private const string Detail429 =
        "Sie haben in kurzer Zeit zu viele Prüfungen durchgeführt. Bitte warten Sie einen Moment und versuchen Sie es erneut.";

    /// <summary>Sendet <paramref name="anzahl"/> Prüfungen gleichzeitig, abwechselnd auf beide Endpunkte, und liefert die Status.</summary>
    private static async Task<int[]> GemischtAsync(HttpClient client, int anzahl, string nummer = "AB1234", bool nurOhneEmpfaenger = false)
    {
        var antworten = await Task.WhenAll(Enumerable.Range(0, anzahl)
            .Select(i => PostPruefungAsync(client, nummer, mitEmpfaenger: !nurOhneEmpfaenger && i % 2 == 1)));
        var status = antworten.Select(a => (int)a.StatusCode).ToArray();
        foreach (var antwort in antworten)
        {
            antwort.Dispose();
        }

        return status;
    }

    /// <summary>Verbraucht das Kontingent eines Kontos (20 erfolgreiche Prüfungen über beide Endpunkte).</summary>
    private static async Task KontingentVerbrauchenAsync(HttpClient client)
    {
        var status = await GemischtAsync(client, Grenze);
        Assert.All(status, s => Assert.Equal(200, s));
    }

    [Fact]
    public async Task Zwanzig_Pruefungen_ueber_beide_Endpunkte_sind_erlaubt()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        Assert.Equal(Enumerable.Repeat(200, Grenze), await GemischtAsync(pruefer.Client, Grenze));
    }

    [Fact]
    public async Task Die_21_Pruefung_liefert_429()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();
        await KontingentVerbrauchenAsync(pruefer.Client);

        using var antwort = await PostPruefungAsync(pruefer.Client, "AB1234");

        Assert.Equal(HttpStatusCode.TooManyRequests, antwort.StatusCode);
    }

    [Fact]
    public async Task Die_21_Pruefung_auf_dem_anderen_Endpunkt_liefert_ebenfalls_429()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();
        Assert.All(await GemischtAsync(pruefer.Client, Grenze, nurOhneEmpfaenger: true), s => Assert.Equal(200, s));

        using var antwort = await PostPruefungAsync(pruefer.Client, "AB1234", mitEmpfaenger: true);

        Assert.Equal(HttpStatusCode.TooManyRequests, antwort.StatusCode);
    }

    [Fact]
    public async Task Antwort_429_ist_ProblemDetails_mit_Titel_Code_und_Text()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();
        await KontingentVerbrauchenAsync(pruefer.Client);

        using var antwort = await PostPruefungAsync(pruefer.Client, "AB1234");

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.TooManyRequests);
        Assert.Equal(
            (Titel429, "zu_viele_pruefungen", Detail429),
            (json.GetProperty("title").GetString(), json.GetProperty("code").GetString(), json.GetProperty("detail").GetString()));
    }

    [Fact]
    public async Task Antwort_429_hat_Retry_After_zwischen_1_und_60_Sekunden()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();
        await KontingentVerbrauchenAsync(pruefer.Client);

        using var antwort = await PostPruefungAsync(pruefer.Client, "AB1234");

        Assert.True(antwort.Headers.TryGetValues("Retry-After", out var werte), "Retry-After fehlt.");
        var sekunden = int.Parse(Assert.Single(werte!), System.Globalization.CultureInfo.InvariantCulture);
        Assert.InRange(sekunden, 1, 60);
    }

    [Fact]
    public async Task Antwort_429_setzt_Cache_Control_no_store()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();
        await KontingentVerbrauchenAsync(pruefer.Client);

        using var antwort = await PostPruefungAsync(pruefer.Client, "AB1234");

        Assert.True(antwort.Headers.CacheControl?.NoStore, "Cache-Control ohne no-store.");
    }

    [Fact]
    public async Task Antwort_429_enthaelt_kein_Pruefergebnis()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();
        await KontingentVerbrauchenAsync(pruefer.Client);

        using var antwort = await PostPruefungAsync(pruefer.Client, "AB1234");
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.DoesNotContain("ergebnis", text, StringComparison.Ordinal);
        Assert.DoesNotContain("AB 12-34", text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Abgelehnte_Pruefungen_schreiben_kein_Audit()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();
        await KontingentVerbrauchenAsync(pruefer.Client);

        var weitere = await GemischtAsync(pruefer.Client, 5);

        Assert.All(weitere, s => Assert.Equal(429, s));
        Assert.Equal(Grenze, (await HologrammDb.PruefAuditAsync(pruefer.Id)).Count);
    }

    [Fact]
    public async Task Ein_zweiter_Benutzer_ist_unberuehrt()
    {
        await SzenarioAsync();
        var erster = await PrueferAsync();
        var zweiter = await PrueferAsync();
        await KontingentVerbrauchenAsync(erster.Client);

        using var antwort = await PostPruefungAsync(zweiter.Client, "AB1234");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Ein_neues_Token_desselben_Benutzers_bleibt_begrenzt()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();
        await KontingentVerbrauchenAsync(pruefer.Client);
        var neuesToken = ClientMit(new TokenDaten { Subject = pruefer.Subject, Email = pruefer.Email, Name = pruefer.Name });

        using var antwort = await PostPruefungAsync(neuesToken, "AB1234");

        Assert.Equal(HttpStatusCode.TooManyRequests, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_erhaelt_auf_mit_empfaenger_auch_nach_25_Anfragen_403_und_danach_auf_api_pruefung_200()
    {
        await SzenarioAsync();
        var betrachter = await PrueferAsync("Betrachter");

        var verweigert = await Task.WhenAll(Enumerable.Range(0, 25).Select(_ => PostPruefungAsync(betrachter.Client, "AB1234", mitEmpfaenger: true)));
        var status = verweigert.Select(a => (int)a.StatusCode).ToArray();
        foreach (var a in verweigert)
        {
            a.Dispose();
        }

        using var danach = await PostPruefungAsync(betrachter.Client, "AB1234");

        Assert.All(status, s => Assert.Equal(403, s));
        Assert.Equal(HttpStatusCode.OK, danach.StatusCode);
    }

    [Fact]
    public async Task Deaktivierte_erhalten_auch_nach_25_Anfragen_403_statt_429()
    {
        var deaktiviert = await ClientMitRolleAsync("Administrator", aktiv: false);

        var antworten = await Task.WhenAll(Enumerable.Range(0, 25).Select(_ => PostPruefungAsync(deaktiviert, "AB1234")));
        var codes = new List<string?>();
        foreach (var a in antworten)
        {
            codes.Add($"{(int)a.StatusCode} {await CodeAsync(a)}");
            a.Dispose();
        }

        Assert.All(codes, c => Assert.Equal("403 benutzer_deaktiviert", c));
    }

    [Fact]
    public async Task Anfragen_mit_400_verbrauchen_Kontingent()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();
        var ungueltig = await GemischtAsync(pruefer.Client, Grenze, nummer: "AB/1");
        Assert.All(ungueltig, s => Assert.Equal(400, s));

        using var antwort = await PostPruefungAsync(pruefer.Client, "AB1234");

        Assert.Equal(HttpStatusCode.TooManyRequests, antwort.StatusCode);
    }

    [Fact]
    public async Task Andere_Endpunkte_sind_nicht_begrenzt()
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();
        await KontingentVerbrauchenAsync(pruefer.Client);

        var antworten = await Task.WhenAll(Enumerable.Range(0, 25).Select(_ => pruefer.Client.GetAsync(ExemplareUrl(s.CoinA))));
        var status = antworten.Select(a => (int)a.StatusCode).ToArray();
        foreach (var a in antworten)
        {
            a.Dispose();
        }

        Assert.All(status, c => Assert.Equal(200, c));
    }

    [Fact]
    public async Task Schreibende_Ausgabe_Endpunkte_sind_nicht_begrenzt()
    {
        var a = await NeueAusgabeAsync(null, auflage: 40);
        var pruefer = await PrueferAsync();
        await KontingentVerbrauchenAsync(pruefer.Client);

        using var antwort = await PutHologrammAsync(pruefer.Client, a.CoinId, a.AusgabeId, new { hologrammnummer = "RB1234" });

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    // ---------- Fest im Code (H8) ----------

    private static string RepoWurzel()
    {
        var verzeichnis = new DirectoryInfo(AppContext.BaseDirectory);
        while (verzeichnis is not null && !File.Exists(Path.Combine(verzeichnis.FullName, "CLAUDE.md")))
        {
            verzeichnis = verzeichnis.Parent;
        }

        return verzeichnis?.FullName ?? throw new InvalidOperationException("Repository-Wurzel nicht gefunden.");
    }

    private static string Quelle(params string[] pfad) => File.ReadAllText(Path.Combine([RepoWurzel(), .. pfad]));

    [GeneratedRegex(@"\b(IConfiguration|GetSection|IOptions|IOptionsMonitor|GetValue<|Configuration\[|\.Bind\()")]
    private static partial Regex Konfigurationszugriff();

    [Fact]
    public void Ratenbegrenzung_liegt_in_Coin_Api_Http_Ratenbegrenzung_cs()
    {
        Assert.True(File.Exists(Path.Combine(RepoWurzel(), "src", "Coin.Api", "Http", "Ratenbegrenzung.cs")), "src/Coin.Api/Http/Ratenbegrenzung.cs fehlt (Abschnitt 5.6).");
    }

    [Fact]
    public void Ratenbegrenzung_liest_keine_Konfiguration()
    {
        var quelle = Quelle("src", "Coin.Api", "Http", "Ratenbegrenzung.cs");

        Assert.DoesNotMatch(Konfigurationszugriff(), quelle);
    }

    [Fact]
    public void Ratenbegrenzung_partitioniert_nach_sub_und_nie_nach_IP()
    {
        var quelle = Quelle("src", "Coin.Api", "Http", "Ratenbegrenzung.cs");

        Assert.Contains("\"sub\"", quelle, StringComparison.Ordinal);
        Assert.DoesNotContain("RemoteIpAddress", quelle, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("appsettings.json")]
    [InlineData("appsettings.Development.json")]
    public void Konfigurationsdateien_enthalten_keine_Ratenbegrenzung(string datei)
    {
        var pfad = Path.Combine(RepoWurzel(), "src", "Coin.Api", datei);
        var inhalt = File.ReadAllText(pfad);

        Assert.DoesNotMatch(new Regex("RateLimit|Ratenbegrenzung|Pruefung", RegexOptions.IgnoreCase), inhalt);
    }

    [Fact]
    public void UseRateLimiter_steht_nach_UseAuthorization_und_vor_MapControllers()
    {
        var programm = Quelle("src", "Coin.Api", "Program.cs");

        var begrenzung = programm.IndexOf("app.UseRateLimiter()", StringComparison.Ordinal);
        Assert.True(begrenzung >= 0, "app.UseRateLimiter() fehlt in Program.cs.");
        Assert.True(begrenzung > programm.IndexOf("app.UseAuthorization()", StringComparison.Ordinal), "UseRateLimiter muss nach UseAuthorization stehen.");
        Assert.True(begrenzung < programm.IndexOf("app.MapControllers()", StringComparison.Ordinal), "UseRateLimiter muss vor MapControllers stehen.");
    }

    // ---------- Metadaten der Endpunkte ----------

    [GeneratedRegex(@"\{(\w+)(:[^}]*)?\}")]
    private static partial Regex RoutenParameter();

    private IEnumerable<(string Name, RouteEndpoint Endpunkt)> Endpunkte() =>
        Fixture.Factory.Services.GetServices<EndpointDataSource>()
            .SelectMany(q => q.Endpoints)
            .OfType<RouteEndpoint>()
            .SelectMany(e =>
            {
                var methoden = e.Metadata.GetMetadata<Microsoft.AspNetCore.Routing.HttpMethodMetadata>()?.HttpMethods ?? ["*"];
                var muster = "/" + RoutenParameter().Replace(e.RoutePattern.RawText ?? string.Empty, "{$1}").TrimStart('/');
                return methoden.Select(m => ($"{m} {muster}", e));
            });

    [Theory]
    [InlineData("POST /api/pruefung")]
    [InlineData("POST /api/pruefung/mit-empfaenger")]
    public void Pruef_Endpunkt_nutzt_die_Policy_pruefung(string name)
    {
        var endpunkt = Assert.Single(Endpunkte(), e => e.Name == name).Endpunkt;

        Assert.Equal("pruefung", endpunkt.Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName);
    }

    [Fact]
    public void Nur_die_beiden_Pruef_Endpunkte_sind_begrenzt()
    {
        var begrenzt = Endpunkte()
            .Where(e => e.Endpunkt.Metadata.GetMetadata<EnableRateLimitingAttribute>() is not null)
            .Select(e => e.Name)
            .Distinct()
            .Order(StringComparer.Ordinal);

        Assert.Equal(["POST /api/pruefung", "POST /api/pruefung/mit-empfaenger"], begrenzt);
    }
}
