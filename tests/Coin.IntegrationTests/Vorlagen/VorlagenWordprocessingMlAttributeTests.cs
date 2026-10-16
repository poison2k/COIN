using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using Coin.Domain.Vorlagen;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.Extensions.DependencyInjection;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 8, AK-10 „Namespace-Positivliste“ Punkt 8 (QA-Review 6, Hinweis 2, Annahme A32):
/// An Elementen der zehn WordprocessingML-Namespaces (<c>w</c>, <c>w14</c>, <c>w15</c>, <c>w16</c>, <c>w16se</c>,
/// <c>w16cid</c>, <c>w16cex</c>, <c>w16sdtdh</c>, <c>w16sdtfl</c>, <c>w16du</c>) ist jedes Attribut ohne Namespace ein
/// Befund → genau die Erweiterungsmeldung (Probe <c>&lt;w:fldSimple instr="DDEAUTO …"&gt;</c> wurde angenommen).
/// Nicht betroffen sind Elemente aller anderen Namespaces (VML, <c>w10</c>, DrawingML, <c>mc</c>, Paket und
/// Eigenschaften). Reihenfolge wie die Erweiterungsmeldung (AK-10 Punkt 5); jede Ablehnung speichert nichts.
/// </summary>
public class VorlagenWordprocessingMlAttributeTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string W15 = "http://schemas.microsoft.com/office/word/2012/wordml";
    private const string W16Cid = "http://schemas.microsoft.com/office/word/2016/wordml/cid";
    private const string W10 = "urn:schemas-microsoft-com:office:word";
    private const string S = "http://purl.oclc.org/ooxml/wordprocessingml/main";

    private const string FeldArt = "Felder mit externen Verknüpfungen oder DDE";

    private static string XmlKopf => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";

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

    /// <summary>Hauptteil mit den Pflichtplatzhaltern und <paramref name="bloecke"/>; <paramref name="wurzelZusatz"/> steht im Start-Tag von <c>w:document</c>.</summary>
    private static DocxBauer Dokument(string wurzelZusatz, params string[] bloecke) => new()
    {
        DokumentInhalt = XmlKopf + $"<w:document {Namensraeume} {wurzelZusatz}><w:body>{string.Concat(PflichtAbsaetze)}{string.Concat(bloecke)}<w:sectPr/></w:body></w:document>",
    };

    private static string Sdt(string sdtPr) => $"<w:sdt><w:sdtPr><w:id w:val=\"13\"/>{sdtPr}</w:sdtPr><w:sdtContent>{Text("Inhalt")}</w:sdtContent></w:sdt>";

    // ---------- Befunde → Erweiterungsmeldung ----------

    public static TheoryData<string> Befunde =>
    [
        "w:fldSimple instr DDEAUTO ohne w:instr",
        "w:fldSimple instr DDEAUTO zusätzlich zu w:instr PAGE",
        "w:fldChar fldCharType ohne w:fldCharType",
        "w:p foo",
        "w:r foo mit xml:space am w:t",
        "foo am Wurzelelement w:document",
        "w14:checkbox val in w:sdtPr",
        "w15:appearance val",
        "w16cid:commentsIds foo in verwaistem application/xml-Teil",
        "w:Override PartName ContentType in [Content_Types].xml",
    ];

    public static byte[] MitBefund(string fall)
    {
        switch (fall)
        {
            case "w:fldSimple instr DDEAUTO ohne w:instr":
                return Gueltig().Absaetze(P($"<w:fldSimple instr=\"DDEAUTO x\">{Run("Ergebnis")}</w:fldSimple>")).Bytes();
            case "w:fldSimple instr DDEAUTO zusätzlich zu w:instr PAGE":
                return Gueltig().Absaetze(P($"<w:fldSimple w:instr=\"PAGE\" instr=\"DDEAUTO x\">{Run("1")}</w:fldSimple>")).Bytes();
            case "w:fldChar fldCharType ohne w:fldCharType":
                return Gueltig().Absaetze(P("<w:r><w:fldChar fldCharType=\"begin\"/></w:r>", Run("Text"))).Bytes();
            case "w:p foo":
                return Gueltig().Absaetze($"<w:p foo=\"1\">{Run("Text")}</w:p>").Bytes();
            case "w:r foo mit xml:space am w:t":
                return Gueltig().Absaetze(P("<w:r foo=\"1\"><w:t xml:space=\"preserve\">Text</w:t></w:r>")).Bytes();
            case "foo am Wurzelelement w:document":
                return Dokument("foo=\"1\"").Bytes();
            case "w14:checkbox val in w:sdtPr":
                return Gueltig().Absaetze(Sdt("<w14:checkbox val=\"1\"/>")).Bytes();
            case "w15:appearance val":
                return Dokument($"xmlns:w15=\"{W15}\"", Sdt("<w15:appearance val=\"hidden\"/>")).Bytes();
            case "w16cid:commentsIds foo in verwaistem application/xml-Teil":
                return Gueltig().Teil("word/waise.xml", "application/xml", XmlKopf + $"<w16cid:commentsIds xmlns:w16cid=\"{W16Cid}\" foo=\"1\"/>").Bytes();
            case "w:Override PartName ContentType in [Content_Types].xml":
            {
                var bauer = Gueltig();
                bauer.ContentTypesZusatz = $"<w:Override xmlns:w=\"{DocxLeser.W.NamespaceName}\" PartName=\"/word/document.xml\" ContentType=\"{HauptteilTyp}\"/>";
                return bauer.Bytes();
            }

            default:
                throw new ArgumentOutOfRangeException(nameof(fall), fall, null);
        }
    }

    [Theory]
    [MemberData(nameof(Befunde))]
    public async Task Unqualifiziertes_Attribut_an_WordprocessingML_Element_ergibt_die_Erweiterungsmeldung(string fall)
    {
        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(MitBefund(fall)));
    }

    [Theory]
    [MemberData(nameof(Befunde))]
    public void Gegenprobe_Testdatei_enthaelt_ein_unqualifiziertes_Attribut_an_einem_WordprocessingML_Element(string fall)
    {
        Assert.NotEmpty(DocxLeser.UnqualifizierteWordprocessingMlAttribute(MitBefund(fall)));
    }

    [Fact]
    public async Task Unqualifiziertes_Attribut_in_der_Kopfzeile_ergibt_die_Erweiterungsmeldung()
    {
        var datei = Gueltig().Kopfzeile("default", $"<w:p foo=\"1\">{Run("Kopf")}</w:p>").Bytes();

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Unqualifiziertes_Attribut_in_den_Einstellungen_ergibt_die_Erweiterungsmeldung()
    {
        var datei = Gueltig().Einstellungen("<w:zoom w:percent=\"100\" percent=\"500\"/>").Bytes();

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    // ---------- Kein Befund aus dieser Regel ----------

    public static TheoryData<string> KeineBefunde =>
    [
        "w10:wrap type",
        "wp:anchor distT und a:off x y",
        "v:shape style",
        "o:shapedefaults spidmax in settings",
        "mc:Choice Requires",
        "Relationship Id Type Target und Override/Default im Content-Types-Namespace",
        "property fmtid pid name in docProps/custom.xml",
        "xml:space und xml:lang an w:t",
    ];

    private static byte[] OhneBefund(string fall) => fall switch
    {
        "w10:wrap type" => Dokument($"xmlns:w10=\"{W10}\"",
            P("<w:r><w:pict><v:shape id=\"Form1\" style=\"width:20pt;height:20pt\"><w10:wrap type=\"square\"/></v:shape></w:pict></w:r>")).Bytes(),
        "wp:anchor distT und a:off x y" => Gueltig().Absaetze(P(
            "<w:r><w:drawing><wp:anchor distT=\"0\" distB=\"0\" distL=\"114300\" distR=\"114300\" simplePos=\"0\" relativeHeight=\"251659264\" behindDoc=\"0\" locked=\"0\" layoutInCell=\"1\" allowOverlap=\"1\">" +
            "<wp:simplePos x=\"0\" y=\"0\"/><wp:positionH relativeFrom=\"column\"><wp:posOffset>0</wp:posOffset></wp:positionH>" +
            "<wp:positionV relativeFrom=\"paragraph\"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx=\"952500\" cy=\"952500\"/>" +
            "<wp:effectExtent l=\"0\" t=\"0\" r=\"0\" b=\"0\"/><wp:wrapNone/><wp:docPr id=\"51\" name=\"Form 51\"/>" +
            "<a:graphic><a:graphicData uri=\"http://schemas.microsoft.com/office/word/2010/wordprocessingShape\"><wps:wsp><wps:cNvSpPr/>" +
            "<wps:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"952500\" cy=\"952500\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></wps:spPr>" +
            "<wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>")).Bytes(),
        "v:shape style" => Gueltig().Absaetze(Testvorlagen.TextfeldVml(Text("Textfeld"))).Bytes(),
        "o:shapedefaults spidmax in settings" => Gueltig().Einstellungen(
            "<w:shapeDefaults><o:shapedefaults v:ext=\"edit\" spidmax=\"1026\"/><o:shapelayout v:ext=\"edit\"><o:idmap v:ext=\"edit\" data=\"1\"/></o:shapelayout></w:shapeDefaults>").Bytes(),
        "mc:Choice Requires" => Gueltig().Absaetze(Testvorlagen.TextfeldAlternateContent(Text("Textfeld"))).Bytes(),
        "Relationship Id Type Target und Override/Default im Content-Types-Namespace" => Testvorlagen.MitBild().Bytes(),
        "property fmtid pid name in docProps/custom.xml" => Gueltig().BenutzerdefinierteEigenschaft("Abteilung", "Beispiel").Bytes(),
        "xml:space und xml:lang an w:t" => Gueltig().Absaetze(P("<w:r><w:t xml:space=\"preserve\" xml:lang=\"de-DE\">Text</w:t></w:r>")).Bytes(),
        _ => throw new ArgumentOutOfRangeException(nameof(fall), fall, null),
    };

    [Theory]
    [MemberData(nameof(KeineBefunde))]
    public async Task Unqualifizierte_Attribute_ausserhalb_der_WordprocessingML_Namespaces_werden_angenommen(string fall)
    {
        await AngenommenAsync(OhneBefund(fall));
    }

    [Theory]
    [MemberData(nameof(KeineBefunde))]
    public void Gegenprobe_Testdatei_hat_kein_unqualifiziertes_Attribut_an_WordprocessingML_Elementen(string fall)
    {
        Assert.Empty(DocxLeser.UnqualifizierteWordprocessingMlAttribute(OhneBefund(fall)));
    }

    [Fact]
    public async Task Unqualifiziertes_href_an_Element_in_DrawingML_bleibt_ohne_Befund_aus_dieser_Regel()
    {
        // Testplan W2 (Rev. 8): „fremd“ heißt erlaubter Namespace außer VML und außer WordprocessingML, z. B. a:.
        var datei = Gueltig().Absaetze(P("<w:r><a:zusatz href=\"file:///C:/x\"/></w:r>")).Bytes();

        await AngenommenAsync(datei);
    }

    [Fact]
    public async Task Unqualifiziertes_href_an_w_Element_ergibt_die_Erweiterungsmeldung()
    {
        var datei = Gueltig().Absaetze($"<w:p href=\"https://beispiel.invalid\">{Run("Text")}</w:p>").Bytes();

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    // ---------- Reihenfolge ----------

    private const string UnqualifizierterAbsatz = "<w:p foo=\"1\"><w:r><w:t>Text</w:t></w:r></w:p>";

    [Fact]
    public async Task Unqualifiziertes_Attribut_und_Strict_Element_ergeben_nur_kein_Word_Dokument()
    {
        var datei = Dokument($"xmlns:s=\"{S}\"", UnqualifizierterAbsatz, P("<w:r><s:t>Strict</s:t></w:r>")).Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Unqualifiziertes_Attribut_und_SVG_Bild_ergeben_SVG_Meldung_und_Erweiterungsmeldung()
    {
        var bauer = Gueltig();
        var ridPng = bauer.DokumentTeil("media/image1.png", "image/png", RelImage, Testbilder.Png(300));
        var ridSvg = bauer.DokumentTeil("media/image2.svg", "image/svg+xml", RelImage,
            XmlKopf + "<svg:svg xmlns:svg=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"><svg:rect width=\"10\" height=\"10\"/></svg:svg>");
        bauer.Absaetze(
            P("<w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"952500\" cy=\"952500\"/>" +
              "<wp:docPr id=\"41\" name=\"Grafik 41\"/><a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\">" +
              "<pic:pic><pic:nvPicPr><pic:cNvPr id=\"41\" name=\"Grafik 41\"/><pic:cNvPicPr/></pic:nvPicPr>" +
              $"<pic:blipFill><a:blip r:embed=\"{ridPng}\"><a:extLst><a:ext uri=\"{{96DAC541-7B7A-43D3-8B79-37D633B846F1}}\">" +
              $"<asvg:svgBlip xmlns:asvg=\"http://schemas.microsoft.com/office/drawing/2016/SVG/main\" r:embed=\"{ridSvg}\"/></a:ext></a:extLst></a:blip>" +
              "<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"),
            UnqualifizierterAbsatz);

        Assert.Equal([SvgGrafiken, Erweiterungen], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Unqualifiziertes_Attribut_und_eingeschmuggeltes_vbaProject_ergeben_nur_Makros()
    {
        var datei = Gueltig().Absaetze(UnqualifizierterAbsatz).RohEintrag("word/vbaProject.bin", [0xCC, 0x61, 0xFF, 0xFF, 0x00]).Bytes();

        Assert.Equal([Makros], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Unqualifiziertes_Attribut_und_DDE_Feld_ergeben_nur_die_Erweiterungsmeldung()
    {
        var datei = Gueltig().Absaetze(UnqualifizierterAbsatz, Testvorlagen.FeldMitAnweisung(" DDE excel x ")).Bytes();

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public void Gegenprobe_DDE_Feld_allein_ergibt_die_Feldmeldung()
    {
        var analyse = Fixture.Factory.Services.GetRequiredService<IDocxAnalyse>();

        var befund = Assert.IsType<DocxBefund.Abgelehnt>(analyse.Analysieren(Gueltig().Absaetze(Testvorlagen.FeldMitAnweisung(" DDE excel x ")).Bytes()));

        Assert.Equal([Unzulaessig(FeldArt)], befund.Meldungen);
    }

    [Fact]
    public async Task Mehrere_Gruende_fuer_die_Erweiterungsmeldung_ergeben_sie_genau_einmal()
    {
        var bauer = Dokument($"xmlns:w15=\"{W15}\"", UnqualifizierterAbsatz, P("<w:r><x:zusatz xmlns:x=\"urn:example:fremd\"/></w:r>"),
            "<w15:people><w15:person w15:author=\"Testperson Mg61\"/></w15:people>");
        var rid = bauer.DokumentTeil("media/image1.png", "image/png", RelImage, Testbilder.Png(64));
        bauer.DokumentInhalt = bauer.DokumentInhalt!.Replace("<w:sectPr/>", P($"<w:contentPart r:id=\"{rid}\"/>") + "<w:sectPr/>", StringComparison.Ordinal);

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    // ---------- Nachprüfung (AK-16) umfasst Punkt 8 ----------

    private sealed class BereinigungMitUnqualifiziertemAttribut : IDocxBereinigung
    {
        public byte[] Bereinigen(byte[] inhalt) =>
            Gueltig().Absaetze(UnqualifizierterAbsatz).KernEigenschaften("<dc:creator>C.O.I.N.</dc:creator>").Bytes();
    }

    [Fact]
    public async Task Nachpruefung_lehnt_bereinigte_Datei_mit_unqualifiziertem_Attribut_ab()
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Dienste = dienste => dienste.AddSingleton<IDocxBereinigung>(new BereinigungMitUnqualifiziertemAttribut()),
        });
        using var client = factory.CreateClient();
        using var coin = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin($"Coin Nachpruefung {Guid.NewGuid():N}"));
        var coinId = (await JsonAsync(coin)).GetProperty("id").GetGuid();

        using var antwort = await PostVersionAsync(client, coinId, Gueltig().Bytes());

        Assert.Equal(
            ["Die Datei konnte nicht verarbeitet werden. Bitte in Word erneut als Word-Dokument (.docx) speichern und erneut hochladen."],
            await DateiFehlerAsync(antwort));
    }

    // ---------- Laufzeit ----------

    [Fact]
    public void Analyse_meldet_w_Element_mit_1000_unqualifizierten_Attributen_in_unter_2_Sekunden()
    {
        var analyse = Fixture.Factory.Services.GetRequiredService<IDocxAnalyse>();
        // 999 unqualifizierte Attribute + 1 Deklaration = 1.000 (Grenze aus AK-12 eingehalten).
        var attribute = string.Concat(Enumerable.Range(0, 999).Select(i => $" a{i}=\"\""));
        var datei = Gueltig().Teil("word/attribute.xml", "application/xml",
            XmlKopf + $"<w:e xmlns:w=\"{DocxLeser.W.NamespaceName}\"{attribute}/>").Bytes();
        analyse.Analysieren(Gueltig().Bytes());

        var uhr = Stopwatch.StartNew();
        var befund = analyse.Analysieren(datei);
        uhr.Stop();

        Assert.Equal([Erweiterungen], Assert.IsType<DocxBefund.Abgelehnt>(befund).Meldungen);
        Assert.True(uhr.Elapsed < TimeSpan.FromSeconds(2), $"Dauer: {uhr.Elapsed}");
    }
}
