using System.Net;
using System.Text;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Ausgaben;

/// <summary>
/// Feature coin-ausgaben, AK-17 (Entscheidungen F3, F4, F9; ADR-0020 Punkt 8): <c>PUT /api/coins/{id}/auflage</c>.
/// </summary>
public class AuflageAendernTests(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    [Fact]
    public async Task Erhoehung_liefert_200_mit_dem_Coin()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PutAuflageAsync(Client, coinId, 15);
        var json = await JsonAsync(antwort);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(
            ["auflage", "beschreibung", "bildUrl", "erstelltAm", "herausgeber", "id", "name"],
            Feldnamen(json));
        Assert.Equal((coinId, 15), (json.GetProperty("id").GetGuid(), json.GetProperty("auflage").GetInt32()));
    }

    [Fact]
    public async Task Erhoehung_erzeugt_die_Exemplare_alt_plus_1_bis_neu()
    {
        var coinId = await CoinMitAuflageAsync(3);

        using var antwort = await PutAuflageAsync(Client, coinId, 6);

        Assert.Equal([1, 2, 3, 4, 5, 6], await AusgabeDb.ExemplarNummernAsync(coinId));
    }

    [Fact]
    public async Task Erhoehung_ist_im_Coin_Detail_sichtbar()
    {
        var coinId = await CoinMitAuflageAsync(3);

        await AuflageSetzenAsync(coinId, 6);

        using var detail = await Anonym.GetAsync($"{CoinsUrl}/{coinId}");
        Assert.Equal(6, (await JsonAsync(detail)).GetProperty("auflage").GetInt32());
    }

    [Fact]
    public async Task Erste_Auflage_fuer_einen_Coin_ohne_Auflage_erzeugt_die_Exemplare_1_bis_N()
    {
        var coinId = await CoinMitAuflageAsync(null);

        using var antwort = await PutAuflageAsync(Client, coinId, 4);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal([1, 2, 3, 4], await AusgabeDb.ExemplarNummernAsync(coinId));
    }

    [Fact]
    public async Task Nach_dem_Festlegen_der_Auflage_sind_Ausgaben_moeglich()
    {
        var coinId = await CoinMitAuflageAsync(null);
        await AuflageSetzenAsync(coinId, 4);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe());

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Gleicher_Wert_liefert_200_ohne_Aenderung()
    {
        var coinId = await CoinMitAuflageAsync(5);
        await ErfasseAsync(coinId, 5);

        using var antwort = await PutAuflageAsync(Client, coinId, 5);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal([1, 2, 3, 4, 5], await AusgabeDb.ExemplarNummernAsync(coinId));
    }

    [Fact]
    public async Task Senkung_ohne_Ausgaben_loescht_die_Exemplare_ueber_der_neuen_Auflage()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PutAuflageAsync(Client, coinId, 4);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal([1, 2, 3, 4], await AusgabeDb.ExemplarNummernAsync(coinId));
    }

    [Fact]
    public async Task Senkung_aktualisiert_die_Kennzahlen()
    {
        var coinId = await CoinMitAuflageAsync(10);
        await ErfasseAsync(coinId, 2);

        await AuflageSetzenAsync(coinId, 4);

        Assert.Equal((4, 1, 3), await KennzahlenAsync(coinId));
    }

    [Fact]
    public async Task Senkung_unter_ein_storniertes_Exemplar_liefert_409_auflage_zu_klein()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var ausgabe = await ErfasseAsync(coinId, 7);
        await StornierenAsync(coinId, ausgabe.GetProperty("id").GetGuid());

        using var antwort = await PutAuflageAsync(Client, coinId, 6);

        var json = await AssertKonfliktAsync(antwort, "auflage_zu_klein");
        Assert.Equal(
            "Die Auflage kann nicht unter 7 gesenkt werden, weil Exemplar Nr. 7 ausgegeben wurde.",
            json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Senkung_bis_auf_ein_storniertes_Exemplar_ist_erlaubt()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var ausgabe = await ErfasseAsync(coinId, 7);
        await StornierenAsync(coinId, ausgabe.GetProperty("id").GetGuid());

        using var antwort = await PutAuflageAsync(Client, coinId, 7);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(Enumerable.Range(1, 7), await AusgabeDb.ExemplarNummernAsync(coinId));
    }

    [Fact]
    public async Task Senkung_unter_ein_aktiv_ausgegebenes_Exemplar_liefert_409()
    {
        var coinId = await CoinMitAuflageAsync(10);
        await ErfasseAsync(coinId, 9);

        using var antwort = await PutAuflageAsync(Client, coinId, 3);

        var json = await AssertKonfliktAsync(antwort, "auflage_zu_klein");
        Assert.Equal(
            "Die Auflage kann nicht unter 9 gesenkt werden, weil Exemplar Nr. 9 ausgegeben wurde.",
            json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Abgelehnte_Senkung_aendert_nichts()
    {
        var coinId = await CoinMitAuflageAsync(10);
        await ErfasseAsync(coinId, 9);

        using (var abgelehnt = await PutAuflageAsync(Client, coinId, 3))
        {
            Assert.Equal(HttpStatusCode.Conflict, abgelehnt.StatusCode);
        }

        Assert.Equal(10, await AusgabeDb.AnzahlExemplareAsync(coinId));
        Assert.Equal((10, 1, 9), await KennzahlenAsync(coinId));
    }

    [Fact]
    public async Task Null_liefert_400_Auflage_ist_erforderlich()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PutAuflageAsync(Client, coinId, null);

        Assert.Equal(["Auflage ist erforderlich."], await FehlerZuFeldAsync(antwort, "auflage"));
    }

    [Fact]
    public async Task Fehlendes_Feld_liefert_400_Auflage_ist_erforderlich()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PutRohAsync(Client, AuflageUrl(coinId), "{}");

        Assert.Equal(["Auflage ist erforderlich."], await FehlerZuFeldAsync(antwort, "auflage"));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(1_000_001)]
    public async Task Auflage_ausserhalb_1_bis_1000000_liefert_400(int auflage)
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PutAuflageAsync(Client, coinId, auflage);

        Assert.Equal(["Auflage muss zwischen 1 und 1000000 liegen."], await FehlerZuFeldAsync(antwort, "auflage"));
    }

    [Fact]
    public async Task Text_als_Auflage_liefert_Ungueltiger_Wert()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PutRohAsync(Client, AuflageUrl(coinId), """{ "auflage": "viel" }""");

        Assert.Equal(["Ungültiger Wert für dieses Feld."], await FehlerZuFeldAsync(antwort, "auflage"));
    }

    [Fact]
    public async Task Kein_JSON_liefert_400_mit_errors_anfrage()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PutRohAsync(Client, AuflageUrl(coinId), "{ \"auflage\": ");

        Assert.NotEmpty(await FehlerZuFeldAsync(antwort, "anfrage"));
    }

    [Fact]
    public async Task Ohne_JSON_Content_Type_liefert_415()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await Client.PutAsync(AuflageUrl(coinId), new StringContent("auflage=5", Encoding.UTF8, "text/plain"));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.UnsupportedMediaType);
    }

    [Fact]
    public async Task Unbekannter_Coin_liefert_404()
    {
        using var antwort = await PutAuflageAsync(Client, Guid.NewGuid(), 5);

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Coin nicht gefunden", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Auflage_aendern_traegt_Cache_Control_no_store()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PutAuflageAsync(Client, coinId, 11);

        Assert.True(antwort.Headers.CacheControl?.NoStore, $"Cache-Control: {antwort.Headers.CacheControl}");
    }

    [Fact]
    public async Task Exemplar_Nummer_ueber_der_gesenkten_Auflage_liefert_400()
    {
        var coinId = await CoinMitAuflageAsync(10);
        await AuflageSetzenAsync(coinId, 5);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(6));

        Assert.Equal(["Exemplar-Nummer muss zwischen 1 und 5 liegen."], await FehlerZuFeldAsync(antwort, "exemplarNummer"));
    }
}
