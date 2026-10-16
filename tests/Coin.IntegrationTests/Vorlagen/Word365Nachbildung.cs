using System.Text;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Nachbildungen typischer Word-365- und LibreOffice-Dateien für die Kontrollfälle der Namespace-Positivliste
/// (zertifikatsvorlagen Rev. 7, Testplan „Kontrollfälle, angenommen“ (b) und (c), ADR-0026). Struktur und
/// Deklarationen wie beim Speichern als .docx; Inhalte gekürzt, keine Personendaten.
/// </summary>
public static class Word365Nachbildung
{
    private const string XmlKopf = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";

    /// <summary>Alle Präfixe beider Tabellen aus <c>docs/word-namespaces.md</c> (erlaubt und nicht erlaubt), nur deklariert.</summary>
    public static readonly (string Praefix, string Uri)[] AlleDeklarationen =
    [
        // erlaubt (Teil der Wurzel, die Word 365 in document.xml schreibt)
        ("wpc", "http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"),
        ("mc", "http://schemas.openxmlformats.org/markup-compatibility/2006"),
        ("o", "urn:schemas-microsoft-com:office:office"),
        ("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships"),
        ("m", "http://schemas.openxmlformats.org/officeDocument/2006/math"),
        ("v", "urn:schemas-microsoft-com:vml"),
        ("wp14", "http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"),
        ("wp", "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"),
        ("w10", "urn:schemas-microsoft-com:office:word"),
        ("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main"),
        ("w14", "http://schemas.microsoft.com/office/word/2010/wordml"),
        ("w15", "http://schemas.microsoft.com/office/word/2012/wordml"),
        ("w16cex", "http://schemas.microsoft.com/office/word/2018/wordml/cex"),
        ("w16cid", "http://schemas.microsoft.com/office/word/2016/wordml/cid"),
        ("w16", "http://schemas.microsoft.com/office/word/2018/wordml"),
        ("w16du", "http://schemas.microsoft.com/office/word/2023/wordml/word16du"),
        ("w16sdtdh", "http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash"),
        ("w16sdtfl", "http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock"),
        ("w16se", "http://schemas.microsoft.com/office/word/2015/wordml/symex"),
        ("wpg", "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"),
        ("wps", "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"),
        ("wp15", "http://schemas.microsoft.com/office/word/2012/wordprocessingDrawing"),
        ("a", "http://schemas.openxmlformats.org/drawingml/2006/main"),
        ("pic", "http://schemas.openxmlformats.org/drawingml/2006/picture"),
        ("a14", "http://schemas.microsoft.com/office/drawing/2010/main"),
        ("a16", "http://schemas.microsoft.com/office/drawing/2014/main"),
        ("adec", "http://schemas.microsoft.com/office/drawing/2017/decorative"),
        ("thm15", "http://schemas.microsoft.com/office/thememl/2012/main"),
        ("ax", "http://schemas.microsoft.com/office/2006/activeX"),

        // nicht erlaubt, von Word 365 bzw. laut Erläuterungstabelle nur deklariert
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
        ("svg", "http://www.w3.org/2000/svg"),
        ("xlink", "http://www.w3.org/1999/xlink"),
        ("inkml", "http://www.w3.org/2003/InkML"),
        ("dgm", "http://schemas.openxmlformats.org/drawingml/2006/diagram"),
        ("dsp", "http://schemas.microsoft.com/office/drawing/2008/diagram"),
        ("c", "http://schemas.openxmlformats.org/drawingml/2006/chart"),
        ("c14", "http://schemas.microsoft.com/office/drawing/2007/8/2/chart"),
        ("c15", "http://schemas.microsoft.com/office/drawing/2012/chart"),
        ("c16", "http://schemas.microsoft.com/office/drawing/2014/chart"),
        ("cs", "http://schemas.microsoft.com/office/drawing/2012/chartStyle"),
        ("p", "http://schemas.microsoft.com/office/2006/metadata/properties"),
        ("pc", "http://schemas.microsoft.com/office/infopath/2007/PartnerControls"),
        ("clbl", "http://schemas.microsoft.com/office/2020/mipLabelMetadata"),
        ("we", "http://schemas.microsoft.com/office/webextensions/webextension/2010/11"),
        ("wetp", "http://schemas.microsoft.com/office/webextensions/taskpanes/2010/11"),
        ("cui", "http://schemas.microsoft.com/office/2009/07/customui"),
        ("sl", "http://schemas.openxmlformats.org/schemaLibrary/2006/main"),
        ("a1611", "http://schemas.microsoft.com/office/drawing/2016/11/main"),
        ("ahyp", "http://schemas.microsoft.com/office/drawing/2018/hyperlinkcolor"),
        ("x", "urn:schemas-microsoft-com:office:excel"),
        ("pvml", "urn:schemas-microsoft-com:office:powerpoint"),
        ("lc", "http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas"),
    ];

    public const string Ignorable = "w14 w15 w16se w16cid w16 w16cex w16sdtdh w16sdtfl w16du wp14";

    /// <summary>Start-Tag-Inhalt einer Teilwurzel wie bei Word 365.</summary>
    public static string WordWurzel => string.Join(" ", AlleDeklarationen.Select(n => $"xmlns:{n.Praefix}=\"{n.Uri}\"")) + $" mc:Ignorable=\"{Ignorable}\"";

    private static int _id = 1;

    private static string ParaIds() => $"w14:paraId=\"{_id++:X8}\" w14:textId=\"77777777\" w:rsidR=\"00A1B2C3\" w:rsidRDefault=\"00A1B2C3\"";

    private static string Absatz(string inhalt) => $"<w:p {ParaIds()}>{inhalt}</w:p>";

    private static string Lauf(string text) => $"<w:r><w:t xml:space=\"preserve\">{text}</w:t></w:r>";

    private static string PageFeldRuns =>
        "<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r><w:r><w:instrText xml:space=\"preserve\"> PAGE   \\* MERGEFORMAT </w:instrText></w:r>" +
        "<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r><w:r><w:rPr><w:noProof/></w:rPr><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType=\"end\"/></w:r>";

    /// <summary>Textfeld in der Form, die Word 365 schreibt (DrawingML mit <c>wp14</c>/<c>a14</c>, VML-Rückfall), mit PAGE-Feld.</summary>
    private static string Textfeld() =>
        Absatz("<w:r><w:rPr><w:noProof/></w:rPr><mc:AlternateContent><mc:Choice Requires=\"wps\"><w:drawing>" +
            "<wp:anchor distT=\"45720\" distB=\"45720\" distL=\"114300\" distR=\"114300\" simplePos=\"0\" relativeHeight=\"251659264\" behindDoc=\"0\" locked=\"0\" layoutInCell=\"1\" allowOverlap=\"1\" wp14:anchorId=\"1A2B3C4D\" wp14:editId=\"5E6F7A8B\">" +
            "<wp:simplePos x=\"0\" y=\"0\"/><wp:positionH relativeFrom=\"column\"><wp:posOffset>0</wp:posOffset></wp:positionH>" +
            "<wp:positionV relativeFrom=\"paragraph\"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx=\"2360930\" cy=\"1404620\"/>" +
            "<wp:effectExtent l=\"0\" t=\"0\" r=\"0\" b=\"0\"/><wp:wrapSquare wrapText=\"bothSides\"/><wp:docPr id=\"217\" name=\"Textfeld 2\"/>" +
            "<wp:cNvGraphicFramePr><a:graphicFrameLocks/></wp:cNvGraphicFramePr>" +
            "<a:graphic><a:graphicData uri=\"http://schemas.microsoft.com/office/word/2010/wordprocessingShape\"><wps:wsp><wps:cNvSpPr txBox=\"1\"><a:spLocks noChangeArrowheads=\"1\"/></wps:cNvSpPr>" +
            "<wps:spPr bwMode=\"auto\"><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"2360930\" cy=\"1404620\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom>" +
            "<a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:ln w=\"9525\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:miter lim=\"800000\"/></a:ln></wps:spPr>" +
            $"<wps:txbx><w:txbxContent>{Absatz(Lauf("Seite ") + PageFeldRuns)}</w:txbxContent></wps:txbx>" +
            "<wps:bodyPr rot=\"0\" vert=\"horz\" wrap=\"square\" lIns=\"91440\" tIns=\"45720\" rIns=\"91440\" bIns=\"45720\" anchor=\"t\" anchorCtr=\"0\"><a:spAutoFit/></wps:bodyPr></wps:wsp>" +
            "</a:graphicData></a:graphic><wp14:sizeRelH relativeFrom=\"margin\"><wp14:pctWidth>40000</wp14:pctWidth></wp14:sizeRelH>" +
            "<wp14:sizeRelV relativeFrom=\"margin\"><wp14:pctHeight>20000</wp14:pctHeight></wp14:sizeRelV></wp:anchor></w:drawing></mc:Choice>" +
            "<mc:Fallback><w:pict><v:shapetype id=\"_x0000_t202\" coordsize=\"21600,21600\" o:spt=\"202\" path=\"m,l,21600r21600,l21600,xe\">" +
            "<v:stroke joinstyle=\"miter\"/><v:path gradientshapeok=\"t\" o:connecttype=\"rect\"/></v:shapetype>" +
            "<v:shape id=\"Textfeld 2\" o:spid=\"_x0000_s1026\" type=\"#_x0000_t202\" style=\"position:absolute;margin-left:0;margin-top:0;width:185.9pt;height:110.6pt;z-index:251659264\">" +
            $"<v:textbox style=\"mso-fit-shape-to-text:t\"><w:txbxContent>{Absatz(Lauf("Seite ") + PageFeldRuns)}</w:txbxContent></v:textbox>" +
            "<w10:wrap type=\"square\"/></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>");

    private static string Tabelle() =>
        "<w:tbl><w:tblPr><w:tblStyle w:val=\"Tabellenraster\"/><w:tblW w:w=\"0\" w:type=\"auto\"/><w:tblLook w:val=\"04A0\"/></w:tblPr>" +
        "<w:tblGrid><w:gridCol w:w=\"4531\"/><w:gridCol w:w=\"4531\"/></w:tblGrid>" +
        $"<w:tr w:rsidR=\"00A1B2C3\"><w:tc><w:tcPr><w:tcW w:w=\"4531\" w:type=\"dxa\"/></w:tcPr>{Absatz(Lauf("Dienstgrad"))}</w:tc>" +
        $"<w:tc><w:tcPr><w:tcW w:w=\"4531\" w:type=\"dxa\"/></w:tcPr>{Absatz(Lauf("{{Empfaenger.Dienstgrad}}"))}</w:tc></w:tr></w:tbl>";

    private static string Bild(string rid, int id, string name) =>
        Absatz("<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\" wp14:anchorId=\"2B3C4D5E\" wp14:editId=\"6F7A8B9C\">" +
            "<wp:extent cx=\"952500\" cy=\"952500\"/><wp:effectExtent l=\"0\" t=\"0\" r=\"0\" b=\"0\"/>" +
            $"<wp:docPr id=\"{id}\" name=\"{name}\"><a:extLst><a:ext uri=\"{{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}}\"><a16:creationId id=\"{{3C4D5E6F-0000-4000-8000-00000000000{id}}}\"/></a:ext>" +
            "<a:ext uri=\"{C183D7F6-B498-43B3-948B-1728B52AA6E4}\"><adec:decorative val=\"1\"/></a:ext></a:extLst></wp:docPr>" +
            "<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect=\"1\"/></wp:cNvGraphicFramePr>" +
            $"<a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:pic><pic:nvPicPr><pic:cNvPr id=\"{id}\" name=\"{name}\"/><pic:cNvPicPr/></pic:nvPicPr>" +
            $"<pic:blipFill><a:blip r:embed=\"{rid}\"><a:extLst><a:ext uri=\"{{28A0092B-C50C-407E-A947-70E740481C1C}}\"><a14:useLocalDpi val=\"0\"/></a:ext>" +
            "</a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>" +
            "<pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"952500\" cy=\"952500\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr>" +
            "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>");

    private const string StoreItemId = "{1B2C3D4E-0000-4000-8000-0000000000AA}";

    private static string Inhaltssteuerelement() =>
        "<w:sdt><w:sdtPr><w:alias w:val=\"Gelegenheit\"/><w:tag w:val=\"Gelegenheit\"/><w:id w:val=\"-1234567\"/>" +
        $"<w:dataBinding w:prefixMappings=\"xmlns:b='{Testvorlagen.BibliographyNs}'\" w:xpath=\"/b:Sources[1]/b:Source[1]/b:Tag[1]\" w:storeItemID=\"{StoreItemId}\" w16sdtdh:storeItemChecksum=\"AAAAAA==\"/>" +
        "<w15:appearance w15:val=\"hidden\"/><w:text/></w:sdtPr>" +
        $"<w:sdtContent>{Absatz(Lauf("{{Ausgabe.Gelegenheit}}"))}</w:sdtContent></w:sdt>";

    private static string Formel() =>
        Absatz("<m:oMathPara><m:oMath><m:r><m:t>a</m:t></m:r><m:r><w:rPr><w:rFonts w:ascii=\"Cambria Math\" w:hAnsi=\"Cambria Math\"/></w:rPr><m:t>=</m:t></m:r>" +
            "<m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath></m:oMathPara>");

    /// <summary>Kopf- oder Fußzeilenteil mit Word-365-Wurzel.</summary>
    private static string StoryTeil(string wurzel, string inhalt) => XmlKopf + $"<w:{wurzel} {WordWurzel}>{inhalt}</w:{wurzel}>";

    /// <summary>
    /// Word-365-Nachbildung ohne SVG (Testplan Kontrollfall b, F15): PNG- und JPEG-Bild; <c>asvg</c>, <c>svg</c> und
    /// <c>xlink</c> sind an den Wurzeln nur deklariert.
    /// </summary>
    public static byte[] Word365()
    {
        var bauer = new DocxBauer();
        var ridPng = bauer.DokumentTeil("media/image1.png", "image/png", RelImage, Testbilder.Png(900));
        var ridJpeg = bauer.DokumentTeil("media/image2.jpeg", "image/jpeg", RelImage, Testbilder.Jpeg(700));
        var ridLink = bauer.DokumentBeziehung(RelHyperlink, "https://beispiel.invalid/coins", istExtern: true);
        var ridKopf = bauer.DokumentTeil("header1.xml", HeaderTyp, RelHeader,
            StoryTeil("hdr", Absatz("<w:pPr><w:pStyle w:val=\"Kopfzeile\"/></w:pPr>" + Lauf("Zertifikat Nr. {{Zertifikat.Nummer}}"))));
        var ridFuss = bauer.DokumentTeil("footer1.xml", FooterTyp, RelFooter,
            StoryTeil("ftr", Absatz("<w:pPr><w:pStyle w:val=\"Fuzeile\"/><w:jc w:val=\"center\"/></w:pPr>" + PageFeldRuns)));
        bauer.DokumentTeil("styles.xml", StylesTyp, RelStyles,
            StoryTeil("styles", "<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme=\"minorHAnsi\" w:hAnsiTheme=\"minorHAnsi\"/>" +
                "<w:kern w:val=\"2\"/><w:lang w:val=\"de-DE\"/><w14:ligatures w14:val=\"standardContextual\"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>" +
                "<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Standard\"><w:name w:val=\"Normal\"/><w:qFormat/></w:style>" +
                "<w:style w:type=\"table\" w:styleId=\"Tabellenraster\"><w:name w:val=\"Table Grid\"/><w:basedOn w:val=\"NormaleTabelle\"/><w:uiPriority w:val=\"39\"/><w:rsid w:val=\"00A1B2C3\"/></w:style>"));
        bauer.DokumentTeil("stylesWithEffects.xml", "application/vnd.ms-word.stylesWithEffects+xml",
            "http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects", StoryTeil("styles", string.Empty));
        bauer.DokumentTeil("settings.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml", RelSettings,
            StoryTeil("settings", "<w:zoom w:percent=\"100\"/><w:proofState w:spelling=\"clean\" w:grammar=\"clean\"/><w:defaultTabStop w:val=\"708\"/>" +
                "<w:hyphenationZone w:val=\"425\"/><w:characterSpacingControl w:val=\"doNotCompress\"/><w:compat><w:compatSetting w:name=\"compatibilityMode\" w:uri=\"http://schemas.microsoft.com/office/word\" w:val=\"15\"/></w:compat>" +
                "<w:rsids><w:rsidRoot w:val=\"00A1B2C3\"/><w:rsid w:val=\"00A1B2C3\"/></w:rsids>" +
                "<m:mathPr><m:mathFont m:val=\"Cambria Math\"/><m:brkBin m:val=\"before\"/><m:defJc m:val=\"centerGroup\"/></m:mathPr>" +
                "<w:themeFontLang w:val=\"de-DE\"/><w:shapeDefaults><o:shapedefaults v:ext=\"edit\" spidmax=\"1026\"/><o:shapelayout v:ext=\"edit\"><o:idmap v:ext=\"edit\" data=\"1\"/></o:shapelayout></w:shapeDefaults>" +
                "<w:decimalSymbol w:val=\",\"/><w:listSeparator w:val=\";\"/><w14:docId w14:val=\"1A2B3C4D\"/><w15:chartTrackingRefBased/>" +
                "<w15:docId w15:val=\"{2B3C4D5E-0000-4000-8000-000000000001}\"/>"));
        bauer.DokumentTeil("webSettings.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml", RelBasis + "/webSettings",
            StoryTeil("webSettings", "<w:optimizeForBrowser/><w:allowPNG/>"));
        bauer.DokumentTeil("fontTable.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml", RelBasis + "/fontTable",
            StoryTeil("fonts", "<w:font w:name=\"Aptos\"><w:panose1 w:val=\"020B0004020202020204\"/><w:charset w:val=\"00\"/><w:family w:val=\"swiss\"/><w:pitch w:val=\"variable\"/>" +
                "<w:embedRegular r:id=\"rIdSchrift1\" w:fontKey=\"{00000000-0000-0000-0000-000000000001}\"/></w:font>"));
        bauer.Teil("word/fonts/font1.odttf", "application/vnd.openxmlformats-officedocument.obfuscatedFont", Testbilder.Png(256));
        bauer.Beziehung("word/fontTable.xml", RelBasis + "/font", "fonts/font1.odttf", id: "rIdSchrift1");
        bauer.DokumentTeil("theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml", RelBasis + "/theme",
            XmlKopf + "<a:theme xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" name=\"Office\"><a:themeElements>" +
            "<a:clrScheme name=\"Office\"><a:dk1><a:sysClr val=\"windowText\" lastClr=\"000000\"/></a:dk1><a:lt1><a:sysClr val=\"window\" lastClr=\"FFFFFF\"/></a:lt1>" +
            "<a:dk2><a:srgbClr val=\"0E2841\"/></a:dk2><a:lt2><a:srgbClr val=\"E8E8E8\"/></a:lt2><a:accent1><a:srgbClr val=\"156082\"/></a:accent1><a:accent2><a:srgbClr val=\"E97132\"/></a:accent2>" +
            "<a:accent3><a:srgbClr val=\"196B24\"/></a:accent3><a:accent4><a:srgbClr val=\"0F9ED5\"/></a:accent4><a:accent5><a:srgbClr val=\"A02B93\"/></a:accent5><a:accent6><a:srgbClr val=\"4EA72E\"/></a:accent6>" +
            "<a:hlink><a:srgbClr val=\"467886\"/></a:hlink><a:folHlink><a:srgbClr val=\"96607D\"/></a:folHlink></a:clrScheme>" +
            "<a:fontScheme name=\"Office\"><a:majorFont><a:latin typeface=\"Aptos Display\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:majorFont>" +
            "<a:minorFont><a:latin typeface=\"Aptos\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:minorFont></a:fontScheme>" +
            "<a:fmtScheme name=\"Office\"><a:fillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:fillStyleLst>" +
            "<a:lnStyleLst><a:ln w=\"12700\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln><a:ln w=\"19050\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln><a:ln w=\"25400\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln></a:lnStyleLst>" +
            "<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>" +
            "<a:bgFillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>" +
            "</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/><a:extLst><a:ext uri=\"{05A4C25C-085E-4340-85A3-A5531E510DB2}\">" +
            "<thm15:themeFamily xmlns:thm15=\"http://schemas.microsoft.com/office/thememl/2012/main\" name=\"Office Theme\" id=\"{2E142A2C-CD16-42D6-873A-C26D2A0506FA}\" vid=\"{1BDDFF52-6CD6-40A5-AB3C-68EB2F1E4D0A}\"/>" +
            "</a:ext></a:extLst></a:theme>");
        bauer.Teil("customXml/item1.xml", null, Testvorlagen.QuellenverzeichnisXml("Quelle1"));
        bauer.Teil("customXml/itemProps1.xml", "application/vnd.openxmlformats-officedocument.customXmlProperties+xml",
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?>" +
            $"<ds:datastoreItem ds:itemID=\"{StoreItemId}\" xmlns:ds=\"http://schemas.openxmlformats.org/officeDocument/2006/customXml\">" +
            $"<ds:schemaRefs><ds:schemaRef ds:uri=\"{Testvorlagen.BibliographyNs}\"/></ds:schemaRefs></ds:datastoreItem>");
        bauer.Beziehung("customXml/item1.xml", RelBasis + "/customXmlProps", "itemProps1.xml");
        bauer.DokumentBeziehung(RelCustomXml, "../customXml/item1.xml");
        bauer.KernEigenschaften(
            "<dc:title></dc:title><dc:subject></dc:subject><dc:creator>Testautor</dc:creator><cp:keywords></cp:keywords><dc:description></dc:description>" +
            "<cp:lastModifiedBy>Testautor</cp:lastModifiedBy><cp:revision>2</cp:revision>" +
            "<dcterms:created xsi:type=\"dcterms:W3CDTF\">2026-10-01T08:00:00Z</dcterms:created><dcterms:modified xsi:type=\"dcterms:W3CDTF\">2026-10-01T09:00:00Z</dcterms:modified>");
        bauer.AppEigenschaften(
            "<Template>Normal.dotm</Template><TotalTime>3</TotalTime><Pages>1</Pages><Words>40</Words><Characters>260</Characters>" +
            "<Application>Microsoft Office Word</Application><DocSecurity>0</DocSecurity><Lines>2</Lines><Paragraphs>1</Paragraphs><ScaleCrop>false</ScaleCrop>" +
            "<HeadingPairs><vt:vector size=\"2\" baseType=\"variant\"><vt:variant><vt:lpstr>Titel</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>" +
            "<TitlesOfParts><vt:vector size=\"1\" baseType=\"lpstr\"><vt:lpstr></vt:lpstr></vt:vector></TitlesOfParts>" +
            "<Company></Company><LinksUpToDate>false</LinksUpToDate><CharactersWithSpaces>299</CharactersWithSpaces><SharedDoc>false</SharedDoc>" +
            "<HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion>");

        var koerper = new StringBuilder()
            .Append(Absatz(Lauf("{{Coin.Name}}")))
            .Append(Absatz(Lauf("Exemplar Nr. {{Exemplar.Nummer}}")))
            .Append(Absatz(Lauf("verliehen an {{Empfaenger.Name}}")))
            .Append(Textfeld())
            .Append(Tabelle())
            .Append(Bild(ridPng, 1, "Grafik 1"))
            .Append(Bild(ridJpeg, 2, "Grafik 2"))
            .Append(Absatz($"<w:hyperlink r:id=\"{ridLink}\" w:history=\"1\"><w:r><w:rPr><w:rStyle w:val=\"Hyperlink\"/></w:rPr><w:t>Coin-Katalog</w:t></w:r></w:hyperlink>"))
            .Append(Inhaltssteuerelement())
            .Append(Formel())
            .Append($"<w:sectPr w:rsidR=\"00A1B2C3\"><w:headerReference w:type=\"default\" r:id=\"{ridKopf}\"/><w:footerReference w:type=\"default\" r:id=\"{ridFuss}\"/>" +
                "<w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1417\" w:right=\"1417\" w:bottom=\"1134\" w:left=\"1417\" w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/>" +
                "<w:cols w:space=\"708\"/><w:docGrid w:linePitch=\"360\"/></w:sectPr>");
        bauer.DokumentInhalt = XmlKopf + $"<w:document {WordWurzel}><w:body>{koerper}</w:body></w:document>";
        return bauer.Bytes();
    }

    /// <summary>Wurzel-Deklarationen wie LibreOffice 24.x beim Speichern als „Word 2007–365“.</summary>
    public const string LibreOfficeWurzel =
        "xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" " +
        "xmlns:v=\"urn:schemas-microsoft-com:vml\" xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" " +
        "xmlns:w10=\"urn:schemas-microsoft-com:office:word\" xmlns:wp=\"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing\" " +
        "xmlns:wps=\"http://schemas.microsoft.com/office/word/2010/wordprocessingShape\" xmlns:wpg=\"http://schemas.microsoft.com/office/word/2010/wordprocessingGroup\" " +
        "xmlns:mc=\"http://schemas.openxmlformats.org/markup-compatibility/2006\" xmlns:wp14=\"http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing\" " +
        "xmlns:w14=\"http://schemas.microsoft.com/office/word/2010/wordml\" xmlns:w15=\"http://schemas.microsoft.com/office/word/2012/wordml\" " +
        "xmlns:m=\"http://schemas.openxmlformats.org/officeDocument/2006/math\" mc:Ignorable=\"w14 wp14 w15\"";

    private static string LoAbsatz(string text) => $"<w:p><w:pPr><w:pStyle w:val=\"Normal\"/><w:rPr></w:rPr></w:pPr><w:r><w:rPr></w:rPr><w:t xml:space=\"preserve\">{text}</w:t></w:r></w:p>";

    /// <summary>Gruppe aus Rechteck mit Textfeld, wie LibreOffice sie schreibt (<c>wpg</c>/<c>wps</c> in <c>mc:Choice</c>, VML im Rückfall).</summary>
    private static string LoGruppe() =>
        "<w:p><w:pPr><w:pStyle w:val=\"Normal\"/></w:pPr><w:r><mc:AlternateContent><mc:Choice Requires=\"wpg\"><w:drawing>" +
        "<wp:anchor behindDoc=\"0\" distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\" simplePos=\"0\" locked=\"0\" layoutInCell=\"0\" allowOverlap=\"1\" relativeHeight=\"2\">" +
        "<wp:simplePos x=\"0\" y=\"0\"/><wp:positionH relativeFrom=\"column\"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom=\"paragraph\"><wp:posOffset>0</wp:posOffset></wp:positionV>" +
        "<wp:extent cx=\"1800000\" cy=\"720000\"/><wp:effectExtent l=\"0\" t=\"0\" r=\"0\" b=\"0\"/><wp:wrapNone/><wp:docPr id=\"1\" name=\"Form 1\"/><wp:cNvGraphicFramePr/>" +
        "<a:graphic xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><a:graphicData uri=\"http://schemas.microsoft.com/office/word/2010/wordprocessingGroup\">" +
        "<wpg:wgp><wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"1800000\" cy=\"720000\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"1800000\" cy=\"720000\"/></a:xfrm></wpg:grpSpPr>" +
        "<wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"1800000\" cy=\"720000\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom>" +
        "<a:solidFill><a:srgbClr val=\"729FCF\"/></a:solidFill></wps:spPr>" +
        "<wps:txbx><w:txbxContent>" + LoAbsatz("Ausgegeben am {{Ausgabe.Datum}}") + "</w:txbxContent></wps:txbx>" +
        "<wps:bodyPr anchor=\"ctr\" lIns=\"91440\" tIns=\"45720\" rIns=\"91440\" bIns=\"45720\"><a:prstTxWarp prst=\"textNoShape\"><a:avLst/></a:prstTxWarp><a:noAutofit/></wps:bodyPr></wps:wsp>" +
        "</wpg:wgp></a:graphicData></a:graphic><wp14:sizeRelH relativeFrom=\"page\"><wp14:pctWidth>0</wp14:pctWidth></wp14:sizeRelH></wp:anchor></w:drawing></mc:Choice>" +
        "<mc:Fallback><w:pict><v:group id=\"shape_0\" alt=\"Form 1\" style=\"position:absolute;margin-left:0pt;margin-top:0pt;width:141.7pt;height:56.7pt\" coordorigin=\"0,0\" coordsize=\"2835,1134\">" +
        "<v:rect id=\"shape_1\" stroked=\"t\" o:allowincell=\"f\" style=\"position:absolute;left:0;top:0;width:2835;height:1134;mso-wrap-style:square;v-text-anchor:middle\" fillcolor=\"#729fcf\">" +
        "<v:fill o:detectmouseclick=\"t\" type=\"solid\" color2=\"#8d6030\"/><v:stroke color=\"#3465a4\" joinstyle=\"round\" endcap=\"flat\"/>" +
        "<v:textbox><w:txbxContent>" + LoAbsatz("Ausgegeben am {{Ausgabe.Datum}}") + "</w:txbxContent></v:textbox><w10:wrap type=\"none\"/></v:rect></v:group></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>";

    /// <summary>LibreOffice-Nachbildung (Testplan Kontrollfall c).</summary>
    public static byte[] LibreOffice()
    {
        var bauer = new DocxBauer();
        bauer.DokumentTeil("styles.xml", StylesTyp, RelStyles,
            XmlKopf + $"<w:styles {LibreOfficeWurzel}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii=\"Liberation Serif\" w:hAnsi=\"Liberation Serif\"/>" +
            "<w:kern w:val=\"2\"/><w:sz w:val=\"24\"/><w:lang w:val=\"de-DE\" w:eastAsia=\"zh-CN\" w:bidi=\"hi-IN\"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr/></w:pPrDefault></w:docDefaults>" +
            "<w:style w:type=\"paragraph\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/><w:qFormat/><w:pPr><w:widowControl/></w:pPr><w:rPr/></w:style></w:styles>");
        bauer.DokumentTeil("fontTable.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml", RelBasis + "/fontTable",
            XmlKopf + $"<w:fonts {LibreOfficeWurzel}><w:font w:name=\"Times New Roman\"><w:charset w:val=\"00\"/><w:family w:val=\"roman\"/><w:pitch w:val=\"variable\"/></w:font>" +
            "<w:font w:name=\"Liberation Serif\"><w:altName w:val=\"Times New Roman\"/><w:charset w:val=\"01\"/><w:family w:val=\"roman\"/><w:pitch w:val=\"variable\"/></w:font></w:fonts>");
        bauer.DokumentTeil("settings.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml", RelSettings,
            XmlKopf + $"<w:settings {LibreOfficeWurzel}><w:zoom w:percent=\"100\"/><w:defaultTabStop w:val=\"709\"/><w:autoHyphenation w:val=\"true\"/>" +
            "<w:compat><w:compatSetting w:name=\"compatibilityMode\" w:uri=\"http://schemas.microsoft.com/office/word\" w:val=\"15\"/></w:compat>" +
            "<w:themeFontLang w:val=\"de-DE\" w:eastAsia=\"zh-CN\" w:bidi=\"hi-IN\"/></w:settings>");
        bauer.DokumentTeil("theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml", RelBasis + "/theme",
            XmlKopf + "<a:theme xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" name=\"Office\">" +
            "<a:themeElements><a:clrScheme name=\"LibreOffice\"><a:dk1><a:srgbClr val=\"000000\"/></a:dk1><a:lt1><a:srgbClr val=\"FFFFFF\"/></a:lt1>" +
            "<a:dk2><a:srgbClr val=\"000000\"/></a:dk2><a:lt2><a:srgbClr val=\"FFFFFF\"/></a:lt2><a:accent1><a:srgbClr val=\"18A303\"/></a:accent1><a:accent2><a:srgbClr val=\"0369A3\"/></a:accent2>" +
            "<a:accent3><a:srgbClr val=\"A33E03\"/></a:accent3><a:accent4><a:srgbClr val=\"8E03A3\"/></a:accent4><a:accent5><a:srgbClr val=\"C99C00\"/></a:accent5><a:accent6><a:srgbClr val=\"C9211E\"/></a:accent6>" +
            "<a:hlink><a:srgbClr val=\"000080\"/></a:hlink><a:folHlink><a:srgbClr val=\"800000\"/></a:folHlink></a:clrScheme>" +
            "<a:fontScheme name=\"Office\"><a:majorFont><a:latin typeface=\"\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:majorFont><a:minorFont><a:latin typeface=\"\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:minorFont></a:fontScheme>" +
            "<a:fmtScheme><a:fillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:fillStyleLst>" +
            "<a:lnStyleLst><a:ln w=\"6350\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln><a:ln w=\"12700\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln><a:ln w=\"19050\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln></a:lnStyleLst>" +
            "<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>" +
            "<a:bgFillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>" +
            "</a:themeElements></a:theme>");
        bauer.KernEigenschaften(
            "<dcterms:created xsi:type=\"dcterms:W3CDTF\">2026-10-01T08:00:00Z</dcterms:created><dc:creator></dc:creator><dc:description></dc:description>" +
            "<dc:language>de-DE</dc:language><cp:lastModifiedBy></cp:lastModifiedBy><dcterms:modified xsi:type=\"dcterms:W3CDTF\">2026-10-01T09:00:00Z</dcterms:modified>" +
            "<cp:revision>1</cp:revision><dc:subject></dc:subject><dc:title></dc:title>");
        bauer.AppEigenschaften(
            "<Template></Template><TotalTime>1</TotalTime><Application>LibreOffice/24.2.7.2$Windows_X86_64 LibreOffice_project/0000000000000000000000000000000000000000</Application>" +
            "<AppVersion>15.0000</AppVersion><Pages>1</Pages><Words>20</Words><Characters>150</Characters><CharactersWithSpaces>170</CharactersWithSpaces><Paragraphs>5</Paragraphs>");

        var koerper = string.Concat(
            LoAbsatz("{{Coin.Name}}"), LoAbsatz("Exemplar Nr. {{Exemplar.Nummer}}"), LoAbsatz("Zertifikat Nr. {{Zertifikat.Nummer}}"),
            LoAbsatz("verliehen an {{Empfaenger.Name}}"), LoGruppe(),
            "<w:p><w:pPr><w:pStyle w:val=\"Normal\"/></w:pPr><m:oMathPara><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></m:oMathPara></w:p>",
            "<w:sectPr><w:type w:val=\"nextPage\"/><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:left=\"1134\" w:right=\"1134\" w:gutter=\"0\" w:header=\"0\" w:top=\"1134\" w:footer=\"0\" w:bottom=\"1134\"/>" +
            "<w:pgNumType w:fmt=\"decimal\"/><w:formProt w:val=\"false\"/><w:textDirection w:val=\"lrTb\"/><w:docGrid w:type=\"default\" w:linePitch=\"100\" w:charSpace=\"0\"/></w:sectPr>");
        bauer.DokumentInhalt = XmlKopf + $"<w:document {LibreOfficeWurzel}><w:body>{koerper}</w:body></w:document>";
        return bauer.Bytes();
    }
}
