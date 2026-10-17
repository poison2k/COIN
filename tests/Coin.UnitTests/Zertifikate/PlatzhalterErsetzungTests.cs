using System.Diagnostics;
using static Coin.UnitTests.Zertifikate.ZertifikatDomain;

namespace Coin.UnitTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-10 bis AK-12 und AK-14 (ADR-0028 Punkt 2 bis 5, 8): <c>PlatzhalterErsetzung</c> als
/// reine Textlogik. Eingabe sind die Segmenttexte eines Absatzes (je <c>w:t</c> ein Segment) und die Werte; Ergebnis
/// ist je Segment der neue Inhalt. Der Wert steht im Segment des ersten <c>{</c> (dessen Run-Formatierung gilt), die
/// übrigen Zeichen des Platzhalters verschwinden aus den folgenden Segmenten. Zerlegung wie
/// <c>PlatzhalterPruefung</c>, ein Durchgang auf dem Originaltext. In der Darstellung steht
/// <see cref="ZertifikatDomain.Umbruch"/> für <c>w:br</c> und <see cref="ZertifikatDomain.Tab"/> für <c>w:tab</c>.
/// </summary>
public class PlatzhalterErsetzungTests
{
    private static string[] Ersetze(IReadOnlyDictionary<string, string> werte, params string[] segmente) => Ersetzen(segmente, werte);

    private static string[] Ersetze(params string[] segmente) => Ersetzen(segmente, StandardWerte(("Coin.Name", "Alpha"), ("Exemplar.Nummer", "12")));

    private static string Wert(string name, string wert) => Ersetze(StandardWerte((name, wert)), $"{{{{{name}}}}}").Single();

    // ---------- Grundfall ----------

    [Fact]
    public void Platzhalter_in_einem_Segment_wird_ersetzt()
    {
        Assert.Equal(["Alpha"], Ersetze("{{Coin.Name}}"));
    }

    [Fact]
    public void Text_vor_und_nach_dem_Platzhalter_bleibt_erhalten()
    {
        Assert.Equal(["Coin: Alpha (Nr. 12)."], Ersetze("Coin: {{Coin.Name}} (Nr. {{Exemplar.Nummer}})."));
    }

    [Fact]
    public void Ergebnis_hat_je_Segment_genau_einen_Eintrag()
    {
        Assert.Equal(4, Ersetze("a", "{{Coin.Name}}", "b", "c").Length);
    }

    [Fact]
    public void Segmente_ohne_Platzhalter_bleiben_unveraendert()
    {
        Assert.Equal(["Erster Teil ", "Alpha", " letzter Teil"], Ersetze("Erster Teil ", "{{Coin.Name}}", " letzter Teil"));
    }

    [Fact]
    public void Mehrere_Platzhalter_je_Absatz_werden_alle_ersetzt()
    {
        Assert.Equal(["Alpha Alpha 12"], Ersetze("{{Coin.Name}} {{Coin.Name}} {{Exemplar.Nummer}}"));
    }

    [Fact]
    public void Platzhalter_direkt_aneinander_werden_ersetzt()
    {
        Assert.Equal(["Alpha12"], Ersetze("{{Coin.Name}}{{Exemplar.Nummer}}"));
    }

    [Fact]
    public void Jeder_Katalog_Platzhalter_wird_durch_seinen_Wert_ersetzt()
    {
        var werte = StandardWerte();
        var text = string.Join("|", werte.Keys.Select(n => $"{{{{{n}}}}}"));

        Assert.Equal([string.Join("|", werte.Values)], Ersetze(werte, text));
    }

    // ---------- verteilte Platzhalter (AK-10) ----------

    [Fact]
    public void Platzhalter_ueber_zwei_Segmente_steht_im_ersten_Segment()
    {
        Assert.Equal(["Alpha", ""], Ersetze("{{Coin.", "Name}}"));
    }

    [Fact]
    public void Platzhalter_ueber_drei_Segmente_behaelt_den_Text_davor_und_danach()
    {
        Assert.Equal(["Vor Alpha", "", " nach"], Ersetze("Vor {{Co", "in.Na", "me}} nach"));
    }

    [Fact]
    public void Platzhalter_ueber_fuenf_Segmente_steht_im_Segment_des_ersten_Klammerzeichens()
    {
        Assert.Equal(["Alpha", "", "", "", " Ende"], Ersetze("{", "{Coin", ".Name", "}", "} Ende"));
    }

    [Fact]
    public void Erstes_Klammerzeichen_am_Ende_eines_Segments_bestimmt_das_Segment_des_Werts()
    {
        Assert.Equal(["Text Alpha", "", "!"], Ersetze("Text {", "{Coin.Name}", "}!"));
    }

    [Fact]
    public void Zwei_verteilte_Platzhalter_in_einem_Absatz_werden_beide_ersetzt()
    {
        Assert.Equal(["Alpha / 12", "!"], Ersetze("{{Coin.Name}} / {{Exem", "plar.Nummer}}!"));
    }

    [Fact]
    public void Leere_Segmente_zwischen_den_Teilen_stoeren_nicht()
    {
        Assert.Equal(["Alpha", "", ""], Ersetze("{{Coin.Na", "", "me}}"));
    }

    // ---------- Zerlegung wie die Prüfung ----------

    [Fact]
    public void Unbekannter_Platzhalter_bleibt_unveraendert()
    {
        Assert.Equal(["{{Unbekannt.Feld}} Alpha"], Ersetze("{{Unbekannt.Feld}} {{Coin.Name}}"));
    }

    [Fact]
    public void Dreifache_oeffnende_Klammer_wird_wie_in_der_Pruefung_nicht_ersetzt()
    {
        // Die Prüfung liest „{{{Coin.Name}}“ als einen (unbekannten) Platzhalter.
        Assert.Equal(["{{{Coin.Name}}"], Ersetze("{{{Coin.Name}}"));
    }

    [Fact]
    public void Unvollstaendiger_Platzhalter_bleibt_unveraendert()
    {
        Assert.Equal(["{{Coin.Name"], Ersetze("{{Coin.Name"));
    }

    [Fact]
    public void Abweichende_Schreibweise_wird_nicht_ersetzt()
    {
        Assert.Equal(["{{coin.name}} {{ Coin.Name }}"], Ersetze("{{coin.name}} {{ Coin.Name }}"));
    }

    // ---------- keine erneute Ersetzung (AK-11) ----------

    [Fact]
    public void Wert_mit_Platzhalter_Coin_Name_steht_woertlich_im_Ergebnis()
    {
        var werte = StandardWerte(("Empfaenger.Name", "{{Coin.Name}}"), ("Coin.Name", "Alpha"));

        Assert.Equal(["an {{Coin.Name}}"], Ersetze(werte, "an {{Empfaenger.Name}}"));
    }

    [Fact]
    public void Wert_mit_Platzhalter_Zertifikat_Nummer_steht_woertlich_im_Ergebnis()
    {
        var werte = StandardWerte(("Ausgabe.Begruendung", "{{Zertifikat.Nummer}}"), ("Zertifikat.Nummer", "C0042-0012"));

        Assert.Equal(["{{Zertifikat.Nummer}} C0042-0012"], Ersetze(werte, "{{Ausgabe.Begruendung}} {{Zertifikat.Nummer}}"));
    }

    [Fact]
    public void Wert_mit_offenen_Klammern_veraendert_die_Zerlegung_des_Rests_nicht()
    {
        var werte = StandardWerte(("Ausgabe.Begruendung", "x {{"), ("Coin.Name", "Alpha"));

        Assert.Equal(["x {{Alpha"], Ersetze(werte, "{{Ausgabe.Begruendung}}{{Coin.Name}}"));
    }

    [Fact]
    public void Wert_mit_schliessenden_Klammern_steht_woertlich_im_Ergebnis()
    {
        var werte = StandardWerte(("Ausgabe.Gelegenheit", "}} {{Coin.Name}} {{"), ("Coin.Name", "Alpha"));

        Assert.Equal(["}} {{Coin.Name}} {{ / Alpha"], Ersetze(werte, "{{Ausgabe.Gelegenheit}} / {{Coin.Name}}"));
    }

    // ---------- leere Werte (AK-12, F8) ----------

    [Fact]
    public void Leerer_Wert_laesst_den_Platzhalter_verschwinden()
    {
        var werte = StandardWerte(("Empfaenger.Dienstgrad", string.Empty), ("Empfaenger.Name", "Max Beispiel"));

        Assert.Equal([" Max Beispiel"], Ersetze(werte, "{{Empfaenger.Dienstgrad}} {{Empfaenger.Name}}"));
    }

    [Fact]
    public void Leerer_Wert_in_einem_verteilten_Platzhalter_leert_alle_Teile()
    {
        var werte = StandardWerte(("Empfaenger.Dienststelle", string.Empty));

        Assert.Equal(["(", "", ")"], Ersetze(werte, "({{Empfaenger.Dienst", "stelle}}", ")"));
    }

    // ---------- Werte als Text (AK-11) ----------

    [Theory]
    [InlineData("& < > \" '")]
    [InlineData("Jürgen Öztürk-Weiß")]
    [InlineData("Preis 5 €")]
    [InlineData("Emoji 😀 und 𝄞")]
    [InlineData("<w:t>kein XML</w:t>")]
    public void Sonderzeichen_erscheinen_unveraendert(string wert)
    {
        Assert.Equal(wert, Wert("Empfaenger.Name", wert));
    }

    [Theory]
    [InlineData("  zwei vorne")]
    [InlineData("hinten zwei  ")]
    [InlineData("mehrfach   Leerzeichen")]
    public void Leerzeichen_bleiben_erhalten(string wert)
    {
        Assert.Equal(wert, Wert("Ausgabe.Gelegenheit", wert));
    }

    [Theory]
    [InlineData("a\r\nb")]
    [InlineData("a\rb")]
    [InlineData("a\nb")]
    [InlineData("a\u0085b")]
    [InlineData("a\u2028b")]
    [InlineData("a\u2029b")]
    public void Zeilenumbrueche_werden_je_zu_einem_Umbruch(string wert)
    {
        Assert.Equal($"a{Umbruch}b", Wert("Ausgabe.Begruendung", wert));
    }

    [Fact]
    public void Mehrere_Zeilenumbrueche_ergeben_mehrere_Umbrueche()
    {
        Assert.Equal($"a{Umbruch}{Umbruch}b{Umbruch}c", Wert("Ausgabe.Begruendung", "a\n\nb\r\nc"));
    }

    [Fact]
    public void Zeilenumbruch_im_Wert_steht_im_Segment_des_ersten_Klammerzeichens()
    {
        var werte = StandardWerte(("Ausgabe.Begruendung", "Zeile 1\nZeile 2"));

        Assert.Equal([$"Begründung: Zeile 1{Umbruch}Zeile 2", "."], Ersetze(werte, "Begründung: {{Ausgabe.Begr", "uendung}}."));
    }

    [Fact]
    public void Tabulator_wird_zu_einem_Tab()
    {
        Assert.Equal($"a{Tab}b", Wert("Ausgabe.Begruendung", "a\tb"));
    }

    // Zeichen in Codepunkten statt InlineData: Steuerzeichen und einzelne Surrogate in Attributen stören die Testerkennung.
    public static TheoryData<int> UnzulaessigeZeichen => [0x0, 0x1, 0x8, 0xB, 0xC, 0xE, 0x1F, 0xFFFE, 0xFFFF];

    [Theory]
    [MemberData(nameof(UnzulaessigeZeichen))]
    public void In_XML_unzulaessige_Zeichen_werden_entfernt(int codepunkt)
    {
        Assert.Equal("ab", Wert("Ausgabe.Begruendung", $"a{(char)codepunkt}b"));
    }

    public static TheoryData<int, bool> Surrogate => new() { { 0xD800, true }, { 0xDC00, true }, { 0xDBFF, false } };

    [Theory]
    [MemberData(nameof(Surrogate))]
    public void Einzelnes_Surrogat_wird_zum_Ersatzzeichen(int codepunkt, bool mitFolgetext)
    {
        var folge = mitFolgetext ? "b" : string.Empty;

        Assert.Equal($"a�{folge}", Wert("Ausgabe.Begruendung", $"a{(char)codepunkt}{folge}"));
    }

    [Fact]
    public void Gueltiges_Surrogatpaar_bleibt_erhalten()
    {
        Assert.Equal("a😀b", Wert("Ausgabe.Begruendung", "a😀b"));
    }

    [Fact]
    public void Langer_Wert_wird_nicht_gekuerzt()
    {
        var lang = string.Concat(Enumerable.Range(0, 2000).Select(i => (char)('a' + (i % 26))));

        Assert.Equal(lang, Wert("Ausgabe.Begruendung", lang));
    }

    // ---------- Zählung und Grenze (AK-14) ----------

    [Fact]
    public void Grenze_ist_200()
    {
        Assert.Equal(200, Grenze());
    }

    [Fact]
    public void Vorkommen_werden_ueber_alle_Absaetze_gezaehlt()
    {
        Assert.Equal(4, VorkommenZaehlen(["{{Coin.Name}} und {{Coin.Name}}", "Nr. {{Exemplar.Nummer}}", "ohne", "{{Empfaenger.Name}}"]));
    }

    [Fact]
    public void Text_ohne_Platzhalter_hat_null_Vorkommen()
    {
        Assert.Equal(0, VorkommenZaehlen(["kein Platzhalter", "{ einfach }"]));
    }

    [Theory]
    [InlineData(200)]
    [InlineData(201)]
    public void Zaehlung_trifft_die_Grenze_genau(int anzahl)
    {
        var absaetze = Enumerable.Repeat("{{Coin.Name}}", anzahl).ToList();

        Assert.Equal(anzahl, VorkommenZaehlen(absaetze));
    }

    // ---------- Laufzeit ----------

    [Fact]
    public async Task Zweihundert_Vorkommen_mit_je_2000_Zeichen_werden_unter_einer_Sekunde_ersetzt()
    {
        var werte = StandardWerte(("Ausgabe.Begruendung", new string('b', 1999) + "\n"));
        var segmente = Enumerable.Range(0, 200).Select(i => i % 2 == 0 ? "{{Ausgabe.Begr" : "uendung}} ").ToArray();
        // 2 Absätze mit je 100 verteilten Platzhaltern = 200 Vorkommen.
        var absaetze = Enumerable.Range(0, 2).Select(_ => segmente).ToList();

        var uhr = Stopwatch.StartNew();
        var ergebnis = await Task.Run(() => absaetze.Select(s => Ersetzen(s, werte)).ToList()).WaitAsync(TimeSpan.FromSeconds(10));
        uhr.Stop();

        Assert.Equal(2, ergebnis.Count);
        Assert.True(uhr.Elapsed < TimeSpan.FromSeconds(1), $"Ersetzung dauerte {uhr.Elapsed.TotalMilliseconds:F0} ms.");
    }
}
