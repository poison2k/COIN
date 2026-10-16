using System.Diagnostics;
using System.IO.Compression;
using System.Net;
using System.Security;
using System.Text;
using System.Xml.Linq;
using Coin.Domain.Vorlagen;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.Extensions.DependencyInjection;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 5 (nach QA-Review 3), AK-10, AK-12, AK-13, AK-16 (ADR-0024 Punkt 1.4–1.6, 3):
/// <list type="bullet">
/// <item>W1: <c>HYPERLINK</c>-Zerlegung wie Word (Token endet auch an <c>"</c>, Schalter ohne Groß-/Kleinschreibung).</item>
/// <item>W2: <c>href</c> ohne Namespace an VML-Elementen unterliegt der Hyperlink-Positivliste.</item>
/// <item>H1: <c>wp15:webVideoPr</c> → „Verknüpfungen auf externe Inhalte“.</item>
/// <item>H2: höchstens 1.000 Attribute (inkl. Namespace-Deklarationen) je Element.</item>
/// <item>H3: DOCTYPE-Erkennung mit derselben Kodierungserkennung wie der <c>XmlReader</c>.</item>
/// <item>H4: <c>[</c> und <c>]</c> bleiben in der Teilnamen-Normalform unkodiert.</item>
/// <item>H5: interne Beziehungsziele müssen auf einen vorhandenen Teil zeigen.</item>
/// <item>AK-16 (i): die Bereinigung schreibt Eintragsnamen in der Normalform.</item>
/// </list>
/// Jede Ablehnung nennt die wörtliche Meldung unter <c>errors.datei</c> und speichert nichts.
/// </summary>
public class VorlagenPruefungNachschaerfungTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string DtdArt = "Dokumenttypdefinitionen (DTD)";
    private const string ExternArt = "Verknüpfungen auf externe Inhalte";
    private const string HyperlinkArt = "Hyperlinks mit unzulässigem Ziel";
    private const string FeldnameArt = "Felder mit unzulässigem Feldnamen";

    private const string Wp15Ns = "http://schemas.microsoft.com/office/word/2012/wordprocessingDrawing";

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

    private static string Bild(string blipAttribut, string cNvPrInhalt = "") =>
        P("<w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"952500\" cy=\"952500\"/>" +
          "<wp:docPr id=\"7\" name=\"Bild 7\"/><a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\">" +
          $"<pic:pic><pic:nvPicPr><pic:cNvPr id=\"0\" name=\"bild.png\">{cNvPrInhalt}</pic:cNvPr><pic:cNvPicPr/></pic:nvPicPr>" +
          $"<pic:blipFill><a:blip {blipAttribut}/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>" +
          "<pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"952500\" cy=\"952500\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr>" +
          "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>");

    // ---------- W1: HYPERLINK-Zerlegung wie Word ----------

    /// <summary>Komplexes Feld, dessen Anweisung auf mehrere <c>w:instrText</c> zu je <paramref name="stueck"/> Zeichen verteilt ist.</summary>
    private static string GeteiltesFeld(string anweisung, int stueck = 3)
    {
        var runs = new StringBuilder();
        for (var i = 0; i < anweisung.Length; i += stueck)
        {
            var teil = anweisung.Substring(i, Math.Min(stueck, anweisung.Length - i));
            runs.Append($"<w:r><w:instrText xml:space=\"preserve\">{SecurityElement.Escape(teil)}</w:instrText></w:r>");
        }

        return P("<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>" + runs +
                 "<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>" + Run("Ergebnis") +
                 "<w:r><w:fldChar w:fldCharType=\"end\"/></w:r>");
    }

    /// <summary>Feld in der Form <paramref name="form"/>: <c>komplex</c>, <c>geteilt</c> (mehrere <c>w:instrText</c>) oder <c>einfach</c> (<c>w:fldSimple</c>).</summary>
    private static string Feld(string form, string anweisung) => form switch
    {
        "komplex" => Testvorlagen.FeldMitAnweisung(SecurityElement.Escape(anweisung)),
        "geteilt" => GeteiltesFeld(anweisung),
        "einfach" => Testvorlagen.EinfachesFeld(SecurityElement.Escape(anweisung), Run("Verweis")),
        _ => throw new ArgumentOutOfRangeException(nameof(form), form, null),
    };

    private static readonly string[] Feldformen = ["komplex", "geteilt", "einfach"];

    private static TheoryData<string, string> JeFeldform(params string[] anweisungen)
    {
        var daten = new TheoryData<string, string>();
        foreach (var anweisung in anweisungen)
        {
            foreach (var form in Feldformen)
            {
                daten.Add(form, anweisung);
            }
        }

        return daten;
    }

    public static TheoryData<string, string> HyperlinkAnweisungenMitVersteckterAdresse => JeFeldform(
        " HYPERLINK \"https://a\" \\o tip\"\\\\evil\\share\\x.docx\" ",
        " HYPERLINK \"https://a\" \\t x\"\\\\evil\\x\" ",
        " HYPERLINK \\l a\"file:///C:/x\" ",
        " HYPERLINK \"https://a\"\\\\evil\\x ",
        " HYPERLINK \"https://a\" \\O tip\"file:///C:/x\" ",
        " HYPERLINK \\L a\"file:///C:/x\" ");

    [Theory]
    [MemberData(nameof(HyperlinkAnweisungenMitVersteckterAdresse))]
    public async Task HYPERLINK_Feld_mit_Adresse_direkt_nach_einem_Token_wird_abgelehnt(string form, string anweisung)
    {
        var datei = Gueltig().Absaetze(Feld(form, anweisung)).Bytes();

        Assert.Equal([Unzulaessig(HyperlinkArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    public static TheoryData<string, string> HyperlinkAnweisungenWieInWord => JeFeldform(
        " HYPERLINK \\l\"Anker\" ",
        " HYPERLINK \"https://a\" \\o\"Info\" ",
        " HYPERLINK \\L \"Anker\" ",
        " HYPERLINK \"https://a\" \\T \"_blank\" ");

    [Theory]
    [MemberData(nameof(HyperlinkAnweisungenWieInWord))]
    public async Task HYPERLINK_Feld_mit_Schalterargument_ohne_Leerraum_oder_grossem_Schalter_wird_angenommen(string form, string anweisung)
    {
        await AngenommenAsync(Gueltig().Absaetze(Feld(form, anweisung)).Bytes());
    }

    public static TheoryData<string, string> HyperlinkDirektMitAnfuehrungszeichen => JeFeldform(" HYPERLINK\"file:///x\" ");

    [Theory]
    [MemberData(nameof(HyperlinkDirektMitAnfuehrungszeichen))]
    public async Task HYPERLINK_direkt_gefolgt_von_Anfuehrungszeichen_ist_ein_unzulaessiger_Feldname(string form, string anweisung)
    {
        var datei = Gueltig().Absaetze(Feld(form, anweisung)).Bytes();

        Assert.Equal([Unzulaessig(FeldnameArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    // Rev. 6, Hinweis 1 (A22): „\"“ nach dem Feldnamen ist immer ein Befund. Word liest in der ersten Anweisung
    // \o mit dem Argument „a" \t“ und die Adresse file:///C:/x.
    public static TheoryData<string, string> HyperlinkMitMaskiertemAnfuehrungszeichen => JeFeldform(
        """ HYPERLINK \o "a\" \t" file:///C:/x """,
        """ HYPERLINK "https://example.invalid" \o "Er sagte \"Hallo\"" """);

    [Theory]
    [MemberData(nameof(HyperlinkMitMaskiertemAnfuehrungszeichen))]
    public async Task HYPERLINK_Feld_mit_maskiertem_Anfuehrungszeichen_wird_abgelehnt(string form, string anweisung)
    {
        var datei = Gueltig().Absaetze(Feld(form, anweisung)).Bytes();

        Assert.Equal([Unzulaessig(HyperlinkArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    // ---------- W2: href an VML-Elementen ----------

    private static string Vml(string element) => P($"<w:r><w:pict>{element}</w:pict></w:r>");

    public static TheoryData<string> VmlMitUnzulaessigemHref =>
    [
        "<v:shape id=\"S1\" style=\"width:10pt;height:10pt\" href=\"file:///C:/x\"/>",
        "<v:rect id=\"R1\" style=\"width:10pt;height:10pt\" href=\" javascript:x\"/>",
        "<v:oval id=\"O1\" style=\"width:10pt;height:10pt\" href=\"\\\\server\\x\"/>",
        "<v:shape id=\"S2\" style=\"width:10pt;height:10pt\" href=\"../x.docx\"/>",
        "<v:rect id=\"R2\" style=\"width:10pt;height:10pt\" href=\"file://evil/share/x\"/>",
        "<v:shape id=\"S3\" style=\"width:10pt;height:10pt\" href=\"\\\\evil\\share\\x.docx\"/>",
    ];

    [Theory]
    [MemberData(nameof(VmlMitUnzulaessigemHref))]
    public async Task VML_Element_mit_href_auf_unzulaessiges_Ziel_wird_abgelehnt(string element)
    {
        var datei = Gueltig().Absaetze(Vml(element)).Bytes();

        Assert.Equal([Unzulaessig(HyperlinkArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    public static TheoryData<string> VmlMitZulaessigemHref =>
    [
        "<v:shape id=\"S1\" style=\"width:10pt;height:10pt\" href=\"https://example.invalid\"/>",
        "<v:shape id=\"S2\" style=\"width:10pt;height:10pt\" href=\"mailto:x@example.invalid\"/>",
        "<v:shape id=\"S3\" style=\"width:10pt;height:10pt\" href=\"\"/>",
    ];

    [Theory]
    [MemberData(nameof(VmlMitZulaessigemHref))]
    public async Task VML_Element_mit_zulaessigem_oder_leerem_href_wird_angenommen(string element)
    {
        await AngenommenAsync(Gueltig().Absaetze(Vml(element)).Bytes());
    }

    /// <summary>Rev. 7: „fremd“ heißt jetzt ein erlaubter Namespace außer VML (hier <c>a:</c>); ein nicht erlaubter ergäbe die Erweiterungsmeldung.</summary>
    [Fact]
    public async Task Href_ohne_Namespace_an_Element_eines_erlaubten_Nicht_VML_Namespace_wird_angenommen()
    {
        var datei = Gueltig()
            .Teil("word/fremd.xml", "application/xml", XmlKopf + "<a:e xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" href=\"file:///C:/x\"/>")
            .Bytes();

        await AngenommenAsync(datei);
    }

    // ---------- H1: Online-Video ----------

    private const string WebVideo =
        $"<wp15:webVideoPr xmlns:wp15=\"{Wp15Ns}\" embeddedHtml=\"&lt;iframe src=&quot;https://example.invalid/v&quot;&gt;&lt;/iframe&gt;\" h=\"315\" w=\"560\"/>";

    private static DocxBauer MitBildteil(out string rid)
    {
        var bauer = Gueltig();
        rid = bauer.DokumentTeil("media/bild1.png", "image/png", RelImage, Testbilder.Png(128));
        return bauer;
    }

    [Fact]
    public async Task Online_Video_in_a_graphicData_wird_als_externe_Verknuepfung_abgelehnt()
    {
        var bauer = MitBildteil(out var rid);
        bauer.Absaetze(Bild($"r:embed=\"{rid}\"",
            $"<a:extLst><a:ext uri=\"{{C809E66F-F1BF-436E-B5F7-EEA9579F0CBA}}\">{WebVideo}</a:ext></a:extLst>"));

        Assert.Equal([Unzulaessig(ExternArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Online_Video_in_mc_Fallback_wird_als_externe_Verknuepfung_abgelehnt()
    {
        var datei = Gueltig().Absaetze(P(
            "<w:r><mc:AlternateContent><mc:Choice Requires=\"w14\"><w:t>Video</w:t></mc:Choice>" +
            $"<mc:Fallback>{WebVideo}</mc:Fallback></mc:AlternateContent></w:r>")).Bytes();

        Assert.Equal([Unzulaessig(ExternArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Gleiches_Bild_ohne_Online_Video_wird_angenommen()
    {
        var bauer = MitBildteil(out var rid);
        bauer.Absaetze(Bild($"r:embed=\"{rid}\""));

        await AngenommenAsync(bauer.Bytes());
    }

    // ---------- H2: Attribute je Element ----------

    /// <summary><paramref name="anzahl"/> Attribute <c>a{i}=""</c> (eindeutige Namen).</summary>
    private static string Attribute(int anzahl)
    {
        var text = new StringBuilder(anzahl * 10);
        for (var i = 0; i < anzahl; i++)
        {
            text.Append(" a").Append(i).Append("=\"\"");
        }

        return text.ToString();
    }

    /// <summary>
    /// <paramref name="anzahl"/> Namespace-Deklarationen, die erste für das Präfix <c>a</c> des Elements, die übrigen
    /// deklariert und ungenutzt (Rev. 7: ungenutzte Deklarationen sind zulässig, das Element liegt im erlaubten <c>a</c>;
    /// Rev. 8: DrawingML statt <c>w</c>, weil unqualifizierte Attribute an WordprocessingML-Elementen ein Befund sind).
    /// </summary>
    private static string Deklarationen(int anzahl) =>
        string.Concat(Enumerable.Range(0, anzahl).Select(i => i == 0
            ? " xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\""
            : $" xmlns:n{i}=\"urn:coin:n{i}\""));

    /// <summary>Verwaister <c>application/xml</c>-Teil mit einem Element <c>a:e</c>; das Präfix deklariert <see cref="Deklarationen"/>.</summary>
    private static DocxBauer MitVerwaistemElement(string startTagInhalt, string prolog = "") =>
        Gueltig().Teil("word/attribute.xml", "application/xml", XmlKopf + prolog + $"<a:e{startTagInhalt}/>");

    [Fact]
    public async Task Element_mit_genau_1000_Attributen_inklusive_Namespace_Deklarationen_wird_angenommen()
    {
        var coinId = await AngenommenAsync(MitVerwaistemElement(Deklarationen(10) + Attribute(990)).Bytes());

        Assert.DoesNotContain("word/attribute.xml", DocxLeser.Eintraege(await LadeAsync(AktiveDateiUrl(coinId))).Keys);
    }

    [Fact]
    public async Task Element_mit_1001_Attributen_inklusive_Namespace_Deklarationen_wird_als_zu_gross_abgelehnt()
    {
        var datei = MitVerwaistemElement(Deklarationen(10) + Attribute(991)).Bytes();

        Assert.Equal([ZuGrossEntpackt], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Element_mit_1000_Attributen_und_einer_Namespace_Deklaration_wird_als_zu_gross_abgelehnt()
    {
        var datei = MitVerwaistemElement(Deklarationen(1) + Attribute(1_000)).Bytes();

        Assert.Equal([ZuGrossEntpackt], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Element_mit_1001_Attributen_im_Hauptteil_wird_als_zu_gross_abgelehnt()
    {
        var datei = Gueltig().Absaetze($"<x:e xmlns:x=\"urn:coin:test\"{Attribute(1_000)}/>").Bytes();

        Assert.Equal([ZuGrossEntpackt], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Element_mit_1001_Attributen_in_den_Paketbeziehungen_wird_als_zu_gross_abgelehnt()
    {
        var bauer = Gueltig();
        bauer.PaketRelsZusatz = $"<x xmlns=\"urn:coin:test\"{Attribute(1_000)}/>";

        Assert.Equal([ZuGrossEntpackt], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Element_mit_1001_Attributen_in_Content_Types_wird_als_zu_gross_abgelehnt()
    {
        var bauer = Gueltig();
        bauer.ContentTypesZusatz = $"<x xmlns=\"urn:coin:test\"{Attribute(1_000)}/>";

        Assert.Equal([ZuGrossEntpackt], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task DOCTYPE_vor_Element_mit_zu_vielen_Attributen_wird_als_DTD_abgelehnt()
    {
        var datei = MitVerwaistemElement(Deklarationen(1) + Attribute(1_001), "<!DOCTYPE a:e [<!ENTITY x \"y\">]>").Bytes();

        Assert.Equal([Unzulaessig(DtdArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    private static byte[] MitSiebenhunderttausendAttributen()
    {
        var datei = MitVerwaistemElement(Deklarationen(1) + Attribute(700_000)).Bytes();
        Assert.True(datei.Length < FuenfMiB, $"Testdatei zu groß: {datei.Length}");
        return datei;
    }

    [Fact]
    public async Task Element_mit_700000_Attributen_wird_als_zu_gross_abgelehnt()
    {
        Assert.Equal([ZuGrossEntpackt], await AbgelehntOhneSpeichernAsync(MitSiebenhunderttausendAttributen()));
    }

    [Fact]
    public void Analyse_lehnt_700000_Attributen_in_unter_2_Sekunden_ab()
    {
        var analyse = Fixture.Factory.Services.GetRequiredService<IDocxAnalyse>();
        var datei = MitSiebenhunderttausendAttributen();
        analyse.Analysieren(Gueltig().Bytes());

        var uhr = Stopwatch.StartNew();
        var befund = analyse.Analysieren(datei);
        uhr.Stop();

        Assert.Equal([ZuGrossEntpackt], Assert.IsType<DocxBefund.Abgelehnt>(befund).Meldungen);
        Assert.True(uhr.Elapsed < TimeSpan.FromSeconds(2), $"Dauer: {uhr.Elapsed}");
    }

    /// <summary>
    /// Verwaister Teil von rund 9 MiB aus Elementen mit je 1.000 Attributen. Zufällige Werte halten das
    /// Kompressionsverhältnis unter 100 : 1 und die Datei unter 5 MiB. Rev. 8: Elemente in DrawingML (<c>a</c>), weil
    /// unqualifizierte Attribute an WordprocessingML-Elementen ein Befund sind (AK-10 Punkt 8).
    /// </summary>
    private static byte[] NeunMiBMitJe1000Attributen()
    {
        var zufall = new Random(4711);
        var xml = new StringBuilder(9_200_000).Append(XmlKopf)
            .Append("<a:r xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">");
        while (xml.Length < 9_000_000)
        {
            xml.Append("<a:e");
            for (var i = 0; i < 1_000; i++)
            {
                xml.Append(" a").Append(i).Append("=\"").Append(zufall.Next().ToString("x8")).Append('"');
            }

            xml.Append("/>");
        }

        var datei = Gueltig().Teil("word/viele.xml", "application/xml", xml.Append("</a:r>").ToString()).Bytes();
        Assert.True(datei.Length < FuenfMiB, $"Testdatei zu groß: {datei.Length}");
        return datei;
    }

    [Fact]
    public async Task Verwaister_Teil_von_9_MiB_mit_je_1000_Attributen_wird_in_unter_15_Sekunden_angenommen()
    {
        var datei = NeunMiBMitJe1000Attributen();
        var coinId = await CoinAsync();

        var uhr = Stopwatch.StartNew();
        using var antwort = await PostVersionAsync(coinId, datei);
        uhr.Stop();

        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"{(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        Assert.True(uhr.Elapsed < TimeSpan.FromSeconds(15), $"Dauer: {uhr.Elapsed}");
    }

    // ---------- H3: DOCTYPE in jeder Kodierung des XmlReader ----------

    private const string KopfMitDoctypeOhneEncoding =
        "<?xml version=\"1.0\" standalone=\"yes\"?><!DOCTYPE w:hdr [<!ENTITY x \"y\">]>" +
        "<w:hdr " + Namensraeume + "><w:p><w:r><w:t>Kopf &x;</w:t></w:r></w:p></w:hdr>";

    private const string KopfMitDoctypeUndEncoding =
        "<?xml version=\"1.0\" encoding=\"UTF-16\" standalone=\"yes\"?><!DOCTYPE w:hdr [<!ENTITY x \"y\">]>" +
        "<w:hdr " + Namensraeume + "><w:p><w:r><w:t>Kopf &x;</w:t></w:r></w:p></w:hdr>";

    private static byte[] Kodiert(string kodierung, string xml) => kodierung switch
    {
        "UTF-16LE ohne BOM" => new UnicodeEncoding(bigEndian: false, byteOrderMark: false).GetBytes(xml),
        "UTF-16BE ohne BOM" => new UnicodeEncoding(bigEndian: true, byteOrderMark: false).GetBytes(xml),
        "UTF-16LE mit BOM" => [.. new UnicodeEncoding(false, true).GetPreamble(), .. new UnicodeEncoding(false, false).GetBytes(xml)],
        "UTF-8 mit BOM" => [.. new UTF8Encoding(true).GetPreamble(), .. new UTF8Encoding(false).GetBytes(xml)],
        _ => throw new ArgumentOutOfRangeException(nameof(kodierung), kodierung, null),
    };

    private static byte[] MitKopfzeile(byte[] inhalt) => Gueltig().KopfzeileAls("header1.xml", "default", [], inhalt).Bytes();

    [Theory]
    [InlineData("UTF-16LE ohne BOM")]
    [InlineData("UTF-16BE ohne BOM")]
    [InlineData("UTF-16LE mit BOM")]
    [InlineData("UTF-8 mit BOM")]
    public async Task Kopfzeile_mit_DOCTYPE_in_anderer_Kodierung_wird_als_DTD_abgelehnt(string kodierung)
    {
        var datei = MitKopfzeile(Kodiert(kodierung, KopfMitDoctypeOhneEncoding));

        Assert.Equal([Unzulaessig(DtdArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Theory]
    [InlineData("UTF-16LE ohne BOM")]
    [InlineData("UTF-16BE ohne BOM")]
    public async Task Kopfzeile_mit_DOCTYPE_in_UTF16_ohne_BOM_mit_encoding_Angabe_wird_als_DTD_abgelehnt(string kodierung)
    {
        var datei = MitKopfzeile(Kodiert(kodierung, KopfMitDoctypeUndEncoding));

        Assert.Equal([Unzulaessig(DtdArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Kopfzeile_in_UTF16_ohne_BOM_ohne_DOCTYPE_wird_angenommen()
    {
        var xml = "<?xml version=\"1.0\" encoding=\"UTF-16\" standalone=\"yes\"?>" +
                  $"<w:hdr {Namensraeume}><w:p><w:r><w:t>Kopf</w:t></w:r></w:p></w:hdr>";

        await AngenommenAsync(MitKopfzeile(Kodiert("UTF-16LE ohne BOM", xml)));
    }

    // ---------- H4: eckige Klammern in der Normalform ----------

    [Theory]
    [InlineData("media/a%5B1%5D.png")]
    [InlineData("media/a[1].png")]
    public async Task Bild_mit_eckigen_Klammern_im_Namen_wird_angenommen_und_liegt_im_Download_unter_dem_Namen_mit_Klammern(string ziel)
    {
        var bild = Testbilder.Png(300);
        var bauer = Gueltig();
        bauer.Teil("word/media/a[1].png", null, bild);
        var rid = bauer.DokumentBeziehung(RelImage, ziel);
        bauer.Absaetze(Bild($"r:embed=\"{rid}\""));

        var coinId = await AngenommenAsync(bauer.Bytes());
        var eintraege = DocxLeser.Eintraege(await LadeAsync(AktiveDateiUrl(coinId)));

        Assert.True(eintraege.TryGetValue("word/media/a[1].png", out var geladen), $"Einträge: {string.Join(", ", eintraege.Keys)}");
        Assert.Equal(bild, geladen);
    }

    [Fact]
    public async Task Eckige_Klammern_und_kodierte_eckige_Klammern_im_Namen_sind_doppelte_Eintraege()
    {
        var bauer = Gueltig();
        bauer.Teil("word/media/a[1].png", null, Testbilder.Png(64));
        var rid = bauer.DokumentBeziehung(RelImage, "media/a[1].png");
        bauer.Absaetze(Bild($"r:embed=\"{rid}\""));
        bauer.RohEintrag("word/media/a%5B1%5D.png", Testbilder.Png(64));

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    // ---------- H5: interne Ziele müssen existieren ----------

    public static TheoryData<string> FehlendeBildziele =>
    [
        "media/fehlt.png",
        "C%3A/x",
        "media/b.png%00",
        "media/a%CC%88.png",
        "media/a\u0308.png",
    ];

    [Theory]
    [MemberData(nameof(FehlendeBildziele))]
    public async Task Internes_Bildziel_ohne_passenden_Teil_ist_kein_Word_Dokument(string ziel)
    {
        var bauer = Gueltig();
        bauer.Teil("word/media/b.png", null, Testbilder.Png(64));
        bauer.Teil("word/media/\u00E4.png", null, Testbilder.Png(65));
        var rid = bauer.DokumentBeziehung(RelImage, ziel);
        bauer.Absaetze(Bild($"r:embed=\"{rid}\""));

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Theory]
    [InlineData("../[Content_Types].xml")]
    [InlineData("_rels/document.xml.rels")]
    public async Task Internes_Ziel_auf_Content_Types_oder_Beziehungsteil_ist_kein_Word_Dokument(string ziel)
    {
        var bauer = Gueltig();
        bauer.DokumentBeziehung(RelImage, ziel);

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Internes_Ziel_auf_einen_Verzeichniseintrag_ist_kein_Word_Dokument()
    {
        var bauer = Gueltig().RohEintrag("word/ordner/", []);
        bauer.DokumentBeziehung(RelImage, "ordner");

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Verzeichniseintrag_ohne_Beziehung_wird_angenommen()
    {
        await AngenommenAsync(Gueltig().RohEintrag("word/ordner/", []).Bytes());
    }

    [Fact]
    public async Task Paketbeziehung_auf_fehlenden_Teil_ist_kein_Word_Dokument()
    {
        var bauer = Gueltig();
        bauer.Beziehung(string.Empty, RelCoreProperties, "docProps/fehlt.xml");

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Nicht_referenzierte_interne_Bildbeziehung_auf_fehlenden_Teil_ist_kein_Word_Dokument()
    {
        var bauer = Gueltig();
        bauer.DokumentBeziehung(RelImage, "media/fehlt.png");

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Nicht_referenzierte_interne_Bildbeziehung_auf_vorhandenen_Teil_wird_angenommen()
    {
        var bauer = Gueltig();
        bauer.DokumentTeil("media/da.png", "image/png", RelImage, Testbilder.Png(64));

        await AngenommenAsync(bauer.Bytes());
    }

    [Theory]
    [InlineData("media/fehlt.png", false)]
    [InlineData("media/da.png", true)]
    public async Task Beziehung_eines_verwaisten_Teils_muss_auf_einen_vorhandenen_Teil_zeigen(string ziel, bool angenommen)
    {
        var bauer = Gueltig();
        bauer.Teil("word/media/da.png", null, Testbilder.Png(64));
        bauer.Teil("word/waise.xml", "application/xml", XmlKopf + "<w:waise xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"/>");
        bauer.Beziehung("word/waise.xml", RelImage, ziel);

        await PruefeErgebnisAsync(bauer.Bytes(), angenommen);
    }

    [Theory]
    [InlineData("media/fehlt.png", false)]
    [InlineData("media/da.png", true)]
    public async Task Beziehung_ohne_Quellteil_muss_auf_einen_vorhandenen_Teil_zeigen(string ziel, bool angenommen)
    {
        var bauer = Gueltig();
        bauer.Teil("word/media/da.png", null, Testbilder.Png(64));
        bauer.Beziehung("word/gibtsnicht.xml", RelImage, ziel);

        await PruefeErgebnisAsync(bauer.Bytes(), angenommen);
    }

    private async Task PruefeErgebnisAsync(byte[] datei, bool angenommen)
    {
        if (angenommen)
        {
            await AngenommenAsync(datei);
        }
        else
        {
            Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
        }
    }

    [Fact]
    public async Task Externe_Hyperlink_Beziehung_ohne_Teil_wird_angenommen()
    {
        var bauer = Gueltig();
        bauer.DokumentBeziehung(RelHyperlink, "https://example.invalid/fehlt", istExtern: true);

        await AngenommenAsync(bauer.Bytes());
    }

    // ---------- AK-16 (i): Eintragsnamen in Normalform ----------

    public static TheoryData<string, string, string> Umbenennungen => new()
    {
        { "word/media/\u00E4.png", "media/%C3%A4.png", "word/media/%C3%A4.png" },
        { "word/media/%c3%a4.png", "media/%C3%A4.png", "word/media/%C3%A4.png" },
        { "word/media/a%5B1%5D.png", "media/a%5B1%5D.png", "word/media/a[1].png" },
    };

    private async Task<Dictionary<string, byte[]>> DownloadMitBildAsync(string eintrag, string ziel, byte[] bild, string? contentType)
    {
        var bauer = Gueltig();
        bauer.Teil(eintrag, contentType, bild);
        var rid = bauer.DokumentBeziehung(RelImage, ziel);
        bauer.Absaetze(Bild($"r:embed=\"{rid}\""));

        var coinId = await AngenommenAsync(bauer.Bytes());
        return DocxLeser.Eintraege(await LadeAsync(AktiveDateiUrl(coinId)));
    }

    [Theory]
    [MemberData(nameof(Umbenennungen))]
    public async Task Bereinigung_benennt_Bild_in_die_Normalform_um_und_laesst_die_Bytes_gleich(string eintrag, string ziel, string erwartet)
    {
        var bild = Testbilder.Png(333);

        var eintraege = await DownloadMitBildAsync(eintrag, ziel, bild, contentType: null);

        Assert.True(eintraege.TryGetValue(erwartet, out var geladen), $"Einträge: {string.Join(", ", eintraege.Keys)}");
        Assert.Equal(bild, geladen);
        Assert.DoesNotContain(eintrag, eintraege.Keys);
    }

    [Theory]
    [MemberData(nameof(Umbenennungen))]
    public async Task Bereinigung_zieht_den_Override_auf_den_neuen_Namen_mit(string eintrag, string ziel, string erwartet)
    {
        var eintraege = await DownloadMitBildAsync(eintrag, ziel, Testbilder.Png(334), contentType: "image/png");

        XNamespace ct = "http://schemas.openxmlformats.org/package/2006/content-types";
        var teilnamen = XDocument.Load(new MemoryStream(eintraege["[Content_Types].xml"]))
            .Descendants(ct + "Override")
            .Select(o => (string?)o.Attribute("PartName") ?? string.Empty)
            .ToList();
        Assert.DoesNotContain("/" + eintrag, teilnamen);
        Assert.All(
            teilnamen.Where(n => n.Contains("/word/media/", StringComparison.OrdinalIgnoreCase)),
            n => Assert.Equal("/" + erwartet, n));
    }
}
