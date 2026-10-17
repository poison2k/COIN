using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.Extensions.Logging;

namespace Coin.IntegrationTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-17 und AK-21 (Muster <c>LogTests</c>, ADR-0019, ADR-0028 Punkt 9): Download mit
/// eindeutigen Werten in allen Feldern, Download einer stornierten Ausgabe und Lesen der Ausgabe bringen weder Werte der
/// Ausgabe noch Coin-Daten, Zertifikatsnummer oder Dateiinhalte ins Log; das Request-Protokoll nennt nur Routen-Templates.
/// Wirft der Erzeuger (Testersatz), antwortet die API mit <c>500 zertifikat_fehler</c>, schreibt kein Audit und genau
/// eine Warnung <c>ZertifikatErzeugungFehlgeschlagen</c> mit fester Meldung, ohne Ausnahmetext und Stacktrace.
/// </summary>
public partial class ZertifikatLogTests(PostgresFixture fixture) : ZertifikatTestBasis(fixture)
{
    private const string AnfrageKategorie = "Coin.Api.Http.AnfrageProtokoll";

    private const string WarnungName = "ZertifikatErzeugungFehlgeschlagen";

    private const string CoinName = "Logcoin Qy91";
    private const string Herausgeber = "Logherausgeber Qy92";
    private const string Beschreibung = "Logbeschreibung Qy93";
    private const string Name = "Logwert Empfaenger Qy94";
    private const string Dienstgrad = "Logwert Dienstgrad Qy95";
    private const string Dienststelle = "Logwert Dienststelle Qy96";
    private const string Gelegenheit = "Logwert Gelegenheit Qy97";
    private const string Begruendung = "Logwert Begruendung Qy98";
    private const string Stelle = "Logwert Stelle Qy99";
    private const string Vorlagentext = "Logvorlage Qy9a";
    private const string Ausnahmetext = "Geheimer Ausnahmetext Qy9b";

    private static readonly string[] Testwerte = [CoinName, Herausgeber, Beschreibung, Name, Dienstgrad, Dienststelle, Gelegenheit, Begruendung, Stelle, Vorlagentext];

    [GeneratedRegex(@"C[0-9]{4,}-[0-9]{4,}")]
    private static partial Regex Nummer();

    private sealed record Szenario(SammelLoggerProvider Logs, IReadOnlyList<string> Requests, string ZertifikatsNummer, long Audit);

    private static FactoryOptionen Optionen(SammelLoggerProvider logs, bool erzeugerWirft) => new()
    {
        Logger = logs,
        Einstellungen = new Dictionary<string, string?>
        {
            ["Logging:LogLevel:Default"] = "Trace",
            ["Logging:LogLevel:Microsoft"] = "Trace",
            ["Logging:LogLevel:Microsoft.AspNetCore"] = "Trace",
        },
        Dienste = erzeugerWirft ? dienste => ZertifikatErzeugerErsatz.Werfend(dienste, () => new InvalidOperationException(Ausnahmetext)) : null,
    };

    /// <summary>Coin, eigene Vorlage, zwei Ausgaben (eine storniert); Downloads und Lesen; alles mit eindeutigen Werten.</summary>
    private async Task<Szenario> SzenarioAsync(bool erzeugerWirft = false)
    {
        var logs = new SammelLoggerProvider();
        await using var factory = Fixture.NeueFactory(Optionen(logs, erzeugerWirft));
        using var admin = factory.CreateClient();
        var requests = new List<string>();

        async Task<HttpResponseMessage> MerkeAsync(string name, Task<HttpResponseMessage> anfrage)
        {
            var antwort = await anfrage;
            requests.Add($"{name} -> {(int)antwort.StatusCode}");
            return antwort;
        }

        using var coin = await admin.PostAsJsonAsync(CoinsUrl, GueltigerCoin(CoinName, Herausgeber, 5, Beschreibung));
        var coinId = (await JsonAsync(coin)).GetProperty("id").GetGuid();
        using (var upload = await PostVersionAsync(admin, coinId, Zertifikatvorlagen.MitAbsaetzen(
            DocxBauer.Text(Vorlagentext), DocxBauer.Text(string.Join(" ", Zertifikatvorlagen.Namen.Select(n => $"{{{{{n}}}}}")))).Bytes()))
        {
            Assert.Equal(HttpStatusCode.Created, upload.StatusCode);
        }

        var body = GueltigeAusgabe(1, Name, Dienstgrad, Dienststelle, Datum, Gelegenheit, Begruendung, Stelle);
        using var erste = await admin.PostAsJsonAsync(AusgabenUrl(coinId), body);
        var ersteJson = await JsonAsync(erste);
        var aktiv = ersteJson.GetProperty("id").GetGuid();
        body["exemplarNummer"] = 2;
        using var zweite = await admin.PostAsJsonAsync(AusgabenUrl(coinId), body);
        var storniert = (await JsonAsync(zweite)).GetProperty("id").GetGuid();
        using (await admin.PostAsJsonAsync($"{AusgabenUrl(coinId)}/{storniert}/storno", new { grund = "Logtest Storno" }))
        using (await MerkeAsync("Download", admin.GetAsync(ZertifikatUrl(coinId, aktiv))))
        using (await MerkeAsync("Download storniert", admin.GetAsync(ZertifikatUrl(coinId, storniert))))
        using (await MerkeAsync("Download unbekannt", admin.GetAsync(ZertifikatUrl(coinId, Guid.NewGuid()))))
        using (await MerkeAsync("Ausgabe", admin.GetAsync(AusgabeUrl(coinId, aktiv))))
        {
        }

        Assert.True(ersteJson.TryGetProperty("zertifikatsnummer", out var nummer), "Antwort ohne zertifikatsnummer (AK-3).");
        return new Szenario(logs, requests, nummer.GetString()!, await ZertifikatDb.AnzahlAsync());
    }

    private static List<LogEintrag> AnwendungsWarnungen(SammelLoggerProvider logs) =>
        logs.Strukturiert.Where(e => e.Level >= LogLevel.Warning && e.Kategorie.StartsWith("Coin", StringComparison.Ordinal)).ToList();

    [Fact]
    public async Task Szenario_ruft_die_Endpunkte_mit_den_erwarteten_Status_auf()
    {
        var szenario = await SzenarioAsync();

        Assert.Equal(["Download -> 200", "Download storniert -> 409", "Download unbekannt -> 404", "Ausgabe -> 200"], szenario.Requests);
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

        Assert.DoesNotContain("Qy9", szenario.Logs.Gesamt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Logs_enthalten_keine_Zertifikatsnummer()
    {
        var szenario = await SzenarioAsync();

        Assert.DoesNotContain(szenario.ZertifikatsNummer, szenario.Logs.Gesamt, StringComparison.Ordinal);
        Assert.DoesNotMatch(Nummer(), szenario.Logs.Gesamt);
    }

    [Fact]
    public async Task Logs_enthalten_keine_Dateiinhalte()
    {
        var szenario = await SzenarioAsync();

        Assert.DoesNotContain("word/document.xml", szenario.Logs.Gesamt, StringComparison.Ordinal);
        Assert.DoesNotContain("PK\u0003\u0004", szenario.Logs.Gesamt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Request_Protokoll_nennt_fuer_Download_und_Ausgabe_die_Routen_Templates()
    {
        var szenario = await SzenarioAsync();

        var routen = szenario.Logs.Strukturiert
            .Where(e => e.Kategorie == AnfrageKategorie && Convert.ToString(e.Werte.GetValueOrDefault("Methode"), CultureInfo.InvariantCulture) == "GET")
            .Select(e => Convert.ToString(e.Werte.GetValueOrDefault("Route"), CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);

        Assert.Superset(
            new HashSet<string?>(["/api/coins/{id}/ausgaben/{ausgabeId}/zertifikat", "/api/coins/{id}/ausgaben/{ausgabeId}"]),
            routen);
    }

    [Fact]
    public async Task Ohne_Fehler_gibt_es_keine_Warnung_ZertifikatErzeugungFehlgeschlagen()
    {
        var szenario = await SzenarioAsync();

        Assert.DoesNotContain(szenario.Logs.Strukturiert, e => e.EventId.Name == WarnungName);
    }

    // ---------- AK-17: Erzeuger wirft ----------

    [Fact]
    public async Task Werfender_Erzeuger_liefert_500_zertifikat_fehler()
    {
        var logs = new SammelLoggerProvider();
        var k = await AusgabeAsync();
        await using var factory = Fixture.NeueFactory(Optionen(logs, erzeugerWirft: true));
        using var client = factory.CreateClient();

        using var antwort = await client.GetAsync(ZertifikatUrl(k.CoinId, k.AusgabeId));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.InternalServerError);
        Assert.Equal((KonfliktTitel, "zertifikat_fehler", DetailFehler),
            (json.GetProperty("title").GetString(), json.GetProperty("code").GetString(), json.GetProperty("detail").GetString()));
    }

    [Fact]
    public async Task Werfender_Erzeuger_schreibt_kein_Audit()
    {
        var szenario = await SzenarioAsync(erzeugerWirft: true);

        Assert.Equal(0L, szenario.Audit);
    }

    [Fact]
    public async Task Werfender_Erzeuger_schreibt_genau_eine_Warnung_mit_fester_EventId_und_Meldung()
    {
        var szenario = await SzenarioAsync(erzeugerWirft: true);

        var warnung = Assert.Single(AnwendungsWarnungen(szenario.Logs));
        Assert.Equal((LogLevel.Warning, WarnungName), (warnung.Level, warnung.EventId.Name));
        Assert.NotEqual(0, warnung.EventId.Id);
        Assert.Equal(warnung.Nachricht, szenario.Logs.Strukturiert.First(e => e.EventId.Name == WarnungName).Nachricht);
    }

    [Fact]
    public async Task Warnung_hat_keine_Parameter()
    {
        var szenario = await SzenarioAsync(erzeugerWirft: true);

        var warnung = Assert.Single(szenario.Logs.Strukturiert, e => e.EventId.Name == WarnungName);
        Assert.All(warnung.Werte.Keys, k => Assert.Equal("{OriginalFormat}", k));
    }

    [Fact]
    public async Task Werfender_Erzeuger_bringt_weder_Ausnahmetext_noch_Stacktrace_ins_Log()
    {
        var szenario = await SzenarioAsync(erzeugerWirft: true);

        Assert.DoesNotContain(Ausnahmetext, szenario.Logs.Gesamt, StringComparison.Ordinal);
        Assert.DoesNotContain("InvalidOperationException", szenario.Logs.Gesamt, StringComparison.Ordinal);
        Assert.DoesNotContain("   at ", szenario.Logs.Gesamt, StringComparison.Ordinal);
    }

    [Theory]
    [MemberData(nameof(Werte))]
    public async Task Werfender_Erzeuger_bringt_den_Testwert_nicht_ins_Log(string wert)
    {
        var szenario = await SzenarioAsync(erzeugerWirft: true);

        Assert.DoesNotContain(wert, szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Werfender_Erzeuger_liefert_im_Szenario_500()
    {
        var szenario = await SzenarioAsync(erzeugerWirft: true);

        Assert.Contains("Download -> 500", szenario.Requests);
    }
}
