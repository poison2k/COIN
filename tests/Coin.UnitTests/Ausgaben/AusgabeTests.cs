using Coin.Domain.Ausgaben;

namespace Coin.UnitTests.Ausgaben;

/// <summary>
/// Feature coin-ausgaben, AK-6, AK-11, AK-12 (ADR-0020 Punkt 4 und 9): Entität <see cref="Ausgabe"/>.
/// <see cref="Ausgabe.Erstellen"/> übernimmt geprüfte <see cref="AusgabeAngaben"/>, die unter der Sperre ermittelte
/// Exemplar-Nummer sowie Erfasser und Zeit vom Server (nie vom Client). <see cref="Ausgabe.Stornieren"/> verlangt einen
/// Grund (Pflicht, höchstens 500 Zeichen nach dem Trimmen) und ist nur einmal möglich.
/// </summary>
public class AusgabeTests
{
    private static readonly DateTimeOffset Jetzt = new(2026, 10, 8, 9, 0, 0, TimeSpan.Zero);
    private static readonly Guid CoinId = Guid.CreateVersion7();
    private static readonly Guid Erfasser = Guid.CreateVersion7();
    private static readonly Guid Stornierer = Guid.CreateVersion7();

    private static AusgabeAngaben Angaben()
    {
        var ergebnis = AusgabeAngaben.Pruefen(
            "Max Beispiel", null, null, new DateOnly(2026, 10, 1), "Truppenbesuch", "Herausragende Leistung",
            "Kommandeur Beispielbataillon 1", Jetzt);
        Assert.True(ergebnis.IstErfolgreich);
        return ergebnis.Wert!;
    }

    private static Ausgabe NeueAusgabe(int nummer = 12) =>
        Ausgabe.Erstellen(CoinId, nummer, Angaben(), Erfasser, Jetzt);

    // ---------- Erstellen ----------

    [Fact]
    public void Erstellen_uebernimmt_Coin_Exemplar_Nummer_und_Angaben()
    {
        var angaben = Angaben();

        var ausgabe = Ausgabe.Erstellen(CoinId, 12, angaben, Erfasser, Jetzt);

        Assert.Equal((CoinId, 12, angaben), (ausgabe.CoinId, ausgabe.ExemplarNummer, ausgabe.Angaben));
    }

    [Fact]
    public void Erstellen_setzt_Erfasser_und_Erfassungszeit()
    {
        var ausgabe = NeueAusgabe();

        Assert.Equal((Erfasser, Jetzt), (ausgabe.ErfasstVon, ausgabe.ErfasstAm));
    }

    [Fact]
    public void Erstellen_vergibt_eine_Guid_Version_7()
    {
        Assert.Equal(7, NeueAusgabe().Id.Version);
    }

    [Fact]
    public void Erstellen_vergibt_je_Ausgabe_eine_eigene_Id()
    {
        Assert.NotEqual(NeueAusgabe().Id, NeueAusgabe().Id);
    }

    [Fact]
    public void Eine_neue_Ausgabe_ist_nicht_storniert()
    {
        Assert.Null(NeueAusgabe().Storno);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Erstellen_mit_Nummer_kleiner_1_wirft(int nummer)
    {
        // Die Nummer stammt aus der Prüfung unter der Sperre (AK-7, AK-10); ein Wert < 1 ist ein Programmierfehler.
        Assert.Throws<ArgumentOutOfRangeException>(() => Ausgabe.Erstellen(CoinId, nummer, Angaben(), Erfasser, Jetzt));
    }

    // ---------- AK-11: Stornieren ----------

    [Fact]
    public void Stornieren_mit_Grund_ist_erfolgreich()
    {
        var ausgabe = NeueAusgabe();

        var ergebnis = ausgabe.Stornieren("Falsches Exemplar erfasst", Stornierer, Jetzt.AddHours(1));

        Assert.IsType<StornoErgebnis.Storniert>(ergebnis);
    }

    [Fact]
    public void Stornieren_setzt_Zeitpunkt_Akteur_und_Grund()
    {
        var ausgabe = NeueAusgabe();
        var spaeter = Jetzt.AddHours(1);

        ausgabe.Stornieren("Falsches Exemplar erfasst", Stornierer, spaeter);

        Assert.Equal(new Storno(spaeter, Stornierer, "Falsches Exemplar erfasst"), ausgabe.Storno);
    }

    [Fact]
    public void Stornieren_trimmt_den_Grund()
    {
        var ausgabe = NeueAusgabe();

        ausgabe.Stornieren("  Falsches Exemplar \n", Stornierer, Jetzt);

        Assert.Equal("Falsches Exemplar", ausgabe.Storno!.Grund);
    }

    [Fact]
    public void Stornieren_aendert_die_Angaben_der_Ausgabe_nicht()
    {
        var ausgabe = NeueAusgabe();
        var vorher = (ausgabe.Id, ausgabe.CoinId, ausgabe.ExemplarNummer, ausgabe.Angaben, ausgabe.ErfasstVon, ausgabe.ErfasstAm);

        ausgabe.Stornieren("Grund", Stornierer, Jetzt);

        Assert.Equal(vorher, (ausgabe.Id, ausgabe.CoinId, ausgabe.ExemplarNummer, ausgabe.Angaben, ausgabe.ErfasstVon, ausgabe.ErfasstAm));
    }

    // ---------- AK-12: Grund Pflicht, höchstens 500 Zeichen ----------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Stornieren_ohne_Grund_ist_ein_Fehler_am_Feld_grund(string? grund)
    {
        var ergebnis = NeueAusgabe().Stornieren(grund, Stornierer, Jetzt);

        var ungueltig = Assert.IsType<StornoErgebnis.Ungueltig>(ergebnis);
        Assert.Equal(["Bitte einen Grund für das Storno angeben."], ungueltig.Fehler["grund"]);
    }

    [Fact]
    public void Stornieren_ohne_Grund_laesst_die_Ausgabe_aktiv()
    {
        var ausgabe = NeueAusgabe();

        ausgabe.Stornieren(" ", Stornierer, Jetzt);

        Assert.Null(ausgabe.Storno);
    }

    [Fact]
    public void Stornieren_mit_500_Zeichen_Grund_ist_erfolgreich()
    {
        var ergebnis = NeueAusgabe().Stornieren(new string('g', 500), Stornierer, Jetzt);

        Assert.IsType<StornoErgebnis.Storniert>(ergebnis);
    }

    [Fact]
    public void Stornieren_mit_501_Zeichen_Grund_ist_ein_Fehler_am_Feld_grund()
    {
        var ergebnis = NeueAusgabe().Stornieren(new string('g', 501), Stornierer, Jetzt);

        var ungueltig = Assert.IsType<StornoErgebnis.Ungueltig>(ergebnis);
        Assert.Equal(["Der Grund darf höchstens 500 Zeichen lang sein."], ungueltig.Fehler["grund"]);
    }

    [Fact]
    public void Grundlaenge_wird_nach_dem_Trimmen_geprueft()
    {
        var ergebnis = NeueAusgabe().Stornieren("  " + new string('g', 500) + "  ", Stornierer, Jetzt);

        Assert.IsType<StornoErgebnis.Storniert>(ergebnis);
    }

    // ---------- AK-12, ADR-0020 Punkt 9: nur einmal stornierbar ----------

    [Fact]
    public void Zweites_Storno_meldet_bereits_storniert()
    {
        var ausgabe = NeueAusgabe();
        ausgabe.Stornieren("Erster Grund", Stornierer, Jetzt);

        var ergebnis = ausgabe.Stornieren("Zweiter Grund", Erfasser, Jetzt.AddMinutes(5));

        Assert.IsType<StornoErgebnis.BereitsStorniert>(ergebnis);
    }

    [Fact]
    public void Zweites_Storno_aendert_das_erste_Storno_nicht()
    {
        var ausgabe = NeueAusgabe();
        ausgabe.Stornieren("Erster Grund", Stornierer, Jetzt);

        ausgabe.Stornieren("Zweiter Grund", Erfasser, Jetzt.AddMinutes(5));

        Assert.Equal(new Storno(Jetzt, Stornierer, "Erster Grund"), ausgabe.Storno);
    }
}
