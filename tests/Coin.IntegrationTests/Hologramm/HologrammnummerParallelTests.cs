using System.Globalization;
using System.Net;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Hologramm;

/// <summary>
/// Feature hologrammnummer, AK-9 (ADR-0033 Punkt 5): Die Coin-Sperre serialisiert nur Ausgaben desselben Coins; bei
/// zwei Coins ist allein der eindeutige Index die Grenze. Je Durchlauf zwei gleichzeitige Anfragen auf zwei
/// verschiedene Coins mit derselben Nummer in zwei Schreibweisen (Start über eine gemeinsame Schranke, 20 Durchläufe
/// mit je neuer Nummer): genau ein Erfolg und ein <c>409 hologrammnummer_vergeben</c>, nie <c>500</c>; in der DB genau
/// eine nicht abgelöste Zeile mit der Normalform. Für <c>POST</c>/<c>POST</c>, <c>PUT</c>/<c>PUT</c> und
/// <c>POST</c>/<c>PUT</c>.
/// </summary>
public class HologrammnummerParallelTests(PostgresFixture fixture) : HologrammTestBasis(fixture)
{
    private const int Durchlaeufe = 20;

    /// <summary>Nummer des Durchlaufs in zwei Schreibweisen mit derselben Normalform (z. B. „ab 07-34“ und „AB0734“).</summary>
    private static (string Klein, string Gross, string Normalform) Nummer(int lauf)
    {
        var mitte = lauf.ToString("D2", CultureInfo.InvariantCulture);
        return ($"ab {mitte}-34", $"AB{mitte}34", $"AB{mitte}34");
    }

    /// <summary>Startet beide Anfragen gleichzeitig hinter einer gemeinsamen Schranke.</summary>
    private static async Task<HttpResponseMessage[]> GleichzeitigAsync(params Func<Task<HttpResponseMessage>>[] anfragen)
    {
        using var schranke = new Barrier(anfragen.Length);
        var laufend = anfragen.Select(a => Task.Run(async () =>
        {
            schranke.SignalAndWait(TimeSpan.FromSeconds(30));
            return await a();
        })).ToArray();
        return await Task.WhenAll(laufend);
    }

    private static async Task<string> BeschreibungAsync(HttpResponseMessage antwort) =>
        antwort.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK
            ? "ok"
            : $"{(int)antwort.StatusCode} {await CodeAsync(antwort)}";

    private async Task<List<string>> ErgebnisseAsync(HttpResponseMessage[] antworten)
    {
        var ergebnisse = new List<string>();
        foreach (var antwort in antworten)
        {
            ergebnisse.Add(await BeschreibungAsync(antwort));
            antwort.Dispose();
        }

        ergebnisse.Sort(StringComparer.Ordinal);
        return ergebnisse;
    }

    private async Task<(Guid CoinA, Guid CoinB)> ZweiCoinsAsync()
    {
        await AdminIdAsync();
        return (await CoinMitAuflageAsync(Durchlaeufe + 5), await CoinMitAuflageAsync(Durchlaeufe + 5));
    }

    private async Task<int> AktuelleZeilenMitAsync(string normalform) =>
        (await HologrammDb.ZeilenAsync()).Count(z => z.NummerNormalisiert == normalform && z.AbgeloestAm is null);

    // ---------- POST gegen POST ----------

    [Fact]
    public async Task Zwei_parallele_Erfassungen_an_zwei_Coins_ergeben_genau_einen_Erfolg_und_einen_409_vergeben()
    {
        var (coinA, coinB) = await ZweiCoinsAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var (klein, gross, _) = Nummer(lauf);

            var antworten = await GleichzeitigAsync(
                () => PostAusgabeAsync(coinA, AusgabeMit(klein)),
                () => PostAusgabeAsync(coinB, AusgabeMit(gross)));

            Assert.Equal(["409 hologrammnummer_vergeben", "ok"], await ErgebnisseAsync(antworten));
        }
    }

    [Fact]
    public async Task Nach_parallelen_Erfassungen_gibt_es_je_Nummer_genau_eine_aktuelle_Zeile_und_eine_Ausgabe()
    {
        var (coinA, coinB) = await ZweiCoinsAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var (klein, gross, normalform) = Nummer(lauf);
            var vorher = (await AusgabeDb.AusgabenAsync()).Count;

            await ErgebnisseAsync(await GleichzeitigAsync(
                () => PostAusgabeAsync(coinA, AusgabeMit(klein)),
                () => PostAusgabeAsync(coinB, AusgabeMit(gross))));

            Assert.Equal((1, vorher + 1), (await AktuelleZeilenMitAsync(normalform), (await AusgabeDb.AusgabenAsync()).Count));
        }
    }

    [Fact]
    public async Task Nach_parallelen_Erfassungen_gibt_es_je_Nummer_genau_ein_Hologramm_Audit()
    {
        var (coinA, coinB) = await ZweiCoinsAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var (klein, gross, _) = Nummer(lauf);
            await ErgebnisseAsync(await GleichzeitigAsync(
                () => PostAusgabeAsync(coinA, AusgabeMit(klein)),
                () => PostAusgabeAsync(coinB, AusgabeMit(gross))));
        }

        var audit = await HologrammDb.AuditAsync();
        Assert.Equal(Enumerable.Range(0, Durchlaeufe).Select(l => Nummer(l).Normalform).Order(StringComparer.Ordinal), audit.Select(a => a.NummerNeu).Order(StringComparer.Ordinal));
    }

    // ---------- PUT gegen PUT ----------

    [Fact]
    public async Task Zwei_parallele_Ergaenzungen_an_Ausgaben_zweier_Coins_ergeben_genau_einen_Erfolg_und_einen_409_vergeben()
    {
        var (coinA, coinB) = await ZweiCoinsAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var (klein, gross, _) = Nummer(lauf);
            var x = await ErfasseMitNummerAsync(coinA, null);
            var y = await ErfasseMitNummerAsync(coinB, null);

            var antworten = await GleichzeitigAsync(
                () => PutHologrammAsync(Client, x.CoinId, x.AusgabeId, new { hologrammnummer = klein }),
                () => PutHologrammAsync(Client, y.CoinId, y.AusgabeId, new { hologrammnummer = gross }));

            Assert.Equal(["409 hologrammnummer_vergeben", "ok"], await ErgebnisseAsync(antworten));
        }
    }

    [Fact]
    public async Task Nach_parallelen_Ergaenzungen_gibt_es_je_Nummer_genau_eine_aktuelle_Zeile()
    {
        var (coinA, coinB) = await ZweiCoinsAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var (klein, gross, normalform) = Nummer(lauf);
            var x = await ErfasseMitNummerAsync(coinA, null);
            var y = await ErfasseMitNummerAsync(coinB, null);

            await ErgebnisseAsync(await GleichzeitigAsync(
                () => PutHologrammAsync(Client, x.CoinId, x.AusgabeId, new { hologrammnummer = klein }),
                () => PutHologrammAsync(Client, y.CoinId, y.AusgabeId, new { hologrammnummer = gross })));

            Assert.Equal(1, await AktuelleZeilenMitAsync(normalform));
        }
    }

    [Fact]
    public async Task Zwei_parallele_Korrekturen_auf_dieselbe_Nummer_ergeben_genau_einen_Erfolg_und_einen_409_vergeben()
    {
        var (coinA, coinB) = await ZweiCoinsAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var (klein, gross, _) = Nummer(lauf);
            var alt = lauf.ToString("D2", CultureInfo.InvariantCulture);
            var x = await ErfasseMitNummerAsync(coinA, $"XA{alt}");
            var y = await ErfasseMitNummerAsync(coinB, $"XB{alt}");

            var antworten = await GleichzeitigAsync(
                () => PutHologrammAsync(Client, x.CoinId, x.AusgabeId, new { hologrammnummer = klein, grund = "Test parallel", bisherige = x.Hologrammnummer }),
                () => PutHologrammAsync(Client, y.CoinId, y.AusgabeId, new { hologrammnummer = gross, grund = "Test parallel", bisherige = y.Hologrammnummer }));

            Assert.Equal(["409 hologrammnummer_vergeben", "ok"], await ErgebnisseAsync(antworten));
        }
    }

    [Fact]
    public async Task Bei_paralleler_Korrektur_behaelt_die_unterlegene_Ausgabe_ihre_bisherige_Nummer()
    {
        var (coinA, coinB) = await ZweiCoinsAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var (klein, gross, _) = Nummer(lauf);
            var alt = lauf.ToString("D2", CultureInfo.InvariantCulture);
            var x = await ErfasseMitNummerAsync(coinA, $"XA{alt}");
            var y = await ErfasseMitNummerAsync(coinB, $"XB{alt}");

            await ErgebnisseAsync(await GleichzeitigAsync(
                () => PutHologrammAsync(Client, x.CoinId, x.AusgabeId, new { hologrammnummer = klein, grund = "Test parallel", bisherige = x.Hologrammnummer }),
                () => PutHologrammAsync(Client, y.CoinId, y.AusgabeId, new { hologrammnummer = gross, grund = "Test parallel", bisherige = y.Hologrammnummer })));

            var aktuell = new[] { (await AktuelleZeileAsync(x.AusgabeId))?.Nummer, (await AktuelleZeileAsync(y.AusgabeId))?.Nummer };
            Assert.True(
                aktuell.SequenceEqual([klein.ToUpperInvariant(), $"XB{alt}"]) || aktuell.SequenceEqual([$"XA{alt}", gross]),
                $"Lauf {lauf}: aktuelle Nummern {string.Join(", ", aktuell)}");
        }
    }

    // ---------- POST gegen PUT ----------

    [Fact]
    public async Task Paralleles_Erfassen_und_Ergaenzen_an_zwei_Coins_ergeben_genau_einen_Erfolg_und_einen_409_vergeben()
    {
        var (coinA, coinB) = await ZweiCoinsAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var (klein, gross, _) = Nummer(lauf);
            var y = await ErfasseMitNummerAsync(coinB, null);

            var antworten = await GleichzeitigAsync(
                () => PostAusgabeAsync(coinA, AusgabeMit(klein)),
                () => PutHologrammAsync(Client, y.CoinId, y.AusgabeId, new { hologrammnummer = gross }));

            Assert.Equal(["409 hologrammnummer_vergeben", "ok"], await ErgebnisseAsync(antworten));
        }
    }

    [Fact]
    public async Task Nach_parallelem_Erfassen_und_Ergaenzen_gibt_es_je_Nummer_genau_eine_aktuelle_Zeile()
    {
        var (coinA, coinB) = await ZweiCoinsAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var (klein, gross, normalform) = Nummer(lauf);
            var y = await ErfasseMitNummerAsync(coinB, null);

            await ErgebnisseAsync(await GleichzeitigAsync(
                () => PostAusgabeAsync(coinA, AusgabeMit(klein)),
                () => PutHologrammAsync(Client, y.CoinId, y.AusgabeId, new { hologrammnummer = gross })));

            Assert.Equal(1, await AktuelleZeilenMitAsync(normalform));
        }
    }

    [Fact]
    public async Task Unterliegt_das_Erfassen_bleibt_keine_Ausgabe_zurueck()
    {
        var (coinA, coinB) = await ZweiCoinsAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var (klein, gross, _) = Nummer(lauf);
            var y = await ErfasseMitNummerAsync(coinB, null);
            var vorher = (await AusgabeDb.AusgabenAsync()).Count(a => a.CoinId == coinA);

            var antworten = await GleichzeitigAsync(
                () => PostAusgabeAsync(coinA, AusgabeMit(klein)),
                () => PutHologrammAsync(Client, y.CoinId, y.AusgabeId, new { hologrammnummer = gross }));
            var erfasst = antworten[0].StatusCode == HttpStatusCode.Created;
            await ErgebnisseAsync(antworten);

            Assert.Equal(vorher + (erfasst ? 1 : 0), (await AusgabeDb.AusgabenAsync()).Count(a => a.CoinId == coinA));
        }
    }
}
