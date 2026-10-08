using Coin.Domain;
using Coin.Domain.Gemeinsam;
using Coin.Domain.Katalog;
using Microsoft.Extensions.Time.Testing;

namespace Coin.UnitTests.Katalog;

/// <summary>
/// Use Cases des Katalogs (AK-1, AK-7, AK-8, AK-9 bis AK-11, AK-15 Duplikat-Rennen). Feature katalog-seiten (AK-1 bis
/// AK-4): <c>SuchenAsync</c> ersetzt <c>AuflistenAsync</c>.
/// </summary>
public class CoinKatalogServiceTests
{
    private static readonly DateTimeOffset Startzeit = new(2026, 10, 5, 9, 15, 0, TimeSpan.Zero);

    private readonly FakeCoinKatalogRepository _repository = new();
    private readonly FakeTimeProvider _zeit = new(Startzeit);
    private readonly CoinKatalogService _service;

    public CoinKatalogServiceTests()
    {
        _service = new CoinKatalogService(_repository, _zeit);
    }

    private Task<CoinAnlegenErgebnis> AnlegenAsync(
        string? name = "Coin Alpha",
        string? herausgeber = "Herausgeber Beta",
        int? auflage = null,
        string? beschreibung = null) =>
        _service.AnlegenAsync(name, herausgeber, auflage, beschreibung, CancellationToken.None);

    private async Task<CoinEintrag> LegeCoinAnAsync(string name = "Coin Alpha", string herausgeber = "Herausgeber Beta")
    {
        var ergebnis = await AnlegenAsync(name, herausgeber);
        return Assert.IsType<CoinAnlegenErgebnis.Angelegt>(ergebnis).Coin;
    }

    // ---------- AnlegenAsync ----------

    [Fact]
    public async Task AnlegenAsync_mit_gueltigen_Daten_liefert_Angelegt()
    {
        var ergebnis = await AnlegenAsync(auflage: 250, beschreibung: "Text");

        var angelegt = Assert.IsType<CoinAnlegenErgebnis.Angelegt>(ergebnis);
        Assert.Equal("Coin Alpha", angelegt.Coin.Name);
        Assert.Equal("Herausgeber Beta", angelegt.Coin.Herausgeber);
        Assert.Equal(250, angelegt.Coin.Auflage);
        Assert.Equal("Text", angelegt.Coin.Beschreibung);
        Assert.Null(angelegt.Coin.BildSha256);
    }

    [Fact]
    public async Task AnlegenAsync_speichert_den_Coin_im_Repository()
    {
        var coin = await LegeCoinAnAsync();

        var gespeichert = Assert.Single(_repository.Coins);
        Assert.Equal(coin.Id, gespeichert.Id);
    }

    [Fact]
    public async Task AnlegenAsync_setzt_ErstelltAm_aus_dem_TimeProvider()
    {
        _zeit.Advance(TimeSpan.FromMinutes(42));

        var coin = await LegeCoinAnAsync();

        Assert.Equal(Startzeit.AddMinutes(42), coin.ErstelltAm);
    }

    [Fact]
    public async Task AnlegenAsync_speichert_getrimmte_Werte()
    {
        var coin = await LegeCoinAnAsync("  Coin Alpha  ", " Herausgeber Beta ");

        Assert.Equal("Coin Alpha", coin.Name);
        Assert.Equal("Herausgeber Beta", coin.Herausgeber);
    }

    [Fact]
    public async Task AnlegenAsync_mit_ungueltigen_Daten_liefert_Ungueltig_mit_allen_Feldfehlern()
    {
        var ergebnis = await AnlegenAsync(name: " ", herausgeber: null, auflage: 0);

        var ungueltig = Assert.IsType<CoinAnlegenErgebnis.Ungueltig>(ergebnis);
        Assert.Equal(
            new[] { "auflage", "herausgeber", "name" },
            ungueltig.Fehler.Keys.Order(StringComparer.Ordinal).ToArray());
    }

    [Fact]
    public async Task AnlegenAsync_mit_ungueltigen_Daten_speichert_nichts()
    {
        await AnlegenAsync(name: "");

        Assert.Equal(0, _repository.AnzahlHinzufuegenAufrufe);
        Assert.Empty(_repository.Coins);
    }

    // ---------- AK-8: Duplikate ----------

    [Fact]
    public async Task AnlegenAsync_mit_gleichem_Namen_und_Herausgeber_liefert_Duplikat()
    {
        await LegeCoinAnAsync("Coin Alpha", "Herausgeber Beta");

        var ergebnis = await AnlegenAsync("Coin Alpha", "Herausgeber Beta");

        Assert.IsType<CoinAnlegenErgebnis.Duplikat>(ergebnis);
    }

    [Fact]
    public async Task AnlegenAsync_erkennt_Duplikat_ohne_Beachtung_von_Gross_und_Kleinschreibung()
    {
        await LegeCoinAnAsync("Coin Alpha", "Herausgeber Beta");

        var ergebnis = await AnlegenAsync("COIN ALPHA", "herausgeber beta");

        Assert.IsType<CoinAnlegenErgebnis.Duplikat>(ergebnis);
    }

    [Fact]
    public async Task AnlegenAsync_erkennt_Duplikat_nach_dem_Trimmen()
    {
        await LegeCoinAnAsync("Coin Alpha", "Herausgeber Beta");

        var ergebnis = await AnlegenAsync("  coin alpha ", " Herausgeber Beta  ");

        Assert.IsType<CoinAnlegenErgebnis.Duplikat>(ergebnis);
    }

    [Fact]
    public async Task AnlegenAsync_bei_Duplikat_speichert_keinen_weiteren_Coin()
    {
        await LegeCoinAnAsync("Coin Alpha", "Herausgeber Beta");

        await AnlegenAsync("Coin Alpha", "Herausgeber Beta");

        Assert.Single(_repository.Coins);
    }

    [Fact]
    public async Task AnlegenAsync_erlaubt_gleichen_Namen_bei_anderem_Herausgeber()
    {
        await LegeCoinAnAsync("Coin Alpha", "Herausgeber Beta");

        var ergebnis = await AnlegenAsync("Coin Alpha", "Herausgeber Gamma");

        Assert.IsType<CoinAnlegenErgebnis.Angelegt>(ergebnis);
        Assert.Equal(2, _repository.Coins.Count);
    }

    [Fact]
    public async Task AnlegenAsync_liefert_Duplikat_wenn_das_Repository_den_eindeutigen_Index_meldet()
    {
        _repository.HinzufuegenMeldetDuplikat = true;

        var ergebnis = await AnlegenAsync();

        Assert.IsType<CoinAnlegenErgebnis.Duplikat>(ergebnis);
    }

    // ---------- BildHochladenAsync ----------

    [Fact]
    public async Task BildHochladenAsync_mit_gueltigem_Bild_liefert_Gespeichert_mit_BildSha256()
    {
        var coin = await LegeCoinAnAsync();

        var ergebnis = await _service.BildHochladenAsync(coin.Id, Testbilder.Png(), CancellationToken.None);

        var gespeichert = Assert.IsType<BildHochladenErgebnis.Gespeichert>(ergebnis);
        Assert.Equal(coin.Id, gespeichert.Coin.Id);
        Assert.NotNull(gespeichert.Coin.BildSha256);
    }

    [Fact]
    public async Task BildHochladenAsync_speichert_das_Bild_im_Repository()
    {
        var coin = await LegeCoinAnAsync();
        var inhalt = Testbilder.Jpeg(500);

        await _service.BildHochladenAsync(coin.Id, inhalt, CancellationToken.None);

        var bild = Assert.Contains(coin.Id, _repository.Bilder);
        Assert.Equal(inhalt, bild.Inhalt);
        Assert.Equal(BildFormat.Jpeg, bild.Format);
    }

    [Fact]
    public async Task BildHochladenAsync_setzt_HochgeladenAm_aus_dem_TimeProvider()
    {
        var coin = await LegeCoinAnAsync();
        _zeit.Advance(TimeSpan.FromHours(3));

        await _service.BildHochladenAsync(coin.Id, Testbilder.Webp(), CancellationToken.None);

        Assert.Equal(Startzeit.AddHours(3), _repository.Bilder[coin.Id].HochgeladenAm);
    }

    [Fact]
    public async Task BildHochladenAsync_ersetzt_ein_vorhandenes_Bild()
    {
        var coin = await LegeCoinAnAsync();
        await _service.BildHochladenAsync(coin.Id, Testbilder.Png(), CancellationToken.None);
        var neuerInhalt = Testbilder.Jpeg(777);

        await _service.BildHochladenAsync(coin.Id, neuerInhalt, CancellationToken.None);

        Assert.Equal(neuerInhalt, _repository.Bilder[coin.Id].Inhalt);
    }

    [Fact]
    public async Task BildHochladenAsync_fuer_unbekannten_Coin_liefert_CoinNichtGefunden()
    {
        var ergebnis = await _service.BildHochladenAsync(Guid.NewGuid(), Testbilder.Png(), CancellationToken.None);

        Assert.IsType<BildHochladenErgebnis.CoinNichtGefunden>(ergebnis);
    }

    [Fact]
    public async Task BildHochladenAsync_fuer_unbekannten_Coin_speichert_nichts()
    {
        await _service.BildHochladenAsync(Guid.NewGuid(), Testbilder.Png(), CancellationToken.None);

        Assert.Equal(0, _repository.AnzahlBildSpeichernAufrufe);
    }

    [Fact]
    public async Task BildHochladenAsync_mit_leerem_Inhalt_liefert_Leer()
    {
        var coin = await LegeCoinAnAsync();

        var ergebnis = await _service.BildHochladenAsync(coin.Id, [], CancellationToken.None);

        Assert.IsType<BildHochladenErgebnis.Leer>(ergebnis);
    }

    [Fact]
    public async Task BildHochladenAsync_mit_mehr_als_5_MiB_liefert_ZuGross()
    {
        var coin = await LegeCoinAnAsync();

        var ergebnis = await _service.BildHochladenAsync(coin.Id, Testbilder.Jpeg(5_242_881), CancellationToken.None);

        Assert.IsType<BildHochladenErgebnis.ZuGross>(ergebnis);
    }

    [Fact]
    public async Task BildHochladenAsync_mit_GIF_liefert_FormatNichtUnterstuetzt()
    {
        var coin = await LegeCoinAnAsync();

        var ergebnis = await _service.BildHochladenAsync(coin.Id, Testbilder.Gif(), CancellationToken.None);

        Assert.IsType<BildHochladenErgebnis.FormatNichtUnterstuetzt>(ergebnis);
    }

    [Fact]
    public async Task BildHochladenAsync_mit_ungueltigem_Bild_laesst_vorhandenes_Bild_unveraendert()
    {
        var coin = await LegeCoinAnAsync();
        var original = Testbilder.Png(128);
        await _service.BildHochladenAsync(coin.Id, original, CancellationToken.None);

        await _service.BildHochladenAsync(coin.Id, Testbilder.Svg(), CancellationToken.None);

        Assert.Equal(original, _repository.Bilder[coin.Id].Inhalt);
        Assert.Equal(1, _repository.AnzahlBildSpeichernAufrufe);
    }

    // ---------- Lesen ----------

    // ---------- katalog-seiten, AK-1 bis AK-4: SuchenAsync ersetzt AuflistenAsync ----------

    private Task<Ergebnis<Seite<CoinEintrag>>> SuchenAsync(string? suche = null, int? seite = null, int? groesse = null) =>
        _service.SuchenAsync(suche, seite, groesse, CancellationToken.None);

    [Fact]
    public async Task SuchenAsync_ohne_Parameter_fragt_Seite_1_mit_25_Eintraegen_ab()
    {
        await SuchenAsync();

        Assert.Equal(((string?)null, 1, 25), _repository.LetzteSuche!.Value);
    }

    [Fact]
    public async Task SuchenAsync_reicht_Seite_und_Groesse_an_das_Repository_weiter()
    {
        await SuchenAsync(seite: 3, groesse: 10);

        Assert.Equal(((string?)null, 3, 10), _repository.LetzteSuche!.Value);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task SuchenAsync_gibt_eine_leere_Suche_als_null_weiter(string suche)
    {
        await SuchenAsync(suche);

        Assert.Equal(1, _repository.AnzahlSuchenAufrufe);
        Assert.Null(_repository.LetzteSuche?.Suche);
    }

    [Fact]
    public async Task SuchenAsync_gibt_den_Suchbegriff_getrimmt_weiter()
    {
        await SuchenAsync("  Alpha  ");

        Assert.Equal("Alpha", _repository.LetzteSuche?.Suche);
    }

    [Fact]
    public async Task SuchenAsync_liefert_die_Seite_des_Repositorys()
    {
        await LegeCoinAnAsync("Coin Alpha");
        await LegeCoinAnAsync("Coin Beta");

        var ergebnis = await SuchenAsync();

        Assert.True(ergebnis.IstErfolgreich);
        Assert.Equal(["Coin Alpha", "Coin Beta"], ergebnis.Wert!.Eintraege.Select(c => c.Name).ToArray());
        Assert.Equal(2, ergebnis.Wert.Gesamt);
    }

    [Fact]
    public async Task SuchenAsync_liefert_nur_die_Treffer_zum_Suchbegriff()
    {
        await LegeCoinAnAsync("Coin Alpha", "Herausgeber Nord");
        await LegeCoinAnAsync("Coin Beta", "Herausgeber Nord");

        var ergebnis = await SuchenAsync("beta");

        Assert.Equal(["Coin Beta"], ergebnis.Wert!.Eintraege.Select(c => c.Name).ToArray());
    }

    [Fact]
    public async Task SuchenAsync_mit_Seite_0_liefert_einen_Fehler_an_seite()
    {
        var ergebnis = await SuchenAsync(seite: 0);

        Assert.False(ergebnis.IstErfolgreich);
        Assert.Equal(["Die Seite muss mindestens 1 sein."], ergebnis.Fehler["seite"]);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(101)]
    public async Task SuchenAsync_mit_Groesse_ausserhalb_1_bis_100_liefert_einen_Fehler_an_groesse(int groesse)
    {
        var ergebnis = await SuchenAsync(groesse: groesse);

        Assert.Equal(["Die Seitengröße muss zwischen 1 und 100 liegen."], ergebnis.Fehler["groesse"]);
    }

    [Fact]
    public async Task SuchenAsync_mit_101_Zeichen_liefert_einen_Fehler_an_suche()
    {
        var ergebnis = await SuchenAsync(new string('x', 101));

        Assert.Equal(["Der Suchbegriff darf höchstens 100 Zeichen lang sein."], ergebnis.Fehler["suche"]);
    }

    [Fact]
    public async Task SuchenAsync_akzeptiert_100_Zeichen_nach_dem_Trimmen()
    {
        var ergebnis = await SuchenAsync($"  {new string('x', 100)}  ");

        Assert.True(ergebnis.IstErfolgreich);
    }

    [Fact]
    public async Task SuchenAsync_meldet_mehrere_Fehler_gemeinsam()
    {
        var ergebnis = await SuchenAsync(new string('x', 101), 0, 101);

        Assert.Equal(["groesse", "seite", "suche"], ergebnis.Fehler.Keys.Order(StringComparer.Ordinal).ToArray());
    }

    [Fact]
    public async Task SuchenAsync_fragt_bei_ungueltigen_Eingaben_das_Repository_nicht_ab()
    {
        await SuchenAsync(seite: 0);

        Assert.Equal(0, _repository.AnzahlSuchenAufrufe);
    }

    [Fact]
    public async Task FindenAsync_liefert_den_Coin_zur_Id()
    {
        var coin = await LegeCoinAnAsync();

        var gefunden = await _service.FindenAsync(coin.Id, CancellationToken.None);

        Assert.NotNull(gefunden);
        Assert.Equal(coin.Id, gefunden!.Id);
    }

    [Fact]
    public async Task FindenAsync_fuer_unbekannte_Id_liefert_null()
    {
        var gefunden = await _service.FindenAsync(Guid.NewGuid(), CancellationToken.None);

        Assert.Null(gefunden);
    }

    [Fact]
    public async Task BildLadenAsync_liefert_das_gespeicherte_Bild()
    {
        var coin = await LegeCoinAnAsync();
        var inhalt = Testbilder.Webp(256);
        await _service.BildHochladenAsync(coin.Id, inhalt, CancellationToken.None);

        var bild = await _service.BildLadenAsync(coin.Id, CancellationToken.None);

        Assert.NotNull(bild);
        Assert.Equal(inhalt, bild!.Inhalt);
    }

    [Fact]
    public async Task BildLadenAsync_fuer_Coin_ohne_Bild_liefert_null()
    {
        var coin = await LegeCoinAnAsync();

        var bild = await _service.BildLadenAsync(coin.Id, CancellationToken.None);

        Assert.Null(bild);
    }
}
