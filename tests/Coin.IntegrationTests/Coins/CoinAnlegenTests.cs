using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Coins;

/// <summary>POST /api/coins: AK-1 bis AK-8 über HTTP sowie AK-12 bis AK-16.</summary>
public class CoinAnlegenTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    // ---------- AK-12 / AK-1: Erfolg ----------

    [Fact]
    public async Task Post_mit_gueltigen_Daten_liefert_201_Created()
    {
        using var antwort = await PostCoinAsync(GueltigerCoin());

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Post_liefert_Location_Header_auf_den_angelegten_Coin()
    {
        using var antwort = await PostCoinAsync(GueltigerCoin());
        var id = (await JsonAsync(antwort)).GetProperty("id").GetGuid();

        var location = antwort.Headers.Location;
        Assert.NotNull(location);
        var pfad = location!.IsAbsoluteUri ? location.AbsolutePath : location.OriginalString;
        Assert.Equal($"/api/coins/{id}", pfad, ignoreCase: true);
    }

    [Fact]
    public async Task Post_liefert_den_angelegten_Coin_mit_allen_Feldern()
    {
        using var antwort = await PostCoinAsync(GueltigerCoin("Coin Alpha", "Herausgeber Beta", 250, "Ein Text"));
        var coin = await JsonAsync(antwort);

        Assert.Equal("Coin Alpha", coin.GetProperty("name").GetString());
        Assert.Equal("Herausgeber Beta", coin.GetProperty("herausgeber").GetString());
        Assert.Equal(250, coin.GetProperty("auflage").GetInt32());
        Assert.Equal("Ein Text", coin.GetProperty("beschreibung").GetString());
    }

    [Fact]
    public async Task Post_liefert_genau_die_Felder_des_CoinResponse_in_camelCase()
    {
        var coin = await LegeCoinAnAsync();

        var felder = coin.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(
            new[] { "auflage", "beschreibung", "bildUrl", "erstelltAm", "herausgeber", "id", "name" },
            felder);
    }

    [Fact]
    public async Task Post_liefert_bildUrl_null()
    {
        var coin = await LegeCoinAnAsync();

        Assert.Equal(JsonValueKind.Null, coin.GetProperty("bildUrl").ValueKind);
    }

    [Fact]
    public async Task Post_erzeugt_eine_GUID_als_id()
    {
        var coin = await LegeCoinAnAsync();

        Assert.True(Guid.TryParse(coin.GetProperty("id").GetString(), out var id));
        Assert.NotEqual(Guid.Empty, id);
    }

    [Fact]
    public async Task Post_setzt_erstelltAm_serverseitig_in_UTC()
    {
        var vorher = DateTimeOffset.UtcNow.AddSeconds(-5);

        var coin = await LegeCoinAnAsync();

        var erstelltAm = coin.GetProperty("erstelltAm").GetDateTimeOffset();
        Assert.Equal(TimeSpan.Zero, erstelltAm.Offset);
        Assert.InRange(erstelltAm, vorher, DateTimeOffset.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task Post_ohne_Auflage_speichert_auflage_null()
    {
        using var antwort = await PostRohJsonAsync("""{ "name": "Coin Alpha", "herausgeber": "Herausgeber Beta" }""");
        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
        var coin = await JsonAsync(antwort);

        Assert.Equal(JsonValueKind.Null, coin.GetProperty("auflage").ValueKind);
    }

    [Fact]
    public async Task Post_mit_leerer_Beschreibung_speichert_beschreibung_null()
    {
        var coin = await LegeCoinAnAsync(beschreibung: "   ");

        Assert.Equal(JsonValueKind.Null, coin.GetProperty("beschreibung").ValueKind);
    }

    [Fact]
    public async Task Post_speichert_getrimmte_Werte()
    {
        var coin = await LegeCoinAnAsync("  Coin Alpha  ", " Herausgeber Beta ", beschreibung: "  Text  ");

        Assert.Equal("Coin Alpha", coin.GetProperty("name").GetString());
        Assert.Equal("Herausgeber Beta", coin.GetProperty("herausgeber").GetString());
        Assert.Equal("Text", coin.GetProperty("beschreibung").GetString());
    }

    [Fact]
    public async Task Post_angelegter_Coin_ist_danach_in_der_Liste()
    {
        var coin = await LegeCoinAnAsync();

        var liste = await LadeListeAsync();

        var eintrag = Assert.Single(liste);
        Assert.Equal(coin.GetProperty("id").GetGuid(), eintrag.GetProperty("id").GetGuid());
    }

    // ---------- AK-13: Validierungsfehler ----------

    [Fact]
    public async Task Post_ohne_Name_liefert_400_mit_Fehler_fuer_name()
    {
        using var antwort = await PostCoinAsync(GueltigerCoin(name: "   "));

        var schluessel = await AssertValidierungsfehlerAsync(antwort);
        Assert.Equal(["name"], schluessel);
    }

    [Fact]
    public async Task Post_ohne_Feld_name_liefert_400_mit_Fehler_fuer_name()
    {
        using var antwort = await PostRohJsonAsync("""{ "herausgeber": "Herausgeber Beta" }""");

        var schluessel = await AssertValidierungsfehlerAsync(antwort);
        Assert.Equal(["name"], schluessel);
    }

    [Fact]
    public async Task Post_ohne_Herausgeber_liefert_400_mit_Fehler_fuer_herausgeber()
    {
        using var antwort = await PostCoinAsync(GueltigerCoin(herausgeber: ""));

        var schluessel = await AssertValidierungsfehlerAsync(antwort);
        Assert.Equal(["herausgeber"], schluessel);
    }

    [Fact]
    public async Task Post_mit_Name_aus_201_Zeichen_liefert_400_mit_Fehler_fuer_name()
    {
        using var antwort = await PostCoinAsync(GueltigerCoin(name: new string('n', 201)));

        var schluessel = await AssertValidierungsfehlerAsync(antwort);
        Assert.Equal(["name"], schluessel);
    }

    [Fact]
    public async Task Post_mit_Name_aus_200_Zeichen_liefert_201()
    {
        using var antwort = await PostCoinAsync(GueltigerCoin(name: new string('n', 200)));

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Post_mit_Herausgeber_aus_200_Zeichen_liefert_201()
    {
        using var antwort = await PostCoinAsync(GueltigerCoin(herausgeber: new string('h', 200)));

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Post_mit_Beschreibung_aus_2000_Zeichen_liefert_201()
    {
        using var antwort = await PostCoinAsync(GueltigerCoin(beschreibung: new string('b', 2000)));

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(1_000_001)]
    public async Task Post_mit_Auflage_ausserhalb_des_Bereichs_liefert_400_mit_Fehler_fuer_auflage(int auflage)
    {
        using var antwort = await PostCoinAsync(GueltigerCoin(auflage: auflage));

        var schluessel = await AssertValidierungsfehlerAsync(antwort);
        Assert.Equal(["auflage"], schluessel);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(1_000_000)]
    public async Task Post_mit_Auflage_an_der_Grenze_liefert_201(int auflage)
    {
        using var antwort = await PostCoinAsync(GueltigerCoin(auflage: auflage));

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Post_mit_Beschreibung_aus_2001_Zeichen_liefert_400_mit_Fehler_fuer_beschreibung()
    {
        using var antwort = await PostCoinAsync(GueltigerCoin(beschreibung: new string('b', 2001)));

        var schluessel = await AssertValidierungsfehlerAsync(antwort);
        Assert.Equal(["beschreibung"], schluessel);
    }

    [Fact]
    public async Task Post_mit_mehreren_ungueltigen_Feldern_meldet_alle_Felder_gemeinsam()
    {
        using var antwort = await PostRohJsonAsync(
            $$"""{ "name": "", "herausgeber": " ", "auflage": 0, "beschreibung": "{{new string('b', 2001)}}" }""");

        var schluessel = await AssertValidierungsfehlerAsync(antwort);
        Assert.Equal(["auflage", "beschreibung", "herausgeber", "name"], schluessel);
    }

    [Fact]
    public async Task Post_Validierungsfehler_enthaelt_nicht_leere_Meldungen()
    {
        using var antwort = await PostCoinAsync(GueltigerCoin(name: ""));
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);

        var meldungen = json.GetProperty("errors").GetProperty("name").EnumerateArray().Select(m => m.GetString()).ToArray();
        Assert.NotEmpty(meldungen);
        Assert.All(meldungen, m => Assert.False(string.IsNullOrWhiteSpace(m)));
    }

    [Fact]
    public async Task Post_mit_ungueltigen_Daten_speichert_nichts()
    {
        using var antwort = await PostCoinAsync(GueltigerCoin(name: "", auflage: 0));
        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);

        Assert.Empty(await LadeListeAsync());
    }

    // ---------- AK-14: kaputtes JSON / falscher Typ ----------

    [Fact]
    public async Task Post_mit_syntaktisch_ungueltigem_JSON_liefert_400_ProblemDetails()
    {
        using var antwort = await PostRohJsonAsync("""{ "name": "Coin Alpha", "herausgeber": """);

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Post_mit_Text_als_Auflage_liefert_400_ProblemDetails()
    {
        using var antwort = await PostRohJsonAsync("""{ "name": "Coin Alpha", "herausgeber": "Herausgeber Beta", "auflage": "viel" }""");

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Post_mit_Kommazahl_als_Auflage_liefert_400_ProblemDetails()
    {
        using var antwort = await PostRohJsonAsync("""{ "name": "Coin Alpha", "herausgeber": "Herausgeber Beta", "auflage": 1.5 }""");

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Post_mit_falschem_Typ_speichert_nichts()
    {
        using var antwort = await PostRohJsonAsync("""{ "name": "Coin Alpha", "herausgeber": "Herausgeber Beta", "auflage": "viel" }""");
        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);

        Assert.Empty(await LadeListeAsync());
    }

    [Fact]
    public async Task Post_ohne_JSON_Content_Type_liefert_415_ProblemDetails()
    {
        using var antwort = await Client.PostAsync(CoinsUrl,
            new StringContent("name=Coin Alpha", Encoding.UTF8, "text/plain"));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.UnsupportedMediaType);
    }

    // ---------- AK-8 / AK-15: Duplikate ----------

    [Fact]
    public async Task Post_Duplikat_liefert_409_ProblemDetails()
    {
        await LegeCoinAnAsync("Coin Alpha", "Herausgeber Beta");

        using var antwort = await PostCoinAsync(GueltigerCoin("Coin Alpha", "Herausgeber Beta"));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Post_Duplikat_liefert_Titel_Coin_existiert_bereits()
    {
        await LegeCoinAnAsync("Coin Alpha", "Herausgeber Beta");

        using var antwort = await PostCoinAsync(GueltigerCoin("Coin Alpha", "Herausgeber Beta"));
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.Conflict);

        Assert.Equal("Coin existiert bereits", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Post_Duplikat_in_anderer_Schreibweise_und_mit_Leerzeichen_liefert_409()
    {
        await LegeCoinAnAsync("Coin Alpha", "Herausgeber Beta");

        using var antwort = await PostCoinAsync(GueltigerCoin("  COIN alpha ", "herausgeber BETA  "));

        Assert.Equal(HttpStatusCode.Conflict, antwort.StatusCode);
    }

    [Fact]
    public async Task Post_Duplikat_speichert_keinen_weiteren_Coin()
    {
        await LegeCoinAnAsync("Coin Alpha", "Herausgeber Beta");

        using var antwort = await PostCoinAsync(GueltigerCoin("coin alpha", "Herausgeber Beta"));
        Assert.Equal(HttpStatusCode.Conflict, antwort.StatusCode);

        Assert.Single(await LadeListeAsync());
    }

    [Fact]
    public async Task Post_gleicher_Name_bei_anderem_Herausgeber_liefert_201()
    {
        await LegeCoinAnAsync("Coin Alpha", "Herausgeber Beta");

        using var antwort = await PostCoinAsync(GueltigerCoin("Coin Alpha", "Herausgeber Gamma"));

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Post_gleichzeitige_Duplikate_legen_genau_einen_Coin_an_und_liefern_sonst_409()
    {
        const int anzahl = 8;

        var antworten = await Task.WhenAll(Enumerable.Range(0, anzahl)
            .Select(_ => PostCoinAsync(GueltigerCoin("Coin Parallel", "Herausgeber Parallel"))));

        try
        {
            Assert.Single(antworten, a => a.StatusCode == HttpStatusCode.Created);
            Assert.Equal(anzahl - 1, antworten.Count(a => a.StatusCode == HttpStatusCode.Conflict));
            Assert.Single(await LadeListeAsync());
        }
        finally
        {
            foreach (var antwort in antworten)
            {
                antwort.Dispose();
            }
        }
    }

    [Fact]
    public async Task Post_gleichzeitige_Duplikate_liefern_409_als_ProblemDetails()
    {
        var antworten = await Task.WhenAll(Enumerable.Range(0, 6)
            .Select(_ => PostCoinAsync(GueltigerCoin("Coin Parallel", "Herausgeber Parallel"))));

        try
        {
            foreach (var antwort in antworten.Where(a => a.StatusCode != HttpStatusCode.Created))
            {
                await AssertProblemDetailsAsync(antwort, HttpStatusCode.Conflict);
            }
        }
        finally
        {
            foreach (var antwort in antworten)
            {
                antwort.Dispose();
            }
        }
    }

    // ---------- AK-16: Serverfelder werden ignoriert ----------

    [Fact]
    public async Task Post_ignoriert_mitgesendete_id()
    {
        var fremdeId = Guid.Parse("11111111-2222-3333-4444-555555555555");

        using var antwort = await Client.PostAsJsonAsync(CoinsUrl,
            new { id = fremdeId, name = "Coin Alpha", herausgeber = "Herausgeber Beta" });
        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);

        Assert.NotEqual(fremdeId, (await JsonAsync(antwort)).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Post_ignoriert_mitgesendetes_erstelltAm()
    {
        var vorher = DateTimeOffset.UtcNow.AddSeconds(-5);

        using var antwort = await Client.PostAsJsonAsync(CoinsUrl,
            new { erstelltAm = "2000-01-01T00:00:00+00:00", name = "Coin Alpha", herausgeber = "Herausgeber Beta" });
        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);

        var erstelltAm = (await JsonAsync(antwort)).GetProperty("erstelltAm").GetDateTimeOffset();
        Assert.True(erstelltAm >= vorher, $"erstelltAm {erstelltAm:O} stammt nicht vom Server.");
    }

    [Fact]
    public async Task Post_ignoriert_mitgesendete_bildUrl()
    {
        using var antwort = await Client.PostAsJsonAsync(CoinsUrl,
            new { bildUrl = "https://example.invalid/fremd.png", name = "Coin Alpha", herausgeber = "Herausgeber Beta" });
        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);

        Assert.Equal(JsonValueKind.Null, (await JsonAsync(antwort)).GetProperty("bildUrl").ValueKind);
    }
}
