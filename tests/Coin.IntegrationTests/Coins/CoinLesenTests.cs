using System.Net;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Coins;

/// <summary>
/// GET /api/coins und GET /api/coins/{id}: AK-9, AK-17, AK-18. Seit katalog-seiten (AK-1, Entscheidung F7) liefert die
/// Liste das Seiten-Format; Suche und Paging prüft <see cref="CoinSucheTests"/>.
/// </summary>
public class CoinLesenTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    // ---------- AK-17: Liste ----------

    [Fact]
    public async Task GetListe_ohne_Coins_liefert_eine_leere_erste_Seite()
    {
        using var antwort = await Anonym.GetAsync(CoinsUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("application/json", antwort.Content.Headers.ContentType?.MediaType);
        Assert.Equal(
            """{"eintraege":[],"gesamt":0,"seite":1,"groesse":25}""",
            (await antwort.Content.ReadAsStringAsync()).Trim());
    }

    [Fact]
    public async Task GetListe_liefert_alle_angelegten_Coins()
    {
        await LegeCoinAnAsync("Coin Alpha");
        await LegeCoinAnAsync("Coin Beta");
        await LegeCoinAnAsync("Coin Gamma");

        var liste = await LadeListeAsync();

        Assert.Equal(3, liste.Length);
    }

    [Fact]
    public async Task GetListe_sortiert_nach_Name_aufsteigend_ohne_Beachtung_der_Schreibweise()
    {
        await LegeCoinAnAsync("zulu");
        await LegeCoinAnAsync("Alpha");
        await LegeCoinAnAsync("bravo");
        await LegeCoinAnAsync("Charlie");

        var namen = (await LadeListeAsync()).Select(c => c.GetProperty("name").GetString() ?? "").ToArray();

        Assert.Equal(new[] { "Alpha", "bravo", "Charlie", "zulu" }, namen);
    }

    [Fact]
    public async Task GetListe_enthaelt_bildUrl_null_fuer_Coin_ohne_Bild()
    {
        await LegeCoinAnAsync();

        var eintrag = Assert.Single(await LadeListeAsync());

        Assert.Equal(JsonValueKind.Null, eintrag.GetProperty("bildUrl").ValueKind);
    }

    [Fact]
    public async Task GetListe_enthaelt_bildUrl_fuer_Coin_mit_Bild()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var hochgeladen = await LadeBildHochAsync(id, Testbilder.Png());

        var eintrag = Assert.Single(await LadeListeAsync());

        Assert.Equal(hochgeladen.GetProperty("bildUrl").GetString(), eintrag.GetProperty("bildUrl").GetString());
    }

    [Fact]
    public async Task GetListe_enthaelt_keine_Bilddaten()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        await LadeBildHochAsync(id, Testbilder.Png(4096));

        var eintrag = Assert.Single(await LadeListeAsync());

        var felder = eintrag.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(
            new[] { "auflage", "beschreibung", "bildUrl", "erstelltAm", "herausgeber", "id", "name" },
            felder);
    }

    // ---------- AK-18: Einzelabruf ----------

    [Fact]
    public async Task GetEinzeln_liefert_200_mit_dem_Coin()
    {
        var angelegt = await LegeCoinAnAsync("Coin Alpha", "Herausgeber Beta", 250, "Ein Text");
        var id = angelegt.GetProperty("id").GetGuid();

        using var antwort = await Anonym.GetAsync($"{CoinsUrl}/{id}");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        var coin = await JsonAsync(antwort);
        Assert.Equal(id, coin.GetProperty("id").GetGuid());
        Assert.Equal("Coin Alpha", coin.GetProperty("name").GetString());
        Assert.Equal("Herausgeber Beta", coin.GetProperty("herausgeber").GetString());
        Assert.Equal(250, coin.GetProperty("auflage").GetInt32());
        Assert.Equal("Ein Text", coin.GetProperty("beschreibung").GetString());
        Assert.Equal(
            angelegt.GetProperty("erstelltAm").GetDateTimeOffset(),
            coin.GetProperty("erstelltAm").GetDateTimeOffset());
    }

    [Fact]
    public async Task GetEinzeln_fuer_unbekannte_Id_liefert_404_ProblemDetails()
    {
        await LegeCoinAnAsync();

        using var antwort = await Anonym.GetAsync($"{CoinsUrl}/{Guid.NewGuid()}");

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
    }

    [Theory]
    [InlineData("keine-guid")]
    [InlineData("123")]
    public async Task GetEinzeln_mit_ungueltiger_Id_liefert_404(string id)
    {
        using var antwort = await Anonym.GetAsync($"{CoinsUrl}/{id}");

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Fact]
    public async Task GetEinzeln_liefert_bildUrl_mit_Versionsparameter_aus_dem_Hash()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var inhalt = Testbilder.Jpeg(1024);
        await LadeBildHochAsync(id, inhalt);
        var sha = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(inhalt));

        using var antwort = await Anonym.GetAsync($"{CoinsUrl}/{id}");
        var coin = await JsonAsync(antwort);

        Assert.Equal($"/api/coins/{id}/bild?v={sha[..16]}", coin.GetProperty("bildUrl").GetString());
    }
}
