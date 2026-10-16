using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Security;
using System.Text;
using Coin.Domain.Vorlagen;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.Extensions.DependencyInjection;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 7, AK-10 „Namespace-Positivliste“ (Entscheidungen F13/F14, ADR-0026): In jedem
/// XML-Teil müssen alle Elemente und qualifizierten Attribute in einem erlaubten Namespace liegen; Präfixe in den
/// <c>mc:</c>-Attributen müssen auf erlaubte Namespaces zeigen. Strict (<c>http://purl.oclc.org/ooxml/…</c>) oder ein
/// nicht deklariertes Präfix in einem <c>mc:</c>-Attribut → „kein .docx“; jeder andere nicht erlaubte Namespace → die
/// Erweiterungsmeldung. Deklarierte, ungenutzte Namespaces sind zulässig. Jede Ablehnung ist die einzige Meldung unter
/// <c>errors.datei</c> und speichert nichts (kein Audit).
/// </summary>
public class VorlagenNamespacePositivlisteTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string S = "http://purl.oclc.org/ooxml/wordprocessingml/main";
    private const string Fremd = "urn:example:fremd";
    private const string DeklarationS = $"xmlns:s=\"{S}\"";
    private const string DeklarationX = $"xmlns:x=\"{Fremd}\"";

    private const string DtdArt = "Dokumenttypdefinitionen (DTD)";
    private const string FeldArt = "Felder mit externen Verknüpfungen oder DDE";
    private const string ZuTief = "Die Datei ist zu tief verschachtelt. Bitte verschachtelte Tabellen, Textfelder oder Formen vereinfachen.";

    private static string XmlKopf => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";

    private async Task<string[]> AbgelehntOhneSpeichernAsync(byte[] datei)
    {
        var coinId = await CoinAsync();
        var vorher = await SpeicherZustandAsync(coinId);

        var meldungen = await AbgelehntAsync(coinId, datei);

        Assert.Equal(vorher, await SpeicherZustandAsync(coinId));
        return meldungen;
    }

    private async Task<Guid> AngenommenAsync(byte[] datei)
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, datei);

        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"{(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return coinId;
    }

    /// <summary>Hauptteil mit den Pflichtplatzhaltern und <paramref name="bloecke"/>; <paramref name="wurzelZusatz"/> steht im Start-Tag von <c>w:document</c>.</summary>
    private static DocxBauer Dokument(string wurzelZusatz, params string[] bloecke) => new()
    {
        DokumentInhalt = XmlKopf + $"<w:document {Namensraeume} {wurzelZusatz}><w:body>{string.Concat(PflichtAbsaetze)}{string.Concat(bloecke)}<w:sectPr/></w:body></w:document>",
    };

    // ---------- Strict-Formen aus QA-Review 5 (K1) ----------

    private static string FeldBeginn => "<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>";

    private static string FeldTrenner => "<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>";

    private static string FeldEnde => "<w:r><w:fldChar w:fldCharType=\"end\"/></w:r>";

    private static string WInstr(string text) => $"<w:r><w:instrText xml:space=\"preserve\">{SecurityElement.Escape(text)}</w:instrText></w:r>";

    private static string SInstr(string text) => $"<w:r><s:instrText xml:space=\"preserve\">{SecurityElement.Escape(text)}</s:instrText></w:r>";

    private static readonly string Ergebnis = Run("Ergebnis");

    /// <summary>Absatz mit der Strict-Form <paramref name="form"/> (alle Feldanweisungen wären DDE bzw. INCLUDETEXT).</summary>
    private static string StrictForm(string form) => form switch
    {
        "s:instrText DDEAUTO" =>
            P(FeldBeginn, SInstr(" DDEAUTO excel \"C:\\\\x.xls\" \"R1C1\" "), FeldTrenner, Ergebnis, FeldEnde),
        "s:instrText INCLUDETEXT" =>
            P(FeldBeginn, SInstr(" INCLUDETEXT \"C:\\\\x.docx\" "), FeldTrenner, Ergebnis, FeldEnde),
        "s:fldSimple s:instr" =>
            P($"<s:fldSimple s:instr=\"INCLUDETEXT &quot;C:\\\\x.docx&quot;\">{Ergebnis}</s:fldSimple>"),
        "w:fldSimple s:instr" =>
            P($"<w:fldSimple s:instr=\"DDE excel x\">{Ergebnis}</w:fldSimple>"),
        "w:fldChar s:fldCharType" =>
            P("<w:r><w:fldChar s:fldCharType=\"begin\"/></w:r>", WInstr(" INCLUDETEXT \"C:\\\\x.docx\" "),
              "<w:r><w:fldChar s:fldCharType=\"separate\"/></w:r>", Ergebnis, "<w:r><w:fldChar s:fldCharType=\"end\"/></w:r>"),
        "s:fldChar s:fldCharType" =>
            P("<w:r><s:fldChar s:fldCharType=\"begin\"/></w:r>", WInstr(" DDE excel x "),
              "<w:r><s:fldChar s:fldCharType=\"separate\"/></w:r>", Ergebnis, "<w:r><s:fldChar s:fldCharType=\"end\"/></w:r>"),
        "w:instrText und s:instrText gemischt" =>
            P(FeldBeginn, WInstr(" INCLUDE"), SInstr("TEXT \"C:\\\\x.docx\" "), FeldTrenner, Ergebnis, FeldEnde),
        _ => throw new ArgumentOutOfRangeException(nameof(form), form, null),
    };

    private static readonly string[] StrictFormen =
    [
        "s:instrText DDEAUTO", "s:instrText INCLUDETEXT", "s:fldSimple s:instr", "w:fldSimple s:instr",
        "w:fldChar s:fldCharType", "s:fldChar s:fldCharType", "w:instrText und s:instrText gemischt",
    ];

    public static TheoryData<string, string> StrictFormenJeOrt()
    {
        var daten = new TheoryData<string, string>();
        foreach (var form in StrictFormen)
        {
            foreach (var ort in new[] { "Hauptteil", "Kopfzeile", "Textfeld" })
            {
                daten.Add(form, ort);
            }
        }

        return daten;
    }

    /// <summary>Datei mit <paramref name="absatz"/> am Ort <paramref name="ort"/>; <c>s</c> ist an der jeweiligen Teilwurzel deklariert.</summary>
    private static byte[] AmOrt(string absatz, string ort) => ort switch
    {
        "Hauptteil" => Dokument(DeklarationS, absatz).Bytes(),
        "Kopfzeile" => Gueltig().KopfzeileAls("header1.xml", "default", [], Encoding.UTF8.GetBytes(
            XmlKopf + $"<w:hdr {Namensraeume} {DeklarationS}>{absatz}</w:hdr>")).Bytes(),
        "Textfeld" => Dokument(DeklarationS, Testvorlagen.TextfeldAlternateContent(absatz)).Bytes(),
        _ => throw new ArgumentOutOfRangeException(nameof(ort), ort, null),
    };

    [Theory]
    [MemberData(nameof(StrictFormenJeOrt))]
    public async Task Strict_Feldform_ist_kein_Word_Dokument(string form, string ort)
    {
        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(AmOrt(StrictForm(form), ort)));
    }

    [Theory]
    [MemberData(nameof(StrictFormenJeOrt))]
    public void Gegenprobe_dieselbe_Form_im_w_Namespace_ist_ein_unzulaessiges_Feld(string form, string ort)
    {
        // Gegenprobe für die Bausteine: Mit s = Transitional-w lehnt die zweite Linie dieselbe Datei als Feld ab,
        // die Strict-Form ist also tatsächlich ein DDE- bzw. INCLUDETEXT-Feld.
        var datei = AmOrtMitW(StrictForm(form), ort);
        var analyse = Fixture.Factory.Services.GetRequiredService<IDocxAnalyse>();

        var befund = Assert.IsType<DocxBefund.Abgelehnt>(analyse.Analysieren(datei));

        Assert.Equal([Unzulaessig(FeldArt)], befund.Meldungen);
    }

    /// <summary>Wie <see cref="AmOrt"/>, aber <c>s</c> zeigt auf den Transitional-<c>w</c>-Namespace.</summary>
    private static byte[] AmOrtMitW(string absatz, string ort)
    {
        const string sAlsW = "xmlns:s=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"";
        return ort switch
        {
            "Hauptteil" => Dokument(sAlsW, absatz).Bytes(),
            "Kopfzeile" => Gueltig().KopfzeileAls("header1.xml", "default", [], Encoding.UTF8.GetBytes(
                XmlKopf + $"<w:hdr {Namensraeume} {sAlsW}>{absatz}</w:hdr>")).Bytes(),
            "Textfeld" => Dokument(sAlsW, Testvorlagen.TextfeldAlternateContent(absatz)).Bytes(),
            _ => throw new ArgumentOutOfRangeException(nameof(ort), ort, null),
        };
    }

    [Fact]
    public async Task Strict_ins_im_Hauptteil_ist_kein_Word_Dokument()
    {
        var datei = Dokument(DeklarationS,
            P($"<s:ins s:id=\"1\" s:author=\"Test Autor\" s:date=\"2026-10-01T00:00:00Z\">{Run("eingefügt")}</s:ins>")).Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Strict_mailMerge_in_settings_ist_kein_Word_Dokument()
    {
        var bauer = Gueltig();
        bauer.DokumentTeil("settings.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml", RelSettings,
            XmlKopf + $"<w:settings {Namensraeume} {DeklarationS}><s:mailMerge><s:mainDocumentType s:val=\"formLetters\"/>" +
            "<s:dataType s:val=\"textFile\"/></s:mailMerge></w:settings>");

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Strict_commentReference_im_Hauptteil_ist_kein_Word_Dokument()
    {
        var datei = Dokument(DeklarationS, P(Run("kommentiert"), "<w:r><s:commentReference s:id=\"0\"/></w:r>")).Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Theory]
    [InlineData("w:p")]
    [InlineData("w:r")]
    public async Task Strict_Attribut_an_Transitional_Element_ist_kein_Word_Dokument(string element)
    {
        var absatz = element == "w:p"
            ? $"<w:p s:rsidR=\"00A1B2C3\">{Run("Text")}</w:p>"
            : P("<w:r s:rsidR=\"00A1B2C3\"><w:t>Text</w:t></w:r>");

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(Dokument(DeklarationS, absatz).Bytes()));
    }

    [Fact]
    public async Task Strict_Namespace_nur_an_der_Wurzel_deklariert_wird_angenommen()
    {
        await AngenommenAsync(Dokument(DeklarationS, Text("Ohne Strict-Verwendung")).Bytes());
    }

    [Fact]
    public async Task Strict_Praefix_in_mc_Ignorable_ist_kein_Word_Dokument()
    {
        var datei = new DocxBauer
        {
            DokumentInhalt = XmlKopf + $"<w:document {Namensraeume.Replace("mc:Ignorable=\"w14\"", $"{DeklarationS} mc:Ignorable=\"w14 s\"", StringComparison.Ordinal)}>" +
                $"<w:body>{string.Concat(PflichtAbsaetze)}<w:sectPr/></w:body></w:document>",
        }.Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    // ---------- Fremd-Namespace (urn:example:fremd) ----------

    /// <summary>Wurzel wie <see cref="DocxBauer.Namensraeume"/>, <c>mc:Ignorable</c> durch <paramref name="ignorable"/> ersetzt.</summary>
    private static DocxBauer DokumentMitIgnorable(string ignorable, string zusatz, params string[] bloecke) => new()
    {
        DokumentInhalt = XmlKopf + $"<w:document {Namensraeume.Replace("mc:Ignorable=\"w14\"", $"mc:Ignorable=\"{ignorable}\"", StringComparison.Ordinal)} {zusatz}>" +
            $"<w:body>{string.Concat(PflichtAbsaetze)}{string.Concat(bloecke)}<w:sectPr/></w:body></w:document>",
    };

    public static TheoryData<string> FremdeVerwendungen =>
    [
        "Element im Körper",
        "Element in w:r",
        "Element mit mc:Ignorable an der Wurzel",
        "qualifiziertes Attribut an w:p",
        "nur in mc:Ignorable an der Wurzel",
        "mc:Ignorable an w:p",
        "mc:Choice Requires",
        "mc:ProcessContent",
        "mc:MustUnderstand",
        "mc:PreserveElements",
        "mc:PreserveAttributes",
    ];

    private static byte[] MitFremdemNamespace(string fall) => fall switch
    {
        "Element im Körper" => Dokument(DeklarationX, "<x:zusatz/>").Bytes(),
        "Element in w:r" => Dokument(DeklarationX, P("<w:r><x:zusatz>x</x:zusatz></w:r>")).Bytes(),
        "Element mit mc:Ignorable an der Wurzel" => DokumentMitIgnorable("w14 x", DeklarationX, P("<w:r><x:zusatz>x</x:zusatz></w:r>")).Bytes(),
        "qualifiziertes Attribut an w:p" => Dokument(DeklarationX, $"<w:p x:a=\"1\">{Run("Text")}</w:p>").Bytes(),
        "nur in mc:Ignorable an der Wurzel" => DokumentMitIgnorable("w14 x", DeklarationX, Text("Text")).Bytes(),
        "mc:Ignorable an w:p" => Dokument(DeklarationX, $"<w:p mc:Ignorable=\"x\">{Run("Text")}</w:p>").Bytes(),
        "mc:Choice Requires" => Dokument(DeklarationX, P(
            "<w:r><mc:AlternateContent><mc:Choice Requires=\"x\"><w:t>A</w:t></mc:Choice><mc:Fallback><w:t>B</w:t></mc:Fallback></mc:AlternateContent></w:r>")).Bytes(),
        "mc:ProcessContent" => Dokument($"{DeklarationX} mc:ProcessContent=\"x:*\"", Text("Text")).Bytes(),
        "mc:MustUnderstand" => Dokument($"{DeklarationX} mc:MustUnderstand=\"x\"", Text("Text")).Bytes(),
        "mc:PreserveElements" => Dokument($"{DeklarationX} mc:PreserveElements=\"x:a\"", Text("Text")).Bytes(),
        "mc:PreserveAttributes" => Dokument($"{DeklarationX} mc:PreserveAttributes=\"x:a\"", Text("Text")).Bytes(),
        _ => throw new ArgumentOutOfRangeException(nameof(fall), fall, null),
    };

    [Theory]
    [MemberData(nameof(FremdeVerwendungen))]
    public async Task Fremder_Namespace_ergibt_die_Erweiterungsmeldung(string fall)
    {
        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(MitFremdemNamespace(fall)));
    }

    [Fact]
    public async Task Gegenprobe_fremder_Namespace_nur_deklariert_wird_angenommen()
    {
        await AngenommenAsync(Dokument(DeklarationX, Text("Text")).Bytes());
    }

    public static TheoryData<string> NichtDeklariertePraefixe =>
    [
        "mc:Ignorable", "mc:ProcessContent", "mc:MustUnderstand", "mc:PreserveElements", "mc:PreserveAttributes", "mc:Choice Requires",
    ];

    private static DocxBauer MitNichtDeklariertemPraefix(string fall) => fall switch
    {
        "mc:Ignorable" => DokumentMitIgnorable("w14 zz", string.Empty, Text("Text")),
        "mc:ProcessContent" => Dokument("mc:ProcessContent=\"zz:*\"", Text("Text")),
        "mc:MustUnderstand" => Dokument("mc:MustUnderstand=\"zz\"", Text("Text")),
        "mc:PreserveElements" => Dokument("mc:PreserveElements=\"zz:a\"", Text("Text")),
        "mc:PreserveAttributes" => Dokument("mc:PreserveAttributes=\"zz:a\"", Text("Text")),
        "mc:Choice Requires" => Dokument(string.Empty, P(
            "<w:r><mc:AlternateContent><mc:Choice Requires=\"zz\"><w:t>A</w:t></mc:Choice><mc:Fallback><w:t>B</w:t></mc:Fallback></mc:AlternateContent></w:r>")),
        _ => throw new ArgumentOutOfRangeException(nameof(fall), fall, null),
    };

    [Theory]
    [MemberData(nameof(NichtDeklariertePraefixe))]
    public async Task Nicht_deklariertes_Praefix_in_mc_Attribut_ist_kein_Word_Dokument(string fall)
    {
        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(MitNichtDeklariertemPraefix(fall).Bytes()));
    }

    [Theory]
    [InlineData("<zusatz/>")]
    [InlineData("<w:p><zusatz/></w:p>")]
    [InlineData("<w:p><zusatz xmlns=\"\"/></w:p>")]
    public async Task Element_ohne_Namespace_im_Hauptteil_ergibt_die_Erweiterungsmeldung(string block)
    {
        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(Dokument(string.Empty, block).Bytes()));
    }

    [Theory]
    [InlineData("HTTP://schemas.openxmlformats.org/wordprocessingml/2006/main")]
    [InlineData("http://schemas.openxmlformats.org/wordprocessingml/2006/main ")]
    public async Task Abweichende_Schreibweise_des_w_Namespace_ergibt_die_Erweiterungsmeldung(string uri)
    {
        var datei = Dokument(string.Empty, $"<W:p xmlns:W=\"{uri}\"><W:r><W:t>Text</W:t></W:r></W:p>").Bytes();

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    // ---------- Geltungsbereich: alle XML-Teile ----------

    public static TheoryData<string> Teilarten =>
    [
        "[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels", "docProps/core.xml", "docProps/app.xml",
        "customXml/item1.xml", "verwaister application/xml-Teil", "Kopfzeile",
    ];

    private static byte[] MitFremdElementIn(string teil)
    {
        var fremd = $"<x:zusatz {DeklarationX}/>";
        var bauer = Gueltig();
        switch (teil)
        {
            case "[Content_Types].xml":
                bauer.ContentTypesZusatz = fremd;
                break;
            case "_rels/.rels":
                bauer.PaketRelsZusatz = fremd;
                break;
            case "word/_rels/document.xml.rels":
                bauer.DokumentBeziehung(RelImage, "media/bild1.png");
                bauer.Teil("word/media/bild1.png", null, Testbilder.Png(64));
                return ErsetzeInEintrag(bauer.Bytes(), "word/_rels/document.xml.rels", "</Relationships>", fremd + "</Relationships>");
            case "docProps/core.xml":
                bauer.KernEigenschaften($"<dc:title>Titel</dc:title>{fremd}");
                break;
            case "docProps/app.xml":
                bauer.AppEigenschaften($"<Pages>1</Pages>{fremd}");
                break;
            case "customXml/item1.xml":
                bauer.Teil("customXml/item1.xml", null, XmlKopf + $"<b:Sources xmlns:b=\"{Testvorlagen.BibliographyNs}\">{fremd}</b:Sources>");
                bauer.DokumentBeziehung(RelCustomXml, "../customXml/item1.xml");
                break;
            case "verwaister application/xml-Teil":
                bauer.Teil("word/waise.xml", "application/xml", XmlKopf + $"<w:waise xmlns:w=\"{DocxLeser.W.NamespaceName}\">{fremd}</w:waise>");
                break;
            case "Kopfzeile":
                bauer.Kopfzeile("default", P($"<w:r>{fremd}</w:r>"));
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(teil), teil, null);
        }

        return bauer.Bytes();
    }

    /// <summary>Ersetzt in einem ZIP-Eintrag den ersten Treffer von <paramref name="alt"/> (Testdatei nachträglich ändern).</summary>
    private static byte[] ErsetzeInEintrag(byte[] docx, string eintrag, string alt, string neu)
    {
        var eintraege = DocxLeser.Eintraege(docx);
        var text = Encoding.UTF8.GetString(eintraege[eintrag]);
        Assert.Contains(alt, text, StringComparison.Ordinal);
        var index = text.IndexOf(alt, StringComparison.Ordinal);
        eintraege[eintrag] = Encoding.UTF8.GetBytes(text[..index] + neu + text[(index + alt.Length)..]);
        using var puffer = new MemoryStream();
        using (var zip = new System.IO.Compression.ZipArchive(puffer, System.IO.Compression.ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, inhalt) in eintraege)
            {
                using var ziel = zip.CreateEntry(name).Open();
                ziel.Write(inhalt);
            }
        }

        return puffer.ToArray();
    }

    [Theory]
    [MemberData(nameof(Teilarten))]
    public async Task Fremder_Namespace_in_jedem_XML_Teil_ergibt_die_Erweiterungsmeldung(string teil)
    {
        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(MitFremdElementIn(teil)));
    }

    [Theory]
    [MemberData(nameof(Teilarten))]
    public void Gegenprobe_Testdatei_enthaelt_den_fremden_Namespace_im_genannten_Teil(string teil)
    {
        var datei = MitFremdElementIn(teil);
        var name = teil switch
        {
            "verwaister application/xml-Teil" => "word/waise.xml",
            "Kopfzeile" => "word/header1.xml",
            _ => teil,
        };

        Assert.Contains($"{name}: {Fremd}", DocxLeser.VerwendeteNamespaces(datei));
    }

    [Fact]
    public async Task Strict_und_fremder_Namespace_in_derselben_Datei_ist_kein_Word_Dokument()
    {
        var datei = Dokument($"{DeklarationS} {DeklarationX}", P("<w:r><x:zusatz/></w:r>"), $"<w:p s:rsidR=\"00A1B2C3\">{Run("Text")}</w:p>").Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Fremder_Namespace_im_Hauptteil_und_Strict_in_der_Kopfzeile_ist_kein_Word_Dokument()
    {
        var datei = Dokument(DeklarationX, P("<w:r><x:zusatz/></w:r>"))
            .KopfzeileAls("header1.xml", "default", [], Encoding.UTF8.GetBytes(
                XmlKopf + $"<w:hdr {Namensraeume} {DeklarationS}><w:p s:rsidR=\"00A1B2C3\">{Run("Kopf")}</w:p></w:hdr>"))
            .Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Strict_im_Hauptteil_und_fremder_Namespace_in_der_Kopfzeile_ist_kein_Word_Dokument()
    {
        var datei = Dokument(DeklarationS, $"<w:p s:rsidR=\"00A1B2C3\">{Run("Text")}</w:p>")
            .Kopfzeile("default", P($"<w:r><x:zusatz {DeklarationX}/></w:r>"))
            .Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    // ---------- Deklarierte, ungenutzte Namespaces ----------

    /// <summary>Namespaces, die Word 365 an Wurzelelementen deklariert, ohne sie dort zu verwenden (A23).</summary>
    public static readonly (string Praefix, string Uri)[] UngenutzteWordDeklarationen =
    [
        ("cx", "http://schemas.microsoft.com/office/drawing/2014/chartex"),
        ("cx1", "http://schemas.microsoft.com/office/drawing/2015/9/8/chartex"),
        ("cx2", "http://schemas.microsoft.com/office/drawing/2015/10/21/chartex"),
        ("cx3", "http://schemas.microsoft.com/office/drawing/2016/5/9/chartex"),
        ("cx4", "http://schemas.microsoft.com/office/drawing/2016/5/10/chartex"),
        ("cx5", "http://schemas.microsoft.com/office/drawing/2016/5/11/chartex"),
        ("cx6", "http://schemas.microsoft.com/office/drawing/2016/5/12/chartex"),
        ("cx7", "http://schemas.microsoft.com/office/drawing/2016/5/13/chartex"),
        ("cx8", "http://schemas.microsoft.com/office/drawing/2016/5/14/chartex"),
        ("aink", "http://schemas.microsoft.com/office/drawing/2016/ink"),
        ("am3d", "http://schemas.microsoft.com/office/drawing/2017/model3d"),
        ("oel", "http://schemas.microsoft.com/office/2019/extlst"),
        ("wpi", "http://schemas.microsoft.com/office/word/2010/wordprocessingInk"),
        ("wne", "http://schemas.microsoft.com/office/word/2006/wordml"),
        ("asvg", "http://schemas.microsoft.com/office/drawing/2016/SVG/main"),
    ];

    private static string Deklariert((string Praefix, string Uri)[] liste) =>
        string.Join(" ", liste.Select(n => $"xmlns:{n.Praefix}=\"{n.Uri}\""));

    [Fact]
    public async Task Ungenutzte_Deklarationen_wie_Word_365_an_der_Wurzel_werden_angenommen()
    {
        var datei = Dokument(Deklariert(UngenutzteWordDeklarationen), Text("Text"))
            .KopfzeileAls("header1.xml", "default", [], Encoding.UTF8.GetBytes(
                XmlKopf + $"<w:hdr {Namensraeume} {Deklariert(UngenutzteWordDeklarationen)}>{Text("Kopf")}</w:hdr>"))
            .Bytes();

        await AngenommenAsync(datei);
    }

    [Theory]
    [InlineData("cx1")]
    [InlineData("aink")]
    [InlineData("am3d")]
    [InlineData("wne")]
    public async Task Verwendung_eines_nur_bei_Word_deklarierten_Namespace_ergibt_die_Erweiterungsmeldung(string praefix)
    {
        var datei = Dokument(Deklariert(UngenutzteWordDeklarationen), P($"<w:r><{praefix}:zusatz/></w:r>")).Bytes();

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    // ---------- Entscheidungen F14 (O1–O6) ----------

    private const string RelChart = RelBasis + "/chart";
    private const string RelDiagramData = RelBasis + "/diagramData";

    private static string Zeichnung(string graphicDataUri, string inhalt, int id = 21) =>
        "<w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"952500\" cy=\"952500\"/>" +
        $"<wp:docPr id=\"{id}\" name=\"Objekt {id}\"/><a:graphic><a:graphicData uri=\"{graphicDataUri}\">{inhalt}</a:graphicData></a:graphic></wp:inline></w:drawing>";

    private static string AlsAlternative(string requires, string choice) =>
        P($"<w:r><mc:AlternateContent><mc:Choice Requires=\"{requires}\">{choice}</mc:Choice>" +
          "<mc:Fallback><w:t>Ersatz</w:t></mc:Fallback></mc:AlternateContent></w:r>");

    public static TheoryData<string> Entscheidungen =>
    [
        "O1 Freihand wpi:contentPart",
        "O1 Freihand aink:inkSrc",
        "O2 SmartArt",
        "O3 Diagramm",
        "O3 ChartEx",
        "O4 3D-Modell",
        "O5 SharePoint-Metadaten",
        "O6 Vertraulichkeitsbezeichnung",
    ];

    private static byte[] Nachbildung(string fall)
    {
        switch (fall)
        {
            case "O1 Freihand wpi:contentPart":
            {
                var bauer = Dokument("xmlns:wpi=\"http://schemas.microsoft.com/office/word/2010/wordprocessingInk\"");
                var rid = bauer.Beziehung("word/document.xml", "http://schemas.microsoft.com/office/2011/relationships/ink", "ink/ink1.xml");
                bauer.Teil("word/ink/ink1.xml", "application/inkml+xml",
                    XmlKopf + "<inkml:ink xmlns:inkml=\"http://www.w3.org/2003/InkML\"><inkml:trace>0 0, 10 10</inkml:trace></inkml:ink>");
                bauer.DokumentInhalt = bauer.DokumentInhalt!.Replace("<w:sectPr/>",
                    AlsAlternative("wpi", $"<w:drawing><wp:inline><wp:extent cx=\"1\" cy=\"1\"/><wp:docPr id=\"31\" name=\"Freihand 31\"/><wpi:contentPart r:id=\"{rid}\"/></wp:inline></w:drawing>") + "<w:sectPr/>",
                    StringComparison.Ordinal);
                return bauer.Bytes();
            }

            case "O1 Freihand aink:inkSrc":
            {
                var bauer = Dokument("xmlns:aink=\"http://schemas.microsoft.com/office/drawing/2016/ink\"");
                var rid = bauer.DokumentTeil("media/image1.png", "image/png", RelImage, Testbilder.Png(64));
                var bild = Zeichnung("http://schemas.openxmlformats.org/drawingml/2006/picture",
                    "<pic:pic><pic:nvPicPr><pic:cNvPr id=\"0\" name=\"Freihand\"/><pic:cNvPicPr/></pic:nvPicPr>" +
                    $"<pic:blipFill><a:blip r:embed=\"{rid}\"><a:extLst><a:ext uri=\"{{63B3BB69-23CF-44E3-9099-C40C66FF867C}}\"><aink:inkSrc r:id=\"{rid}\"/></a:ext></a:extLst></a:blip></pic:blipFill>" +
                    "<pic:spPr/></pic:pic>");
                return Ersetze(bauer, P($"<w:r>{bild}</w:r>"));
            }

            case "O2 SmartArt":
            {
                var bauer = Dokument("xmlns:dgm=\"http://schemas.openxmlformats.org/drawingml/2006/diagram\"");
                var rid = bauer.Beziehung("word/document.xml", RelDiagramData, "diagrams/data1.xml");
                bauer.Teil("word/diagrams/data1.xml", "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml",
                    XmlKopf + "<dgm:dataModel xmlns:dgm=\"http://schemas.openxmlformats.org/drawingml/2006/diagram\" " +
                    "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><dgm:ptLst><dgm:pt modelId=\"{00000000-0000-0000-0000-000000000001}\" type=\"doc\"/></dgm:ptLst></dgm:dataModel>");
                var smartArt = Zeichnung("http://schemas.openxmlformats.org/drawingml/2006/diagram",
                    $"<dgm:relIds r:dm=\"{rid}\" r:lo=\"{rid}\" r:qs=\"{rid}\" r:cs=\"{rid}\"/>");
                return Ersetze(bauer, P($"<w:r>{smartArt}</w:r>"));
            }

            case "O3 Diagramm":
            {
                var bauer = Dokument("xmlns:c=\"http://schemas.openxmlformats.org/drawingml/2006/chart\"");
                var rid = bauer.Beziehung("word/document.xml", RelChart, "charts/chart1.xml");
                bauer.Teil("word/charts/chart1.xml", "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
                    XmlKopf + "<c:chartSpace xmlns:c=\"http://schemas.openxmlformats.org/drawingml/2006/chart\" " +
                    "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><c:chart><c:plotArea><c:layout/></c:plotArea></c:chart></c:chartSpace>");
                var diagramm = Zeichnung("http://schemas.openxmlformats.org/drawingml/2006/chart", $"<c:chart r:id=\"{rid}\"/>");
                return Ersetze(bauer, P($"<w:r>{diagramm}</w:r>"));
            }

            case "O3 ChartEx":
            {
                var bauer = Dokument(
                    "xmlns:cx=\"http://schemas.microsoft.com/office/drawing/2014/chartex\" " +
                    "xmlns:cx1=\"http://schemas.microsoft.com/office/drawing/2015/9/8/chartex\"");
                var rid = bauer.Beziehung("word/document.xml", "http://schemas.microsoft.com/office/2014/relationships/chartEx", "charts/chartEx1.xml");
                bauer.Teil("word/charts/chartEx1.xml", "application/vnd.ms-office.chartex+xml",
                    XmlKopf + "<cx:chartSpace xmlns:cx=\"http://schemas.microsoft.com/office/drawing/2014/chartex\"><cx:chart/></cx:chartSpace>");
                var diagramm = Zeichnung("http://schemas.microsoft.com/office/drawing/2014/chartex", $"<cx:chart r:id=\"{rid}\"/>");
                return Ersetze(bauer, AlsAlternative("cx1", diagramm));
            }

            case "O4 3D-Modell":
            {
                var bauer = Dokument("xmlns:am3d=\"http://schemas.microsoft.com/office/drawing/2017/model3d\"");
                var rid = bauer.Beziehung("word/document.xml", "http://schemas.microsoft.com/office/2017/06/relationships/model3d", "media/model3d1.glb");
                bauer.Teil("word/media/model3d1.glb", "model/gltf.binary", [0x67, 0x6C, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
                var modell = Zeichnung("http://schemas.microsoft.com/office/drawing/2017/model3d",
                    $"<am3d:model3d r:embed=\"{rid}\"><am3d:spPr/><am3d:camera/><am3d:trans/></am3d:model3d>");
                return Ersetze(bauer, AlsAlternative("am3d", modell));
            }

            case "O5 SharePoint-Metadaten":
            {
                var bauer = Gueltig();
                bauer.Teil("customXml/item1.xml", null,
                    XmlKopf + "<p:properties xmlns:p=\"http://schemas.microsoft.com/office/2006/metadata/properties\" " +
                    "xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:pc=\"http://schemas.microsoft.com/office/infopath/2007/PartnerControls\">" +
                    "<documentManagement><Abteilung xmlns=\"5f1c2a3b-0000-4000-8000-00000000c0de\">Beispiel</Abteilung></documentManagement></p:properties>");
                bauer.Teil("customXml/itemProps1.xml", "application/vnd.openxmlformats-officedocument.customXmlProperties+xml",
                    XmlKopf + "<ds:datastoreItem ds:itemID=\"{11111111-2222-3333-4444-555555555555}\" xmlns:ds=\"http://schemas.openxmlformats.org/officeDocument/2006/customXml\">" +
                    "<ds:schemaRefs><ds:schemaRef ds:uri=\"http://schemas.microsoft.com/office/2006/metadata/properties\"/></ds:schemaRefs></ds:datastoreItem>");
                bauer.Beziehung("customXml/item1.xml", RelBasis + "/customXmlProps", "itemProps1.xml");
                bauer.DokumentBeziehung(RelCustomXml, "../customXml/item1.xml");
                return bauer.Bytes();
            }

            case "O6 Vertraulichkeitsbezeichnung":
            {
                var bauer = Gueltig();
                bauer.Teil("docMetadata/LabelInfo.xml", "application/vnd.ms-office.classificationlabels+xml",
                    XmlKopf + "<clbl:labelList xmlns:clbl=\"http://schemas.microsoft.com/office/2020/mipLabelMetadata\">" +
                    "<clbl:label id=\"{00000000-0000-4000-8000-000000000abc}\" enabled=\"1\" method=\"Standard\" siteId=\"{00000000-0000-4000-8000-000000000def}\" removed=\"0\"/></clbl:labelList>");
                bauer.Beziehung(string.Empty, "http://schemas.microsoft.com/office/2020/02/relationships/classificationlabels", "docMetadata/LabelInfo.xml");
                return bauer.Bytes();
            }

            default:
                throw new ArgumentOutOfRangeException(nameof(fall), fall, null);
        }
    }

    /// <summary>Hängt <paramref name="block"/> vor <c>w:sectPr</c> in den mit <see cref="Dokument"/> gebauten Hauptteil.</summary>
    private static byte[] Ersetze(DocxBauer bauer, string block)
    {
        bauer.DokumentInhalt = bauer.DokumentInhalt!.Replace("<w:sectPr/>", block + "<w:sectPr/>", StringComparison.Ordinal);
        return bauer.Bytes();
    }

    [Theory]
    [MemberData(nameof(Entscheidungen))]
    public async Task Abgelehnte_Word_Erweiterung_ergibt_die_Erweiterungsmeldung(string fall)
    {
        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(Nachbildung(fall)));
    }

    [Fact]
    public async Task Eingebettete_Schrift_bleibt_zulaessig()
    {
        var bauer = Gueltig();
        bauer.DokumentTeil("fontTable.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml",
            RelBasis + "/fontTable",
            XmlKopf + $"<w:fonts {Namensraeume}><w:font w:name=\"Testschrift\">" +
            "<w:embedRegular r:id=\"rIdSchrift\" w:fontKey=\"{00000000-0000-0000-0000-000000000001}\"/></w:font></w:fonts>");
        bauer.Teil("word/fonts/font1.odttf", "application/vnd.openxmlformats-officedocument.obfuscatedFont", Testbilder.Png(128));
        bauer.Beziehung("word/fontTable.xml", RelBasis + "/font", "fonts/font1.odttf", id: "rIdSchrift");

        await AngenommenAsync(bauer.Bytes());
    }

    // ---------- Reihenfolge ----------

    [Fact]
    public async Task DOCTYPE_im_Hauptteil_geht_fremdem_Namespace_in_einem_spaeteren_Teil_vor()
    {
        var bauer = Gueltig();
        bauer.DokumentProlog = "<!DOCTYPE w:document [<!ENTITY x \"y\">]>";
        bauer.Teil("word/waise.xml", "application/xml", XmlKopf + $"<x:zusatz {DeklarationX}/>");

        Assert.Equal([Unzulaessig(DtdArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task DOCTYPE_in_einem_spaeteren_Teil_geht_fremdem_Namespace_im_Hauptteil_vor()
    {
        var bauer = Dokument(DeklarationX, "<x:zusatz/>");
        bauer.Teil("word/waise.xml", "application/xml",
            XmlKopf + "<!DOCTYPE w:waise [<!ENTITY x \"y\">]>" + $"<w:waise xmlns:w=\"{DocxLeser.W.NamespaceName}\">&x;</w:waise>");

        Assert.Equal([Unzulaessig(DtdArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Zu_tiefer_Teil_mit_fremder_Wurzel_ergibt_die_Tiefenmeldung()
    {
        var xml = new StringBuilder(XmlKopf).Append($"<x:e {DeklarationX}>");
        for (var i = 0; i < 256; i++)
        {
            xml.Append("<x:e>");
        }

        for (var i = 0; i < 256; i++)
        {
            xml.Append("</x:e>");
        }

        var bauer = Gueltig().Teil("word/tief.xml", "application/xml", xml.Append("</x:e>").ToString());
        bauer.Kompression = System.IO.Compression.CompressionLevel.NoCompression;

        Assert.Equal([ZuTief], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Fremdes_Element_mit_1001_Attributen_ergibt_entpackt_zu_gross()
    {
        var attribute = string.Concat(Enumerable.Range(0, 1_000).Select(i => $" a{i}=\"\""));
        var datei = Gueltig().Teil("word/attribute.xml", "application/xml", XmlKopf + $"<x:e {DeklarationX}{attribute}/>").Bytes();

        Assert.Equal([ZuGrossEntpackt], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Echte_docm_mit_wne_Teil_meldet_weiterhin_Makros()
    {
        var bauer = Gueltig();
        bauer.HauptTyp = MakroHauptteilTyp;
        bauer.DokumentTeil("vbaProject.bin", "application/vnd.ms-office.vbaProject", RelVbaProject, [0xCC, 0x61, 0xFF, 0xFF, 0x00]);
        bauer.Teil("word/vbaData.xml", "application/vnd.ms-word.vbaData+xml",
            XmlKopf + "<wne:vbaSuppData xmlns:wne=\"http://schemas.microsoft.com/office/word/2006/wordml\"><wne:mcds>" +
            "<wne:mcd wne:macroName=\"PROJECT.NEWMACROS.MAKRO1\" wne:name=\"Project.NewMacros.Makro1\" wne:bEncrypt=\"00\" wne:cmg=\"56\"/></wne:mcds></wne:vbaSuppData>");
        bauer.Beziehung("word/vbaProject.bin", "http://schemas.microsoft.com/office/2006/relationships/wordVbaData", "vbaData.xml");

        Assert.Equal([Makros], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Eingeschmuggeltes_vbaProject_und_fremder_Namespace_meldet_Makros()
    {
        var datei = Dokument(DeklarationX, "<x:zusatz/>").RohEintrag("word/vbaProject.bin", [0xCC, 0x61, 0xFF, 0xFF, 0x00]).Bytes();

        Assert.Equal([Makros], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Kopfzeile_mit_Content_Type_image_png_und_fremder_Namespace_ist_kein_Word_Dokument()
    {
        var bauer = Dokument(DeklarationX, "<x:zusatz/>");
        bauer.KopfzeileAls("media/kopf.png", "default", [], Testbilder.Png(64), "image/png");

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Fremder_Namespace_mit_DDE_Feld_und_Kommentar_ergibt_nur_die_Erweiterungsmeldung()
    {
        var bauer = Dokument(DeklarationX, "<x:zusatz/>",
            P(FeldBeginn, WInstr(" DDE excel x "), FeldTrenner, Ergebnis, FeldEnde), Testvorlagen.KommentarVerweis());
        Testvorlagen.MitKommentarTeil(basis: bauer);

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task ActiveX_Teil_mit_ax_ocx_meldet_weiterhin_ActiveX()
    {
        Assert.Equal([Unzulaessig("ActiveX-Steuerelemente")], await AbgelehntOhneSpeichernAsync(Testvorlagen.MitActiveX().Bytes()));
    }

    // ---------- Nachprüfung umfasst die Positivliste ----------

    /// <summary>Ersetzte Bereinigung: liefert eine bereinigte Datei, optional mit fremdem Namespace im Hauptteil.</summary>
    private sealed class BereinigungMitFremdemNamespace(bool mitFremd) : IDocxBereinigung
    {
        public byte[] Bereinigen(byte[] inhalt) =>
            (mitFremd ? Mit([.. PflichtAbsaetze, P($"<w:r><x:zusatz {DeklarationX}/></w:r>")]) : Gueltig())
                .KernEigenschaften("<dc:creator>C.O.I.N.</dc:creator>")
                .Bytes();
    }

    private async Task<(HttpStatusCode Status, string Antwort)> HochladenMitBereinigungAsync(bool mitFremd)
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Dienste = dienste => dienste.AddSingleton<IDocxBereinigung>(new BereinigungMitFremdemNamespace(mitFremd)),
        });
        using var client = factory.CreateClient();
        using var coin = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin($"Coin Nachpruefung {Guid.NewGuid():N}"));
        var coinId = (await JsonAsync(coin)).GetProperty("id").GetGuid();

        using var antwort = await PostVersionAsync(client, coinId, Gueltig().Bytes());
        return (antwort.StatusCode, await antwort.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Nachpruefung_lehnt_bereinigte_Datei_mit_fremdem_Namespace_ab()
    {
        var (status, antwort) = await HochladenMitBereinigungAsync(mitFremd: true);

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Contains(
            "Die Datei konnte nicht verarbeitet werden. Bitte in Word erneut als Word-Dokument (.docx) speichern und erneut hochladen.",
            antwort, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Gegenprobe_Nachpruefung_nimmt_dieselbe_bereinigte_Datei_ohne_fremden_Namespace_an()
    {
        var (status, antwort) = await HochladenMitBereinigungAsync(mitFremd: false);

        Assert.True(status == HttpStatusCode.Created, $"{(int)status} {antwort}");
    }

    // ---------- Laufzeit ----------

    /// <summary>Qualifizierte Attribute aus erlaubten Namespaces (Präfixe aus <see cref="DocxBauer.Namensraeume"/>).</summary>
    private static readonly string[] ErlaubtePraefixe = ["w", "r", "a", "wp", "w14", "o", "v", "pic"];

    /// <summary>
    /// Verwaister Teil von rund 9 MiB; jedes Element hat 1.000 Attribute (10 Deklarationen an der Wurzel ausgenommen),
    /// alle qualifiziert in erlaubten Namespaces. Zufällige Werte halten die Kompression unter 100 : 1.
    /// </summary>
    private static byte[] NeunMiBMitQualifiziertenAttributen()
    {
        var zufall = new Random(4712);
        var xml = new StringBuilder(9_300_000).Append(XmlKopf).Append($"<w:r {Namensraeume.Replace(" mc:Ignorable=\"w14\"", string.Empty, StringComparison.Ordinal)}>");
        while (xml.Length < 9_000_000)
        {
            xml.Append("<w:e");
            for (var i = 0; i < 1_000; i++)
            {
                xml.Append(' ').Append(ErlaubtePraefixe[i % ErlaubtePraefixe.Length]).Append(":a").Append(i)
                    .Append("=\"").Append(zufall.Next().ToString("x8", System.Globalization.CultureInfo.InvariantCulture)).Append('"');
            }

            xml.Append("/>");
        }

        var datei = Gueltig().Teil("word/viele.xml", "application/xml", xml.Append("</w:r>").ToString()).Bytes();
        Assert.True(datei.Length < FuenfMiB, $"Testdatei zu groß: {datei.Length}");
        return datei;
    }

    [Fact]
    public async Task Verwaister_Teil_von_9_MiB_mit_qualifizierten_erlaubten_Attributen_wird_in_unter_15_Sekunden_angenommen()
    {
        var datei = NeunMiBMitQualifiziertenAttributen();
        var coinId = await CoinAsync();

        var uhr = Stopwatch.StartNew();
        using var antwort = await PostVersionAsync(coinId, datei);
        uhr.Stop();

        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"{(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        Assert.True(uhr.Elapsed < TimeSpan.FromSeconds(15), $"Dauer: {uhr.Elapsed}");
    }

    [Fact]
    public void Analyse_meldet_Element_mit_1000_fremden_Attributen_in_unter_2_Sekunden()
    {
        var analyse = Fixture.Factory.Services.GetRequiredService<IDocxAnalyse>();
        var attribute = string.Concat(Enumerable.Range(0, 999).Select(i => $" x:a{i}=\"\""));
        var datei = Gueltig().Teil("word/fremd.xml", "application/xml", XmlKopf + $"<x:e {DeklarationX}{attribute}/>").Bytes();
        analyse.Analysieren(Gueltig().Bytes());

        var uhr = Stopwatch.StartNew();
        var befund = analyse.Analysieren(datei);
        uhr.Stop();

        Assert.Equal([Erweiterungen], Assert.IsType<DocxBefund.Abgelehnt>(befund).Meldungen);
        Assert.True(uhr.Elapsed < TimeSpan.FromSeconds(2), $"Dauer: {uhr.Elapsed}");
    }
}
