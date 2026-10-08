using System.Net;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Ausgaben;

/// <summary>
/// Feature coin-ausgaben, AK-1, AK-3, AK-4 und AK-5: Exemplare entstehen beim Anlegen; <c>GET …/exemplare</c> liefert
/// Kennzahlen und Exemplare seitenweise ohne Ausgabedaten; die öffentlichen Katalog-Endpunkte bleiben unverändert.
/// </summary>
public class ExemplareTests(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    // ---------- AK-1: Exemplare beim Anlegen ----------

    [Fact]
    public async Task Anlegen_mit_Auflage_150_erzeugt_150_Exemplare()
    {
        var coinId = await CoinMitAuflageAsync(150);

        Assert.Equal(150, await AusgabeDb.AnzahlExemplareAsync(coinId));
    }

    [Fact]
    public async Task Anlegen_mit_Auflage_erzeugt_die_Nummern_1_bis_Auflage()
    {
        var coinId = await CoinMitAuflageAsync(5);

        Assert.Equal([1, 2, 3, 4, 5], await AusgabeDb.ExemplarNummernAsync(coinId));
    }

    [Fact]
    public async Task Anlegen_ohne_Auflage_erzeugt_keine_Exemplare()
    {
        var coinId = await CoinMitAuflageAsync(null);

        Assert.Equal(0, await AusgabeDb.AnzahlExemplareAsync(coinId));
    }

    [Fact]
    public async Task Anlegen_mit_Auflage_1_erzeugt_genau_ein_Exemplar()
    {
        var coinId = await CoinMitAuflageAsync(1);

        Assert.Equal([1], await AusgabeDb.ExemplarNummernAsync(coinId));
    }

    [Fact]
    public async Task Abgelehntes_Duplikat_erzeugt_keine_weiteren_Exemplare()
    {
        var coinId = await CoinMitAuflageAsync(3, "Coin Duplikat");

        using var antwort = await PostCoinAsync(GueltigerCoin("Coin Duplikat", auflage: 7));

        Assert.Equal(HttpStatusCode.Conflict, antwort.StatusCode);
        Assert.Equal(3, await AusgabeDb.AnzahlExemplareAsync(coinId));
    }

    [Fact]
    public async Task Anlegen_liefert_weiterhin_die_sieben_Coin_Felder()
    {
        var coin = await LegeCoinAnAsync("Coin Felder", auflage: 150);

        Assert.Equal(
            ["auflage", "beschreibung", "bildUrl", "erstelltAm", "herausgeber", "id", "name"],
            Feldnamen(coin));
    }

    [Fact]
    public async Task Ein_neuer_Coin_mit_Auflage_150_hat_150_verfuegbare_Exemplare()
    {
        var coinId = await CoinMitAuflageAsync(150);

        Assert.Equal((150, 0, 150), await KennzahlenAsync(coinId));
    }

    // ---------- AK-3: Kennzahlen und Einträge ----------

    [Fact]
    public async Task Exemplare_liefert_kennzahlen_eintraege_gesamt_seite_groesse()
    {
        var coinId = await CoinMitAuflageAsync(3);

        var json = await ExemplareAsync(coinId);

        Assert.Equal(["eintraege", "gesamt", "groesse", "kennzahlen", "seite"], Feldnamen(json));
    }

    [Fact]
    public async Task Nach_drei_aktiven_Ausgaben_bei_Auflage_150_sind_3_ausgegeben_und_147_verfuegbar()
    {
        var coinId = await CoinMitAuflageAsync(150);
        await ErfasseAsync(coinId);
        await ErfasseAsync(coinId);
        await ErfasseAsync(coinId);

        Assert.Equal((150, 3, 147), await KennzahlenAsync(coinId));
    }

    [Fact]
    public async Task Eine_stornierte_Ausgabe_zaehlt_nicht_als_ausgegeben()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var ausgabe = await ErfasseAsync(coinId);
        await ErfasseAsync(coinId);
        await StornierenAsync(coinId, ausgabe.GetProperty("id").GetGuid());

        Assert.Equal((10, 1, 9), await KennzahlenAsync(coinId));
    }

    [Fact]
    public async Task Eintraege_sind_nach_Nummer_sortiert_und_tragen_den_Status()
    {
        var coinId = await CoinMitAuflageAsync(4);
        await ErfasseAsync(coinId, exemplarNummer: 3);

        var eintraege = (await ExemplareAsync(coinId)).GetProperty("eintraege").EnumerateArray()
            .Select(e => $"{e.GetProperty("nummer").GetInt32()}:{e.GetProperty("status").GetString()}");

        Assert.Equal(["1:verfuegbar", "2:verfuegbar", "3:ausgegeben", "4:verfuegbar"], eintraege);
    }

    [Fact]
    public async Task Ohne_Paging_Angaben_gelten_Seite_1_und_Groesse_25()
    {
        var coinId = await CoinMitAuflageAsync(30);

        var json = await ExemplareAsync(coinId);

        Assert.Equal(
            (1, 25, 30, 25),
            (json.GetProperty("seite").GetInt32(), json.GetProperty("groesse").GetInt32(),
                json.GetProperty("gesamt").GetInt32(), json.GetProperty("eintraege").GetArrayLength()));
    }

    [Fact]
    public async Task Seite_2_liefert_die_folgenden_Nummern()
    {
        var coinId = await CoinMitAuflageAsync(30);

        var nummern = (await ExemplareAsync(coinId, "?seite=2&groesse=10")).GetProperty("eintraege").EnumerateArray()
            .Select(e => e.GetProperty("nummer").GetInt32());

        Assert.Equal(Enumerable.Range(11, 10), nummern);
    }

    [Fact]
    public async Task Seite_hinter_dem_Ende_ist_leer()
    {
        var coinId = await CoinMitAuflageAsync(3);

        var json = await ExemplareAsync(coinId, "?seite=5");

        Assert.Equal((0, 3), (json.GetProperty("eintraege").GetArrayLength(), json.GetProperty("gesamt").GetInt32()));
    }

    [Fact]
    public async Task Filter_ausgegeben_liefert_nur_ausgegebene_Exemplare()
    {
        var coinId = await CoinMitAuflageAsync(10);
        await ErfasseAsync(coinId, 2);
        await ErfasseAsync(coinId, 9);

        var nummern = (await ExemplareAsync(coinId, "?status=ausgegeben")).GetProperty("eintraege").EnumerateArray()
            .Select(e => e.GetProperty("nummer").GetInt32());

        Assert.Equal([2, 9], nummern);
    }

    [Fact]
    public async Task Filter_verfuegbar_liefert_nur_verfuegbare_Exemplare()
    {
        var coinId = await CoinMitAuflageAsync(4);
        await ErfasseAsync(coinId, 1);
        await ErfasseAsync(coinId, 3);

        var nummern = (await ExemplareAsync(coinId, "?status=verfuegbar")).GetProperty("eintraege").EnumerateArray()
            .Select(e => e.GetProperty("nummer").GetInt32());

        Assert.Equal([2, 4], nummern);
    }

    [Fact]
    public async Task Gesamt_gilt_fuer_den_Filter_die_Kennzahlen_fuer_alle_Exemplare()
    {
        var coinId = await CoinMitAuflageAsync(150);
        await ErfasseAsync(coinId);
        await ErfasseAsync(coinId);
        await ErfasseAsync(coinId);

        var json = await ExemplareAsync(coinId, "?status=ausgegeben");
        var k = json.GetProperty("kennzahlen");

        Assert.Equal(
            (3, 150, 3, 147),
            (json.GetProperty("gesamt").GetInt32(), k.GetProperty("auflage").GetInt32(),
                k.GetProperty("ausgegeben").GetInt32(), k.GetProperty("verfuegbar").GetInt32()));
    }

    [Fact]
    public async Task Ein_storniertes_Exemplar_ist_wieder_verfuegbar()
    {
        var coinId = await CoinMitAuflageAsync(3);
        var ausgabe = await ErfasseAsync(coinId, 2);
        await StornierenAsync(coinId, ausgabe.GetProperty("id").GetGuid());

        var status = (await ExemplareAsync(coinId)).GetProperty("eintraege").EnumerateArray()
            .Single(e => e.GetProperty("nummer").GetInt32() == 2).GetProperty("status").GetString();

        Assert.Equal("verfuegbar", status);
    }

    [Fact]
    public async Task Coin_ohne_Auflage_liefert_Auflage_null_0_0_und_keine_Eintraege()
    {
        var coinId = await CoinMitAuflageAsync(null);

        var json = await ExemplareAsync(coinId);
        var k = json.GetProperty("kennzahlen");

        Assert.Equal(JsonValueKind.Null, k.GetProperty("auflage").ValueKind);
        Assert.Equal((0, 0, 0, 0),
            (k.GetProperty("ausgegeben").GetInt32(), k.GetProperty("verfuegbar").GetInt32(),
                json.GetProperty("gesamt").GetInt32(), json.GetProperty("eintraege").GetArrayLength()));
    }

    [Theory]
    [InlineData("?status=aktiv")]
    [InlineData("?status=ungueltig")]
    public async Task Ungueltiger_Status_liefert_400_am_Feld_status(string query)
    {
        var coinId = await CoinMitAuflageAsync(3);

        using var antwort = await Client.GetAsync(ExemplareUrl(coinId) + query);

        Assert.Equal(["Bitte einen gültigen Status wählen."], await FehlerZuFeldAsync(antwort, "status"));
    }

    [Theory]
    [InlineData("?seite=0", "seite")]
    [InlineData("?groesse=101", "groesse")]
    [InlineData("?groesse=0", "groesse")]
    public async Task Ungueltiges_Paging_liefert_400_wie_bei_der_Katalogliste(string query, string feld)
    {
        var coinId = await CoinMitAuflageAsync(3);

        using var antwort = await Client.GetAsync(ExemplareUrl(coinId) + query);

        Assert.NotEmpty(await FehlerZuFeldAsync(antwort, feld));
    }

    [Fact]
    public async Task Unbekannter_Coin_liefert_404()
    {
        using var antwort = await Client.GetAsync(ExemplareUrl(Guid.NewGuid()));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Coin nicht gefunden", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Id_ohne_GUID_Format_liefert_404()
    {
        using var antwort = await Client.GetAsync($"{CoinsUrl}/keine-guid/exemplare");

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Fact]
    public async Task Exemplare_tragen_Cache_Control_no_store()
    {
        var coinId = await CoinMitAuflageAsync(3);

        using var antwort = await Client.GetAsync(ExemplareUrl(coinId));

        Assert.True(antwort.Headers.CacheControl?.NoStore, $"Cache-Control: {antwort.Headers.CacheControl}");
    }

    // ---------- AK-4: keine weiteren Felder ----------

    [Fact]
    public async Task Kennzahlen_haben_genau_auflage_ausgegeben_verfuegbar()
    {
        var coinId = await CoinMitAuflageAsync(3);
        await ErfasseAsync(coinId);

        var json = await ExemplareAsync(coinId);

        Assert.Equal(["auflage", "ausgegeben", "verfuegbar"], Feldnamen(json.GetProperty("kennzahlen")));
    }

    [Fact]
    public async Task Eintraege_haben_genau_nummer_und_status_auch_wenn_ausgegeben()
    {
        var coinId = await CoinMitAuflageAsync(3);
        await ErfasseAsync(coinId, 1);

        var json = await ExemplareAsync(coinId);

        Assert.All(json.GetProperty("eintraege").EnumerateArray(), e => Assert.Equal(["nummer", "status"], Feldnamen(e)));
    }

    [Theory]
    [InlineData("Administrator")]
    [InlineData("Sachbearbeiter")]
    [InlineData("Betrachter")]
    public async Task Antwort_ist_fuer_jede_Rolle_gleich(string rolle)
    {
        var coinId = await CoinMitAuflageAsync(3);
        await ErfasseAsync(coinId, 2);
        using var alsAdmin = await Client.GetAsync(ExemplareUrl(coinId));
        var client = await ClientMitRolleAsync(rolle);

        using var alsRolle = await client.GetAsync(ExemplareUrl(coinId));

        Assert.Equal(await alsAdmin.Content.ReadAsStringAsync(), await alsRolle.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Antwort_enthaelt_keine_Ausgabedaten()
    {
        var coinId = await CoinMitAuflageAsync(3);
        var ausgabe = await ErfasseAsync(coinId, 2, empfaengerName: "Test Empfaenger Exemplar");

        using var antwort = await Client.GetAsync(ExemplareUrl(coinId));
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.DoesNotContain("Test Empfaenger Exemplar", text);
        Assert.DoesNotContain(ausgabe.GetProperty("id").GetString()!, text);
        Assert.DoesNotContain(Datum, text);
    }

    // ---------- AK-5: öffentliche Endpunkte unverändert ----------

    [Fact]
    public async Task Coin_Detail_bleibt_bei_sieben_Feldern_ohne_Kennzahlen()
    {
        var coinId = await CoinMitAuflageAsync(150);
        await ErfasseAsync(coinId);

        using var antwort = await Anonym.GetAsync($"{CoinsUrl}/{coinId}");

        Assert.Equal(
            ["auflage", "beschreibung", "bildUrl", "erstelltAm", "herausgeber", "id", "name"],
            Feldnamen(await JsonAsync(antwort)));
    }

    [Fact]
    public async Task Katalogliste_bleibt_bei_sieben_Feldern_je_Eintrag()
    {
        var coinId = await CoinMitAuflageAsync(150);
        await ErfasseAsync(coinId);

        var eintraege = await LadeListeAsync();

        Assert.Equal(
            ["auflage", "beschreibung", "bildUrl", "erstelltAm", "herausgeber", "id", "name"],
            Feldnamen(Assert.Single(eintraege)));
    }

    [Fact]
    public async Task Coin_Detail_bleibt_anonym_lesbar()
    {
        var coinId = await CoinMitAuflageAsync(3);

        using var antwort = await Anonym.GetAsync($"{CoinsUrl}/{coinId}");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }
}
