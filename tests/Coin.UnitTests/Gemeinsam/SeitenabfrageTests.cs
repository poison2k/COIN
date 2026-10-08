using Coin.Domain.Gemeinsam;

namespace Coin.UnitTests.Gemeinsam;

/// <summary>
/// Feature katalog-seiten, AK-4 und Abschnitt 5.1: gemeinsame Validierung von Suche und Paging für die Benutzerliste,
/// das Audit-Log und den Coin-Katalog. Meldungen wörtlich wie bei <c>/api/benutzer</c>.
/// </summary>
public class SeitenabfrageTests
{
    private const string SeiteMeldung = "Die Seite muss mindestens 1 sein.";
    private const string GroesseMeldung = "Die Seitengröße muss zwischen 1 und 100 liegen.";
    private const string SucheMeldung = "Der Suchbegriff darf höchstens 100 Zeichen lang sein.";

    // ---------- Konstanten ----------

    [Fact]
    public void Kleinste_Seitengroesse_ist_1()
    {
        Assert.Equal(1, Seitenabfrage.GroesseMin);
    }

    [Fact]
    public void Groesste_Seitengroesse_ist_100()
    {
        Assert.Equal(100, Seitenabfrage.GroesseMax);
    }

    [Fact]
    public void Standard_Seitengroesse_ist_25()
    {
        Assert.Equal(25, Seitenabfrage.StandardGroesse);
    }

    [Fact]
    public void Suchbegriff_darf_hoechstens_100_Zeichen_lang_sein()
    {
        Assert.Equal(100, Seitenabfrage.SucheMaxLaenge);
    }

    // ---------- SeiteFehler ----------

    [Fact]
    public void SeiteFehler_ohne_Angaben_ist_leer()
    {
        Assert.Empty(Seitenabfrage.SeiteFehler(null, null));
    }

    [Theory]
    [InlineData(1, 1)]
    [InlineData(1, 100)]
    [InlineData(500, 25)]
    public void SeiteFehler_mit_gueltigen_Grenzwerten_ist_leer(int seite, int groesse)
    {
        Assert.Empty(Seitenabfrage.SeiteFehler(seite, groesse));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(int.MinValue)]
    public void SeiteFehler_meldet_eine_Seite_kleiner_1_woertlich(int seite)
    {
        var fehler = Seitenabfrage.SeiteFehler(seite, null);

        Assert.Equal([SeiteMeldung], Assert.Single(fehler, f => f.Key == "seite").Value);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(101)]
    [InlineData(-5)]
    public void SeiteFehler_meldet_eine_Groesse_ausserhalb_1_bis_100_woertlich(int groesse)
    {
        var fehler = Seitenabfrage.SeiteFehler(null, groesse);

        Assert.Equal([GroesseMeldung], Assert.Single(fehler, f => f.Key == "groesse").Value);
    }

    [Fact]
    public void SeiteFehler_meldet_Seite_und_Groesse_gemeinsam()
    {
        var fehler = Seitenabfrage.SeiteFehler(0, 101);

        Assert.Equal(["groesse", "seite"], fehler.Keys.Order(StringComparer.Ordinal).ToArray());
    }

    // ---------- Fehler (mit Suche) ----------

    [Fact]
    public void Fehler_ohne_Angaben_ist_leer()
    {
        Assert.Empty(Seitenabfrage.Fehler(null, null, null));
    }

    [Fact]
    public void Fehler_mit_Suchbegriff_von_genau_100_Zeichen_ist_leer()
    {
        Assert.Empty(Seitenabfrage.Fehler(new string('x', 100), 1, 25));
    }

    [Fact]
    public void Fehler_meldet_einen_Suchbegriff_mit_101_Zeichen_woertlich()
    {
        var fehler = Seitenabfrage.Fehler(new string('x', 101), null, null);

        Assert.Equal([SucheMeldung], Assert.Single(fehler, f => f.Key == "suche").Value);
    }

    [Fact]
    public void Fehler_prueft_die_Laenge_des_Suchbegriffs_nach_dem_Trimmen()
    {
        Assert.Empty(Seitenabfrage.Fehler($"   {new string('x', 100)}   ", null, null));
    }

    [Fact]
    public void Fehler_meldet_Suche_Seite_und_Groesse_gemeinsam()
    {
        var fehler = Seitenabfrage.Fehler(new string('x', 101), 0, 101);

        Assert.Equal(["groesse", "seite", "suche"], fehler.Keys.Order(StringComparer.Ordinal).ToArray());
    }

    [Fact]
    public void Fehler_meldet_Seite_und_Groesse_wie_SeiteFehler()
    {
        var fehler = Seitenabfrage.Fehler(null, 0, 0);

        Assert.Equal([SeiteMeldung], fehler["seite"]);
        Assert.Equal([GroesseMeldung], fehler["groesse"]);
    }

    // ---------- Suchbegriff ----------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t \n")]
    public void Suchbegriff_ist_ohne_Inhalt_null(string? suche)
    {
        Assert.Null(Seitenabfrage.Suchbegriff(suche));
    }

    [Fact]
    public void Suchbegriff_wird_getrimmt()
    {
        Assert.Equal("Coin Alpha", Seitenabfrage.Suchbegriff("  Coin Alpha  "));
    }

    [Fact]
    public void Suchbegriff_behaelt_Platzhalterzeichen_unveraendert()
    {
        Assert.Equal(@"100%_\x", Seitenabfrage.Suchbegriff(@" 100%_\x "));
    }
}
