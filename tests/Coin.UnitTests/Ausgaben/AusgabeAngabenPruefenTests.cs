using Coin.Domain;
using Coin.Domain.Ausgaben;

namespace Coin.UnitTests.Ausgaben;

/// <summary>
/// Feature coin-ausgaben, AK-6 und AK-7 (Entscheidungen F5, F8): Prüfung der Angaben einer Ausgabe vor der Sperre.
/// <see cref="AusgabeAngaben.Pruefen"/> trimmt, setzt leere optionale Texte auf <c>null</c> und liefert alle Fehler
/// gemeinsam (Schlüssel = camelCase-Feldname des Requests). Die Exemplar-Nummer wird erst unter der Sperre gegen die
/// Auflage geprüft (AK-7, AK-10) und ist daher nicht Teil dieser Prüfung.
/// </summary>
public class AusgabeAngabenPruefenTests
{
    /// <summary>2026-10-08 11:00 in Berlin (Sommerzeit, UTC+2).</summary>
    private static readonly DateTimeOffset Jetzt = new(2026, 10, 8, 9, 0, 0, TimeSpan.Zero);

    private static readonly DateOnly Heute = new(2026, 10, 8);

    private static Ergebnis<AusgabeAngaben> Pruefen(
        string? empfaengerName = "Max Beispiel",
        string? empfaengerDienstgrad = "Hauptmann",
        string? empfaengerDienststelle = "Beispielbataillon 1",
        DateOnly? datum = null,
        bool ohneDatum = false,
        string? gelegenheit = "Truppenbesuch",
        string? begruendung = "Herausragende Leistung",
        string? ausgebendeStelle = "Kommandeur Beispielbataillon 1",
        DateTimeOffset? jetzt = null) =>
        AusgabeAngaben.Pruefen(
            empfaengerName,
            empfaengerDienstgrad,
            empfaengerDienststelle,
            ohneDatum ? null : datum ?? Heute,
            gelegenheit,
            begruendung,
            ausgebendeStelle,
            jetzt ?? Jetzt);

    private static AusgabeAngaben Gueltig(Ergebnis<AusgabeAngaben> ergebnis)
    {
        Assert.True(ergebnis.IstErfolgreich, "Erwartet: gültig. Fehler: " + string.Join(", ", ergebnis.Fehler.Keys));
        return ergebnis.Wert!;
    }

    private static void AssertNurFehler(Ergebnis<AusgabeAngaben> ergebnis, string feld, string meldung)
    {
        Assert.False(ergebnis.IstErfolgreich);
        Assert.Null(ergebnis.Wert);
        Assert.Equal([feld], ergebnis.Fehler.Keys.ToArray());
        Assert.Equal([meldung], ergebnis.Fehler[feld]);
    }

    // ---------- AK-6: gültige Angaben, Trimmen, optionale Felder ----------

    [Fact]
    public void Pruefen_mit_allen_Pflichtangaben_ist_erfolgreich()
    {
        var ergebnis = Pruefen();

        Assert.True(ergebnis.IstErfolgreich);
        Assert.Empty(ergebnis.Fehler);
    }

    [Fact]
    public void Pruefen_uebernimmt_alle_Angaben()
    {
        var angaben = Gueltig(Pruefen(datum: new DateOnly(2026, 10, 1)));

        Assert.Equal("Max Beispiel", angaben.EmpfaengerName);
        Assert.Equal("Hauptmann", angaben.EmpfaengerDienstgrad);
        Assert.Equal("Beispielbataillon 1", angaben.EmpfaengerDienststelle);
        Assert.Equal(new DateOnly(2026, 10, 1), angaben.Datum);
        Assert.Equal("Truppenbesuch", angaben.Gelegenheit);
        Assert.Equal("Herausragende Leistung", angaben.Begruendung);
        Assert.Equal("Kommandeur Beispielbataillon 1", angaben.AusgebendeStelle);
    }

    [Fact]
    public void Pruefen_trimmt_alle_Texte()
    {
        var angaben = Gueltig(Pruefen(
            empfaengerName: "  Max Beispiel \t",
            empfaengerDienstgrad: " Hauptmann ",
            empfaengerDienststelle: " Beispielbataillon 1 ",
            gelegenheit: "\nTruppenbesuch ",
            begruendung: " Herausragende Leistung ",
            ausgebendeStelle: " Kommandeur "));

        IEnumerable<string?> erwartet =
            ["Max Beispiel", "Hauptmann", "Beispielbataillon 1", "Truppenbesuch", "Herausragende Leistung", "Kommandeur"];
        IEnumerable<string?> tatsaechlich =
            [angaben.EmpfaengerName, angaben.EmpfaengerDienstgrad, angaben.EmpfaengerDienststelle, angaben.Gelegenheit,
                angaben.Begruendung, angaben.AusgebendeStelle];
        Assert.Equal(erwartet, tatsaechlich);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Leerer_Dienstgrad_wird_null(string? wert)
    {
        Assert.Null(Gueltig(Pruefen(empfaengerDienstgrad: wert)).EmpfaengerDienstgrad);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Leere_Dienststelle_wird_null(string? wert)
    {
        Assert.Null(Gueltig(Pruefen(empfaengerDienststelle: wert)).EmpfaengerDienststelle);
    }

    // ---------- AK-7: Pflichtfelder ----------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  \t ")]
    public void Fehlender_Empfaengername_ist_ein_Fehler(string? wert)
    {
        AssertNurFehler(Pruefen(empfaengerName: wert), "empfaengerName", "Name des Empfängers ist erforderlich.");
    }

    [Fact]
    public void Fehlendes_Datum_ist_ein_Fehler()
    {
        AssertNurFehler(Pruefen(ohneDatum: true), "datum", "Datum ist erforderlich.");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Fehlende_Gelegenheit_ist_ein_Fehler(string? wert)
    {
        AssertNurFehler(Pruefen(gelegenheit: wert), "gelegenheit", "Gelegenheit ist erforderlich.");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Fehlende_Begruendung_ist_ein_Fehler(string? wert)
    {
        AssertNurFehler(Pruefen(begruendung: wert), "begruendung", "Begründung ist erforderlich.");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Fehlende_ausgebende_Stelle_ist_ein_Fehler(string? wert)
    {
        AssertNurFehler(Pruefen(ausgebendeStelle: wert), "ausgebendeStelle", "Ausgebende Stelle ist erforderlich.");
    }

    [Fact]
    public void Alle_Fehler_werden_gemeinsam_gemeldet()
    {
        var ergebnis = AusgabeAngaben.Pruefen(null, null, null, null, null, null, null, Jetzt);

        Assert.Equal(
            ["ausgebendeStelle", "begruendung", "datum", "empfaengerName", "gelegenheit"],
            ergebnis.Fehler.Keys.Order(StringComparer.Ordinal));
    }

    // ---------- AK-7: Längen (Grenze und Grenze + 1, nach dem Trimmen) ----------

    [Fact]
    public void Empfaengername_mit_200_Zeichen_ist_gueltig()
    {
        Assert.Equal(200, Gueltig(Pruefen(empfaengerName: new string('n', 200))).EmpfaengerName.Length);
    }

    [Fact]
    public void Empfaengername_mit_201_Zeichen_ist_ein_Fehler()
    {
        AssertNurFehler(
            Pruefen(empfaengerName: new string('n', 201)),
            "empfaengerName",
            "Name des Empfängers darf höchstens 200 Zeichen lang sein.");
    }

    [Fact]
    public void Laenge_wird_nach_dem_Trimmen_geprueft()
    {
        Assert.True(Pruefen(empfaengerName: "  " + new string('n', 200) + "  ").IstErfolgreich);
    }

    [Fact]
    public void Dienstgrad_mit_100_Zeichen_ist_gueltig()
    {
        Assert.True(Pruefen(empfaengerDienstgrad: new string('d', 100)).IstErfolgreich);
    }

    [Fact]
    public void Dienstgrad_mit_101_Zeichen_ist_ein_Fehler()
    {
        AssertNurFehler(
            Pruefen(empfaengerDienstgrad: new string('d', 101)),
            "empfaengerDienstgrad",
            "Dienstgrad darf höchstens 100 Zeichen lang sein.");
    }

    [Fact]
    public void Dienststelle_mit_200_Zeichen_ist_gueltig()
    {
        Assert.True(Pruefen(empfaengerDienststelle: new string('s', 200)).IstErfolgreich);
    }

    [Fact]
    public void Dienststelle_mit_201_Zeichen_ist_ein_Fehler()
    {
        AssertNurFehler(
            Pruefen(empfaengerDienststelle: new string('s', 201)),
            "empfaengerDienststelle",
            "Dienststelle darf höchstens 200 Zeichen lang sein.");
    }

    [Fact]
    public void Gelegenheit_mit_200_Zeichen_ist_gueltig()
    {
        Assert.True(Pruefen(gelegenheit: new string('g', 200)).IstErfolgreich);
    }

    [Fact]
    public void Gelegenheit_mit_201_Zeichen_ist_ein_Fehler()
    {
        AssertNurFehler(
            Pruefen(gelegenheit: new string('g', 201)),
            "gelegenheit",
            "Gelegenheit darf höchstens 200 Zeichen lang sein.");
    }

    [Fact]
    public void Begruendung_mit_2000_Zeichen_ist_gueltig()
    {
        Assert.True(Pruefen(begruendung: new string('b', 2000)).IstErfolgreich);
    }

    [Fact]
    public void Begruendung_mit_2001_Zeichen_ist_ein_Fehler()
    {
        AssertNurFehler(
            Pruefen(begruendung: new string('b', 2001)),
            "begruendung",
            "Begründung darf höchstens 2000 Zeichen lang sein.");
    }

    [Fact]
    public void Ausgebende_Stelle_mit_200_Zeichen_ist_gueltig()
    {
        Assert.True(Pruefen(ausgebendeStelle: new string('a', 200)).IstErfolgreich);
    }

    [Fact]
    public void Ausgebende_Stelle_mit_201_Zeichen_ist_ein_Fehler()
    {
        AssertNurFehler(
            Pruefen(ausgebendeStelle: new string('a', 201)),
            "ausgebendeStelle",
            "Ausgebende Stelle darf höchstens 200 Zeichen lang sein.");
    }

    // ---------- AK-7, F8: Datum nicht in der Zukunft, heute nach Europe/Berlin ----------

    [Fact]
    public void Datum_heute_ist_gueltig()
    {
        Assert.True(Pruefen(datum: Heute).IstErfolgreich);
    }

    [Fact]
    public void Datum_morgen_ist_ein_Fehler()
    {
        AssertNurFehler(Pruefen(datum: Heute.AddDays(1)), "datum", "Das Datum darf nicht in der Zukunft liegen.");
    }

    [Fact]
    public void Datum_hat_keine_Untergrenze()
    {
        Assert.True(Pruefen(datum: new DateOnly(1956, 1, 2)).IstErfolgreich);
    }

    [Fact]
    public void Um_23_30_UTC_ist_in_Berlin_schon_der_naechste_Tag_heute()
    {
        // 2026-10-08T23:30Z = 2026-10-09 01:30 in Berlin (Sommerzeit).
        var jetzt = new DateTimeOffset(2026, 10, 8, 23, 30, 0, TimeSpan.Zero);

        Assert.True(Pruefen(datum: new DateOnly(2026, 10, 9), jetzt: jetzt).IstErfolgreich);
    }

    [Fact]
    public void Um_23_30_UTC_ist_der_uebernaechste_Tag_in_der_Zukunft()
    {
        var jetzt = new DateTimeOffset(2026, 10, 8, 23, 30, 0, TimeSpan.Zero);

        AssertNurFehler(
            Pruefen(datum: new DateOnly(2026, 10, 10), jetzt: jetzt),
            "datum",
            "Das Datum darf nicht in der Zukunft liegen.");
    }

    [Fact]
    public void Um_21_30_UTC_im_Sommer_ist_in_Berlin_noch_derselbe_Tag()
    {
        // 2026-10-08T21:30Z = 2026-10-08 23:30 in Berlin: der 9. liegt noch in der Zukunft.
        var jetzt = new DateTimeOffset(2026, 10, 8, 21, 30, 0, TimeSpan.Zero);

        AssertNurFehler(
            Pruefen(datum: new DateOnly(2026, 10, 9), jetzt: jetzt),
            "datum",
            "Das Datum darf nicht in der Zukunft liegen.");
    }

    [Fact]
    public void Im_Winter_gilt_um_23_30_UTC_in_Berlin_der_naechste_Tag()
    {
        // 2026-12-31T23:30Z = 2027-01-01 00:30 in Berlin (Normalzeit, UTC+1).
        var jetzt = new DateTimeOffset(2026, 12, 31, 23, 30, 0, TimeSpan.Zero);

        Assert.True(Pruefen(datum: new DateOnly(2027, 1, 1), jetzt: jetzt).IstErfolgreich);
    }

    [Fact]
    public void Heute_haengt_nicht_vom_Offset_des_uebergebenen_Zeitpunkts_ab()
    {
        // Derselbe Zeitpunkt mit Offset −10 h: in Berlin ist trotzdem schon der 9.
        var jetzt = new DateTimeOffset(2026, 10, 8, 13, 30, 0, TimeSpan.FromHours(-10));

        Assert.True(Pruefen(datum: new DateOnly(2026, 10, 9), jetzt: jetzt).IstErfolgreich);
    }
}
