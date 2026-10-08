using System.Net;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Ausgaben;

/// <summary>
/// Feature coin-ausgaben, AK-14: <c>GET /api/coins/{id}/ausgaben</c> – alle Ausgaben eines Coins seitenweise,
/// neueste zuerst, aktive und stornierte, Filter <c>status=aktiv|storniert</c>, <c>no-store</c>.
/// </summary>
public class AusgabeHistorieTests(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    private static int[] Nummern(JsonElement seite) =>
        seite.GetProperty("eintraege").EnumerateArray().Select(e => e.GetProperty("exemplarNummer").GetInt32()).ToArray();

    [Fact]
    public async Task Historie_liefert_eintraege_gesamt_seite_groesse()
    {
        var coinId = await CoinMitAuflageAsync(5);
        await ErfasseAsync(coinId);

        var json = await HistorieAsync(coinId);

        Assert.Equal(["eintraege", "gesamt", "groesse", "seite"], Feldnamen(json));
    }

    [Fact]
    public async Task Eintraege_haben_das_Ausgabe_Format_aus_Abschnitt_5_2()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var erfasst = await ErfasseAsync(coinId);

        var eintrag = Assert.Single((await HistorieAsync(coinId)).GetProperty("eintraege").EnumerateArray());

        Assert.Equal(erfasst.GetRawText(), eintrag.GetRawText());
    }

    [Fact]
    public async Task Neueste_Ausgabe_steht_zuerst()
    {
        var coinId = await CoinMitAuflageAsync(5);
        await ErfasseAsync(coinId, 3);
        await ErfasseAsync(coinId, 1);
        await ErfasseAsync(coinId, 5);

        Assert.Equal(new[] { 5, 1, 3 }, Nummern(await HistorieAsync(coinId)));
    }

    [Fact]
    public async Task Historie_enthaelt_aktive_und_stornierte_Ausgaben()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var erste = await ErfasseAsync(coinId, 2);
        await StornierenAsync(coinId, erste.GetProperty("id").GetGuid());
        await ErfasseAsync(coinId, 2);

        var json = await HistorieAsync(coinId);

        Assert.Equal(2, json.GetProperty("gesamt").GetInt32());
    }

    [Fact]
    public async Task Stornierte_Ausgabe_traegt_storno_in_der_Historie()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var erste = await ErfasseAsync(coinId);
        await StornierenAsync(coinId, erste.GetProperty("id").GetGuid(), "Doppelt erfasst");

        var eintrag = Assert.Single((await HistorieAsync(coinId)).GetProperty("eintraege").EnumerateArray());

        Assert.Equal("Doppelt erfasst", eintrag.GetProperty("storno").GetProperty("grund").GetString());
    }

    [Fact]
    public async Task Namen_der_Akteure_kommen_beim_Lesen_aus_benutzer()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var konto = await KontoAsync("Sachbearbeiter", name: "Test Alter Name");
        await ErfasseAsync(coinId, client: konto.Client);
        using (var umbenannt = ClientMit(new TokenDaten { Subject = konto.Subject, Email = konto.Email, Name = "Test Neuer Name" }))
        using (var me = await umbenannt.GetAsync(MeUrl))
        {
            Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        }

        var eintrag = Assert.Single((await HistorieAsync(coinId)).GetProperty("eintraege").EnumerateArray());

        Assert.Equal("Test Neuer Name", eintrag.GetProperty("erfasstVon").GetProperty("name").GetString());
    }

    [Fact]
    public async Task Filter_aktiv_liefert_nur_aktive_Ausgaben()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var erste = await ErfasseAsync(coinId, 1);
        await ErfasseAsync(coinId, 2);
        await StornierenAsync(coinId, erste.GetProperty("id").GetGuid());

        Assert.Equal(new[] { 2 }, Nummern(await HistorieAsync(coinId, "?status=aktiv")));
    }

    [Fact]
    public async Task Filter_storniert_liefert_nur_stornierte_Ausgaben()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var erste = await ErfasseAsync(coinId, 1);
        await ErfasseAsync(coinId, 2);
        await StornierenAsync(coinId, erste.GetProperty("id").GetGuid());

        Assert.Equal(new[] { 1 }, Nummern(await HistorieAsync(coinId, "?status=storniert")));
    }

    [Fact]
    public async Task Historie_enthaelt_nur_Ausgaben_des_Coins()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var andererCoin = await CoinMitAuflageAsync(5);
        await ErfasseAsync(coinId, 1);
        await ErfasseAsync(andererCoin, 2);

        Assert.Equal(new[] { 1 }, Nummern(await HistorieAsync(coinId)));
    }

    [Fact]
    public async Task Historie_wird_geblaettert()
    {
        var coinId = await CoinMitAuflageAsync(5);
        for (var nr = 1; nr <= 5; nr++)
        {
            await ErfasseAsync(coinId, nr);
        }

        var json = await HistorieAsync(coinId, "?seite=2&groesse=2");

        Assert.Equal([3, 2], Nummern(json));
        Assert.Equal((5, 2, 2), (json.GetProperty("gesamt").GetInt32(), json.GetProperty("seite").GetInt32(), json.GetProperty("groesse").GetInt32()));
    }

    [Fact]
    public async Task Ohne_Paging_Angaben_gelten_Seite_1_und_Groesse_25()
    {
        var coinId = await CoinMitAuflageAsync(5);

        var json = await HistorieAsync(coinId);

        Assert.Equal((1, 25), (json.GetProperty("seite").GetInt32(), json.GetProperty("groesse").GetInt32()));
    }

    [Fact]
    public async Task Coin_ohne_Ausgaben_liefert_eine_leere_Seite()
    {
        var coinId = await CoinMitAuflageAsync(null);

        var json = await HistorieAsync(coinId);

        Assert.Equal((0, 0), (json.GetProperty("gesamt").GetInt32(), json.GetProperty("eintraege").GetArrayLength()));
    }

    [Theory]
    [InlineData("?status=ausgegeben")]
    [InlineData("?status=alle")]
    public async Task Ungueltiger_Status_liefert_400(string query)
    {
        var coinId = await CoinMitAuflageAsync(5);

        using var antwort = await Client.GetAsync(AusgabenUrl(coinId) + query);

        Assert.Equal(["Bitte einen gültigen Status wählen."], await FehlerZuFeldAsync(antwort, "status"));
    }

    [Theory]
    [InlineData("?seite=0", "seite")]
    [InlineData("?groesse=101", "groesse")]
    public async Task Ungueltiges_Paging_liefert_400(string query, string feld)
    {
        var coinId = await CoinMitAuflageAsync(5);

        using var antwort = await Client.GetAsync(AusgabenUrl(coinId) + query);

        Assert.NotEmpty(await FehlerZuFeldAsync(antwort, feld));
    }

    [Fact]
    public async Task Unbekannter_Coin_liefert_404()
    {
        using var antwort = await Client.GetAsync(AusgabenUrl(Guid.NewGuid()));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Coin nicht gefunden", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Historie_traegt_Cache_Control_no_store()
    {
        var coinId = await CoinMitAuflageAsync(5);

        using var antwort = await Client.GetAsync(AusgabenUrl(coinId));

        Assert.True(antwort.Headers.CacheControl?.NoStore, $"Cache-Control: {antwort.Headers.CacheControl}");
    }
}
