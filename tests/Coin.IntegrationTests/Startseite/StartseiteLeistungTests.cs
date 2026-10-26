using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Coin.IntegrationTests.Infrastruktur;
using Coin.Testdaten;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-6 (Abschnitt 6): <c>GET /api/startseite</c> führt höchstens 4 SQL-Befehle aus,
/// <c>GET /api/startseite/kopf</c> genau 1 – unabhängig von der Datenmenge. Kein Befehl liest <c>exemplar</c> oder die
/// Spalten mit Empfänger- und Ausgabedaten. Mit Auflage 1.000.000 und 1.000 Ausgaben antwortet die Startseite in unter 1 s.
/// Gezählt wird über die ActivitySource „Npgsql“ (<see cref="SqlBefehlsZaehler"/>); der Benutzerabgleich der Anmeldung
/// (nur Tabelle <c>benutzer</c>) zählt bei der Startseite nicht mit.
/// </summary>
public partial class StartseiteLeistungTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    [GeneratedRegex(@"\bexemplar\b", RegexOptions.IgnoreCase)]
    private static partial Regex TabelleExemplar();

    [GeneratedRegex(@"empfaenger_|\bgelegenheit\b|\bbegruendung\b|\bausgebende_stelle\b|\bstorno_grund\b", RegexOptions.IgnoreCase)]
    private static partial Regex Personenspalten();

    private async Task MitDatenAsync()
    {
        for (var i = 1; i <= 15; i++)
        {
            var id = (await LegeCoinAnAsync($"Coin Last {i:D2}", auflage: 20)).GetProperty("id").GetGuid();
            if (i % 2 == 0)
            {
                await LadeBildHochAsync(id, Testbilder.Png());
            }

            for (var n = 0; n < i % 4; n++)
            {
                using var antwort = await Client.PostAsJsonAsync($"{CoinsUrl}/{id}/ausgaben", new Dictionary<string, object?>
                {
                    ["exemplarNummer"] = null,
                    ["empfaengerName"] = "Test Last",
                    ["datum"] = "2026-10-01",
                    ["gelegenheit"] = "Testgelegenheit",
                    ["begruendung"] = "Testbegründung",
                    ["ausgebendeStelle"] = "Teststelle",
                });
                Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
            }
        }

        await SpeichernAsync(MitKopf(alttextBereitsteller: "Wappen"), new LogoTeil("logoBereitsteller", LogoBilder.Png(10, 10)));
    }

    private static async Task<IReadOnlyList<string>> BefehleAsync(HttpClient client, string url, bool ohneBenutzerabgleich)
    {
        using (await client.GetAsync(url))
        {
        }

        using var zaehler = new SqlBefehlsZaehler();
        using var antwort = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        return ohneBenutzerabgleich ? zaehler.OhneBenutzerabgleich : zaehler.Befehle;
    }

    [Fact]
    public async Task Kontrolle_der_Zaehlung_GET_api_coins_zaehlt_Befehle()
    {
        await LegeCoinAnAsync("Coin Zaehlkontrolle");

        var befehle = await BefehleAsync(Anonym, CoinsUrl, ohneBenutzerabgleich: false);

        Assert.NotEmpty(befehle);
    }

    [Fact]
    public async Task Get_startseite_fuehrt_hoechstens_4_SQL_Befehle_aus()
    {
        await MitDatenAsync();

        var befehle = await BefehleAsync(await BetrachterAsync(), StartseiteUrl, ohneBenutzerabgleich: true);

        Assert.True(befehle.Count <= 4, $"{befehle.Count} Befehle:\n{string.Join("\n---\n", befehle)}");
    }

    [Fact]
    public async Task Get_startseite_fuehrt_ohne_Daten_ebenso_hoechstens_4_SQL_Befehle_aus()
    {
        var befehle = await BefehleAsync(await BetrachterAsync(), StartseiteUrl, ohneBenutzerabgleich: true);

        Assert.True(befehle.Count <= 4, $"{befehle.Count} Befehle:\n{string.Join("\n---\n", befehle)}");
    }

    [Fact]
    public async Task Get_kopf_fuehrt_genau_1_SQL_Befehl_aus()
    {
        await MitDatenAsync();

        var befehle = await BefehleAsync(Anonym, KopfUrl, ohneBenutzerabgleich: false);

        Assert.True(befehle.Count == 1, $"{befehle.Count} Befehle:\n{string.Join("\n---\n", befehle)}");
    }

    [Fact]
    public async Task Get_kopf_fuehrt_auch_ohne_Konfiguration_genau_1_SQL_Befehl_aus()
    {
        var befehle = await BefehleAsync(Anonym, KopfUrl, ohneBenutzerabgleich: false);

        Assert.True(befehle.Count == 1, $"{befehle.Count} Befehle:\n{string.Join("\n---\n", befehle)}");
    }

    [Fact]
    public async Task Kein_Befehl_der_Startseite_liest_die_Tabelle_exemplar()
    {
        await MitDatenAsync();

        var befehle = await BefehleAsync(await BetrachterAsync(), StartseiteUrl, ohneBenutzerabgleich: true);

        Assert.DoesNotContain(befehle, b => TabelleExemplar().IsMatch(b));
    }

    [Fact]
    public async Task Kein_Befehl_der_Startseite_liest_Empfaenger_oder_Ausgabeangaben()
    {
        await MitDatenAsync();

        var befehle = await BefehleAsync(await BetrachterAsync(), StartseiteUrl, ohneBenutzerabgleich: true);

        Assert.DoesNotContain(befehle, b => Personenspalten().IsMatch(b));
    }

    [Fact]
    public async Task Kein_Befehl_der_Startseite_liest_Bild_oder_Logo_Bytes()
    {
        await MitDatenAsync();

        var befehle = await BefehleAsync(await BetrachterAsync(), StartseiteUrl, ohneBenutzerabgleich: true);

        Assert.DoesNotContain(befehle, b => Regex.IsMatch(b, @"\binhalt\b", RegexOptions.IgnoreCase));
    }

    [Fact]
    public async Task Kein_Befehl_des_Kopfs_liest_Logo_Bytes()
    {
        await MitDatenAsync();

        var befehle = await BefehleAsync(Anonym, KopfUrl, ohneBenutzerabgleich: false);

        Assert.DoesNotContain(befehle, b => Regex.IsMatch(b, @"\binhalt\b", RegexOptions.IgnoreCase));
    }

    [Fact]
    [Trait("Kategorie", "Langsam")]
    public async Task Get_startseite_antwortet_bei_Auflage_1000000_und_1000_Ausgaben_in_unter_1_s()
    {
        using var langsam = Fixture.Factory.CreateClient();
        langsam.Timeout = TimeSpan.FromMinutes(5);
        using var anlegen = await langsam.PostAsJsonAsync(CoinsUrl, GueltigerCoin("Coin Million", auflage: 1_000_000));
        Assert.True(anlegen.StatusCode == HttpStatusCode.Created, $"Anlegen: {(int)anlegen.StatusCode}");
        var coinId = (await JsonAsync(anlegen)).GetProperty("id").GetGuid();
        Assert.Null(await StartseiteDb.AusgabenEinfuegenAsync(coinId, 1000, await AdminIdAsync()));
        var betrachter = await BetrachterAsync();
        using (await betrachter.GetAsync(StartseiteUrl))
        {
        }

        var uhr = Stopwatch.StartNew();
        using var antwort = await betrachter.GetAsync(StartseiteUrl);
        uhr.Stop();

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.True(uhr.Elapsed < TimeSpan.FromSeconds(1), $"Dauer {uhr.Elapsed.TotalMilliseconds:F0} ms");
        var kennzahlen = Block(await JsonAsync(antwort), "kennzahlen");
        Assert.Equal((1_000_000, 1000), (kennzahlen.GetProperty("exemplare").GetInt32(), kennzahlen.GetProperty("ausgegeben").GetInt32()));
    }
}
