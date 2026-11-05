using Coin.Domain.Ausgaben;

namespace Coin.UnitTests.Ausgaben;

/// <summary>
/// Feature hologrammnummer, AK-1 und Abschnitt 4 (ADR-0033 Punkt 4): <see cref="Hologrammnummer.Pruefen"/> liefert
/// keine Nummer, eine Nummer (Anzeigeform, Normalform) oder einen Fehler. Die Testvektoren aus Abschnitt 4.2 gelten
/// gleich lautend in Vitest (<c>web/src/entities/ausgabe/model/hologrammnummer.test.ts</c>).
/// Erwarteter Vertrag: <c>Hologrammnummer(string Anzeige, string Normalform)</c> mit <c>MaxLaenge = 40</c> und
/// <c>static HologrammnummerPruefung Pruefen(string?)</c>; <c>HologrammnummerPruefung</c> ist eine geschlossene
/// Ergebnisart mit <c>Keine</c>, <c>Gueltig(Hologrammnummer Nummer)</c> und <c>Ungueltig(string Meldung)</c>.
/// </summary>
public class HologrammnummerTests
{
    private const string Zeichenfehler =
        "Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.";

    private const string Laengenfehler = "Die Hologrammnummer darf höchstens 40 Zeichen lang sein.";

    private const string LeerFehler = "Die Hologrammnummer muss mindestens einen Buchstaben oder eine Ziffer enthalten.";

    private static Hologrammnummer Gueltig(string? eingabe) =>
        Assert.IsType<HologrammnummerPruefung.Gueltig>(Hologrammnummer.Pruefen(eingabe)).Nummer;

    private static string Fehler(string? eingabe) =>
        Assert.IsType<HologrammnummerPruefung.Ungueltig>(Hologrammnummer.Pruefen(eingabe)).Meldung;

    // ---------- Abschnitt 4.2: gültige Vektoren ----------

    public static TheoryData<string, string, string> GueltigeVektoren => new()
    {
        { "ab 12-34", "AB 12-34", "AB1234" },
        { "AB1234", "AB1234", "AB1234" },
        { "  AB– 12  34 ", "AB- 12 34", "AB1234" },
        { "ＡＢ１２３４", "AB1234", "AB1234" },
        { "AB​12­34", "AB1234", "AB1234" },
        { "ab\t12\n34", "AB 12 34", "AB1234" },
        { "AB−12", "AB-12", "AB12" },
        { new string('A', 40), new string('A', 40), new string('A', 40) },
        { string.Concat(Enumerable.Repeat("A-", 20)), string.Concat(Enumerable.Repeat("A-", 20)), new string('A', 20) },
    };

    [Theory]
    [MemberData(nameof(GueltigeVektoren))]
    public void Gueltiger_Vektor_ergibt_die_Anzeigeform(string eingabe, string anzeige, string normalform)
    {
        _ = normalform;

        Assert.Equal(anzeige, Gueltig(eingabe).Anzeige);
    }

    [Theory]
    [MemberData(nameof(GueltigeVektoren))]
    public void Gueltiger_Vektor_ergibt_die_Normalform(string eingabe, string anzeige, string normalform)
    {
        _ = anzeige;

        Assert.Equal(normalform, Gueltig(eingabe).Normalform);
    }

    // ---------- Abschnitt 4.2: Fehler ----------

    [Theory]
    [InlineData("AB/1234")]
    [InlineData("AB.1234")]
    [InlineData("Ä1234")]
    [InlineData("AB_1")]
    public void Unerlaubte_Zeichen_ergeben_den_Zeichenfehler(string eingabe)
    {
        Assert.Equal(Zeichenfehler, Fehler(eingabe));
    }

    [Theory]
    [InlineData("- -")]
    [InlineData("--")]
    public void Nur_Trennzeichen_ergeben_den_Fehler_leer_nach_Normalisierung(string eingabe)
    {
        Assert.Equal(LeerFehler, Fehler(eingabe));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Leer_oder_nur_Leerraum_ergibt_keine_Nummer(string? eingabe)
    {
        Assert.IsType<HologrammnummerPruefung.Keine>(Hologrammnummer.Pruefen(eingabe));
    }

    [Fact]
    public void Einundvierzig_Zeichen_ergeben_den_Laengenfehler()
    {
        Assert.Equal(Laengenfehler, Fehler(new string('A', 41)));
    }

    [Fact]
    public void Mehr_als_200_Zeichen_roh_ergeben_den_Laengenfehler_auch_wenn_nach_dem_Trimmen_wenig_bleibt()
    {
        Assert.Equal(Laengenfehler, Fehler(new string(' ', 201) + "A"));
    }

    [Fact]
    public void Genau_200_Zeichen_roh_werden_noch_normalisiert()
    {
        Assert.Equal("A", Gueltig(new string(' ', 199) + "A").Anzeige);
    }

    // ---------- Abschnitt 4.1: Prüfreihenfolge ----------

    [Fact]
    public void Zeichenfehler_geht_dem_Laengenfehler_vor()
    {
        Assert.Equal(Zeichenfehler, Fehler(new string('A', 41) + "/"));
    }

    [Fact]
    public void Laengenfehler_geht_dem_Fehler_leer_nach_Normalisierung_vor()
    {
        Assert.Equal(Laengenfehler, Fehler(new string('-', 41)));
    }

    [Fact]
    public void Rohlaenge_geht_dem_Zeichenfehler_vor()
    {
        Assert.Equal(Laengenfehler, Fehler(new string('/', 201)));
    }

    // ---------- Abschnitt 4.1, Schritt 3: weitere Unicode-Varianten (ADR-0033 Punkt 4) ----------

    [Theory]
    [InlineData("AB 1234", "AB 1234")]
    [InlineData("AB 1234", "AB 1234")]
    [InlineData("AB　1234", "AB 1234")]
    [InlineData("AB\r\n1234", "AB 1234")]
    public void Leerraumzeichen_werden_zu_einem_Leerzeichen(string eingabe, string anzeige)
    {
        Assert.Equal(anzeige, Gueltig(eingabe).Anzeige);
    }

    [Theory]
    [InlineData("AB‐1234")]
    [InlineData("AB‑1234")]
    [InlineData("AB—1234")]
    [InlineData("AB―1234")]
    [InlineData("AB﹣1234")]
    [InlineData("AB－1234")]
    public void Strichzeichen_der_Kategorie_Pd_werden_zum_Bindestrich(string eingabe)
    {
        Assert.Equal("AB-1234", Gueltig(eingabe).Anzeige);
    }

    [Theory]
    [InlineData("AB‌1234")]
    [InlineData("AB‍1234")]
    [InlineData("AB⁠1234")]
    [InlineData("﻿AB1234")]
    public void Formatzeichen_der_Kategorie_Cf_entfallen(string eingabe)
    {
        Assert.Equal("AB1234", Gueltig(eingabe).Anzeige);
    }

    [Fact]
    public void Kleinbuchstaben_werden_invariant_zu_Grossbuchstaben()
    {
        Assert.Equal("IXYZ", Gueltig("ixyz").Anzeige);
    }

    [Fact]
    public void Scharfes_s_ist_kein_erlaubtes_Zeichen()
    {
        Assert.Equal(Zeichenfehler, Fehler("STRAßE1"));
    }

    [Fact]
    public void Folgen_von_Leerzeichen_und_Bindestrichen_bleiben_in_der_Anzeigeform_einzeln_erhalten()
    {
        Assert.Equal("AB - 12", Gueltig("AB   -   12").Anzeige);
    }

    [Fact]
    public void Bindestriche_werden_in_der_Anzeigeform_nicht_zusammengefasst()
    {
        Assert.Equal("AB--12", Gueltig("AB--12").Anzeige);
    }

    [Fact]
    public void Gleiche_Nummer_in_verschiedenen_Schreibweisen_hat_dieselbe_Normalform()
    {
        Assert.Equal(Gueltig("AB1234").Normalform, Gueltig("ab 12-34").Normalform);
    }

    [Fact]
    public void Hoechstlaenge_ist_40()
    {
        Assert.Equal(40, Hologrammnummer.MaxLaenge);
    }

    [Fact]
    public void Eine_Nummer_mit_genau_40_Zeichen_Anzeigeform_samt_Trennern_ist_gueltig()
    {
        var eingabe = "AB-" + new string('1', 37);

        Assert.Equal(40, Gueltig(eingabe).Anzeige.Length);
    }

    [Fact]
    public void Anzeigeform_mit_41_Zeichen_durch_Trenner_ist_zu_lang()
    {
        Assert.Equal(Laengenfehler, Fehler("AB-" + new string('1', 38)));
    }
}
