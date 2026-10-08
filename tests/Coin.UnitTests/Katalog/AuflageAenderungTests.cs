using Coin.Domain.Katalog;

namespace Coin.UnitTests.Katalog;

/// <summary>
/// Feature coin-ausgaben, AK-17 (Entscheidungen F3, F4, F9; ADR-0020 Punkt 8): Regel zum Ändern der Auflage.
/// <see cref="AuflageAenderung.Pruefen"/> bekommt die bisherige Auflage, die gewünschte Auflage und die höchste
/// Exemplar-Nummer, die jemals ausgegeben war (aktiv oder storniert; <c>null</c> = nie), und entscheidet, welche
/// Exemplare zu erzeugen bzw. zu löschen sind. Die Infrastruktur ruft sie unter der Coin-Sperre auf (AK-10).
/// </summary>
public class AuflageAenderungTests
{
    // ---------- Validierung (F4, F9) ----------

    [Fact]
    public void Fehlende_Auflage_ist_ein_Fehler_kein_Zurueck_auf_unbekannt()
    {
        var ergebnis = AuflageAenderung.Pruefen(alteAuflage: 10, neueAuflage: null, hoechsteJeAusgegebeneNummer: null);

        var ungueltig = Assert.IsType<AuflageAenderung.Ungueltig>(ergebnis);
        Assert.Equal(["Auflage ist erforderlich."], ungueltig.Fehler["auflage"]);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(1_000_001)]
    public void Auflage_ausserhalb_1_bis_1000000_ist_ein_Fehler(int neu)
    {
        var ergebnis = AuflageAenderung.Pruefen(10, neu, null);

        var ungueltig = Assert.IsType<AuflageAenderung.Ungueltig>(ergebnis);
        Assert.Equal(["Auflage muss zwischen 1 und 1000000 liegen."], ungueltig.Fehler["auflage"]);
    }

    [Fact]
    public void Ungueltige_Auflage_meldet_nur_das_Feld_auflage()
    {
        var ungueltig = Assert.IsType<AuflageAenderung.Ungueltig>(AuflageAenderung.Pruefen(null, null, null));

        Assert.Equal(["auflage"], ungueltig.Fehler.Keys.ToArray());
    }

    [Fact]
    public void Auflage_1000000_ist_gueltig()
    {
        Assert.Equal(new AuflageAenderung.Erhoehung(11, 1_000_000), AuflageAenderung.Pruefen(10, 1_000_000, null));
    }

    // ---------- Erhöhung ----------

    [Fact]
    public void Erhoehung_erzeugt_die_Exemplare_alt_plus_1_bis_neu()
    {
        Assert.Equal(new AuflageAenderung.Erhoehung(151, 200), AuflageAenderung.Pruefen(150, 200, 37));
    }

    [Fact]
    public void Erste_Auflage_fuer_einen_Coin_ohne_Auflage_erzeugt_die_Exemplare_1_bis_neu()
    {
        Assert.Equal(new AuflageAenderung.Erhoehung(1, 5), AuflageAenderung.Pruefen(null, 5, null));
    }

    [Fact]
    public void Erhoehung_um_1_erzeugt_genau_ein_Exemplar()
    {
        Assert.Equal(new AuflageAenderung.Erhoehung(11, 11), AuflageAenderung.Pruefen(10, 11, 10));
    }

    // ---------- Gleicher Wert ----------

    [Fact]
    public void Gleicher_Wert_ist_unveraendert()
    {
        Assert.IsType<AuflageAenderung.Unveraendert>(AuflageAenderung.Pruefen(10, 10, 10));
    }

    // ---------- Senkung (F4: höchste je ausgegebene Nummer) ----------

    [Fact]
    public void Senkung_ohne_je_ausgegebene_Exemplare_loescht_neu_plus_1_bis_alt()
    {
        Assert.Equal(new AuflageAenderung.Senkung(6, 10), AuflageAenderung.Pruefen(10, 5, null));
    }

    [Fact]
    public void Senkung_bis_genau_auf_die_hoechste_je_ausgegebene_Nummer_ist_erlaubt()
    {
        Assert.Equal(new AuflageAenderung.Senkung(8, 10), AuflageAenderung.Pruefen(10, 7, 7));
    }

    [Fact]
    public void Senkung_unter_die_hoechste_je_ausgegebene_Nummer_ist_zu_klein()
    {
        Assert.Equal(new AuflageAenderung.ZuKlein(7), AuflageAenderung.Pruefen(10, 6, 7));
    }

    [Fact]
    public void Senkung_auf_1_mit_ausgegebenem_Exemplar_Nr_2_ist_zu_klein()
    {
        Assert.Equal(new AuflageAenderung.ZuKlein(2), AuflageAenderung.Pruefen(3, 1, 2));
    }

    [Fact]
    public void Senkung_bis_auf_1_ohne_Ausgaben_ist_erlaubt()
    {
        Assert.Equal(new AuflageAenderung.Senkung(2, 3), AuflageAenderung.Pruefen(3, 1, null));
    }
}
