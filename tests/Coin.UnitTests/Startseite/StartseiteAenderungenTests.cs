using static Coin.UnitTests.Startseite.StartseiteDomain;

namespace Coin.UnitTests.Startseite;

/// <summary>
/// Feature startseite, AK-18 und Abschnitt 4.3 (ADR-0030 Punkt 7): Die Domain ermittelt die Audit-Einträge als Unterschied
/// zwischen alter (oder Standard-) und neuer Konfiguration – je Block- oder Feldänderung ein Eintrag, Texte nur „geändert“
/// (ohne Inhalt), Logos mit SHA-256, ein Logo mit gleichem Hash gilt als unverändert. Reihenfolge der Einträge: Blöcke in
/// Standardreihenfolge, dann Reihenfolge, Texte, Anzahl, Logos.
/// </summary>
public class StartseiteAenderungenTests
{
    private const string Standardfolge = "kopf,infotext,kennzahlen,neueste,meistausgegeben";

    private static readonly string ShaA = new('a', 64);
    private static readonly string ShaB = new('b', 64);

    private static readonly Werte Basis = new();

    [Fact]
    public void Ohne_Aenderung_gibt_es_keinen_Eintrag()
    {
        Assert.Empty(Aenderungen(Basis, Basis with { }));
    }

    [Fact]
    public void Standard_gegen_Standard_ergibt_keinen_Eintrag()
    {
        Assert.Empty(Aenderungen(Standard(), Standard()));
    }

    [Fact]
    public void Block_ausschalten_ergibt_BlockAusgeschaltet_mit_der_Blockart()
    {
        Assert.Equal([new Aenderung("BlockAusgeschaltet", "kennzahlen")], Aenderungen(Basis, Basis with { KennzahlenAktiv = false }));
    }

    [Fact]
    public void Block_einschalten_ergibt_BlockEingeschaltet_mit_der_Blockart()
    {
        Assert.Equal([new Aenderung("BlockEingeschaltet", "kopf")], Aenderungen(Basis, Basis with { KopfAktiv = true }));
    }

    [Fact]
    public void Erstes_Speichern_wird_gegen_die_Standardkonfiguration_verglichen()
    {
        var aenderungen = Aenderungen(Standard(), Konfiguration(Lesen(Standard()) with { NeuesteAktiv = false }));

        Assert.Equal([new Aenderung("BlockAusgeschaltet", "neueste")], aenderungen);
    }

    [Fact]
    public void Geaenderte_Reihenfolge_ergibt_einen_Eintrag_mit_alter_und_neuer_Folge()
    {
        var neu = Basis with { Reihenfolge = ["meistausgegeben", "kopf", "infotext", "kennzahlen", "neueste"] };

        Assert.Equal(
            [new Aenderung("ReihenfolgeGeaendert", null, Standardfolge, "meistausgegeben,kopf,infotext,kennzahlen,neueste")],
            Aenderungen(Basis, neu));
    }

    [Fact]
    public void Geaenderter_Titel_ergibt_TitelGeaendert_ohne_Inhalt()
    {
        Assert.Equal([new Aenderung("TitelGeaendert")], Aenderungen(Basis, Basis with { Titel = "Geheimer Titel" }));
    }

    [Fact]
    public void Geaenderter_Untertitel_ergibt_UntertitelGeaendert_ohne_Inhalt()
    {
        Assert.Equal([new Aenderung("UntertitelGeaendert")], Aenderungen(Basis, Basis with { Untertitel = "Geheimer Untertitel" }));
    }

    [Fact]
    public void Geaenderter_Infotext_ergibt_InfotextGeaendert_ohne_Inhalt()
    {
        Assert.Equal([new Aenderung("InfotextGeaendert")], Aenderungen(Basis, Basis with { Infotext = "Geheimer Infotext" }));
    }

    [Fact]
    public void Geaenderte_Anzahl_Neueste_ergibt_AnzahlGeaendert_mit_alter_und_neuer_Zahl()
    {
        Assert.Equal([new Aenderung("AnzahlGeaendert", "neueste", "6", "8")], Aenderungen(Basis, Basis with { NeuesteAnzahl = 8 }));
    }

    [Fact]
    public void Geaenderte_Anzahl_Meistausgegebene_ergibt_AnzahlGeaendert_mit_Ziel_meistausgegeben()
    {
        Assert.Equal(
            [new Aenderung("AnzahlGeaendert", "meistausgegeben", "5", "10")],
            Aenderungen(Basis, Basis with { MeistausgegebeneAnzahl = 10 }));
    }

    [Fact]
    public void Neues_Logo_ergibt_LogoHochgeladen_mit_dem_neuen_Hash()
    {
        var aenderungen = Aenderungen(Basis, Basis with { LogoBereitsteller = (ShaA, "Wappen") });

        Assert.Equal([new Aenderung("LogoHochgeladen", "bereitsteller", null, ShaA)], aenderungen);
    }

    [Fact]
    public void Ersetztes_Logo_ergibt_LogoErsetzt_mit_altem_und_neuem_Hash()
    {
        var alt = Basis with { LogoSoftware = (ShaA, "Software") };

        var aenderungen = Aenderungen(alt, alt with { LogoSoftware = (ShaB, "Software") });

        Assert.Equal([new Aenderung("LogoErsetzt", "software", ShaA, ShaB)], aenderungen);
    }

    [Fact]
    public void Entferntes_Logo_ergibt_LogoEntfernt_mit_dem_alten_Hash()
    {
        var alt = Basis with { LogoBereitsteller = (ShaA, "Wappen") };

        Assert.Equal([new Aenderung("LogoEntfernt", "bereitsteller", ShaA, null)], Aenderungen(alt, alt with { LogoBereitsteller = null }));
    }

    [Fact]
    public void Logo_mit_gleichem_Hash_gilt_als_unveraendert()
    {
        var alt = Basis with { LogoBereitsteller = (ShaA, "Wappen") };

        Assert.Empty(Aenderungen(alt, alt with { LogoBereitsteller = (ShaA, "Wappen") }));
    }

    [Fact]
    public void Geaenderter_Alternativtext_ergibt_AlternativtextGeaendert_ohne_Inhalt()
    {
        var alt = Basis with { LogoBereitsteller = (ShaA, "Wappen alt") };

        var aenderungen = Aenderungen(alt, alt with { LogoBereitsteller = (ShaA, "Wappen neu") });

        Assert.Equal([new Aenderung("AlternativtextGeaendert", "bereitsteller")], aenderungen);
    }

    [Fact]
    public void Kein_Eintrag_enthaelt_Titel_Untertitel_Infotext_oder_Alternativtext()
    {
        var alt = Basis with { LogoBereitsteller = (ShaA, "Alttext-alt-4711") };
        var neu = alt with
        {
            Titel = "Titel-geheim-4711",
            Untertitel = "Untertitel-geheim-4711",
            Infotext = "Infotext-geheim-4711",
            LogoBereitsteller = (ShaA, "Alttext-neu-4711"),
        };

        var werte = Aenderungen(alt, neu).SelectMany(a => new[] { a.Art, a.Ziel, a.Alt, a.Neu }).OfType<string>();

        Assert.DoesNotContain(werte, w => w.Contains("4711", StringComparison.Ordinal));
    }

    [Fact]
    public void Beispiel_aus_AK_18_ergibt_genau_vier_Eintraege()
    {
        var neu = Basis with
        {
            KennzahlenAktiv = false,
            Reihenfolge = ["kopf", "kennzahlen", "infotext", "neueste", "meistausgegeben"],
            Infotext = "Neuer Infotext",
            LogoBereitsteller = (ShaA, "Wappen"),
        };

        Assert.Equal(
            [
                new Aenderung("BlockAusgeschaltet", "kennzahlen"),
                new Aenderung("ReihenfolgeGeaendert", null, Standardfolge, "kopf,kennzahlen,infotext,neueste,meistausgegeben"),
                new Aenderung("InfotextGeaendert"),
                new Aenderung("LogoHochgeladen", "bereitsteller", null, ShaA),
            ],
            Aenderungen(Basis, neu));
    }

    [Fact]
    public void Eintraege_stehen_in_der_Reihenfolge_Bloecke_Reihenfolge_Texte_Anzahl_Logos()
    {
        var alt = Basis with { LogoSoftware = (ShaB, "Software") };
        var neu = alt with
        {
            MeistausgegebeneAktiv = false,
            KopfAktiv = true,
            Reihenfolge = ["infotext", "kopf", "kennzahlen", "neueste", "meistausgegeben"],
            Infotext = "Neu",
            Titel = "Neuer Titel",
            Untertitel = "Neuer Untertitel",
            MeistausgegebeneAnzahl = 4,
            NeuesteAnzahl = 12,
            LogoSoftware = null,
            LogoBereitsteller = (ShaA, "Wappen"),
        };

        Assert.Equal(
            [
                new Aenderung("BlockEingeschaltet", "kopf"),
                new Aenderung("BlockAusgeschaltet", "meistausgegeben"),
                new Aenderung("ReihenfolgeGeaendert", null, Standardfolge, "infotext,kopf,kennzahlen,neueste,meistausgegeben"),
                new Aenderung("TitelGeaendert"),
                new Aenderung("UntertitelGeaendert"),
                new Aenderung("InfotextGeaendert"),
                new Aenderung("AnzahlGeaendert", "neueste", "6", "12"),
                new Aenderung("AnzahlGeaendert", "meistausgegeben", "5", "4"),
                new Aenderung("LogoHochgeladen", "bereitsteller", null, ShaA),
                new Aenderung("LogoEntfernt", "software", ShaB, null),
            ],
            Aenderungen(alt, neu));
    }
}
