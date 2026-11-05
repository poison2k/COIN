using System.Net;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Hologramm;

/// <summary>
/// Feature hologrammnummer, AK-12 und AK-13 (Rev. 2, H1 und H4, ADR-0033 Punkt 1 und 3):
/// „Nummer stornierter Ausgabe bleibt gesperrt“ – Neuausgabe desselben Exemplars, anderer Coin, <c>PUT</c> auf eine
/// andere Ausgabe und <c>PUT</c> auf die stornierte Ausgabe selbst scheitern; die Zeile bleibt unverändert; nach einer
/// früheren Korrektur ist die aktuelle Nummer gesperrt, die abgelöste frei.
/// „Korrigierte alte Nummer ist wieder vergebbar“ – <c>POST</c> und <c>PUT</c> mit der alten Nummer gelingen, die
/// Prüfung der alten Nummer ergibt vor der Neuvergabe <c>nichtGefunden</c> und danach den Treffer auf die neue
/// Ausgabe; eine Rückkorrektur auf die eigene alte Nummer gelingt.
/// </summary>
public class HologrammnummerReservierungTests(PostgresFixture fixture) : HologrammTestBasis(fixture)
{
    /// <summary>Ausgabe X an Coin A mit <paramref name="nummer"/>, danach storniert.</summary>
    private async Task<HologrammAusgabe> StornierteAusgabeAsync(string nummer = "AB1234")
    {
        var x = await NeueAusgabeAsync(nummer);
        await StornierenAsync(x.CoinId, x.AusgabeId);
        return x;
    }

    // =====================================================================================================
    // AK-12: Nummer stornierter Ausgabe bleibt gesperrt
    // =====================================================================================================

    [Fact]
    public async Task Neuausgabe_desselben_Exemplars_mit_der_Nummer_liefert_409_hologrammnummer_vergeben()
    {
        var x = await StornierteAusgabeAsync();

        using var antwort = await PostAusgabeAsync(x.CoinId, AusgabeMit("AB1234", exemplarNummer: x.ExemplarNummer));

        await AssertKonfliktAsync(antwort, TitelErfassen, "hologrammnummer_vergeben", DetailVergeben);
    }

    [Fact]
    public async Task Neuausgabe_desselben_Exemplars_mit_neuer_Nummer_gelingt()
    {
        var x = await StornierteAusgabeAsync();

        var neu = await ErfasseMitNummerAsync(x.CoinId, "CD5678", exemplarNummer: x.ExemplarNummer);

        Assert.Equal((x.ExemplarNummer, "CD5678"), (neu.ExemplarNummer, neu.Hologrammnummer));
    }

    [Fact]
    public async Task Anderer_Coin_mit_der_Nummer_in_anderer_Schreibweise_liefert_409_hologrammnummer_vergeben()
    {
        await StornierteAusgabeAsync();
        var coinB = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinB, AusgabeMit("ab 12 34"));

        await AssertKonfliktAsync(antwort, TitelErfassen, "hologrammnummer_vergeben", DetailVergeben);
    }

    [Fact]
    public async Task Put_auf_eine_andere_aktive_Ausgabe_mit_der_Nummer_liefert_409_hologrammnummer_vergeben()
    {
        await StornierteAusgabeAsync();
        var y = await NeueAusgabeAsync(null);

        using var antwort = await PutHologrammAsync(y.CoinId, y.AusgabeId, "AB-1234");

        await AssertKonfliktAsync(antwort, TitelHologramm, "hologrammnummer_vergeben", DetailVergeben);
    }

    [Fact]
    public async Task Korrektur_auf_die_stornierte_Ausgabe_liefert_409_ausgabe_storniert()
    {
        var x = await StornierteAusgabeAsync();

        using var antwort = await PutHologrammAsync(x.CoinId, x.AusgabeId, "CD5678", "Tippfehler", "AB1234");

        await AssertKonfliktAsync(antwort, TitelHologramm, "ausgabe_storniert", DetailStorniert);
    }

    [Fact]
    public async Task Ergaenzen_an_einer_stornierten_Ausgabe_ohne_Nummer_liefert_409_ausgabe_storniert()
    {
        var x = await NeueAusgabeAsync(null);
        await StornierenAsync(x.CoinId, x.AusgabeId);

        using var antwort = await PutHologrammAsync(x.CoinId, x.AusgabeId, "CD5678");

        Assert.Equal("ausgabe_storniert", await CodeAsync(antwort));
    }

    [Fact]
    public async Task Nach_dem_Put_auf_die_stornierte_Ausgabe_bleibt_ihre_Zeile_unveraendert()
    {
        var x = await StornierteAusgabeAsync();
        var vorher = Assert.Single(await HologrammDb.ZeilenAsync(x.AusgabeId));

        using (await PutHologrammAsync(x.CoinId, x.AusgabeId, "CD5678", "Tippfehler", "AB1234"))
        {
        }

        Assert.Equal(vorher, Assert.Single(await HologrammDb.ZeilenAsync(x.AusgabeId)));
    }

    [Fact]
    public async Task Zeile_der_stornierten_Ausgabe_bleibt_nicht_abgeloest()
    {
        var x = await StornierteAusgabeAsync();
        var coinB = await CoinMitAuflageAsync(10);
        using (await PostAusgabeAsync(x.CoinId, AusgabeMit("AB1234", exemplarNummer: x.ExemplarNummer)))
        using (await PostAusgabeAsync(coinB, AusgabeMit("ab 12 34")))
        using (await PutHologrammAsync(x.CoinId, x.AusgabeId, "CD5678", "Tippfehler", "AB1234"))
        {
        }

        Assert.Null(Assert.Single(await HologrammDb.ZeilenAsync(x.AusgabeId)).AbgeloestAm);
    }

    [Fact]
    public async Task Nach_frueherer_Korrektur_ist_die_aktuelle_Nummer_der_stornierten_Ausgabe_gesperrt()
    {
        var x = await NeueAusgabeAsync("AB1243");
        await AendereAsync(x, "AB1234", "Tippfehler");
        await StornierenAsync(x.CoinId, x.AusgabeId);
        var coinB = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinB, AusgabeMit("AB1234"));

        Assert.Equal("hologrammnummer_vergeben", await CodeAsync(antwort));
    }

    [Fact]
    public async Task Nach_frueherer_Korrektur_ist_die_abgeloeste_Nummer_der_stornierten_Ausgabe_frei()
    {
        var x = await NeueAusgabeAsync("AB1243");
        await AendereAsync(x, "AB1234", "Tippfehler");
        await StornierenAsync(x.CoinId, x.AusgabeId);
        var coinB = await CoinMitAuflageAsync(10);

        var neu = await ErfasseMitNummerAsync(coinB, "AB1243");

        Assert.Equal("AB1243", neu.Hologrammnummer);
    }

    [Fact]
    public async Task Nach_frueherer_Korrektur_bleibt_die_stornierte_Ausgabe_unaenderbar()
    {
        var x = await NeueAusgabeAsync("AB1243");
        await AendereAsync(x, "AB1234", "Tippfehler");
        await StornierenAsync(x.CoinId, x.AusgabeId);

        using var antwort = await PutHologrammAsync(x.CoinId, x.AusgabeId, "AB1243", "Zurück", "AB1234");

        Assert.Equal("ausgabe_storniert", await CodeAsync(antwort));
    }

    [Fact]
    public async Task Pruefung_der_Nummer_einer_stornierten_Ausgabe_ergibt_storniert()
    {
        await StornierteAusgabeAsync();
        var pruefer = await PrueferAsync();

        Assert.Equal("storniert", Ergebnis(await PruefeAsync(pruefer.Client, "AB1234")));
    }

    // =====================================================================================================
    // AK-13: Korrigierte alte Nummer ist wieder vergebbar
    // =====================================================================================================

    /// <summary>Ausgabe X mit „AB1243“, korrigiert auf „AB1234“.</summary>
    private async Task<HologrammAusgabe> KorrigierteAusgabeAsync()
    {
        var x = await NeueAusgabeAsync("AB1243");
        await AendereAsync(x, "AB1234", "Tippfehler");
        return x with { Hologrammnummer = "AB1234" };
    }

    [Fact]
    public async Task Nach_der_Korrektur_ist_die_alte_Zeile_abgeloest_und_die_neue_aktuell()
    {
        var x = await KorrigierteAusgabeAsync();

        var zeilen = await HologrammDb.ZeilenAsync(x.AusgabeId);

        Assert.Equal([("AB1243", true), ("AB1234", false)], zeilen.Select(z => (z.Nummer, z.AbgeloestAm is not null)));
    }

    [Fact]
    public async Task Post_an_einen_anderen_Coin_mit_der_alten_Nummer_gelingt()
    {
        await KorrigierteAusgabeAsync();
        var coinB = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinB, AusgabeMit("ab 12-43"));

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
        Assert.Equal("AB 12-43", (await JsonAsync(antwort)).GetProperty("hologrammnummer").GetString());
    }

    [Fact]
    public async Task Put_auf_eine_andere_Ausgabe_mit_der_alten_Nummer_gelingt()
    {
        await KorrigierteAusgabeAsync();
        var y = await NeueAusgabeAsync(null);

        using var antwort = await PutHologrammAsync(y.CoinId, y.AusgabeId, "AB1243");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Pruefung_der_alten_Nummer_vor_der_Neuvergabe_ergibt_nichtGefunden()
    {
        await KorrigierteAusgabeAsync();
        var pruefer = await PrueferAsync();

        Assert.Equal("nichtGefunden", Ergebnis(await PruefeAsync(pruefer.Client, "AB1243")));
    }

    [Fact]
    public async Task Pruefung_der_neuen_Nummer_trifft_die_korrigierte_Ausgabe()
    {
        var x = await KorrigierteAusgabeAsync();
        var pruefer = await PrueferAsync();

        var json = await PruefeAsync(pruefer.Client, "AB1234", mitEmpfaenger: true);

        Assert.Equal(("gueltig", x.AusgabeId), (Ergebnis(json), json.GetProperty("datensatz").GetProperty("ausgabeId").GetGuid()));
    }

    [Fact]
    public async Task Pruefung_der_alten_Nummer_nach_der_Neuvergabe_trifft_die_neue_Ausgabe()
    {
        var x = await KorrigierteAusgabeAsync();
        var coinB = await CoinMitAuflageAsync(10);
        var neu = await ErfasseMitNummerAsync(coinB, "AB1243");
        var pruefer = await PrueferAsync();

        var json = await PruefeAsync(pruefer.Client, "AB1243", mitEmpfaenger: true);

        var datensatz = json.GetProperty("datensatz");
        Assert.Equal(("gueltig", neu.AusgabeId, coinB), (Ergebnis(json), datensatz.GetProperty("ausgabeId").GetGuid(), datensatz.GetProperty("coin").GetProperty("id").GetGuid()));
        Assert.NotEqual(x.AusgabeId, neu.AusgabeId);
    }

    [Fact]
    public async Task Pruefung_der_alten_Nummer_mit_dem_Coin_der_korrigierten_Ausgabe_ergibt_nichtGefunden()
    {
        var x = await KorrigierteAusgabeAsync();
        var pruefer = await PrueferAsync();

        Assert.Equal("nichtGefunden", Ergebnis(await PruefeAsync(pruefer.Client, "AB1243", x.CoinId)));
    }

    [Fact]
    public async Task Rueckkorrektur_auf_die_eigene_alte_Nummer_gelingt()
    {
        var x = await KorrigierteAusgabeAsync();

        using var antwort = await PutHologrammAsync(x.CoinId, x.AusgabeId, "AB1243", "Doch die erste Nummer", "AB1234");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("AB1243", (await JsonAsync(antwort)).GetProperty("hologrammnummer").GetString());
    }

    [Fact]
    public async Task Nach_der_Rueckkorrektur_gibt_es_drei_Zeilen_und_eine_aktuelle()
    {
        var x = await KorrigierteAusgabeAsync();
        await AendereAsync(x, "AB1243", "Doch die erste Nummer");

        var zeilen = await HologrammDb.ZeilenAsync(x.AusgabeId);

        Assert.Equal(
            [("AB1243", true), ("AB1234", true), ("AB1243", false)],
            zeilen.Select(z => (z.Nummer, z.AbgeloestAm is not null)));
    }

    [Fact]
    public async Task Rueckkorrektur_auf_eine_inzwischen_neu_vergebene_alte_Nummer_liefert_409_vergeben()
    {
        var x = await KorrigierteAusgabeAsync();
        var coinB = await CoinMitAuflageAsync(10);
        await ErfasseMitNummerAsync(coinB, "AB1243");

        using var antwort = await PutHologrammAsync(x.CoinId, x.AusgabeId, "AB1243", "Doch die erste Nummer", "AB1234");

        Assert.Equal("hologrammnummer_vergeben", await CodeAsync(antwort));
    }

    [Fact]
    public async Task Die_Korrektur_gibt_die_alte_Nummer_auch_fuer_denselben_Coin_frei()
    {
        var x = await KorrigierteAusgabeAsync();

        var neu = await ErfasseMitNummerAsync(x.CoinId, "AB1243");

        Assert.Equal("AB1243", neu.Hologrammnummer);
    }
}
