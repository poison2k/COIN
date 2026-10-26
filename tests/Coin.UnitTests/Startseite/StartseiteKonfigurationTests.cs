using static Coin.UnitTests.Startseite.StartseiteDomain;

namespace Coin.UnitTests.Startseite;

/// <summary>
/// Feature startseite, AK-1, AK-9 und Abschnitt 5.5 (ADR-0030 Punkt 1/2): Standardkonfiguration aus dem Code, Validierung
/// mit den Meldungen aus 5.5 (Längen, Anzahl 3–12 bzw. 3–10, Reihenfolge als Permutation, Steuerzeichen, Pflichttexte nur
/// bei aktivem Block), Trimmen und Zeilenenden; Abbildung auf die öffentliche Kopfansicht (AK-37, Rev. 2).
/// </summary>
public class StartseiteKonfigurationTests
{
    private const string ReihenfolgeFehler = "Die Reihenfolge muss jeden Block genau einmal enthalten.";
    private const string Steuerzeichen = "Der Text enthält unzulässige Steuerzeichen.";

    private static readonly Werte Gueltig = new();

    private static IReadOnlyDictionary<string, string[]> Fehler(Werte werte)
    {
        var (wert, fehler) = Pruefen(werte);
        Assert.True(wert is null, "Pruefen sollte scheitern, lieferte aber einen Wert.");
        return fehler;
    }

    private static Werte Erfolg(Werte werte)
    {
        var (wert, fehler) = Pruefen(werte);
        Assert.True(wert is not null, $"Pruefen scheiterte: {string.Join("; ", fehler.Select(f => $"{f.Key}: {string.Join(" | ", f.Value)}"))}");
        return wert!;
    }

    private static void AssertFehler(Werte werte, string feld, string meldung)
    {
        var fehler = Fehler(werte);
        Assert.True(fehler.TryGetValue(feld, out var meldungen), $"Kein Fehler für „{feld}“, sondern für: {string.Join(", ", fehler.Keys)}");
        Assert.Equal([meldung], meldungen);
    }

    // ---------- AK-1: Standardkonfiguration ----------

    [Fact]
    public void Standard_hat_die_Reihenfolge_kopf_infotext_kennzahlen_neueste_meistausgegeben()
    {
        Assert.Equal(["kopf", "infotext", "kennzahlen", "neueste", "meistausgegeben"], Lesen(Standard()).Reihenfolge);
    }

    [Fact]
    public void Standard_hat_den_Kopfbereich_ausgeschaltet()
    {
        Assert.False(Lesen(Standard()).KopfAktiv);
    }

    [Fact]
    public void Standard_hat_Titel_und_Untertitel_aus_AK_1()
    {
        var standard = Lesen(Standard());

        Assert.Equal(("C.O.I.N.", "Certified Official Issue Numbering"), (standard.Titel, standard.Untertitel));
    }

    [Fact]
    public void Standard_hat_keine_Logos()
    {
        var standard = Lesen(Standard());

        Assert.Equal((null, null), (standard.LogoBereitsteller, standard.LogoSoftware));
    }

    [Fact]
    public void Standard_hat_den_Infotext_aus_AK_1_eingeschaltet()
    {
        var standard = Lesen(Standard());

        Assert.True(standard.InfotextAktiv);
        Assert.Equal(StandardInfotext, standard.Infotext);
    }

    [Fact]
    public void Standard_hat_Kennzahlen_eingeschaltet()
    {
        Assert.True(Lesen(Standard()).KennzahlenAktiv);
    }

    [Fact]
    public void Standard_hat_Neueste_eingeschaltet_mit_Anzahl_6()
    {
        var standard = Lesen(Standard());

        Assert.Equal((true, 6), (standard.NeuesteAktiv, standard.NeuesteAnzahl));
    }

    [Fact]
    public void Standard_hat_Meistausgegebene_eingeschaltet_mit_Anzahl_5()
    {
        var standard = Lesen(Standard());

        Assert.Equal((true, 5), (standard.MeistausgegebeneAktiv, standard.MeistausgegebeneAnzahl));
    }

    [Fact]
    public void Standard_besteht_die_eigene_Pruefung()
    {
        var geprueft = Erfolg(Lesen(Standard()));

        Assert.Equal(StandardInfotext, geprueft.Infotext);
    }

    // ---------- Reihenfolge als Permutation ----------

    [Fact]
    public void Eine_andere_Permutation_der_fuenf_Bloecke_ist_gueltig()
    {
        string[] folge = ["meistausgegeben", "neueste", "kennzahlen", "infotext", "kopf"];

        Assert.Equal(folge, Erfolg(Gueltig with { Reihenfolge = folge }).Reihenfolge);
    }

    public static TheoryData<string[]> UngueltigeFolgen => new()
    {
        new[] { "kopf", "infotext", "kennzahlen", "neueste" },
        new[] { "kopf", "infotext", "kennzahlen", "neueste", "meistausgegeben", "kopf" },
        new[] { "kopf", "kopf", "kennzahlen", "neueste", "meistausgegeben" },
        Array.Empty<string>(),
    };

    [Theory]
    [MemberData(nameof(UngueltigeFolgen))]
    public void Reihenfolge_ohne_jeden_Block_genau_einmal_wird_abgelehnt(string[] folge)
    {
        AssertFehler(Gueltig with { Reihenfolge = folge }, "reihenfolge", ReihenfolgeFehler);
    }

    // ---------- Kopfbereich ----------

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Aktiver_Kopfbereich_ohne_Titel_wird_abgelehnt(string titel)
    {
        AssertFehler(Gueltig with { KopfAktiv = true, Titel = titel }, "kopf.titel", "Bitte einen Titel eingeben oder den Kopfbereich ausschalten.");
    }

    [Fact]
    public void Inaktiver_Kopfbereich_ohne_Titel_ist_gueltig()
    {
        Assert.Equal(string.Empty, Erfolg(Gueltig with { KopfAktiv = false, Titel = "" }).Titel);
    }

    [Fact]
    public void Titel_mit_100_Zeichen_ist_gueltig()
    {
        Assert.Equal(100, Erfolg(Gueltig with { KopfAktiv = true, Titel = new string('T', 100) }).Titel.Length);
    }

    [Fact]
    public void Titel_mit_101_Zeichen_wird_abgelehnt()
    {
        AssertFehler(Gueltig with { KopfAktiv = true, Titel = new string('T', 101) }, "kopf.titel", "Der Titel darf höchstens 100 Zeichen lang sein.");
    }

    [Fact]
    public void Titel_mit_101_Zeichen_wird_auch_bei_inaktivem_Kopfbereich_abgelehnt()
    {
        AssertFehler(Gueltig with { KopfAktiv = false, Titel = new string('T', 101) }, "kopf.titel", "Der Titel darf höchstens 100 Zeichen lang sein.");
    }

    [Fact]
    public void Titel_wird_an_den_Raendern_getrimmt()
    {
        Assert.Equal("Wappen Test", Erfolg(Gueltig with { KopfAktiv = true, Titel = "  Wappen Test \t" }).Titel);
    }

    [Fact]
    public void Titel_mit_100_Zeichen_und_Leerraum_am_Rand_ist_nach_dem_Trimmen_gueltig()
    {
        Assert.Equal(100, Erfolg(Gueltig with { KopfAktiv = true, Titel = $"  {new string('T', 100)}  " }).Titel.Length);
    }

    [Fact]
    public void Untertitel_mit_200_Zeichen_ist_gueltig()
    {
        Assert.Equal(200, Erfolg(Gueltig with { Untertitel = new string('U', 200) }).Untertitel.Length);
    }

    [Fact]
    public void Untertitel_mit_201_Zeichen_wird_abgelehnt()
    {
        AssertFehler(Gueltig with { Untertitel = new string('U', 201) }, "kopf.untertitel", "Der Untertitel darf höchstens 200 Zeichen lang sein.");
    }

    [Fact]
    public void Leerer_Untertitel_ist_bei_aktivem_Kopfbereich_gueltig()
    {
        Assert.Equal(string.Empty, Erfolg(Gueltig with { KopfAktiv = true, Untertitel = "" }).Untertitel);
    }

    [Fact]
    public void Untertitel_wird_an_den_Raendern_getrimmt()
    {
        Assert.Equal("Untertitel Test", Erfolg(Gueltig with { Untertitel = " Untertitel Test  " }).Untertitel);
    }

    // ---------- Alternativtexte ----------

    [Fact]
    public void Logo_des_Bereitstellers_ohne_Alternativtext_wird_abgelehnt()
    {
        AssertFehler(
            Gueltig with { LogoBereitsteller = (new string('a', 64), "  ") },
            "kopf.logoBereitsteller.alternativtext",
            "Bitte einen Alternativtext für das Logo des Bereitstellers eingeben.");
    }

    [Fact]
    public void Logo_der_Software_ohne_Alternativtext_wird_abgelehnt()
    {
        AssertFehler(
            Gueltig with { LogoSoftware = (new string('b', 64), "") },
            "kopf.logoSoftware.alternativtext",
            "Bitte einen Alternativtext für das Logo der Software eingeben.");
    }

    [Fact]
    public void Alternativtext_mit_201_Zeichen_wird_abgelehnt()
    {
        AssertFehler(
            Gueltig with { LogoBereitsteller = (new string('a', 64), new string('A', 201)) },
            "kopf.logoBereitsteller.alternativtext",
            "Der Alternativtext darf höchstens 200 Zeichen lang sein.");
    }

    [Fact]
    public void Alternativtext_mit_200_Zeichen_ist_gueltig()
    {
        var logo = Erfolg(Gueltig with { LogoSoftware = (new string('b', 64), new string('A', 200)) }).LogoSoftware;

        Assert.Equal(200, logo?.Alternativtext.Length);
    }

    [Fact]
    public void Alternativtext_wird_an_den_Raendern_getrimmt()
    {
        var logo = Erfolg(Gueltig with { LogoBereitsteller = (new string('a', 64), "  Wappen des Testverbands ") }).LogoBereitsteller;

        Assert.Equal("Wappen des Testverbands", logo?.Alternativtext);
    }

    // ---------- Infotext ----------

    [Theory]
    [InlineData("")]
    [InlineData(" \n ")]
    public void Aktiver_Infotext_ohne_Text_wird_abgelehnt(string text)
    {
        AssertFehler(Gueltig with { InfotextAktiv = true, Infotext = text }, "infotext.text", "Bitte einen Infotext eingeben oder den Block ausschalten.");
    }

    [Fact]
    public void Inaktiver_Infotext_ohne_Text_ist_gueltig()
    {
        Assert.Equal(string.Empty, Erfolg(Gueltig with { InfotextAktiv = false, Infotext = "" }).Infotext);
    }

    [Fact]
    public void Infotext_mit_5000_Zeichen_ist_gueltig()
    {
        Assert.Equal(5000, Erfolg(Gueltig with { Infotext = new string('i', 5000) }).Infotext.Length);
    }

    [Fact]
    public void Infotext_mit_5001_Zeichen_wird_abgelehnt()
    {
        AssertFehler(Gueltig with { Infotext = new string('i', 5001) }, "infotext.text", "Der Infotext darf höchstens 5.000 Zeichen lang sein.");
    }

    [Fact]
    public void Infotext_mit_5001_Zeichen_wird_auch_bei_inaktivem_Block_abgelehnt()
    {
        AssertFehler(
            Gueltig with { InfotextAktiv = false, Infotext = new string('i', 5001) },
            "infotext.text",
            "Der Infotext darf höchstens 5.000 Zeichen lang sein.");
    }

    [Fact]
    public void Infotext_wird_nicht_getrimmt()
    {
        Assert.Equal("  Eingerückt\n", Erfolg(Gueltig with { Infotext = "  Eingerückt\n" }).Infotext);
    }

    [Fact]
    public void Infotext_Zeilenenden_CRLF_werden_zu_LF()
    {
        Assert.Equal("Zeile 1\nZeile 2\n\nZeile 3", Erfolg(Gueltig with { Infotext = "Zeile 1\r\nZeile 2\r\n\r\nZeile 3" }).Infotext);
    }

    [Fact]
    public void Infotext_einzelnes_CR_wird_zu_LF()
    {
        Assert.Equal("Zeile 1\nZeile 2", Erfolg(Gueltig with { Infotext = "Zeile 1\rZeile 2" }).Infotext);
    }

    [Fact]
    public void Infotext_mit_Tabulator_ist_gueltig()
    {
        Assert.Equal("- Punkt\tmit Tab", Erfolg(Gueltig with { Infotext = "- Punkt\tmit Tab" }).Infotext);
    }

    // ---------- Steuerzeichen ----------

    [Theory]
    [InlineData("\u0000")]
    [InlineData("\u0007")]
    [InlineData("\u001B")]
    [InlineData("\u007F")]
    public void Infotext_mit_Steuerzeichen_wird_abgelehnt(string zeichen)
    {
        AssertFehler(Gueltig with { Infotext = $"Text{zeichen}Text" }, "infotext.text", Steuerzeichen);
    }

    [Fact]
    public void Titel_mit_Steuerzeichen_wird_abgelehnt()
    {
        AssertFehler(Gueltig with { KopfAktiv = true, Titel = "Titel\u0001" + "Test" }, "kopf.titel", Steuerzeichen);
    }

    [Fact]
    public void Untertitel_mit_Steuerzeichen_wird_abgelehnt()
    {
        AssertFehler(Gueltig with { Untertitel = "Unter\u0008titel" }, "kopf.untertitel", Steuerzeichen);
    }

    [Fact]
    public void Alternativtext_mit_Steuerzeichen_wird_abgelehnt()
    {
        AssertFehler(
            Gueltig with { LogoBereitsteller = (new string('a', 64), "Wappen\u0000Test") },
            "kopf.logoBereitsteller.alternativtext",
            Steuerzeichen);
    }

    [Fact]
    public void Steuerzeichen_im_Titel_wird_auch_bei_inaktivem_Kopfbereich_abgelehnt()
    {
        AssertFehler(Gueltig with { KopfAktiv = false, Titel = "Titel\u0002" }, "kopf.titel", Steuerzeichen);
    }

    // ---------- Anzahl ----------

    [Theory]
    [InlineData(3)]
    [InlineData(12)]
    public void Neueste_Anzahl_an_den_Grenzen_3_und_12_ist_gueltig(int anzahl)
    {
        Assert.Equal(anzahl, Erfolg(Gueltig with { NeuesteAnzahl = anzahl }).NeuesteAnzahl);
    }

    [Theory]
    [InlineData(2)]
    [InlineData(13)]
    [InlineData(0)]
    [InlineData(-1)]
    public void Neueste_Anzahl_ausserhalb_3_bis_12_wird_abgelehnt(int anzahl)
    {
        AssertFehler(Gueltig with { NeuesteAnzahl = anzahl }, "neueste.anzahl", "Die Anzahl muss zwischen 3 und 12 liegen.");
    }

    [Theory]
    [InlineData(3)]
    [InlineData(10)]
    public void Meistausgegebene_Anzahl_an_den_Grenzen_3_und_10_ist_gueltig(int anzahl)
    {
        Assert.Equal(anzahl, Erfolg(Gueltig with { MeistausgegebeneAnzahl = anzahl }).MeistausgegebeneAnzahl);
    }

    [Theory]
    [InlineData(2)]
    [InlineData(11)]
    public void Meistausgegebene_Anzahl_ausserhalb_3_bis_10_wird_abgelehnt(int anzahl)
    {
        AssertFehler(Gueltig with { MeistausgegebeneAnzahl = anzahl }, "meistausgegeben.anzahl", "Die Anzahl muss zwischen 3 und 10 liegen.");
    }

    [Fact]
    public void Anzahl_eines_inaktiven_Blocks_wird_trotzdem_geprueft()
    {
        // Die DB prüft die Anzahl per Check (4.1) unabhängig vom Schalter.
        AssertFehler(Gueltig with { NeuesteAktiv = false, NeuesteAnzahl = 13 }, "neueste.anzahl", "Die Anzahl muss zwischen 3 und 12 liegen.");
    }

    // ---------- gesammelt ----------

    [Fact]
    public void Alle_Befunde_werden_gemeinsam_gemeldet()
    {
        var fehler = Fehler(Gueltig with
        {
            Reihenfolge = ["kopf"],
            KopfAktiv = true,
            Titel = "",
            Untertitel = new string('U', 201),
            Infotext = "",
            NeuesteAnzahl = 2,
            MeistausgegebeneAnzahl = 11,
        });

        Assert.Equal(
            ["infotext.text", "kopf.titel", "kopf.untertitel", "meistausgegeben.anzahl", "neueste.anzahl", "reihenfolge"],
            fehler.Keys.Order(StringComparer.Ordinal));
    }

    // ---------- AK-37: öffentliche Kopfansicht ----------

    [Fact]
    public void Kopfansicht_der_Standardkonfiguration_ist_inaktiv_an_Position_1()
    {
        var kopf = KopfAnsicht(Lesen(Standard()));

        Assert.Equal((false, 1), (kopf.Aktiv, kopf.Position));
    }

    [Fact]
    public void Kopfansicht_bei_inaktivem_Kopf_enthaelt_weder_Titel_noch_Untertitel()
    {
        var kopf = KopfAnsicht(Gueltig with { KopfAktiv = false, Titel = "Geheimer Titel", Untertitel = "Geheimer Untertitel" });

        Assert.Equal((null, null), (kopf.Titel, kopf.Untertitel));
    }

    [Fact]
    public void Kopfansicht_bei_inaktivem_Kopf_enthaelt_keine_Logos()
    {
        var kopf = KopfAnsicht(Gueltig with
        {
            KopfAktiv = false,
            LogoBereitsteller = (new string('a', 64), "Wappen"),
            LogoSoftware = (new string('b', 64), "Software"),
        });

        Assert.Equal((false, false), (kopf.LogoBereitsteller, kopf.LogoSoftware));
    }

    [Fact]
    public void Kopfansicht_bei_aktivem_Kopf_enthaelt_Titel_und_Untertitel()
    {
        var kopf = KopfAnsicht(Gueltig with { KopfAktiv = true, Titel = "Titel Test", Untertitel = "Untertitel Test" });

        Assert.Equal((true, "Titel Test", "Untertitel Test"), (kopf.Aktiv, kopf.Titel, kopf.Untertitel));
    }

    [Fact]
    public void Kopfansicht_bei_aktivem_Kopf_enthaelt_vorhandene_Logos()
    {
        var kopf = KopfAnsicht(Gueltig with { KopfAktiv = true, LogoBereitsteller = (new string('a', 64), "Wappen") });

        Assert.Equal((true, false), (kopf.LogoBereitsteller, kopf.LogoSoftware));
    }

    [Theory]
    [InlineData(new[] { "infotext", "kennzahlen", "kopf", "neueste", "meistausgegeben" }, 3)]
    [InlineData(new[] { "infotext", "kennzahlen", "neueste", "meistausgegeben", "kopf" }, 5)]
    public void Kopfansicht_nennt_die_Position_des_Kopfs_in_der_Reihenfolge(string[] folge, int position)
    {
        Assert.Equal(position, KopfAnsicht(Gueltig with { Reihenfolge = folge }).Position);
    }
}
