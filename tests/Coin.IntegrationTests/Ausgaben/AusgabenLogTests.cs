using System.Globalization;
using System.Net.Http.Json;
using System.Text;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Ausgaben;

/// <summary>
/// Feature coin-ausgaben, AK-19 (Muster <c>LogTests</c>, ADR-0019): Erfassen, Stornieren und Lesen mit eindeutigen
/// Testwerten – auch mit Validierungsfehlern und <c>409</c> – bringen weder Empfängerdaten noch Gelegenheit, Begründung,
/// ausgebende Stelle oder Storno-Grund ins Log. Das Request-Protokoll nennt nur Routen-Templates.
/// </summary>
public class AusgabenLogTests(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    private const string AnfrageKategorie = "Coin.Api.Http.AnfrageProtokoll";

    private const string Name = "Logwert Empfaengername Qz81";
    private const string Dienstgrad = "Logwert Dienstgrad Qz82";
    private const string Dienststelle = "Logwert Dienststelle Qz83";
    private const string Gelegenheit = "Logwert Gelegenheit Qz84";
    private const string Begruendung = "Logwert Begruendung Qz85";
    private const string Stelle = "Logwert Stelle Qz86";
    private const string Grund = "Logwert Stornogrund Qz87";

    private static readonly string[] Testwerte = [Name, Dienstgrad, Dienststelle, Gelegenheit, Begruendung, Stelle, Grund];

    private sealed record Szenario(SammelLoggerProvider Logs, IReadOnlyList<string> Requests);

    private static object Body(int? nummer = null, string datum = Datum, string name = Name) =>
        GueltigeAusgabe(nummer, name, Dienstgrad, Dienststelle, datum, Gelegenheit, Begruendung, Stelle);

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

        using var coin = await admin.PostAsJsonAsync(CoinsUrl, GueltigerCoin("Coin Logpruefung", auflage: 3));
        var coinId = (await JsonAsync(coin)).GetProperty("id").GetGuid();

        using var erfasst = await MerkeAsync("Erfassen", admin.PostAsJsonAsync(AusgabenUrl(coinId), Body(1)));
        var ausgabeId = (await JsonAsync(erfasst)).GetProperty("id").GetGuid();
        using (await MerkeAsync("Erfassen 400", admin.PostAsJsonAsync(AusgabenUrl(coinId), Body(datum: "2999-01-01"))))
        using (await MerkeAsync("Erfassen 400 Nummer", admin.PostAsJsonAsync(AusgabenUrl(coinId), Body(99))))
        using (await MerkeAsync("Erfassen 409", admin.PostAsJsonAsync(AusgabenUrl(coinId), Body(1))))
        using (await MerkeAsync("Erfassen kaputt", admin.PostAsync(
            AusgabenUrl(coinId), new StringContent($"{{\"empfaengerName\":\"{Name}\",", Encoding.UTF8, "application/json"))))
        using (await MerkeAsync("Erfassen anonym", anonym.PostAsJsonAsync(AusgabenUrl(coinId), Body())))
        using (await MerkeAsync("Storno 400", admin.PostAsJsonAsync(StornoUrl(coinId, ausgabeId), new { grund = Grund + new string('x', 500) })))
        using (await MerkeAsync("Storno", admin.PostAsJsonAsync(StornoUrl(coinId, ausgabeId), new { grund = Grund })))
        using (await MerkeAsync("Storno 409", admin.PostAsJsonAsync(StornoUrl(coinId, ausgabeId), new { grund = Grund })))
        using (await MerkeAsync("Historie", admin.GetAsync(AusgabenUrl(coinId))))
        using (await MerkeAsync("Exemplare", admin.GetAsync(ExemplareUrl(coinId))))
        using (await MerkeAsync("Auflage", admin.PutAsJsonAsync(AuflageUrl(coinId), new { auflage = 4 })))
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
                "Erfassen -> 201", "Erfassen 400 -> 400", "Erfassen 400 Nummer -> 400", "Erfassen 409 -> 409",
                "Erfassen kaputt -> 400", "Erfassen anonym -> 401", "Storno 400 -> 400", "Storno -> 200",
                "Storno 409 -> 409", "Historie -> 200", "Exemplare -> 200", "Auflage -> 200",
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

        Assert.DoesNotContain("Qz8", szenario.Logs.Gesamt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Request_Protokoll_nennt_fuer_Erfassen_das_Routen_Template()
    {
        var szenario = await SzenarioAsync();

        var routen = szenario.Logs.Strukturiert
            .Where(e => e.Kategorie == AnfrageKategorie && Convert.ToString(e.Werte.GetValueOrDefault("Methode"), CultureInfo.InvariantCulture) == "POST")
            .Select(e => Convert.ToString(e.Werte.GetValueOrDefault("Route"), CultureInfo.InvariantCulture))
            .Distinct()
            .Order(StringComparer.Ordinal);

        Assert.Equal(
            ["/api/coins", "/api/coins/{id}/ausgaben", "/api/coins/{id}/ausgaben/{ausgabeId}/storno"],
            routen);
    }

    [Fact]
    public async Task Request_Protokoll_nennt_fuer_Historie_Exemplare_und_Auflage_das_Routen_Template()
    {
        var szenario = await SzenarioAsync();

        var routen = szenario.Logs.Strukturiert
            .Where(e => e.Kategorie == AnfrageKategorie)
            .Select(e => Convert.ToString(e.Werte.GetValueOrDefault("Route"), CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);

        Assert.Superset(
            new HashSet<string?>(["/api/coins/{id}/exemplare", "/api/coins/{id}/auflage", "/api/coins/{id}/ausgaben"]),
            routen);
    }

    [Fact]
    public async Task Request_DTOs_geben_in_ToString_keine_Werte_aus()
    {
        // MVC protokolliert Aktionsargumente auf Trace; ohne überschriebenes ToString() stünden die Werte im Log.
        var szenario = await SzenarioAsync();

        Assert.DoesNotContain("EmpfaengerName =", szenario.Logs.Gesamt, StringComparison.Ordinal);
        Assert.DoesNotContain("Grund =", szenario.Logs.Gesamt, StringComparison.Ordinal);
    }
}
