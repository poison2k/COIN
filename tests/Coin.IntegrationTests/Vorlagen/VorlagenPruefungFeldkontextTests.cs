using System.Net;
using System.Security;
using System.Text;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 6 (nach QA-Review 4), AK-13 K1 (ADR-0024 Punkt 1.6): „Feldanweisungen in
/// Alternativ- oder Fremdinhalten“. Word liest von <c>mc:AlternateContent</c> nur einen Zweig und verwirft
/// ignorierbare Fremdelemente; deshalb ist ein Feldelement (<c>w:fldChar</c>, <c>w:instrText</c>, <c>w:fldSimple</c>)
/// nur zulässig, wenn alle Vorfahren bis einschließlich seines Feldkontexts (nächstes <c>w:txbxContent</c>, sonst
/// Teilwurzel) im <c>w</c>-Namespace liegen, und innerhalb einer offenen Anweisung darf kein
/// <c>mc:AlternateContent</c> oder <c>w:txbxContent</c> beginnen. Felder werden je Feldkontext verkettet.
/// Jede Ablehnung nennt die wörtliche Meldung unter <c>errors.datei</c> und speichert nichts (kein Audit).
/// </summary>
public class VorlagenPruefungFeldkontextTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string FeldArt = "Felder mit externen Verknüpfungen oder DDE";
    private const string AlternativArt = "Feldanweisungen in Alternativ- oder Fremdinhalten";

    /// <summary>
    /// Namensräume der Testdokumente: wie <see cref="DocxBauer.Namensraeume"/>, zusätzlich ignorierbares <c>w15</c> und
    /// <c>m</c>. (Rev. 7: Die Ignorable-Variante nutzt den erlaubten Namespace <c>w15</c> statt
    /// <c>urn:example:ignorierbar</c>; ein nicht erlaubter Namespace ergäbe vorher die Erweiterungsmeldung.)
    /// </summary>
    private static readonly string TestNamensraeume = Namensraeume.Replace(
        "mc:Ignorable=\"w14\"",
        "xmlns:w15=\"http://schemas.microsoft.com/office/word/2012/wordml\" xmlns:m=\"http://schemas.openxmlformats.org/officeDocument/2006/math\" mc:Ignorable=\"w14 w15\"",
        StringComparison.Ordinal);

    private static string XmlKopf => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";

    /// <summary>Hauptdokument mit den Pflichtplatzhaltern und den Absätzen (Blockinhalt), Wurzel mit <c>mc:Ignorable="w14 w15"</c>.</summary>
    private static DocxBauer Dokument(params string[] bloecke) => new()
    {
        DokumentInhalt = XmlKopf + $"<w:document {TestNamensraeume}><w:body>{string.Concat(PflichtAbsaetze)}{string.Concat(bloecke)}<w:sectPr/></w:body></w:document>",
    };

    private async Task<string[]> AbgelehntOhneSpeichernAsync(byte[] datei)
    {
        var coinId = await CoinAsync();
        var vorher = await SpeicherZustandAsync(coinId);

        var meldungen = await AbgelehntAsync(coinId, datei);

        Assert.Equal(vorher, await SpeicherZustandAsync(coinId));
        return meldungen;
    }

    private async Task AngenommenAsync(byte[] datei)
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, datei);

        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"{(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
    }

    // ---------- Bausteine ----------

    private static string FldChar(string art) => $"<w:fldChar w:fldCharType=\"{art}\"/>";

    private static string InstrText(string text) => $"<w:instrText xml:space=\"preserve\">{SecurityElement.Escape(text)}</w:instrText>";

    private static string FeldBeginn => $"<w:r>{FldChar("begin")}</w:r>";

    private static string FeldTrenner => $"<w:r>{FldChar("separate")}</w:r>";

    private static string FeldEnde => $"<w:r>{FldChar("end")}</w:r>";

    /// <summary>Run mit einer Feldanweisung außerhalb jedes Einschubs.</summary>
    private static string Aus(string text) => $"<w:r>{InstrText(text)}</w:r>";

    /// <summary>
    /// Einschub in der Variante <paramref name="variante"/>: <c>Fallback</c> (leeres <c>mc:Choice Requires="w14"</c>,
    /// Inhalt nur in <c>mc:Fallback</c>), <c>Choice</c> (Inhalt nur in <c>mc:Choice</c>, <paramref name="ersatz"/> im
    /// Fallback) oder <c>Ignorable</c> (Inhalt in <c>w15:zusatz</c>, Namespace per <c>mc:Ignorable</c> ignorierbar).
    /// </summary>
    private static string Einschub(string variante, string inhalt, string ersatz = "") => variante switch
    {
        "Fallback" => $"<mc:AlternateContent><mc:Choice Requires=\"w14\">{ersatz}</mc:Choice><mc:Fallback>{inhalt}</mc:Fallback></mc:AlternateContent>",
        "Choice" => $"<mc:AlternateContent><mc:Choice Requires=\"w14\">{inhalt}</mc:Choice><mc:Fallback>{ersatz}</mc:Fallback></mc:AlternateContent>",
        "Ignorable" => $"<w15:zusatz>{inhalt}</w15:zusatz>{ersatz}",
        _ => throw new ArgumentOutOfRangeException(nameof(variante), variante, null),
    };

    /// <summary>Run, dessen Inhalt (<c>w:instrText</c> bzw. <c>w:fldChar</c>) im Einschub steht.</summary>
    private static string EinschubRun(string variante, string runInhalt) => $"<w:r>{Einschub(variante, runInhalt)}</w:r>";

    /// <summary>Komplexes Feld in einem Absatz: <c>begin</c>, die Anweisungs-Runs, <c>separate</c>, Ergebnis, <c>end</c>.</summary>
    private static string Feld(params string[] anweisungsRuns) =>
        P(FeldBeginn, string.Concat(anweisungsRuns), FeldTrenner, Run("Ergebnis"), FeldEnde);

    private static string PageFeld => Feld(Aus(" PAGE "));

    private static readonly string[] Varianten = ["Fallback", "Choice", "Ignorable"];

    private static TheoryData<string, string> JeVariante(params string[] faelle)
    {
        var daten = new TheoryData<string, string>();
        foreach (var fall in faelle)
        {
            foreach (var variante in Varianten)
            {
                daten.Add(fall, variante);
            }
        }

        return daten;
    }

    /// <summary>Textfeld in der Word-Form (<c>wp:anchor</c>, DrawingML in <c>mc:Choice</c>, VML in <c>mc:Fallback</c>), beide Zweige mit denselben Absätzen.</summary>
    private static string TextfeldWordForm(string absaetze) =>
        "<w:r><mc:AlternateContent><mc:Choice Requires=\"wps\"><w:drawing>" +
        "<wp:anchor distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\" simplePos=\"0\" relativeHeight=\"1\" behindDoc=\"0\" locked=\"0\" layoutInCell=\"1\" allowOverlap=\"1\">" +
        "<wp:simplePos x=\"0\" y=\"0\"/><wp:positionH relativeFrom=\"column\"><wp:posOffset>0</wp:posOffset></wp:positionH>" +
        "<wp:positionV relativeFrom=\"paragraph\"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx=\"2000000\" cy=\"500000\"/>" +
        "<wp:wrapNone/><wp:docPr id=\"5\" name=\"Textfeld 5\"/><a:graphic><a:graphicData uri=\"http://schemas.microsoft.com/office/word/2010/wordprocessingShape\">" +
        $"<wps:wsp><wps:cNvSpPr txBox=\"1\"/><wps:spPr/><wps:txbx><w:txbxContent>{absaetze}</w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp>" +
        "</a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict>" +
        $"<v:shape id=\"Textfeld5\" style=\"width:100pt;height:30pt\"><v:textbox><w:txbxContent>{absaetze}</w:txbxContent></v:textbox></v:shape>" +
        "</w:pict></mc:Fallback></mc:AlternateContent></w:r>";

    /// <summary>Textfeld nur als VML.</summary>
    private static string TextfeldVml(string absaetze) =>
        $"<w:r><w:pict><v:shape id=\"Textfeld6\" style=\"width:100pt;height:30pt\"><v:textbox><w:txbxContent>{absaetze}</w:txbxContent></v:textbox></v:shape></w:pict></w:r>";

    // ---------- Vorfahrenregel: Einschübe in einer Feldanweisung ----------

    private static string Konstruktion(string fall, string variante) => fall switch
    {
        // Word liest „INCLUDETEXT …“, die Verkettung über alle Zweige „XINCLUDETEXT …“.
        "Praefix X vor INCLUDETEXT" => Feld(EinschubRun(variante, InstrText("X")), Aus("INCLUDETEXT \"C:\\\\x.docx\" ")),
        // Word liest „INCLUDEPICTURE …“, die Verkettung „INCLUDEYPICTURE …“.
        "INCLUDE, Y im Einschub, PICTURE" => Feld(Aus(" INCLUDE"), EinschubRun(variante, InstrText("Y")), Aus("PICTURE \"http://example.invalid/x.png\" ")),
        "Praefix X vor LINK" => Feld(EinschubRun(variante, InstrText("X")), Aus("LINK Word.Document.12 \"C:\\\\x.docx\" ")),
        // Word liest die Adresse file:///C:/x, die Verkettung „\o "file:///C:/x"“ (QuickInfo).
        "HYPERLINK mit \\o nur im Einschub" => Feld(Aus(" HYPERLINK \"https://example.invalid\" "), EinschubRun(variante, InstrText("\\o ")), Aus("\"file:///C:/x\" ")),
        _ => throw new ArgumentOutOfRangeException(nameof(fall), fall, null),
    };

    public static TheoryData<string, string> EinschuebeInDerAnweisung => JeVariante(
        "Praefix X vor INCLUDETEXT",
        "INCLUDE, Y im Einschub, PICTURE",
        "Praefix X vor LINK",
        "HYPERLINK mit \\o nur im Einschub");

    [Theory]
    [MemberData(nameof(EinschuebeInDerAnweisung))]
    public async Task Feldanweisung_mit_Teil_in_Alternativ_oder_Fremdinhalt_wird_abgelehnt(string fall, string variante)
    {
        var datei = Dokument(Konstruktion(fall, variante)).Bytes();

        Assert.Equal([Unzulaessig(AlternativArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    private static string FeldMitFldCharImEinschub(string art, string variante) => art switch
    {
        "begin" => P(EinschubRun(variante, FldChar("begin")), Aus(" PAGE "), FeldTrenner, Run("Ergebnis"), FeldEnde),
        "separate" => P(FeldBeginn, Aus(" PAGE "), EinschubRun(variante, FldChar("separate")), Run("Ergebnis"), FeldEnde),
        "end" => P(FeldBeginn, Aus(" PAGE "), FeldTrenner, Run("Ergebnis"), EinschubRun(variante, FldChar("end"))),
        _ => throw new ArgumentOutOfRangeException(nameof(art), art, null),
    };

    public static TheoryData<string, string> FldCharImEinschub => JeVariante("begin", "separate", "end");

    [Theory]
    [MemberData(nameof(FldCharImEinschub))]
    public async Task FldChar_in_Alternativ_oder_Fremdinhalt_wird_abgelehnt(string art, string variante)
    {
        var datei = Dokument(FeldMitFldCharImEinschub(art, variante)).Bytes();

        Assert.Equal([Unzulaessig(AlternativArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    public static TheoryData<string> AlleVarianten => [.. Varianten];

    [Theory]
    [MemberData(nameof(AlleVarianten))]
    public async Task Einfaches_DDE_Feld_in_Alternativ_oder_Fremdinhalt_meldet_nur_Alternativinhalt(string variante)
    {
        var absatz = P(Einschub(variante, $"<w:fldSimple w:instr=\"DDE x\">{Run("Ergebnis")}</w:fldSimple>", Run("Ersatz")));

        Assert.Equal([Unzulaessig(AlternativArt)], await AbgelehntOhneSpeichernAsync(Dokument(absatz).Bytes()));
    }

    [Fact]
    public async Task Feld_in_einer_Formel_wird_abgelehnt()
    {
        var formel = P(
            "<m:oMath>" +
            $"<m:r>{FldChar("begin")}</m:r><m:r>{InstrText(" PAGE ")}</m:r><m:r>{FldChar("separate")}</m:r>" +
            "<m:r><m:t>1</m:t></m:r>" +
            $"<m:r>{FldChar("end")}</m:r>" +
            "</m:oMath>");

        Assert.Equal([Unzulaessig(AlternativArt)], await AbgelehntOhneSpeichernAsync(Dokument(formel).Bytes()));
    }

    [Theory]
    [MemberData(nameof(AlleVarianten))]
    public async Task Absatz_mit_vollstaendigem_Feld_in_Alternativ_oder_Fremdinhalt_wird_abgelehnt(string variante)
    {
        var block = Einschub(variante, PageFeld, Text("Ersatz"));

        Assert.Equal([Unzulaessig(AlternativArt)], await AbgelehntOhneSpeichernAsync(Dokument(block).Bytes()));
    }

    [Fact]
    public async Task Feldkontext_mit_Alternativinhalt_wird_nicht_weiter_ausgewertet_das_Beispiel_aus_AK_13()
    {
        // Präfix X nur in mc:Fallback, danach INCLUDETEXT: genau eine Art, nicht zusätzlich DDE/Include.
        var datei = Dokument(Konstruktion("Praefix X vor INCLUDETEXT", "Fallback")).Bytes();

        var meldungen = await AbgelehntOhneSpeichernAsync(datei);

        Assert.Equal(["Die Datei enthält unzulässige Inhalte: Feldanweisungen in Alternativ- oder Fremdinhalten."], meldungen);
    }

    // ---------- Alternativinhalt in offener Anweisung ----------

    public static TheoryData<string> TextfeldFormen => ["Word-Form", "VML"];

    [Theory]
    [MemberData(nameof(TextfeldFormen))]
    public async Task Textfeld_innerhalb_einer_offenen_Feldanweisung_wird_abgelehnt(string form)
    {
        var textfeldAbsatz = Text("Textfeld");
        var textfeld = form == "Word-Form" ? TextfeldWordForm(textfeldAbsatz) : TextfeldVml(textfeldAbsatz);
        var absatz = P(FeldBeginn, Aus(" PAGE "), textfeld, FeldTrenner, Run("Ergebnis"), FeldEnde);

        Assert.Equal([Unzulaessig(AlternativArt)], await AbgelehntOhneSpeichernAsync(Dokument(absatz).Bytes()));
    }

    // ---------- Feldkontexte getrennt ----------

    [Fact]
    public async Task Unvollstaendiges_Feld_im_Textfeld_verschachtelt_das_aeussere_DDE_Feld_nicht()
    {
        var textfeld = P(TextfeldWordForm(P(FeldBeginn, Aus(" PAGE "))));
        var dde = Feld(Aus(" DDE excel \"C:\\\\x.xls\" \"R1C1\" "));

        Assert.Equal([Unzulaessig(FeldArt)], await AbgelehntOhneSpeichernAsync(Dokument(textfeld, dde).Bytes()));
    }

    [Fact]
    public async Task DDE_Feld_im_Textfeld_der_Word_Form_wird_als_DDE_abgelehnt()
    {
        var textfeld = P(TextfeldWordForm(Feld(Aus(" DDE excel \"C:\\\\x.xls\" \"R1C1\" "))));

        Assert.Equal([Unzulaessig(FeldArt)], await AbgelehntOhneSpeichernAsync(Dokument(textfeld).Bytes()));
    }

    [Fact]
    public async Task Befund_im_Hauptteil_unterdrueckt_die_Feldpruefung_der_Kopfzeile_nicht()
    {
        var datei = Dokument(Konstruktion("Praefix X vor INCLUDETEXT", "Fallback"))
            .Kopfzeile("default", Feld(Aus(" DDE excel \"C:\\\\x.xls\" \"R1C1\" ")))
            .Bytes();

        Assert.Equal([Unzulaessig(FeldArt, AlternativArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Neue_Art_steht_zwischen_verschachtelten_Feldanweisungen_und_unzulaessigem_Feldnamen()
    {
        var verschachtelt = P(
            FeldBeginn, Aus(" "), FeldBeginn, Aus(" QUOTE x "), FeldEnde, Aus(" y "), FeldTrenner, Run("Ergebnis"), FeldEnde);
        var datei = Gueltig()
            .Absaetze(verschachtelt, Feld(Aus(" \"X\" ")))
            .KopfzeileAls("header1.xml", "default", [], Encoding.UTF8.GetBytes(
                XmlKopf + $"<w:hdr {TestNamensraeume}>{Konstruktion("Praefix X vor LINK", "Ignorable")}</w:hdr>"))
            .Bytes();

        Assert.Equal(
            [Unzulaessig("Felder mit verschachtelten Feldanweisungen", AlternativArt, "Felder mit unzulässigem Feldnamen")],
            await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Befund_im_Textfeld_unterdrueckt_die_Feldpruefung_des_aeusseren_Kontexts_nicht()
    {
        var textfeld = P(TextfeldWordForm(Konstruktion("Praefix X vor INCLUDETEXT", "Ignorable")));
        var dde = Feld(Aus(" DDE excel \"C:\\\\x.xls\" \"R1C1\" "));

        Assert.Equal([Unzulaessig(FeldArt, AlternativArt)], await AbgelehntOhneSpeichernAsync(Dokument(textfeld, dde).Bytes()));
    }

    // ---------- Kontrollfälle: angenommen ----------

    [Fact]
    public async Task Textfeld_der_Word_Form_mit_PAGE_Feld_im_Hauptteil_wird_angenommen()
    {
        await AngenommenAsync(Dokument(P(TextfeldWordForm(PageFeld))).Bytes());
    }

    [Fact]
    public async Task Textfeld_der_Word_Form_mit_PAGE_Feld_in_der_Kopfzeile_wird_angenommen()
    {
        await AngenommenAsync(Gueltig().Kopfzeile("default", P(TextfeldWordForm(PageFeld))).Bytes());
    }

    [Fact]
    public async Task Reines_VML_Textfeld_mit_PAGE_Feld_wird_angenommen()
    {
        await AngenommenAsync(Dokument(P(TextfeldVml(PageFeld))).Bytes());
    }

    private static string PageRuns => FeldBeginn + Aus(" PAGE ") + FeldTrenner + Run("1") + FeldEnde;

    private static string FeldImWNamespace(string ort) => ort switch
    {
        "Tabellenzelle" => Testvorlagen.Tabelle(PageFeld) + "<w:p/>",
        "w:sdt" => Testvorlagen.SdtBlock(PageFeld),
        "w:sdt im Absatz" => Testvorlagen.SdtImAbsatz(PageRuns),
        "w:hyperlink" => P($"<w:hyperlink w:anchor=\"Marke\">{PageRuns}</w:hyperlink>"),
        "w:smartTag" => Testvorlagen.SmartTag(PageRuns),
        "w:customXml" => P($"<w:customXml w:uri=\"urn:beispiel\" w:element=\"feld\">{PageRuns}</w:customXml>"),
        _ => throw new ArgumentOutOfRangeException(nameof(ort), ort, null),
    };

    [Theory]
    [InlineData("Tabellenzelle")]
    [InlineData("w:sdt")]
    [InlineData("w:sdt im Absatz")]
    [InlineData("w:hyperlink")]
    [InlineData("w:smartTag")]
    [InlineData("w:customXml")]
    public async Task PAGE_Feld_in_Elementen_des_w_Namespace_wird_angenommen(string ort)
    {
        await AngenommenAsync(Dokument(FeldImWNamespace(ort)).Bytes());
    }

    [Fact]
    public async Task Standardvorlage_wird_angenommen()
    {
        await AngenommenAsync(await StandardvorlageAsync());
    }

    [Fact]
    public async Task Testdokument_ohne_Felder_mit_ignorierbarem_Namespace_wird_angenommen()
    {
        // Gegenprobe für die Bausteine: die zusätzlichen Namespace-Deklarationen allein sind kein Befund.
        var datei = Dokument(P(Run("Text")), P("<w:r><w15:zusatz>x</w15:zusatz></w:r>")).Bytes();

        await AngenommenAsync(datei);
    }
}
