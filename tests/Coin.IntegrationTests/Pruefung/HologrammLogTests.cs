using System.Globalization;
using System.Net.Http.Json;
using Coin.IntegrationTests.Ausgaben;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Pruefung;

/// <summary>
/// Feature hologrammnummer, AK-22 (ADR-0033 Punkt 8, ADR-0034 Punkt 6; Muster <c>AusgabenLogTests</c>,
/// <c>ZertifikatLogTests</c>): Erfassen mit Nummer, Ergänzen, Korrigieren, <c>409 vergeben</c> (auch über den
/// parallelen <c>23505</c>), Prüfungen aller Ergebnisse auf beiden Endpunkten, <c>400</c> und <c>429</c> bringen weder
/// eine Hologrammnummer (Eingabe-, Anzeige- oder Normalform) noch Empfängerdaten noch einen Grund ins Log. Das
/// Request-Protokoll nennt nur Routen-Templates; Request-DTOs geben in <c>ToString</c> keine Werte aus.
/// </summary>
public class HologrammLogTests(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    private const string AnfrageKategorie = "Coin.Api.Http.AnfrageProtokoll";

    private const string Name = "Logwert Empfaenger Hologramm Lw61";
    private const string Dienstgrad = "Logwert Dienstgrad Hologramm Lw62";
    private const string Dienststelle = "Logwert Dienststelle Hologramm Lw63";
    private const string Gelegenheit = "Logwert Gelegenheit Hologramm Lw64";
    private const string Begruendung = "Logwert Begruendung Hologramm Lw65";
    private const string Stelle = "Logwert Stelle Hologramm Lw66";
    private const string Grund = "Logwert Korrekturgrund Hologramm Lw67";
    private const string StornoGrund = "Logwert Stornogrund Hologramm Lw68";

    /// <summary>Alle Hologrammnummern des Szenarios in jeder vorkommenden Schreibweise.</summary>
    private static readonly string[] Nummern =
    [
        "qz 91-77", "QZ 91-77", "QZ9177", "QZ/9177", "qz 55-11", "QZ 55-11", "QZ5511", "QZ5512", "qz 33-44", "QZ 33-44", "QZ3344",
        "QZ 77-88", "QZ7788", "QZ0001", "QZ/1",
    ];

    private static readonly string[] Personendaten = [Name, Dienstgrad, Dienststelle, Gelegenheit, Begruendung, Stelle, Grund, StornoGrund];

    private sealed record Szenario(SammelLoggerProvider Logs, IReadOnlyList<string> Requests);

    private static Dictionary<string, object?> Body(string? nummer, int? exemplar = null)
    {
        var body = GueltigeAusgabe(exemplar, Name, Dienstgrad, Dienststelle, Datum, Gelegenheit, Begruendung, Stelle);
        body["hologrammnummer"] = nummer;
        return body;
    }

    private static string HologrammUrl(Guid coinId, Guid ausgabeId) => $"{AusgabenUrl(coinId)}/{ausgabeId}/hologrammnummer";

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
        var requests = new List<string>();

        async Task<HttpResponseMessage> MerkeAsync(string name, Task<HttpResponseMessage> anfrage)
        {
            var antwort = await anfrage;
            requests.Add($"{name} -> {(int)antwort.StatusCode}");
            return antwort;
        }

        async Task<Guid> CoinAsync(string name)
        {
            using var coin = await admin.PostAsJsonAsync(CoinsUrl, GueltigerCoin(name, auflage: 10));
            return (await JsonAsync(coin)).GetProperty("id").GetGuid();
        }

        var coinA = await CoinAsync("Coin Hologramm Log A");
        var coinB = await CoinAsync("Coin Hologramm Log B");

        using var erfasst = await MerkeAsync("Erfassen", admin.PostAsJsonAsync(AusgabenUrl(coinA), Body("qz 91-77", 1)));
        using (await MerkeAsync("Erfassen 409", admin.PostAsJsonAsync(AusgabenUrl(coinB), Body("QZ9177"))))
        using (await MerkeAsync("Erfassen 400", admin.PostAsJsonAsync(AusgabenUrl(coinB), Body("QZ/9177"))))
        {
        }

        using var ohneNummer = await MerkeAsync("Erfassen ohne Nummer", admin.PostAsJsonAsync(AusgabenUrl(coinB), Body(null)));
        var y = (await JsonAsync(ohneNummer)).GetProperty("id").GetGuid();
        using (await MerkeAsync("Ergaenzen", admin.PutAsJsonAsync(HologrammUrl(coinB, y), new { hologrammnummer = "qz 55-11" })))
        using (await MerkeAsync("Korrigieren", admin.PutAsJsonAsync(HologrammUrl(coinB, y), new { hologrammnummer = "QZ5512", grund = Grund, bisherige = "QZ 55-11" })))
        using (await MerkeAsync("Korrigieren 409", admin.PutAsJsonAsync(HologrammUrl(coinB, y), new { hologrammnummer = "QZ9177", grund = Grund, bisherige = "QZ5512" })))
        using (await MerkeAsync("Korrigieren 400", admin.PutAsJsonAsync(HologrammUrl(coinB, y), new { hologrammnummer = "QZ/1", grund = Grund, bisherige = "QZ5512" })))
        {
        }

        // Paralleler 23505 über zwei Coins (AK-9): einer gewinnt, der andere erhält 409.
        var parallel = await Task.WhenAll(
            admin.PostAsJsonAsync(AusgabenUrl(coinA), Body("qz 33-44")),
            admin.PostAsJsonAsync(AusgabenUrl(coinB), Body("QZ3344")));
        requests.Add($"Parallel -> {string.Join(",", parallel.Select(p => (int)p.StatusCode).Order())}");
        foreach (var p in parallel)
        {
            p.Dispose();
        }

        using var storno = await MerkeAsync("Erfassen fuer Storno", admin.PostAsJsonAsync(AusgabenUrl(coinA), Body("QZ 77-88")));
        var z = (await JsonAsync(storno)).GetProperty("id").GetGuid();
        using (await MerkeAsync("Storno", admin.PostAsJsonAsync($"{AusgabenUrl(coinA)}/{z}/storno", new { grund = StornoGrund })))
        {
        }

        // Prüfungen aller Ergebnisse auf beiden Endpunkten, 400 und schließlich 429 (eigene API-Instanz, eigener Zähler).
        var pruefungen = 0;
        foreach (var mitEmpfaenger in new[] { false, true })
        {
            var url = mitEmpfaenger ? "/api/pruefung/mit-empfaenger" : "/api/pruefung";
            var zusatz = mitEmpfaenger ? " mit Empfaenger" : string.Empty;
            using (await MerkeAsync($"Pruefung gueltig{zusatz}", admin.PostAsJsonAsync(url, new { hologrammnummer = "qz 91-77", coinId = coinA })))
            using (await MerkeAsync($"Pruefung storniert{zusatz}", admin.PostAsJsonAsync(url, new { hologrammnummer = "QZ7788" })))
            using (await MerkeAsync($"Pruefung falscherCoin{zusatz}", admin.PostAsJsonAsync(url, new { hologrammnummer = "QZ9177", coinId = coinB })))
            using (await MerkeAsync($"Pruefung nichtGefunden{zusatz}", admin.PostAsJsonAsync(url, new { hologrammnummer = "QZ0001" })))
            {
            }

            pruefungen += 4;
        }

        using (await MerkeAsync("Pruefung 400", admin.PostAsJsonAsync("/api/pruefung", new { hologrammnummer = "QZ/1" })))
        {
        }

        pruefungen++;
        var auffuellen = await Task.WhenAll(Enumerable.Range(0, 20 - pruefungen)
            .Select(_ => admin.PostAsJsonAsync("/api/pruefung", new { hologrammnummer = "QZ0001" })));
        requests.Add($"Auffuellen -> {string.Join(",", auffuellen.Select(p => ((int)p.StatusCode).ToString(CultureInfo.InvariantCulture)).Distinct())}");
        foreach (var p in auffuellen)
        {
            p.Dispose();
        }

        using (await MerkeAsync("Pruefung 429", admin.PostAsJsonAsync("/api/pruefung", new { hologrammnummer = "QZ9177" })))
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
                "Erfassen -> 201", "Erfassen 409 -> 409", "Erfassen 400 -> 400", "Erfassen ohne Nummer -> 201", "Ergaenzen -> 200",
                "Korrigieren -> 200", "Korrigieren 409 -> 409", "Korrigieren 400 -> 400", "Parallel -> 201,409",
                "Erfassen fuer Storno -> 201", "Storno -> 200",
                "Pruefung gueltig -> 200", "Pruefung storniert -> 200", "Pruefung falscherCoin -> 200", "Pruefung nichtGefunden -> 200",
                "Pruefung gueltig mit Empfaenger -> 200", "Pruefung storniert mit Empfaenger -> 200",
                "Pruefung falscherCoin mit Empfaenger -> 200", "Pruefung nichtGefunden mit Empfaenger -> 200",
                "Pruefung 400 -> 400", "Auffuellen -> 200", "Pruefung 429 -> 429",
            ],
            szenario.Requests);
    }

    [Fact]
    public async Task Logs_werden_tatsaechlich_abgefangen()
    {
        var szenario = await SzenarioAsync();

        Assert.NotEmpty(szenario.Logs.Eintraege);
    }

    public static TheoryData<string> NummernDaten => [.. Nummern];

    [Theory]
    [MemberData(nameof(NummernDaten))]
    public async Task Logs_enthalten_die_Hologrammnummer_nicht(string nummer)
    {
        var szenario = await SzenarioAsync();

        Assert.DoesNotContain(nummer, szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    public static TheoryData<string> PersonendatenDaten => [.. Personendaten];

    [Theory]
    [MemberData(nameof(PersonendatenDaten))]
    public async Task Logs_enthalten_weder_Empfaengerdaten_noch_Gruende(string wert)
    {
        var szenario = await SzenarioAsync();

        Assert.DoesNotContain(wert, szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Request_DTOs_geben_in_ToString_keine_Werte_aus()
    {
        // MVC protokolliert Aktionsargumente auf Trace; ohne überschriebenes ToString() stünden die Werte im Log.
        var szenario = await SzenarioAsync();

        Assert.All(
            ["Hologrammnummer =", "Bisherige =", "Grund =", "CoinId ="],
            muster => Assert.DoesNotContain(muster, szenario.Logs.Gesamt, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Request_Protokoll_nennt_fuer_Ergaenzen_und_Pruefung_nur_Routen_Templates()
    {
        var szenario = await SzenarioAsync();

        var routen = szenario.Logs.Strukturiert
            .Where(e => e.Kategorie == AnfrageKategorie)
            .Select(e => Convert.ToString(e.Werte.GetValueOrDefault("Route"), CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);

        Assert.Superset(
            new HashSet<string?>(["/api/coins/{id}/ausgaben/{ausgabeId}/hologrammnummer", "/api/pruefung", "/api/pruefung/mit-empfaenger"]),
            routen);
    }

    [Fact]
    public async Task Request_Protokoll_vermerkt_die_429_der_Pruefung()
    {
        var szenario = await SzenarioAsync();

        Assert.Contains(szenario.Logs.Strukturiert, e => e.Kategorie == AnfrageKategorie
            && Convert.ToString(e.Werte.GetValueOrDefault("Route"), CultureInfo.InvariantCulture) == "/api/pruefung"
            && Convert.ToString(e.Werte.GetValueOrDefault("Status"), CultureInfo.InvariantCulture) == "429");
    }

    [Fact]
    public async Task Keine_Warnung_mit_Benutzerbezug_zur_Ratenbegrenzung()
    {
        var szenario = await SzenarioAsync();

        Assert.DoesNotContain(szenario.Logs.Strukturiert, e => e.Level >= Microsoft.Extensions.Logging.LogLevel.Warning
            && (e.Text.Contains("sub-bootstrap-admin", StringComparison.Ordinal) || e.Text.Contains(Testbenutzer.AdminEmail, StringComparison.OrdinalIgnoreCase)));
    }
}
