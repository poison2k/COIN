using System.Diagnostics;
using System.Net;
using System.Text;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 3, AK-10 bis AK-15 (ADR-0024 Punkt 1), Angriffsproben aus dem QA-Review:
/// <list type="bullet">
/// <item>K1: XML-Teil nach Content-Type statt Endung; Story-/Strukturteile, die fehlen oder kein XML sind, Einträge
/// ohne Content-Type, nicht wohlgeformte XML-Teile und Strict-OOXML sind „kein .docx“.</item>
/// <item>W1: verschachtelte Feldanweisungen; Feldanweisung über alle <c>w:instrText</c>.</item>
/// <item>W2: vollständige Liste nachverfolgter Änderungen in allen XML-Teilen.</item>
/// <item>W3: 200.000 unbekannte Platzhalter über die API in unter 15 s.</item>
/// <item>G1: XML-Teile zusammen höchstens 10 MiB.</item>
/// <item>H1/H3: externe Hyperlink-Beziehungen nur an Hyperlink-Elementen; Hyperlink-Ziele nur <c>http</c>,
/// <c>https</c>, <c>mailto</c>; VML-Attribute mit externen Adressen.</item>
/// </list>
/// Jede Ablehnung nennt die wörtliche Meldung unter <c>errors.datei</c> und speichert nichts.
/// </summary>
public class VorlagenPruefungHaertungTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string DtdArt = "Dokumenttypdefinitionen (DTD)";
    private const string ExternArt = "Verknüpfungen auf externe Inhalte";
    private const string HyperlinkArt = "Hyperlinks mit unzulässigem Ziel";
    private const string FeldArt = "Felder mit externen Verknüpfungen oder DDE";
    private const string VerschachteltArt = "Felder mit verschachtelten Feldanweisungen";
    private const string AlternativArt = "Feldanweisungen in Alternativ- oder Fremdinhalten";

    private const string Revision = "w:author=\"Test Autor Revision\" w:date=\"2026-10-01T00:00:00Z\"";

    private const string Ddeauto = " DDEAUTO excel \"C:\\\\x.xls\" \"R1C1\" ";

    private static string XmlKopf => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";

    /// <summary>Lädt hoch, erwartet 400 und prüft, dass nichts gespeichert wurde und kein Audit entstand.</summary>
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

    // ---------- K1: XML-Teile nach Content-Type ----------

    private static byte[] KopfzeileAlsBin(params string[] absaetze) =>
        Gueltig().KopfzeileAls("hdr.bin", "default", absaetze).Bytes();

    [Fact]
    public async Task Kopfzeile_als_bin_Teil_mit_DDEAUTO_Feld_wird_abgelehnt()
    {
        var datei = KopfzeileAlsBin(Testvorlagen.FeldMitAnweisung(Ddeauto));

        Assert.Equal([Unzulaessig(FeldArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Kopfzeile_als_bin_Teil_mit_einfachem_DDEAUTO_Feld_wird_abgelehnt()
    {
        var datei = KopfzeileAlsBin(Testvorlagen.EinfachesFeld(" DDEAUTO excel x R1C1 ", Run("Ergebnis")));

        Assert.Equal([Unzulaessig(FeldArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Kopfzeile_als_bin_Teil_mit_w_ins_und_Autor_wird_als_nachverfolgte_Aenderung_abgelehnt()
    {
        var datei = KopfzeileAlsBin(Testvorlagen.Eingefuegt());

        Assert.Equal([NachverfolgteAenderungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Kopfzeile_als_bin_Teil_mit_unbekanntem_Platzhalter_wird_gemeldet()
    {
        var datei = KopfzeileAlsBin(Text("{{Kopf.Unbekannt}}"));

        Assert.Equal(["Unbekannte Platzhalter: {{Kopf.Unbekannt}}." + UnbekanntHinweis], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Kopfzeile_als_bin_Teil_mit_DOCTYPE_wird_als_DTD_abgelehnt()
    {
        var xml = XmlKopf + "<!DOCTYPE w:hdr [<!ENTITY x \"y\">]>" + $"<w:hdr {Namensraeume}>{Text("&x;")}</w:hdr>";
        var datei = Gueltig().KopfzeileAls("kopf.bin", "default", [], Encoding.UTF8.GetBytes(xml)).Bytes();

        Assert.Equal([Unzulaessig(DtdArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Pflichtplatzhalter_in_einer_Kopfzeile_als_bin_Teil_zaehlt()
    {
        var datei = Testvorlagen.OhneCoinName().KopfzeileAls("hdr.bin", "default", [Testvorlagen.GeteilterCoinName]).Bytes();

        await AngenommenAsync(datei);
    }

    [Fact]
    public async Task Kopfzeile_ohne_Endung_mit_unbekanntem_Platzhalter_wird_gemeldet()
    {
        var datei = Gueltig().KopfzeileAls("kopf", "default", [Text("{{Kopf.Ohne}}")]).Bytes();

        Assert.Equal(["Unbekannte Platzhalter: {{Kopf.Ohne}}." + UnbekanntHinweis], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Kommentar_Teil_als_bin_mit_w_author_wird_als_Kommentar_abgelehnt()
    {
        var bauer = Gueltig();
        bauer.DokumentTeil("c.bin", CommentsTyp, RelComments,
            XmlKopf + $"<w:comments {Namensraeume}>" +
            $"<w:comment w:id=\"0\" w:author=\"Test Autor Kommentar\" w:date=\"2026-10-01T00:00:00Z\">{Text("Bitte prüfen")}</w:comment>" +
            "</w:comments>");

        Assert.Equal([Kommentare], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Fussnoten_Teil_als_bin_mit_unbekanntem_Platzhalter_wird_gemeldet()
    {
        var datei = Gueltig().FussnoteAls("fn.bin", Text("{{Fuss.Unbekannt}}")).Bytes();

        Assert.Equal(["Unbekannte Platzhalter: {{Fuss.Unbekannt}}." + UnbekanntHinweis], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Fussnoten_Teil_als_bin_mit_w_ins_wird_als_nachverfolgte_Aenderung_abgelehnt()
    {
        var datei = Gueltig().FussnoteAls("fn.bin", Testvorlagen.Eingefuegt()).Bytes();

        Assert.Equal([NachverfolgteAenderungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Endnoten_Teil_als_dat_mit_DDE_Feld_wird_abgelehnt()
    {
        var datei = Gueltig().EndnoteAls("en.dat", Testvorlagen.FeldMitAnweisung(Ddeauto)).Bytes();

        Assert.Equal([Unzulaessig(FeldArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Verwaister_XML_Teil_mit_Endung_dat_und_w_ins_wird_als_nachverfolgte_Aenderung_abgelehnt()
    {
        var datei = Gueltig()
            .Teil("word/daten.dat", "application/xml", XmlKopf + $"<w:document {Namensraeume}><w:body>{Testvorlagen.Eingefuegt()}</w:body></w:document>")
            .Bytes();

        Assert.Equal([NachverfolgteAenderungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Content_Type_mit_Parameter_und_Grossbuchstaben_gilt_als_XML_Teil()
    {
        var datei = Gueltig()
            .Teil("word/daten.dat", "Application/XML; charset=utf-8", XmlKopf + $"<w:document {Namensraeume}><w:body>{Testvorlagen.Eingefuegt()}</w:body></w:document>")
            .Bytes();

        Assert.Equal([NachverfolgteAenderungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    // ---------- K1: „kein .docx“ ----------

    [Fact]
    public async Task Referenzierte_Kopfzeile_die_kein_lesbares_XML_ist_ist_kein_Word_Dokument()
    {
        var datei = Gueltig().KopfzeileAls("hdr.bin", "default", [], Encoding.UTF8.GetBytes("kein XML <w:hdr")).Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Referenzierte_Kopfzeile_mit_Binaerdaten_ist_kein_Word_Dokument()
    {
        var datei = Gueltig().KopfzeileAls("hdr.bin", "default", [], [0x00, 0xFF, 0x10, 0x80, 0x3C]).Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Nicht_wohlgeformter_verwaister_XML_Teil_mit_Endung_bin_ist_kein_Word_Dokument()
    {
        var datei = Gueltig().Teil("word/daten.bin", "application/xml", "<a><b></a>").Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Nicht_wohlgeformter_XML_Teil_ist_kein_Word_Dokument()
    {
        var datei = Gueltig().Teil("word/kaputt.xml", "application/xml", "<a><b></a>").Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Eintrag_ohne_Content_Type_ist_kein_Word_Dokument()
    {
        var datei = Gueltig().RohEintrag("word/media/unbekannt.qqq", [1, 2, 3, 4]).Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Eintrag_mit_Default_Content_Type_fuer_seine_Endung_ist_zulaessig()
    {
        // Kontrollfall: „.bin“ hat in den Testdateien den Default application/octet-stream.
        await AngenommenAsync(Gueltig().RohEintrag("word/media/daten.bin", [1, 2, 3, 4]).Bytes());
    }

    [Fact]
    public async Task Doppelte_Eintragsnamen_nur_in_Gross_und_Kleinschreibung_verschieden_sind_kein_Word_Dokument()
    {
        var datei = Gueltig().RohEintrag("WORD/Document.xml", Encoding.UTF8.GetBytes("<doppelt/>")).Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Hauptteil_im_Strict_Namespace_ist_kein_Word_Dokument()
    {
        var bauer = new DocxBauer
        {
            DokumentInhalt = XmlKopf +
                "<w:document xmlns:w=\"http://purl.oclc.org/ooxml/wordprocessingml/main\"><w:body>" +
                string.Concat(PflichtAbsaetze) + "</w:body></w:document>",
        };

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    public static TheoryData<string, string> StoryUndStrukturTypen => new()
    {
        { "header", RelHeader },
        { "footer", RelBasis + "/footer" },
        { "footnotes", RelFootnotes },
        { "endnotes", RelEndnotes },
        { "comments", RelComments },
        { "commentsExtended", "http://schemas.microsoft.com/office/2011/relationships/commentsExtended" },
        { "commentsIds", "http://schemas.microsoft.com/office/2016/09/relationships/commentsIds" },
        { "commentsExtensible", "http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible" },
        { "glossaryDocument", RelBasis + "/glossaryDocument" },
        { "styles", RelStyles },
        { "numbering", RelBasis + "/numbering" },
        { "settings", RelSettings },
    };

    [Theory]
    [MemberData(nameof(StoryUndStrukturTypen))]
    public async Task Fehlender_referenzierter_Story_oder_Strukturteil_ist_kein_Word_Dokument(string art, string typ)
    {
        var bauer = Gueltig();
        bauer.DokumentBeziehung(typ, $"{art}-fehlt.xml");

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Theory]
    [MemberData(nameof(StoryUndStrukturTypen))]
    public async Task Referenzierter_Story_oder_Strukturteil_mit_Content_Type_image_png_ist_kein_Word_Dokument(string art, string typ)
    {
        var bauer = Gueltig();
        bauer.DokumentTeil($"media/{art}.png", "image/png", typ, Testbilder.Png(64));

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    // ---------- G1: XML-Teile zusammen höchstens 10 MiB ----------

    /// <summary>XML-Teil mit zufälligem Text aus vier Buchstaben (Kompression etwa 4 : 1, also weit unter 100 : 1).</summary>
    private static string ZufallsXml(int zeichen, int saat)
    {
        var zufall = new Random(saat);
        var text = new StringBuilder(zeichen + 100).Append(XmlKopf).Append("<daten>");
        const string Buchstaben = "abcd";
        for (var i = 0; i < zeichen; i++)
        {
            text.Append(Buchstaben[zufall.Next(4)]);
        }

        return text.Append("</daten>").ToString();
    }

    [Fact]
    public async Task XML_Teile_zusammen_ueber_10_MiB_sind_entpackt_zu_gross()
    {
        var bauer = Gueltig();
        for (var i = 0; i < 3; i++)
        {
            bauer.Teil($"word/daten{i}.xml", null, ZufallsXml(3_700_000, i));
        }

        var datei = bauer.Bytes();
        Assert.True(datei.Length < FuenfMiB, $"Testdatei zu groß: {datei.Length}");

        Assert.Equal([ZuGrossEntpackt], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Binaerteile_zaehlen_nicht_zur_XML_Grenze()
    {
        // Kontrollfall: dieselbe Datenmenge als Binärteile (Content-Type application/octet-stream) ist zulässig.
        var bauer = Gueltig();
        for (var i = 0; i < 3; i++)
        {
            bauer.RohEintrag($"word/media/daten{i}.bin", Encoding.UTF8.GetBytes(ZufallsXml(3_700_000, i)));
        }

        await AngenommenAsync(bauer.Bytes());
    }

    // ---------- W1: Feldanweisungen ----------

    private static string FeldBeginn => "<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>";

    private static string FeldTrenner => "<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>";

    private static string FeldEnde => "<w:r><w:fldChar w:fldCharType=\"end\"/></w:r>";

    private static string Anweisung(string text) => $"<w:r><w:instrText xml:space=\"preserve\">{text}</w:instrText></w:r>";

    /// <summary>Feld, dessen Anweisung ein inneres Feld enthält: <c>{ {innere} rest }</c>.</summary>
    private static string VerschachteltesFeld(string innereAnweisung, string innereErgebnis, string rest) =>
        P(FeldBeginn, Anweisung(" "),
          FeldBeginn, Anweisung(innereAnweisung), FeldTrenner, Run(innereErgebnis), FeldEnde,
          Anweisung(rest), FeldTrenner, Run("Ergebnis"), FeldEnde);

    [Fact]
    public async Task Verschachteltes_Feld_mit_QUOTE_INCLUDEPICTURE_wird_abgelehnt()
    {
        var datei = Gueltig()
            .Absaetze(VerschachteltesFeld(" QUOTE \"INCLUDEPICTURE\" ", "INCLUDEPICTURE", " \"http://example.invalid/x.png\" \\d "))
            .Bytes();

        Assert.Equal([Unzulaessig(VerschachteltArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Verschachteltes_Feld_mit_QUOTE_Zeichencodes_fuer_DDE_wird_abgelehnt()
    {
        // QUOTE 68 68 69 ergibt „DDE“.
        var datei = Gueltig()
            .Absaetze(VerschachteltesFeld(" QUOTE 68 68 69 ", "DDE", " excel \"C:\\\\x.xls\" \"R1C1\" "))
            .Bytes();

        Assert.Equal([Unzulaessig(VerschachteltArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Verschachteltes_Feld_ohne_zwischengespeichertes_Ergebnis_wird_abgelehnt()
    {
        var verschachtelt = P(
            FeldBeginn, Anweisung(" "),
            FeldBeginn, Anweisung(" QUOTE \"INCLUDE\" "), FeldEnde,
            Anweisung("TEXT \"C:\\\\x.docx\" "), FeldTrenner, Run("Ergebnis"), FeldEnde);

        Assert.Equal([Unzulaessig(VerschachteltArt)], await AbgelehntOhneSpeichernAsync(Gueltig().Absaetze(verschachtelt).Bytes()));
    }

    [Fact]
    public async Task Einfaches_Feld_innerhalb_einer_Feldanweisung_wird_abgelehnt()
    {
        var verschachtelt = P(
            FeldBeginn, Anweisung(" "),
            "<w:fldSimple w:instr=\" QUOTE INCLUDEPICTURE \">", Run("INCLUDEPICTURE"), "</w:fldSimple>",
            Anweisung(" \"http://example.invalid/x.png\" "), FeldTrenner, Run("Ergebnis"), FeldEnde);

        Assert.Equal([Unzulaessig(VerschachteltArt)], await AbgelehntOhneSpeichernAsync(Gueltig().Absaetze(verschachtelt).Bytes()));
    }

    [Fact]
    public async Task Verschachteltes_Feld_in_einer_Kopfzeile_wird_abgelehnt()
    {
        var datei = Gueltig()
            .Kopfzeile("default", VerschachteltesFeld(" QUOTE \"INCLUDEPICTURE\" ", "INCLUDEPICTURE", " \"http://example.invalid/x.png\" \\d "))
            .Bytes();

        Assert.Equal([Unzulaessig(VerschachteltArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Feld_im_Feldergebnis_eines_anderen_Felds_ist_zulaessig()
    {
        // Wie im Inhaltsverzeichnis: das innere Feld steht zwischen separate und end des äußeren.
        var feld = P(
            FeldBeginn, Anweisung(" QUOTE \"Seite\" "), FeldTrenner,
            Run("Seite "), FeldBeginn, Anweisung(" PAGE "), FeldTrenner, Run("1"), FeldEnde,
            FeldEnde);

        await AngenommenAsync(Gueltig().Absaetze(feld).Bytes());
    }

    [Fact]
    public async Task DDE_ueber_zwei_instrText_verteilt_wird_erkannt()
    {
        var feld = P(FeldBeginn, Anweisung(" DD"), Anweisung("E excel \"C:\\\\x.xls\" \"R1C1\" "), FeldTrenner, Run("Ergebnis"), FeldEnde);

        Assert.Equal([Unzulaessig(FeldArt)], await AbgelehntOhneSpeichernAsync(Gueltig().Absaetze(feld).Bytes()));
    }

    [Fact]
    public async Task Feldanweisung_ueber_zwei_Absaetze_wird_verkettet()
    {
        var datei = Gueltig().Absaetze(
            P(FeldBeginn, Anweisung(" INCLUDE")),
            P(Anweisung("PICTURE \"http://example.invalid/x.png\" "), FeldTrenner, Run("Ergebnis"), FeldEnde)).Bytes();

        Assert.Equal([Unzulaessig(FeldArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task IncludePicture_in_gemischter_Schreibweise_wird_erkannt()
    {
        var datei = Gueltig().Absaetze(Testvorlagen.FeldMitAnweisung(" IncludePicture \"http://example.invalid/x.png\" ")).Bytes();

        Assert.Equal([Unzulaessig(FeldArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Feldanweisung_in_mc_AlternateContent_wird_als_Alternativinhalt_abgelehnt()
    {
        // Rev. 6 (K1): Feldelemente in mc:AlternateContent werden nicht mehr verkettet, sondern abgelehnt.
        var feld = P(
            FeldBeginn,
            "<mc:AlternateContent><mc:Choice Requires=\"w14\">" + Anweisung(Ddeauto) + "</mc:Choice>" +
            "<mc:Fallback>" + Anweisung(" QUOTE x ") + "</mc:Fallback></mc:AlternateContent>",
            FeldTrenner, Run("Ergebnis"), FeldEnde);

        Assert.Equal([Unzulaessig(AlternativArt)], await AbgelehntOhneSpeichernAsync(Gueltig().Absaetze(feld).Bytes()));
    }

    [Fact]
    public async Task DDE_Feld_im_Glossar_wird_abgelehnt()
    {
        var datei = Testvorlagen.MitGlossar(Testvorlagen.FeldMitAnweisung(Ddeauto)).Bytes();

        Assert.Equal([Unzulaessig(FeldArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    // ---------- W2: nachverfolgte Änderungen ----------

    private static string Zelle(string tcPr = "") =>
        $"<w:tc><w:tcPr><w:tcW w:w=\"4000\" w:type=\"dxa\"/>{tcPr}</w:tcPr><w:p/></w:tc>";

    private static string Tabelle(string tblPr = "", string trPr = "", string tcPr = "", string grid = "", string tblPrEx = "") =>
        $"<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/>{tblPr}</w:tblPr><w:tblGrid><w:gridCol w:w=\"4000\"/>{grid}</w:tblGrid>" +
        $"<w:tr>{tblPrEx}{(trPr.Length == 0 ? string.Empty : $"<w:trPr>{trPr}</w:trPr>")}{Zelle(tcPr)}</w:tr></w:tbl><w:p/>";

    public static TheoryData<string> AenderungsArten =>
    [
        "w:rPrChange", "w:pPrChange", "w:sectPrChange", "w:tblPrChange", "w:tblPrExChange", "w:tblGridChange",
        "w:trPrChange", "w:tcPrChange", "w:numberingChange", "w:cellIns", "w:cellDel", "w:cellMerge",
        "w:moveFromRangeStart", "w:moveToRangeStart", "w:customXmlInsRangeStart", "w:customXmlDelRangeStart",
        "w:customXmlMoveFromRangeStart", "w:customXmlMoveToRangeStart", "w:ins in mc:Fallback",
        "w:rPrChange in styles.xml", "w:pPrChange in styles.xml", "w:numberingChange in numbering.xml",
        "w:rPrChange in der Kopfzeile",
    ];

    private static string AenderungImKoerper(string art) => art switch
    {
        "w:rPrChange" => P($"<w:r><w:rPr><w:b/><w:rPrChange w:id=\"31\" {Revision}><w:rPr/></w:rPrChange></w:rPr><w:t>fett</w:t></w:r>"),
        "w:pPrChange" => $"<w:p><w:pPr><w:jc w:val=\"center\"/><w:pPrChange w:id=\"32\" {Revision}><w:pPr/></w:pPrChange></w:pPr>{Run("zentriert")}</w:p>",
        "w:sectPrChange" => $"<w:p><w:pPr><w:sectPr><w:sectPrChange w:id=\"33\" {Revision}><w:sectPr/></w:sectPrChange></w:sectPr></w:pPr></w:p>",
        "w:tblPrChange" => Tabelle(tblPr: $"<w:tblPrChange w:id=\"34\" {Revision}><w:tblPr/></w:tblPrChange>"),
        "w:tblPrExChange" => Tabelle(tblPrEx: $"<w:tblPrEx><w:tblPrExChange w:id=\"43\" {Revision}><w:tblPrEx/></w:tblPrExChange></w:tblPrEx>"),
        "w:tblGridChange" => Tabelle(grid: "<w:tblGridChange w:id=\"44\"><w:tblGrid><w:gridCol w:w=\"3000\"/></w:tblGrid></w:tblGridChange>"),
        "w:trPrChange" => Tabelle(trPr: $"<w:cantSplit/><w:trPrChange w:id=\"35\" {Revision}><w:trPr/></w:trPrChange>"),
        "w:tcPrChange" => Tabelle(tcPr: $"<w:tcPrChange w:id=\"36\" {Revision}><w:tcPr/></w:tcPrChange>"),
        "w:numberingChange" => $"<w:p><w:pPr><w:numPr><w:ilvl w:val=\"0\"/><w:numId w:val=\"1\"/><w:numberingChange w:id=\"37\" {Revision} w:original=\"%1.\"/></w:numPr></w:pPr>{Run("Liste")}</w:p>",
        "w:cellIns" => Tabelle(tcPr: $"<w:cellIns w:id=\"38\" {Revision}/>"),
        "w:cellDel" => Tabelle(tcPr: $"<w:cellDel w:id=\"39\" {Revision}/>"),
        "w:cellMerge" => Tabelle(tcPr: $"<w:cellMerge w:id=\"40\" {Revision} w:vMerge=\"rest\"/>"),
        "w:moveFromRangeStart" => P($"<w:moveFromRangeStart w:id=\"45\" w:name=\"move1\" {Revision}/>", Run("Text"), "<w:moveFromRangeEnd w:id=\"45\"/>"),
        "w:moveToRangeStart" => P($"<w:moveToRangeStart w:id=\"46\" w:name=\"move1\" {Revision}/>", Run("Text"), "<w:moveToRangeEnd w:id=\"46\"/>"),
        "w:customXmlInsRangeStart" => $"<w:customXmlInsRangeStart w:id=\"47\" {Revision}/><w:customXmlInsRangeEnd w:id=\"47\"/>{Text("x")}",
        "w:customXmlDelRangeStart" => $"<w:customXmlDelRangeStart w:id=\"48\" {Revision}/><w:customXmlDelRangeEnd w:id=\"48\"/>{Text("x")}",
        "w:customXmlMoveFromRangeStart" => $"<w:customXmlMoveFromRangeStart w:id=\"49\" {Revision}/><w:customXmlMoveFromRangeEnd w:id=\"49\"/>{Text("x")}",
        "w:customXmlMoveToRangeStart" => $"<w:customXmlMoveToRangeStart w:id=\"50\" {Revision}/><w:customXmlMoveToRangeEnd w:id=\"50\"/>{Text("x")}",
        "w:ins in mc:Fallback" => P(
            "<mc:AlternateContent><mc:Choice Requires=\"w14\">" + Run("neu") + "</mc:Choice>" +
            $"<mc:Fallback><w:ins w:id=\"51\" {Revision}>{Run("alt")}</w:ins></mc:Fallback></mc:AlternateContent>"),
        _ => throw new ArgumentOutOfRangeException(nameof(art), art, null),
    };

    private static byte[] AenderungsDatei(string art)
    {
        var bauer = Gueltig();
        switch (art)
        {
            case "w:rPrChange in styles.xml":
                bauer.Stile("<w:style w:type=\"character\" w:styleId=\"Betont\"><w:name w:val=\"Betont\"/>" +
                    $"<w:rPr><w:b/><w:rPrChange w:id=\"41\" {Revision}><w:rPr/></w:rPrChange></w:rPr></w:style>");
                break;
            case "w:pPrChange in styles.xml":
                bauer.Stile("<w:style w:type=\"paragraph\" w:styleId=\"Mitte\"><w:name w:val=\"Mitte\"/>" +
                    $"<w:pPr><w:jc w:val=\"center\"/><w:pPrChange w:id=\"42\" {Revision}><w:pPr/></w:pPrChange></w:pPr></w:style>");
                break;
            case "w:numberingChange in numbering.xml":
                bauer.DokumentTeil("numbering.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
                    RelBasis + "/numbering",
                    XmlKopf + $"<w:numbering {Namensraeume}><w:abstractNum w:abstractNumId=\"0\"><w:lvl w:ilvl=\"0\"><w:pPr><w:numPr>" +
                    $"<w:numberingChange w:id=\"52\" {Revision} w:original=\"%1.\"/></w:numPr></w:pPr></w:lvl></w:abstractNum>" +
                    "<w:num w:numId=\"1\"><w:abstractNumId w:val=\"0\"/></w:num></w:numbering>");
                break;
            case "w:rPrChange in der Kopfzeile":
                bauer.Kopfzeile("default", AenderungImKoerper("w:rPrChange"));
                break;
            default:
                bauer.Absaetze(AenderungImKoerper(art));
                break;
        }

        return bauer.Bytes();
    }

    [Theory]
    [MemberData(nameof(AenderungsArten))]
    public async Task Nachverfolgte_Aenderung_wird_abgelehnt(string art)
    {
        Assert.Equal([NachverfolgteAenderungen], await AbgelehntOhneSpeichernAsync(AenderungsDatei(art)));
    }

    [Fact]
    public async Task Nur_commentRangeEnd_wird_als_Kommentar_abgelehnt()
    {
        var datei = Gueltig().Absaetze(P(Run("Text"), "<w:commentRangeEnd w:id=\"5\"/>")).Bytes();

        Assert.Equal([Kommentare], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Einstellung_Aenderungen_nachverfolgen_allein_ist_kein_Befund()
    {
        await AngenommenAsync(Gueltig().Einstellungen("<w:trackRevisions/>").Bytes());
    }

    // ---------- W3: viele unbekannte Platzhalter über die API ----------

    [Fact]
    public async Task Zweihunderttausend_unbekannte_Platzhalter_werden_in_unter_15_Sekunden_mit_gekuerzter_Meldung_abgelehnt()
    {
        var unbekannt = Enumerable.Range(1, 200_000).Select(i => $"{{{{Unbekannt.Nr{i:000000}}}}}").ToList();
        var absaetze = unbekannt.Chunk(200).Select(teil => Text(string.Join(" ", teil))).ToArray();
        var datei = Gueltig().Absaetze(absaetze).Bytes();
        Assert.True(datei.Length < FuenfMiB, $"Testdatei zu groß: {datei.Length}");
        var coinId = await CoinAsync();
        using var abbruch = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var uhr = Stopwatch.StartNew();

        using var antwort = await Client.PostAsync(VersionenUrl(coinId), DocxMultipart(datei), abbruch.Token);
        var meldungen = await DateiFehlerAsync(antwort);
        uhr.Stop();

        Assert.True(uhr.Elapsed < TimeSpan.FromSeconds(15), $"Antwort nach {uhr.Elapsed.TotalSeconds:F1} s.");
        Assert.Equal(
            ["Unbekannte Platzhalter: " + string.Join(", ", unbekannt.Take(20)) + " und 199.980 weitere." + UnbekanntHinweis],
            meldungen);
    }

    // ---------- H1: externe Beziehungen und Hyperlink-Ziele ----------

    [Fact]
    public async Task Externe_hyperlink_Beziehung_als_attachedTemplate_wird_abgelehnt()
    {
        var bauer = Gueltig();
        bauer.Einstellungen("<w:attachedTemplate r:id=\"rIdVorlage\"/>");
        bauer.Beziehung("word/settings.xml", RelHyperlink, "https://beispiel.invalid/Normal.dotm", istExtern: true, id: "rIdVorlage");

        Assert.Equal([Unzulaessig(ExternArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    private static string BildMitBlip(string blipAttribut) =>
        P("<w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"952500\" cy=\"952500\"/>" +
          "<wp:docPr id=\"5\" name=\"Bild 5\"/><a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\">" +
          "<pic:pic><pic:nvPicPr><pic:cNvPr id=\"0\" name=\"bild.png\"/><pic:cNvPicPr/></pic:nvPicPr>" +
          $"<pic:blipFill><a:blip {blipAttribut}/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>" +
          "<pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"952500\" cy=\"952500\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr>" +
          "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>");

    [Fact]
    public async Task Externe_hyperlink_Beziehung_an_a_blip_r_link_wird_abgelehnt()
    {
        var bauer = Gueltig();
        var rid = bauer.DokumentBeziehung(RelHyperlink, "https://beispiel.invalid/bild.png", istExtern: true);
        bauer.Absaetze(BildMitBlip($"r:link=\"{rid}\""));

        Assert.Equal([Unzulaessig(ExternArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Externe_hyperlink_Beziehung_an_v_imagedata_r_id_wird_abgelehnt()
    {
        var bauer = Gueltig();
        var rid = bauer.DokumentBeziehung(RelHyperlink, "https://beispiel.invalid/bild.png", istExtern: true);
        bauer.Absaetze(P($"<w:r><w:pict><v:shape id=\"Bild6\" style=\"width:10pt;height:10pt\"><v:imagedata r:id=\"{rid}\" o:title=\"\"/></v:shape></w:pict></w:r>"));

        Assert.Equal([Unzulaessig(ExternArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Externe_hyperlink_Beziehung_als_r_id_eines_Kopfzeilenverweises_wird_abgelehnt()
    {
        var bauer = Gueltig();
        var rid = bauer.DokumentBeziehung(RelHyperlink, "https://beispiel.invalid/kopf.xml", istExtern: true);
        bauer.Absaetze($"<w:p><w:pPr><w:sectPr><w:headerReference w:type=\"default\" r:id=\"{rid}\"/></w:sectPr></w:pPr></w:p>");

        Assert.Equal([Unzulaessig(ExternArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Externe_hyperlink_Beziehung_an_a_hlinkClick_ist_zulaessig()
    {
        var bauer = Gueltig();
        var link = bauer.DokumentBeziehung(RelHyperlink, "https://beispiel.invalid/seite", istExtern: true);
        var bild = bauer.DokumentTeil("media/bild1.png", "image/png", RelImage, Testbilder.Png(64));
        bauer.Absaetze(BildMitBlip($"r:embed=\"{bild}\"").Replace(
            "<wp:docPr id=\"5\" name=\"Bild 5\"/>",
            $"<wp:docPr id=\"5\" name=\"Bild 5\"><a:hlinkClick r:id=\"{link}\"/></wp:docPr>",
            StringComparison.Ordinal));

        await AngenommenAsync(bauer.Bytes());
    }

    [Fact]
    public async Task Externe_hyperlink_Beziehung_ohne_Referenz_ist_zulaessig()
    {
        var bauer = Gueltig();
        bauer.DokumentBeziehung(RelHyperlink, "https://beispiel.invalid/unbenutzt", istExtern: true);

        await AngenommenAsync(bauer.Bytes());
    }

    public static TheoryData<string> UnzulaessigeHyperlinkZiele =>
    [
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        " vbscript:msgbox(1)",
        "java\tscript:alert(1)",
        "file:///C:/x",
        "data:text/html,<script>alert(1)</script>",
        "\\\\server\\freigabe\\x.docx",
        "../x.docx",
        "ms-word:ofe|u|http://beispiel.invalid/x.docx",
    ];

    [Theory]
    [MemberData(nameof(UnzulaessigeHyperlinkZiele))]
    public async Task Hyperlink_Beziehung_mit_unzulaessigem_Ziel_wird_abgelehnt(string ziel)
    {
        var bauer = Gueltig();
        var rid = bauer.DokumentBeziehung(RelHyperlink, ziel, istExtern: true);
        bauer.Absaetze(P($"<w:hyperlink r:id=\"{rid}\">{Run("Verweis")}</w:hyperlink>"));

        Assert.Equal([Unzulaessig(HyperlinkArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Theory]
    [MemberData(nameof(UnzulaessigeHyperlinkZiele))]
    public async Task HYPERLINK_Feld_mit_unzulaessigem_Ziel_wird_abgelehnt(string ziel)
    {
        var anweisung = $" HYPERLINK \"{System.Security.SecurityElement.Escape(ziel)}\" ";
        var datei = Gueltig().Absaetze(Testvorlagen.FeldMitAnweisung(anweisung)).Bytes();

        Assert.Equal([Unzulaessig(HyperlinkArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Einfaches_HYPERLINK_Feld_mit_javascript_Ziel_wird_abgelehnt()
    {
        var datei = Gueltig().Absaetze(Testvorlagen.EinfachesFeld(" HYPERLINK &quot;javascript:alert(1)&quot; ", Run("Verweis"))).Bytes();

        Assert.Equal([Unzulaessig(HyperlinkArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    public static TheoryData<string> ZulaessigeHyperlinkZiele =>
    [
        "https://beispiel.invalid/seite?x=1#abschnitt",
        "http://beispiel.invalid/",
        "HTTPS://beispiel.invalid/",
        "mailto:info@beispiel.invalid",
    ];

    [Theory]
    [MemberData(nameof(ZulaessigeHyperlinkZiele))]
    public async Task Hyperlink_Beziehung_mit_zulaessigem_Ziel_wird_angenommen(string ziel)
    {
        var bauer = Gueltig();
        var rid = bauer.DokumentBeziehung(RelHyperlink, ziel, istExtern: true);
        bauer.Absaetze(P($"<w:hyperlink r:id=\"{rid}\">{Run("Verweis")}</w:hyperlink>"));

        await AngenommenAsync(bauer.Bytes());
    }

    [Theory]
    [MemberData(nameof(ZulaessigeHyperlinkZiele))]
    public async Task HYPERLINK_Feld_mit_zulaessigem_Ziel_wird_angenommen(string ziel)
    {
        var datei = Gueltig().Absaetze(Testvorlagen.FeldMitAnweisung($" HYPERLINK \"{ziel}\" ")).Bytes();

        await AngenommenAsync(datei);
    }

    [Fact]
    public async Task HYPERLINK_Feld_mit_Anker_ohne_Adresse_wird_angenommen()
    {
        var datei = Gueltig().Absaetze(Testvorlagen.FeldMitAnweisung(" HYPERLINK \\l \"Anker\" ")).Bytes();

        await AngenommenAsync(datei);
    }

    // ---------- H3: VML-Attribute mit externen Adressen ----------

    public static TheoryData<string> VmlVerweise =>
    [
        "<v:shape id=\"S1\" style=\"width:10pt;height:10pt\"><v:imagedata src=\"http://beispiel.invalid/b.png\" o:title=\"\"/></v:shape>",
        "<v:shape id=\"S2\" style=\"width:10pt;height:10pt\"><v:fill src=\"http://beispiel.invalid/f.png\" type=\"frame\"/></v:shape>",
        "<v:shape id=\"S3\" style=\"width:10pt;height:10pt\" o:href=\"file://server/freigabe/x.png\"/>",
        "<v:shape id=\"S4\" style=\"width:10pt;height:10pt\" o:althref=\"file://server/freigabe/y.png\"/>",
    ];

    [Theory]
    [MemberData(nameof(VmlVerweise))]
    public async Task VML_Verweis_auf_externe_Adresse_wird_abgelehnt(string vml)
    {
        var datei = Gueltig().Absaetze(P($"<w:r><w:pict>{vml}</w:pict></w:r>")).Bytes();

        Assert.Equal([Unzulaessig(ExternArt)], await AbgelehntOhneSpeichernAsync(datei));
    }
}
