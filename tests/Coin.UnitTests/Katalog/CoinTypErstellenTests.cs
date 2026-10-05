using Coin.Domain;
using Coin.Domain.Katalog;

namespace Coin.UnitTests.Katalog;

/// <summary>AK-1 bis AK-7: Fabrikmethode <see cref="CoinTyp.Erstellen"/>.</summary>
public class CoinTypErstellenTests
{
    private static readonly DateTimeOffset Jetzt = new(2026, 10, 5, 9, 15, 0, TimeSpan.Zero);

    private static Ergebnis<CoinTyp> Erstellen(
        string? name = "Einsatzkontingent Beispiel 2025",
        string? herausgeber = "Beispielbataillon 1",
        int? auflage = null,
        string? beschreibung = null,
        DateTimeOffset? jetzt = null) =>
        CoinTyp.Erstellen(name, herausgeber, auflage, beschreibung, jetzt ?? Jetzt);

    private static CoinTyp ErstelleGueltig(
        string? name = "Einsatzkontingent Beispiel 2025",
        string? herausgeber = "Beispielbataillon 1",
        int? auflage = null,
        string? beschreibung = null)
    {
        var ergebnis = Erstellen(name, herausgeber, auflage, beschreibung);
        Assert.True(ergebnis.IstErfolgreich, "Erwartet: gültiger Coin. Fehler: " + string.Join(", ", ergebnis.Fehler.Keys));
        Assert.NotNull(ergebnis.Wert);
        return ergebnis.Wert!;
    }

    private static void AssertNurFehlerFuer(Ergebnis<CoinTyp> ergebnis, string feld)
    {
        Assert.False(ergebnis.IstErfolgreich);
        Assert.Null(ergebnis.Wert);
        Assert.Equal([feld], ergebnis.Fehler.Keys.ToArray());
        Assert.NotEmpty(ergebnis.Fehler[feld]);
        Assert.All(ergebnis.Fehler[feld], m => Assert.False(string.IsNullOrWhiteSpace(m)));
    }

    // ---------- AK-1: gültiger Coin ----------

    [Fact]
    public void Erstellen_mit_Name_und_Herausgeber_ist_erfolgreich()
    {
        var ergebnis = Erstellen();

        Assert.True(ergebnis.IstErfolgreich);
        Assert.NotNull(ergebnis.Wert);
        Assert.Empty(ergebnis.Fehler);
    }

    [Fact]
    public void Erstellen_uebernimmt_Name_und_Herausgeber()
    {
        var coin = ErstelleGueltig(name: "Coin Alpha", herausgeber: "Herausgeber Beta");

        Assert.Equal("Coin Alpha", coin.Name);
        Assert.Equal("Herausgeber Beta", coin.Herausgeber);
    }

    [Fact]
    public void Erstellen_ohne_optionale_Felder_setzt_Auflage_Beschreibung_und_Bild_auf_null()
    {
        var coin = ErstelleGueltig(auflage: null, beschreibung: null);

        Assert.Null(coin.Auflage);
        Assert.Null(coin.Beschreibung);
        Assert.Null(coin.Bild);
    }

    [Fact]
    public void Erstellen_mit_allen_Feldern_uebernimmt_Auflage_und_Beschreibung()
    {
        var coin = ErstelleGueltig(auflage: 500, beschreibung: "Ein Beschreibungstext");

        Assert.Equal(500, coin.Auflage);
        Assert.Equal("Ein Beschreibungstext", coin.Beschreibung);
    }

    [Fact]
    public void Erstellen_erzeugt_eine_nicht_leere_Id()
    {
        var coin = ErstelleGueltig();

        Assert.NotEqual(Guid.Empty, coin.Id);
    }

    [Fact]
    public void Erstellen_erzeugt_eine_Guid_Version_7()
    {
        var coin = ErstelleGueltig();

        Assert.Equal(7, coin.Id.Version);
    }

    [Fact]
    public void Erstellen_erzeugt_fuer_jeden_Coin_eine_andere_Id()
    {
        var erster = ErstelleGueltig();
        var zweiter = ErstelleGueltig();

        Assert.NotEqual(erster.Id, zweiter.Id);
    }

    [Fact]
    public void Erstellen_setzt_ErstelltAm_auf_den_uebergebenen_Zeitpunkt()
    {
        var coin = ErstelleGueltig();

        Assert.Equal(Jetzt, coin.ErstelltAm);
    }

    [Fact]
    public void Erstellen_speichert_ErstelltAm_in_UTC_auch_bei_lokalem_Zeitpunkt()
    {
        var lokal = new DateTimeOffset(2026, 10, 5, 11, 15, 0, TimeSpan.FromHours(2));

        var coin = Erstellen(jetzt: lokal).Wert!;

        Assert.Equal(TimeSpan.Zero, coin.ErstelltAm.Offset);
        Assert.Equal(lokal.UtcDateTime, coin.ErstelltAm.UtcDateTime);
    }

    // ---------- AK-2: Name ----------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("   \t  ")]
    public void Erstellen_ohne_Name_meldet_Fehler_fuer_name(string? name)
    {
        var ergebnis = Erstellen(name: name);

        AssertNurFehlerFuer(ergebnis, "name");
    }

    [Fact]
    public void Erstellen_mit_Name_aus_einem_Zeichen_ist_gueltig()
    {
        var coin = ErstelleGueltig(name: "A");

        Assert.Equal("A", coin.Name);
    }

    [Fact]
    public void Erstellen_mit_Name_aus_200_Zeichen_ist_gueltig()
    {
        var name = new string('n', 200);

        var coin = ErstelleGueltig(name: name);

        Assert.Equal(name, coin.Name);
    }

    [Fact]
    public void Erstellen_mit_Name_aus_201_Zeichen_meldet_Fehler_fuer_name()
    {
        var ergebnis = Erstellen(name: new string('n', 201));

        AssertNurFehlerFuer(ergebnis, "name");
    }

    // ---------- AK-3: Herausgeber ----------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("    ")]
    public void Erstellen_ohne_Herausgeber_meldet_Fehler_fuer_herausgeber(string? herausgeber)
    {
        var ergebnis = Erstellen(herausgeber: herausgeber);

        AssertNurFehlerFuer(ergebnis, "herausgeber");
    }

    [Fact]
    public void Erstellen_mit_Herausgeber_aus_einem_Zeichen_ist_gueltig()
    {
        var coin = ErstelleGueltig(herausgeber: "H");

        Assert.Equal("H", coin.Herausgeber);
    }

    [Fact]
    public void Erstellen_mit_Herausgeber_aus_200_Zeichen_ist_gueltig()
    {
        var herausgeber = new string('h', 200);

        var coin = ErstelleGueltig(herausgeber: herausgeber);

        Assert.Equal(herausgeber, coin.Herausgeber);
    }

    [Fact]
    public void Erstellen_mit_Herausgeber_aus_201_Zeichen_meldet_Fehler_fuer_herausgeber()
    {
        var ergebnis = Erstellen(herausgeber: new string('h', 201));

        AssertNurFehlerFuer(ergebnis, "herausgeber");
    }

    // ---------- AK-4: Auflage ----------

    [Fact]
    public void Erstellen_mit_Auflage_null_speichert_null()
    {
        var coin = ErstelleGueltig(auflage: null);

        Assert.Null(coin.Auflage);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(1_000_000)]
    public void Erstellen_mit_Auflage_an_der_Grenze_ist_gueltig(int auflage)
    {
        var coin = ErstelleGueltig(auflage: auflage);

        Assert.Equal(auflage, coin.Auflage);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(1_000_001)]
    [InlineData(int.MinValue)]
    [InlineData(int.MaxValue)]
    public void Erstellen_mit_Auflage_ausserhalb_1_bis_1000000_meldet_Fehler_fuer_auflage(int auflage)
    {
        var ergebnis = Erstellen(auflage: auflage);

        AssertNurFehlerFuer(ergebnis, "auflage");
    }

    // ---------- AK-5: Beschreibung ----------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Erstellen_mit_leerer_Beschreibung_speichert_null(string? beschreibung)
    {
        var coin = ErstelleGueltig(beschreibung: beschreibung);

        Assert.Null(coin.Beschreibung);
    }

    [Fact]
    public void Erstellen_mit_Beschreibung_aus_2000_Zeichen_ist_gueltig()
    {
        var beschreibung = new string('b', 2000);

        var coin = ErstelleGueltig(beschreibung: beschreibung);

        Assert.Equal(beschreibung, coin.Beschreibung);
    }

    [Fact]
    public void Erstellen_mit_Beschreibung_aus_2001_Zeichen_meldet_Fehler_fuer_beschreibung()
    {
        var ergebnis = Erstellen(beschreibung: new string('b', 2001));

        AssertNurFehlerFuer(ergebnis, "beschreibung");
    }

    // ---------- AK-6: Trimmen ----------

    [Fact]
    public void Erstellen_entfernt_Leerzeichen_am_Rand_des_Namens()
    {
        var coin = ErstelleGueltig(name: "  Coin Alpha  ");

        Assert.Equal("Coin Alpha", coin.Name);
    }

    [Fact]
    public void Erstellen_entfernt_Leerzeichen_am_Rand_des_Herausgebers()
    {
        var coin = ErstelleGueltig(herausgeber: "\tHerausgeber Beta ");

        Assert.Equal("Herausgeber Beta", coin.Herausgeber);
    }

    [Fact]
    public void Erstellen_entfernt_Leerzeichen_am_Rand_der_Beschreibung()
    {
        var coin = ErstelleGueltig(beschreibung: "  Text mit Rand  ");

        Assert.Equal("Text mit Rand", coin.Beschreibung);
    }

    [Fact]
    public void Erstellen_laesst_Leerzeichen_innerhalb_des_Namens_unveraendert()
    {
        var coin = ErstelleGueltig(name: "Coin   mit  Abstand");

        Assert.Equal("Coin   mit  Abstand", coin.Name);
    }

    [Fact]
    public void Erstellen_prueft_Laenge_des_Namens_nach_dem_Trimmen()
    {
        var name = new string('n', 200);

        var coin = ErstelleGueltig(name: "  " + name + "  ");

        Assert.Equal(name, coin.Name);
    }

    [Fact]
    public void Erstellen_prueft_Laenge_des_Herausgebers_nach_dem_Trimmen()
    {
        var herausgeber = new string('h', 200);

        var coin = ErstelleGueltig(herausgeber: " " + herausgeber + " ");

        Assert.Equal(herausgeber, coin.Herausgeber);
    }

    [Fact]
    public void Erstellen_prueft_Laenge_der_Beschreibung_nach_dem_Trimmen()
    {
        var beschreibung = new string('b', 2000);

        var coin = ErstelleGueltig(beschreibung: "   " + beschreibung + "   ");

        Assert.Equal(beschreibung, coin.Beschreibung);
    }

    // ---------- AK-7: mehrere Fehler gemeinsam ----------

    [Fact]
    public void Erstellen_meldet_alle_ungueltigen_Felder_gemeinsam()
    {
        var ergebnis = Erstellen(name: "", herausgeber: " ", auflage: 0, beschreibung: new string('b', 2001));

        Assert.False(ergebnis.IstErfolgreich);
        Assert.Null(ergebnis.Wert);
        Assert.Equal(
            new[] { "auflage", "beschreibung", "herausgeber", "name" },
            ergebnis.Fehler.Keys.Order(StringComparer.Ordinal).ToArray());
    }

    [Fact]
    public void Erstellen_meldet_zu_jedem_Feldfehler_eine_nicht_leere_Meldung()
    {
        var ergebnis = Erstellen(name: null, herausgeber: null, auflage: -5);

        Assert.All(ergebnis.Fehler, eintrag =>
        {
            Assert.NotEmpty(eintrag.Value);
            Assert.All(eintrag.Value, m => Assert.False(string.IsNullOrWhiteSpace(m)));
        });
    }

    // ---------- Grenzwerte als Konstanten ----------

    [Fact]
    public void Grenzwerte_sind_als_Konstanten_veroeffentlicht()
    {
        Assert.Equal(200, CoinTyp.NameMaxLaenge);
        Assert.Equal(200, CoinTyp.HerausgeberMaxLaenge);
        Assert.Equal(2000, CoinTyp.BeschreibungMaxLaenge);
        Assert.Equal(1, CoinTyp.AuflageMin);
        Assert.Equal(1_000_000, CoinTyp.AuflageMax);
    }
}
