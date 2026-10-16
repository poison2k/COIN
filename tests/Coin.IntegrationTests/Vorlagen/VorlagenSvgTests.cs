using System.Net;
using System.Text;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 7, Entscheidung F15 (AK-10, ADR-0026 Punkt 3/4/8): Vorlagen mit SVG-Grafiken
/// werden abgelehnt, auch mit PNG-Rückfall. Befund bei einem Teil mit Content-Type <c>image/svg+xml</c> (Override
/// oder Default, auch verwaist) oder bei Verwendung von <c>svg</c>, <c>xlink</c> oder <c>asvg</c> an Element,
/// Attribut oder in einem <c>mc:</c>-Attribut; reine Deklaration ist kein Befund. Meldung „Die Vorlage enthält
/// SVG-Grafiken. …“ nach Makros, vor der Erweiterungsmeldung; beide können zusammen erscheinen (SVG zuerst).
/// </summary>
public class VorlagenSvgTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string SvgNs = "http://www.w3.org/2000/svg";
    private const string XlinkNs = "http://www.w3.org/1999/xlink";
    private const string AsvgNs = "http://schemas.microsoft.com/office/drawing/2016/SVG/main";
    private const string S = "http://purl.oclc.org/ooxml/wordprocessingml/main";

    private static string XmlKopf => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";

    /// <summary>SVG-Teil wie Word ihn schreibt: Wurzel <c>svg:svg</c> mit <c>xmlns:xlink</c> und einem <c>xlink:href</c>.</summary>
    private static string SvgXml(string prolog = "") =>
        XmlKopf + prolog +
        $"<svg:svg xmlns:svg=\"{SvgNs}\" xmlns:xlink=\"{XlinkNs}\" width=\"10\" height=\"10\" viewBox=\"0 0 10 10\">" +
        "<svg:defs><svg:rect id=\"r\" width=\"10\" height=\"10\" fill=\"#1F3864\"/></svg:defs><svg:use xlink:href=\"#r\"/></svg:svg>";

    private async Task<string[]> AbgelehntOhneSpeichernAsync(byte[] datei)
    {
        var coinId = await CoinAsync();
        var vorher = await SpeicherZustandAsync(coinId);

        var meldungen = await AbgelehntAsync(coinId, datei);

        Assert.Equal(vorher, await SpeicherZustandAsync(coinId));
        return meldungen;
    }

    /// <summary>Bild in der Word-Form: <c>a:blip r:embed</c> auf PNG, optional <c>asvg:svgBlip r:embed</c> in <c>a:extLst</c>.</summary>
    private static string Bild(string ridPng, string? ridSvg) =>
        P("<w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"952500\" cy=\"952500\"/>" +
          "<wp:docPr id=\"41\" name=\"Grafik 41\"/><a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\">" +
          "<pic:pic><pic:nvPicPr><pic:cNvPr id=\"41\" name=\"Grafik 41\"/><pic:cNvPicPr/></pic:nvPicPr>" +
          $"<pic:blipFill><a:blip r:embed=\"{ridPng}\">" +
          (ridSvg is null ? string.Empty
              : $"<a:extLst><a:ext uri=\"{{96DAC541-7B7A-43D3-8B79-37D633B846F1}}\"><asvg:svgBlip xmlns:asvg=\"{AsvgNs}\" r:embed=\"{ridSvg}\"/></a:ext></a:extLst>") +
          "</a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"952500\" cy=\"952500\"/></a:xfrm>" +
          "<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>");

    /// <summary>Gültige Datei mit SVG-Bild (PNG-Rückfall) im Hauptteil; weitere Absätze optional.</summary>
    private static DocxBauer MitSvgBild(params string[] weitere)
    {
        var bauer = Gueltig();
        var ridPng = bauer.DokumentTeil("media/image1.png", "image/png", RelImage, Testbilder.Png(300));
        var ridSvg = bauer.DokumentTeil("media/image2.svg", "image/svg+xml", RelImage, SvgXml());
        return bauer.Absaetze([Bild(ridPng, ridSvg), .. weitere]);
    }

    // ---------- Theory F15 ----------

    public static TheoryData<string> SvgFaelle =>
    [
        "SVG-Bild mit PNG-Rückfall im Hauptteil",
        "SVG-Bild mit PNG-Rückfall in der Kopfzeile",
        "SVG-Bild mit PNG-Rückfall im Textfeld",
        "verwaister SVG-Teil",
        "asvg:svgBlip auf PNG",
        "SVG-Teil per Default Extension svg",
        "svg:svg in verwaistem application/xml-Teil",
        "asvg in mc:Ignorable",
    ];

    private static byte[] SvgFall(string fall)
    {
        switch (fall)
        {
            case "SVG-Bild mit PNG-Rückfall im Hauptteil":
                return MitSvgBild().Bytes();

            case "SVG-Bild mit PNG-Rückfall in der Kopfzeile":
            {
                var bauer = Gueltig();
                bauer.Teil("word/media/image1.png", "image/png", Testbilder.Png(300));
                bauer.Teil("word/media/image2.svg", "image/svg+xml", SvgXml());
                var ridPng = bauer.Beziehung("word/header1.xml", RelImage, "media/image1.png");
                var ridSvg = bauer.Beziehung("word/header1.xml", RelImage, "media/image2.svg");
                return bauer.KopfzeileAls("header1.xml", "default", [Bild(ridPng, ridSvg)]).Bytes();
            }

            case "SVG-Bild mit PNG-Rückfall im Textfeld":
            {
                var bauer = Gueltig();
                var ridPng = bauer.DokumentTeil("media/image1.png", "image/png", RelImage, Testbilder.Png(300));
                var ridSvg = bauer.DokumentTeil("media/image2.svg", "image/svg+xml", RelImage, SvgXml());
                return bauer.Absaetze(Testvorlagen.TextfeldAlternateContent(Bild(ridPng, ridSvg))).Bytes();
            }

            case "verwaister SVG-Teil":
                return Gueltig().Teil("word/media/image9.svg", "image/svg+xml", SvgXml()).Bytes();

            case "asvg:svgBlip auf PNG":
            {
                var bauer = Gueltig();
                var ridPng = bauer.DokumentTeil("media/image1.png", "image/png", RelImage, Testbilder.Png(300));
                return bauer.Absaetze(Bild(ridPng, ridPng)).Bytes();
            }

            case "SVG-Teil per Default Extension svg":
            {
                var bauer = Gueltig();
                bauer.ContentTypesZusatz = "<Default Extension=\"svg\" ContentType=\"image/svg+xml\"/>";
                var ridPng = bauer.DokumentTeil("media/image1.png", "image/png", RelImage, Testbilder.Png(300));
                bauer.Teil("word/media/image2.svg", null, SvgXml());
                var ridSvg = bauer.DokumentBeziehung(RelImage, "media/image2.svg");
                return bauer.Absaetze(Bild(ridPng, ridSvg)).Bytes();
            }

            case "svg:svg in verwaistem application/xml-Teil":
                return Gueltig().Teil("word/grafik.xml", "application/xml", SvgXml()).Bytes();

            case "asvg in mc:Ignorable":
                return new DocxBauer
                {
                    DokumentInhalt = XmlKopf + $"<w:document {Namensraeume.Replace("mc:Ignorable=\"w14\"", $"xmlns:asvg=\"{AsvgNs}\" mc:Ignorable=\"w14 asvg\"", StringComparison.Ordinal)}>" +
                        $"<w:body>{string.Concat(PflichtAbsaetze)}<w:sectPr/></w:body></w:document>",
                }.Bytes();

            default:
                throw new ArgumentOutOfRangeException(nameof(fall), fall, null);
        }
    }

    [Theory]
    [MemberData(nameof(SvgFaelle))]
    public async Task SVG_Grafik_ergibt_die_SVG_Meldung(string fall)
    {
        Assert.Equal([SvgGrafiken], await AbgelehntOhneSpeichernAsync(SvgFall(fall)));
    }

    [Fact]
    public void Gegenprobe_SVG_Teil_im_Default_Fall_hat_keinen_Override()
    {
        var typen = Encoding.UTF8.GetString(DocxLeser.Eintraege(SvgFall("SVG-Teil per Default Extension svg"))["[Content_Types].xml"]);

        Assert.Contains("<Default Extension=\"svg\" ContentType=\"image/svg+xml\"/>", typen, StringComparison.Ordinal);
        Assert.DoesNotContain("/word/media/image2.svg", typen, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Gleiches_Bild_ohne_SVG_wird_angenommen()
    {
        var bauer = Gueltig();
        var ridPng = bauer.DokumentTeil("media/image1.png", "image/png", RelImage, Testbilder.Png(300));
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, bauer.Absaetze(Bild(ridPng, null)).Bytes());

        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"{(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
    }

    [Fact]
    public async Task SVG_Namespaces_nur_deklariert_werden_angenommen()
    {
        var datei = new DocxBauer
        {
            DokumentInhalt = XmlKopf + $"<w:document {Namensraeume} xmlns:asvg=\"{AsvgNs}\" xmlns:svg=\"{SvgNs}\" xmlns:xlink=\"{XlinkNs}\">" +
                $"<w:body>{string.Concat(PflichtAbsaetze)}<w:sectPr/></w:body></w:document>",
        }.Bytes();
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, datei);

        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"{(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
    }

    // ---------- Reihenfolge und Zusammentreffen ----------

    [Fact]
    public async Task SVG_Bild_und_fremder_Namespace_ergeben_beide_Meldungen_SVG_zuerst()
    {
        var datei = MitSvgBild(P("<w:r><x:zusatz xmlns:x=\"urn:example:fremd\"/></w:r>")).Bytes();

        Assert.Equal([SvgGrafiken, Erweiterungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task SVG_Bild_und_Strict_Element_ergeben_nur_kein_Word_Dokument()
    {
        var datei = MitSvgBild(P($"<w:r><s:t xmlns:s=\"{S}\">Strict</s:t></w:r>")).Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Docm_mit_SVG_Bild_ergibt_nur_Makros()
    {
        var bauer = MitSvgBild();
        bauer.HauptTyp = MakroHauptteilTyp;
        bauer.DokumentTeil("vbaProject.bin", "application/vnd.ms-office.vbaProject", RelVbaProject, [0xCC, 0x61, 0xFF, 0xFF, 0x00]);

        Assert.Equal([Makros], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task SVG_Teil_mit_DOCTYPE_ergibt_die_DTD_Meldung()
    {
        var bauer = Gueltig();
        var ridPng = bauer.DokumentTeil("media/image1.png", "image/png", RelImage, Testbilder.Png(300));
        var ridSvg = bauer.DokumentTeil("media/image2.svg", "image/svg+xml", RelImage,
            SvgXml("<!DOCTYPE svg:svg [<!ENTITY x \"y\">]>"));
        bauer.Absaetze(Bild(ridPng, ridSvg));

        Assert.Equal([Unzulaessig("Dokumenttypdefinitionen (DTD)")], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task SVG_Bild_und_DDE_Feld_ergeben_nur_die_SVG_Meldung()
    {
        var dde = P("<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r><w:r><w:instrText xml:space=\"preserve\"> DDE excel x </w:instrText></w:r>" +
                    "<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>" + Run("Ergebnis") + "<w:r><w:fldChar w:fldCharType=\"end\"/></w:r>");

        Assert.Equal([SvgGrafiken], await AbgelehntOhneSpeichernAsync(MitSvgBild(dde).Bytes()));
    }
}
