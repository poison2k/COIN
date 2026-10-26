using System.Net;
using System.Net.Http.Json;
using Coin.IntegrationTests.Infrastruktur;
using Coin.Testdaten;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-17 (Rev. 2): Keine Empfänger- oder Personendaten in Startseiten-Antworten. Ausgaben tragen
/// eindeutige Testwerte in allen schutzbedürftigen Feldern; alle fünf Blöcke sind aktiv. Keine Antwort enthält einen
/// dieser Werte oder den Namen eines Erfassers, Stornierers, Hochladenden oder Speichernden – Ausnahme: <c>geaendertVon</c>
/// in der Konfiguration für Administratoren (S11). Geprüft für Betrachter, Administrator und anonym.
/// </summary>
public class StartseiteDatenschutzTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    private const string Empfaenger = "Empfaenger-Geheim-5531";
    private const string Dienstgrad = "Dienstgrad-Geheim-5531";
    private const string Dienststelle = "Dienststelle-Geheim-5531";
    private const string Gelegenheit = "Gelegenheit-Geheim-5531";
    private const string Begruendung = "Begruendung-Geheim-5531";
    private const string Stelle = "Stelle-Geheim-5531";
    private const string StornoGrund = "Stornogrund-Geheim-5531";
    private const string ErfasserName = "Erfasser Geheim 5531";
    private const string ErfasserEmail = "erfasser.geheim.5531@coin-test.invalid";

    private static readonly string[] Geheim =
        [Empfaenger, Dienstgrad, Dienststelle, Gelegenheit, Begruendung, Stelle, StornoGrund, ErfasserName, ErfasserEmail];

    /// <summary>
    /// Zwei Coins mit Ausgaben (eine davon storniert) durch einen Sachbearbeiter mit eindeutigem Namen; alle Blöcke aktiv,
    /// Logos vom Bootstrap-Administrator gespeichert.
    /// </summary>
    private async Task<HttpClient> AufbauAsync()
    {
        var erfasser = await KontoAsync("Sachbearbeiter", name: ErfasserName, email: ErfasserEmail);
        for (var c = 0; c < 2; c++)
        {
            var coin = await LegeCoinAnAsync($"Coin Datenschutz {c}", auflage: 10);
            var coinId = coin.GetProperty("id").GetGuid();
            for (var n = 0; n < 2; n++)
            {
                using var antwort = await erfasser.Client.PostAsJsonAsync($"{CoinsUrl}/{coinId}/ausgaben", new Dictionary<string, object?>
                {
                    ["exemplarNummer"] = null,
                    ["empfaengerName"] = Empfaenger,
                    ["empfaengerDienstgrad"] = Dienstgrad,
                    ["empfaengerDienststelle"] = Dienststelle,
                    ["datum"] = "2026-10-01",
                    ["gelegenheit"] = Gelegenheit,
                    ["begruendung"] = Begruendung,
                    ["ausgebendeStelle"] = Stelle,
                });
                Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
                if (n == 1)
                {
                    var ausgabeId = (await JsonAsync(antwort)).GetProperty("id").GetGuid();
                    using var storno = await erfasser.Client.PostAsJsonAsync($"{CoinsUrl}/{coinId}/ausgaben/{ausgabeId}/storno", new { grund = StornoGrund });
                    Assert.Equal(HttpStatusCode.OK, storno.StatusCode);
                }
            }
        }

        await SpeichernAsync(
            MitKopf(alttextBereitsteller: "Wappen", alttextSoftware: "Software"),
            new LogoTeil("logoBereitsteller", LogoBilder.Png(10, 10)),
            new LogoTeil("logoSoftware", LogoBilder.Jpeg(10, 10)));
        return erfasser.Client;
    }

    private static void AssertOhnePersonendaten(string text, params string[] zusaetzlich)
    {
        foreach (var wert in Geheim.Concat(zusaetzlich))
        {
            Assert.DoesNotContain(wert, text, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task Get_startseite_als_Betrachter_enthaelt_keine_Empfaenger_oder_Personendaten()
    {
        await AufbauAsync();
        var betrachter = await BetrachterAsync();

        using var antwort = await betrachter.GetAsync(StartseiteUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(["kopf", "infotext", "kennzahlen", "neueste", "meistausgegeben"], Arten(await JsonAsync(antwort)));
        AssertOhnePersonendaten(await antwort.Content.ReadAsStringAsync(), Testbenutzer.AdminName, Testbenutzer.AdminEmail);
    }

    [Fact]
    public async Task Get_startseite_als_Sachbearbeiter_enthaelt_keine_Empfaenger_oder_Personendaten()
    {
        var erfasser = await AufbauAsync();

        using var antwort = await erfasser.GetAsync(StartseiteUrl);

        AssertOhnePersonendaten(await antwort.Content.ReadAsStringAsync(), Testbenutzer.AdminName, Testbenutzer.AdminEmail);
    }

    [Fact]
    public async Task Get_konfiguration_als_Administrator_enthaelt_ausser_geaendertVon_keine_Personendaten()
    {
        await AufbauAsync();

        var konfiguration = await KonfigurationAsync();

        Assert.Equal(Testbenutzer.AdminName, konfiguration.GetProperty("geaendertVon").GetString());
        var ohneGeaendertVon = konfiguration.ToString().Replace($"\"geaendertVon\": \"{Testbenutzer.AdminName}\"", string.Empty, StringComparison.Ordinal)
            .Replace($"\"geaendertVon\":\"{Testbenutzer.AdminName}\"", string.Empty, StringComparison.Ordinal);
        AssertOhnePersonendaten(ohneGeaendertVon, Testbenutzer.AdminName, Testbenutzer.AdminEmail, Testbenutzer.AdminSubject);
    }

    [Fact]
    public async Task Get_kopf_anonym_enthaelt_keine_Personendaten()
    {
        await AufbauAsync();

        using var antwort = await Anonym.GetAsync(KopfUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        AssertOhnePersonendaten(await antwort.Content.ReadAsStringAsync(), Testbenutzer.AdminName, Testbenutzer.AdminEmail);
    }

    [Theory]
    [InlineData("bereitsteller")]
    [InlineData("software")]
    public async Task Logo_Antwort_anonym_enthaelt_keine_Personendaten(string platz)
    {
        await AufbauAsync();

        using var antwort = await Anonym.GetAsync(LogoUrl(platz));
        var header = string.Join("\n", antwort.Headers.Concat(antwort.Content.Headers).Select(h => $"{h.Key}: {string.Join(",", h.Value)}"));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        AssertOhnePersonendaten(header, Testbenutzer.AdminName, Testbenutzer.AdminEmail);
    }

    [Fact]
    public async Task Konfigurationsantwort_hat_im_Logo_kein_Feld_zum_Hochladenden()
    {
        await AufbauAsync();

        var logo = (await KonfigurationAsync()).GetProperty("kopf").GetProperty("logoBereitsteller");

        Assert.Equal(["alternativtext", "breite", "format", "groesseBytes", "hoehe", "url"], Feldnamen(logo));
    }

    [Fact]
    public async Task Neueste_und_Meistausgegebene_Eintraege_haben_keine_Personenfelder()
    {
        await AufbauAsync();
        var startseite = await StartseiteAsync(await BetrachterAsync());

        foreach (var art in new[] { "neueste", "meistausgegeben" })
        {
            foreach (var eintrag in Block(startseite, art).GetProperty("eintraege").EnumerateArray())
            {
                Assert.DoesNotContain(Feldnamen(eintrag), f => f.Contains("empfaenger", StringComparison.OrdinalIgnoreCase)
                    || f.Contains("erfasst", StringComparison.OrdinalIgnoreCase)
                    || f.Contains("von", StringComparison.OrdinalIgnoreCase));
            }
        }
    }
}
