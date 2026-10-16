using Coin.Domain.Vorlagen;

namespace Coin.UnitTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen, AK-8, AK-15 und AK-16 (ADR-0024 Punkt 1 und 3): Ablauf Prüfen → Bereinigen →
/// vollständige Nachprüfung in <see cref="VorlagenAufbereitung"/>, mit Fakes für <see cref="IDocxAnalyse"/> und
/// <see cref="IDocxBereinigung"/>. Nur <see cref="VorlageAufbereitenErgebnis.Angenommen"/> darf gespeichert werden;
/// es trägt immer die bereinigte Fassung.
/// </summary>
public class VorlagenAufbereitungTests
{
    private const int FuenfMiB = 5_242_880;

    private const string NichtVerarbeitbar =
        "Die Datei konnte nicht verarbeitet werden. Bitte in Word erneut als Word-Dokument (.docx) speichern und erneut hochladen.";

    private static readonly string[] PflichtAbsaetze =
        ["{{Coin.Name}}", "{{Exemplar.Nummer}}", "{{Zertifikat.Nummer}}", "{{Empfaenger.Name}}"];

    private static readonly byte[] Original = [1, 2, 3];

    private static readonly byte[] Bereinigt = [9, 8, 7, 6];

    /// <summary>Liefert je Eingabe (per Referenz) einen festgelegten Befund und merkt sich die Aufrufe.</summary>
    private sealed class FakeAnalyse : IDocxAnalyse
    {
        private readonly List<(byte[] Inhalt, DocxBefund Befund)> _befunde = [];

        public List<byte[]> Aufrufe { get; } = [];

        public FakeAnalyse Fuer(byte[] inhalt, DocxBefund befund)
        {
            _befunde.Add((inhalt, befund));
            return this;
        }

        public DocxBefund Analysieren(byte[] inhalt)
        {
            Aufrufe.Add(inhalt);
            foreach (var (bekannt, befund) in _befunde)
            {
                if (ReferenceEquals(bekannt, inhalt))
                {
                    return befund;
                }
            }

            throw new InvalidOperationException("Unerwartete Eingabe für die Analyse.");
        }
    }

    private sealed class FakeBereinigung(Func<byte[], byte[]> bereinigen) : IDocxBereinigung
    {
        public List<byte[]> Aufrufe { get; } = [];

        public byte[] Bereinigen(byte[] inhalt)
        {
            Aufrufe.Add(inhalt);
            return bereinigen(inhalt);
        }
    }

    private static DocxBefund Gelesen(params string[] absatztexte) => new DocxBefund.Gelesen(absatztexte);

    private static DocxBefund Abgelehnt(params string[] meldungen) => new DocxBefund.Abgelehnt(meldungen);

    private static (VorlagenAufbereitung Aufbereitung, FakeAnalyse Analyse, FakeBereinigung Bereinigung) Aufbau(
        DocxBefund befundOriginal, DocxBefund? befundBereinigt = null, byte[]? bereinigt = null)
    {
        var ziel = bereinigt ?? Bereinigt;
        var analyse = new FakeAnalyse().Fuer(Original, befundOriginal).Fuer(ziel, befundBereinigt ?? Gelesen(PflichtAbsaetze));
        var bereinigung = new FakeBereinigung(_ => ziel);
        return (new VorlagenAufbereitung(analyse, bereinigung), analyse, bereinigung);
    }

    // ---------- Erfolg ----------

    [Fact]
    public void Gueltige_Datei_wird_angenommen()
    {
        var (aufbereitung, _, _) = Aufbau(Gelesen(PflichtAbsaetze));

        Assert.IsType<VorlageAufbereitenErgebnis.Angenommen>(aufbereitung.Aufbereiten(Original));
    }

    [Fact]
    public void Angenommen_wird_die_bereinigte_Fassung_nicht_das_Original()
    {
        var (aufbereitung, _, _) = Aufbau(Gelesen(PflichtAbsaetze));

        var ergebnis = Assert.IsType<VorlageAufbereitenErgebnis.Angenommen>(aufbereitung.Aufbereiten(Original));

        Assert.Equal(Bereinigt, ergebnis.Inhalt);
    }

    [Fact]
    public void Bereinigt_wird_die_gepruefte_Originaldatei()
    {
        var (aufbereitung, _, bereinigung) = Aufbau(Gelesen(PflichtAbsaetze));

        aufbereitung.Aufbereiten(Original);

        Assert.Same(Original, Assert.Single(bereinigung.Aufrufe));
    }

    [Fact]
    public void Die_bereinigte_Fassung_wird_vollstaendig_nachgeprueft()
    {
        var (aufbereitung, analyse, _) = Aufbau(Gelesen(PflichtAbsaetze));

        aufbereitung.Aufbereiten(Original);

        Assert.Equal(2, analyse.Aufrufe.Count);
        Assert.Same(Original, analyse.Aufrufe[0]);
        Assert.Same(Bereinigt, analyse.Aufrufe[1]);
    }

    [Fact]
    public void Bereinigte_Fassung_mit_genau_5_MiB_wird_angenommen()
    {
        var gross = new byte[FuenfMiB];
        var (aufbereitung, _, _) = Aufbau(Gelesen(PflichtAbsaetze), bereinigt: gross);

        Assert.IsType<VorlageAufbereitenErgebnis.Angenommen>(aufbereitung.Aufbereiten(Original));
    }

    // ---------- Ablehnung vor der Bereinigung ----------

    [Fact]
    public void Strukturbefund_wird_mit_den_Meldungen_der_Analyse_abgelehnt()
    {
        var (aufbereitung, _, _) = Aufbau(Abgelehnt("Die Datei enthält Makros. Bitte als Word-Dokument ohne Makros (.docx) speichern."));

        var ergebnis = Assert.IsType<VorlageAufbereitenErgebnis.Abgelehnt>(aufbereitung.Aufbereiten(Original));

        Assert.Equal(["Die Datei enthält Makros. Bitte als Word-Dokument ohne Makros (.docx) speichern."], ergebnis.Meldungen);
    }

    [Fact]
    public void Mehrere_Strukturmeldungen_bleiben_in_ihrer_Reihenfolge_erhalten()
    {
        var (aufbereitung, _, _) = Aufbau(Abgelehnt("Erste Meldung.", "Zweite Meldung."));

        var ergebnis = Assert.IsType<VorlageAufbereitenErgebnis.Abgelehnt>(aufbereitung.Aufbereiten(Original));

        Assert.Equal(["Erste Meldung.", "Zweite Meldung."], ergebnis.Meldungen);
    }

    [Fact]
    public void Bei_Strukturbefund_wird_nicht_bereinigt()
    {
        var (aufbereitung, _, bereinigung) = Aufbau(Abgelehnt("Befund."));

        aufbereitung.Aufbereiten(Original);

        Assert.Empty(bereinigung.Aufrufe);
    }

    [Fact]
    public void Platzhalterbefund_wird_mit_den_Meldungen_der_Platzhalterpruefung_abgelehnt()
    {
        var (aufbereitung, _, _) = Aufbau(Gelesen("{{Coin.Name}}", "{{Exemplar.Nummer}}", "{{Empfaenger.Name}}", "{{Empfaenger.Nam}}"));

        var ergebnis = Assert.IsType<VorlageAufbereitenErgebnis.Abgelehnt>(aufbereitung.Aufbereiten(Original));

        Assert.Equal(
            [
                "Es fehlen Pflichtplatzhalter: {{Zertifikat.Nummer}}.",
                "Unbekannte Platzhalter: {{Empfaenger.Nam}}. Erlaubt sind nur die Platzhalter aus der Standardvorlage.",
            ],
            ergebnis.Meldungen);
    }

    [Fact]
    public void Bei_Platzhalterbefund_wird_nicht_bereinigt()
    {
        var (aufbereitung, _, bereinigung) = Aufbau(Gelesen("{{Coin.Name}}"));

        aufbereitung.Aufbereiten(Original);

        Assert.Empty(bereinigung.Aufrufe);
    }

    // ---------- Nachprüfung ----------

    [Fact]
    public void Nachpruefung_mit_Strukturbefund_wird_als_nicht_verarbeitbar_abgelehnt()
    {
        var (aufbereitung, _, _) = Aufbau(Gelesen(PflichtAbsaetze), befundBereinigt: Abgelehnt("Interner Befund mit Inhalt."));

        var ergebnis = Assert.IsType<VorlageAufbereitenErgebnis.Abgelehnt>(aufbereitung.Aufbereiten(Original));

        Assert.Equal([NichtVerarbeitbar], ergebnis.Meldungen);
    }

    [Fact]
    public void Nachpruefung_mit_veraenderten_Platzhaltern_wird_als_nicht_verarbeitbar_abgelehnt()
    {
        var (aufbereitung, _, _) = Aufbau(Gelesen(PflichtAbsaetze), befundBereinigt: Gelesen("{{Coin.Name}}"));

        var ergebnis = Assert.IsType<VorlageAufbereitenErgebnis.Abgelehnt>(aufbereitung.Aufbereiten(Original));

        Assert.Equal([NichtVerarbeitbar], ergebnis.Meldungen);
    }

    [Fact]
    public void Bereinigte_Fassung_ueber_5_MiB_wird_als_nicht_verarbeitbar_abgelehnt()
    {
        var zuGross = new byte[FuenfMiB + 1];
        var (aufbereitung, _, _) = Aufbau(Gelesen(PflichtAbsaetze), bereinigt: zuGross);

        var ergebnis = Assert.IsType<VorlageAufbereitenErgebnis.Abgelehnt>(aufbereitung.Aufbereiten(Original));

        Assert.Equal([NichtVerarbeitbar], ergebnis.Meldungen);
    }

    [Fact]
    public void Leere_bereinigte_Fassung_wird_als_nicht_verarbeitbar_abgelehnt()
    {
        var leer = Array.Empty<byte>();
        var (aufbereitung, _, _) = Aufbau(Gelesen(PflichtAbsaetze), befundBereinigt: Abgelehnt("Leer."), bereinigt: leer);

        var ergebnis = Assert.IsType<VorlageAufbereitenErgebnis.Abgelehnt>(aufbereitung.Aufbereiten(Original));

        Assert.Equal([NichtVerarbeitbar], ergebnis.Meldungen);
    }

    [Fact]
    public void Ausnahme_der_Bereinigung_wird_ohne_Details_als_nicht_verarbeitbar_abgelehnt()
    {
        var analyse = new FakeAnalyse().Fuer(Original, Gelesen(PflichtAbsaetze));
        var bereinigung = new FakeBereinigung(_ => throw new InvalidOperationException("Geheimer Dokumentinhalt"));
        var aufbereitung = new VorlagenAufbereitung(analyse, bereinigung);

        var ergebnis = Assert.IsType<VorlageAufbereitenErgebnis.Abgelehnt>(aufbereitung.Aufbereiten(Original));

        Assert.Equal([NichtVerarbeitbar], ergebnis.Meldungen);
    }

    [Fact]
    public void Konstante_MaxGroesseBytes_ist_5_MiB()
    {
        Assert.Equal(FuenfMiB, VorlagenAufbereitung.MaxGroesseBytes);
    }
}
