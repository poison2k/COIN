using System.IO.Compression;
using System.Net;
using System.Security;
using System.Text;
using Coin.Domain.Vorlagen;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.Extensions.DependencyInjection;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 4, AK-10 bis AK-13 (ADR-0024 Punkt 1, 7), Umgehungen aus QA-Review 2:
/// <list type="bullet">
/// <item>K1: <c>TargetMode</c> wie <c>xsd:token</c> normalisiert, nur <c>Internal</c>/<c>External</c>; interne Ziele
/// mit Schema, <c>//</c>, <c>\</c>, <c>?</c>, <c>#</c> oder leer → „kein .docx“.</item>
/// <item>K2: höchstens 256 Element-Ebenen je XML-Teil, eigene Meldung, Prozess bleibt stabil. Tests mit
/// <c>Kategorie=Absturzgefahr</c> können vor der Umsetzung den Testprozess per Stack Overflow beenden und werden dann
/// einzeln ausgeführt.</item>
/// <item>W1: Tokenisierung von <c>HYPERLINK</c>-Anweisungen (Schalter nur <c>\l \o \t \m \n \h</c>).</item>
/// <item>W2: „Serienbrief-Verknüpfungen“, <c>subDocument</c> und eingebettete Office-Pakete nach Content-Type.</item>
/// <item>H1: Teilnamen-Normalform; H2: Strict-Namespaces; H3: Feldnamen-Positivliste; H5: Aufbereitung als Singleton.</item>
/// </list>
/// Jede Ablehnung nennt die wörtliche Meldung unter <c>errors.datei</c> und speichert nichts.
/// </summary>
public class VorlagenPruefungUmgehungTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    /// <summary>Trait für Tests, die vor der Umsetzung von K2 den Testprozess per Stack Overflow beenden können.</summary>
    public const string Absturzgefahr = "Absturzgefahr";

    private const string DtdArt = "Dokumenttypdefinitionen (DTD)";
    private const string ActiveXArt = "ActiveX-Steuerelemente";
    private const string OleArt = "eingebettete Objekte";
    private const string ExternArt = "Verknüpfungen auf externe Inhalte";
    private const string HyperlinkArt = "Hyperlinks mit unzulässigem Ziel";
    private const string AltChunkArt = "importierte Fremdinhalte";
    private const string SerienbriefArt = "Serienbrief-Verknüpfungen";
    private const string FeldArt = "Felder mit externen Verknüpfungen oder DDE";
    private const string VerschachteltArt = "Felder mit verschachtelten Feldanweisungen";
    private const string FeldnameArt = "Felder mit unzulässigem Feldnamen";

    private const string ZuTief = "Die Datei ist zu tief verschachtelt. Bitte verschachtelte Tabellen, Textfelder oder Formen vereinfachen.";

    private const string RelAttachedTemplate = RelBasis + "/attachedTemplate";
    private const string RelSubDocument = RelBasis + "/subDocument";
    private const string StrictRelNs = "http://purl.oclc.org/ooxml/officeDocument/relationships";

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

    private static string BildMitBlip(string blipAttribut) =>
        P("<w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"952500\" cy=\"952500\"/>" +
          "<wp:docPr id=\"7\" name=\"Bild 7\"/><a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\">" +
          "<pic:pic><pic:nvPicPr><pic:cNvPr id=\"0\" name=\"bild.png\"/><pic:cNvPicPr/></pic:nvPicPr>" +
          $"<pic:blipFill><a:blip {blipAttribut}/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>" +
          "<pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"952500\" cy=\"952500\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr>" +
          "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>");

    // ---------- K1: TargetMode ----------

    /// <summary>TargetMode-Werte, die nach xsd:token-Normalisierung <c>External</c> sind (XML-kodiert).</summary>
    public static TheoryData<string> ZielModiExternal =>
    [
        "External&#9;",
        " External ",
        "External&#10;",
        " External",
        "External ",
        "&#9;External",
        "&#10;External&#10;",
    ];

    [Theory]
    [MemberData(nameof(ZielModiExternal))]
    public async Task AttachedTemplate_mit_TargetMode_External_und_Leerraum_wird_abgelehnt(string zielModus)
    {
        var bauer = Gueltig();
        bauer.Einstellungen("<w:attachedTemplate r:id=\"rIdVorlage\"/>");
        bauer.BeziehungMitZielModus("word/settings.xml", RelAttachedTemplate, "file:///srv/t.dotm", zielModus, id: "rIdVorlage");

        Assert.Equal([Unzulaessig(ExternArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Theory]
    [MemberData(nameof(ZielModiExternal))]
    public async Task Externes_Bild_mit_TargetMode_External_und_Leerraum_wird_abgelehnt(string zielModus)
    {
        var bauer = Gueltig();
        var rid = bauer.BeziehungMitZielModus("word/document.xml", RelImage, "file://srv/x.png", zielModus);
        bauer.Absaetze(BildMitBlip($"r:link=\"{rid}\""));

        Assert.Equal([Unzulaessig(ExternArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Theory]
    [InlineData("external")]
    [InlineData("EXTERNAL")]
    [InlineData("Extern")]
    [InlineData("")]
    [InlineData("External x")]
    [InlineData("Bogus")]
    public async Task Unbekannter_TargetMode_ist_kein_Word_Dokument(string zielModus)
    {
        var bauer = Gueltig();
        bauer.Einstellungen("<w:attachedTemplate r:id=\"rIdVorlage\"/>");
        bauer.BeziehungMitZielModus("word/settings.xml", RelAttachedTemplate, "file:///srv/t.dotm", zielModus, id: "rIdVorlage");

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Bild_ohne_TargetMode_mit_relativem_Ziel_wird_angenommen()
    {
        var bauer = Gueltig();
        var rid = bauer.DokumentTeil("media/bild1.png", "image/png", RelImage, Testbilder.Png(128));
        bauer.Absaetze(BildMitBlip($"r:embed=\"{rid}\""));

        await AngenommenAsync(bauer.Bytes());
    }

    // ---------- K1: interne Ziele ----------

    public static TheoryData<string> UnzulaessigeInterneZiele =>
    [
        "file:///C:/x.png",
        "http://example.invalid/x.png",
        "C:\\x.png",
        "mailto:x",
        "//server/x.png",
        "media\\x.png",
        "media/x.png?x",
        "media/x.png#x",
        "",
    ];

    [Theory]
    [MemberData(nameof(UnzulaessigeInterneZiele))]
    public async Task Internes_Bildziel_mit_Schema_oder_unzulaessigem_Zeichen_ist_kein_Word_Dokument(string ziel)
    {
        var bauer = Gueltig();
        bauer.DokumentTeil("media/x.png", "image/png", RelImage, Testbilder.Png(64));
        var rid = bauer.DokumentBeziehung(RelImage, ziel);
        bauer.Absaetze(BildMitBlip($"r:embed=\"{rid}\""));

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Theory]
    [InlineData("file:///srv/t.dotm")]
    [InlineData("http://example.invalid/t.dotm")]
    public async Task Interne_attachedTemplate_Beziehung_mit_absolutem_URI_ist_kein_Word_Dokument(string ziel)
    {
        var bauer = Gueltig();
        bauer.Einstellungen("<w:attachedTemplate r:id=\"rIdVorlage\"/>");
        bauer.Beziehung("word/settings.xml", RelAttachedTemplate, ziel, id: "rIdVorlage");

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    // ---------- K2: Verschachtelungstiefe ----------

    /// <summary><paramref name="anzahl"/> ineinander verschachtelte Elemente <paramref name="name"/> um <paramref name="innen"/>.</summary>
    private static string Verschachtelt(int anzahl, string name, string innen = "", string ersterZusatz = "")
    {
        var text = new StringBuilder(anzahl * (2 * name.Length + 5) + innen.Length + ersterZusatz.Length);
        for (var i = 0; i < anzahl; i++)
        {
            text.Append('<').Append(name).Append(i == 0 ? ersterZusatz : string.Empty).Append('>');
        }

        text.Append(innen);
        for (var i = 0; i < anzahl; i++)
        {
            text.Append("</").Append(name).Append('>');
        }

        return text.ToString();
    }

    /// <summary><paramref name="ebenen"/> ineinander verschachtelte <c>w:sdt</c>/<c>w:sdtContent</c> um einen Absatz.</summary>
    private static string TiefeSdts(int ebenen, string absatz)
    {
        var text = new StringBuilder(ebenen * 40 + absatz.Length);
        for (var i = 0; i < ebenen; i++)
        {
            text.Append("<w:sdt><w:sdtContent>");
        }

        text.Append(absatz);
        for (var i = 0; i < ebenen; i++)
        {
            text.Append("</w:sdtContent></w:sdt>");
        }

        return text.ToString();
    }

    /// <summary>Ohne Kompression, damit die Grenze für das Kompressionsverhältnis nicht vor der Tiefengrenze greift.</summary>
    private static DocxBauer Unkomprimiert(DocxBauer bauer)
    {
        bauer.Kompression = CompressionLevel.NoCompression;
        return bauer;
    }

    /// <summary>
    /// Verwaister <c>application/xml</c>-Teil mit genau <paramref name="ebenen"/> Element-Ebenen. (Rev. 7: Elemente
    /// im erlaubten Namespace <c>w</c>, damit die Namespace-Positivliste nicht anschlägt.)
    /// </summary>
    private static DocxBauer MitTiefemTeil(int ebenen, string prolog = "") =>
        Unkomprimiert(Gueltig().Teil("word/tief.xml", "application/xml", XmlKopf + prolog +
            Verschachtelt(ebenen, "w:e", ersterZusatz: " xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"")));

    /// <summary>Hauptteil mit genau <paramref name="ebenen"/> Element-Ebenen (Dokument, Körper, dann <c>w:r</c>).</summary>
    private static byte[] HauptteilMitEbenen(int ebenen) =>
        Unkomprimiert(new DocxBauer
        {
            DokumentInhalt = XmlKopf + $"<w:document {Namensraeume}><w:body>" + string.Concat(PflichtAbsaetze) +
                Verschachtelt(ebenen - 2, "w:r") + "</w:body></w:document>",
        }).Bytes();

    private static byte[] TieferHauptteil(int ebenen) => Unkomprimiert(Gueltig().Absaetze(TiefeSdts(ebenen, Text("tief")))).Bytes();

    /// <summary>Lädt hoch, erwartet die Tiefen-Meldung und danach einen funktionierenden Testhost (Status 200).</summary>
    private async Task ZuTiefUndHostLebtAsync(byte[] datei)
    {
        var coinId = await CoinAsync();
        var vorher = await SpeicherZustandAsync(coinId);

        var meldungen = await AbgelehntAsync(coinId, datei);

        Assert.Equal([ZuTief], meldungen);
        Assert.Equal(vorher, await SpeicherZustandAsync(coinId));
        using var folge = await Client.GetAsync(VorlageUrl(coinId));
        Assert.Equal(HttpStatusCode.OK, folge.StatusCode);
    }

    [Fact]
    public async Task Verwaister_XML_Teil_mit_256_Ebenen_wird_angenommen_und_entfernt()
    {
        var coinId = await AngenommenAsync(MitTiefemTeil(256).Bytes());

        var aktiv = await LadeAsync(AktiveDateiUrl(coinId));

        Assert.DoesNotContain("word/tief.xml", DocxLeser.Eintraege(aktiv).Keys);
    }

    [Fact]
    public async Task Verwaister_XML_Teil_mit_257_Ebenen_wird_als_zu_tief_abgelehnt()
    {
        Assert.Equal([ZuTief], await AbgelehntOhneSpeichernAsync(MitTiefemTeil(257).Bytes()));
    }

    [Fact]
    public async Task Hauptteil_mit_257_Ebenen_wird_als_zu_tief_abgelehnt()
    {
        Assert.Equal([ZuTief], await AbgelehntOhneSpeichernAsync(HauptteilMitEbenen(257)));
    }

    [Fact]
    public async Task Paketbeziehungen_mit_257_Ebenen_werden_als_zu_tief_abgelehnt()
    {
        var bauer = Gueltig();
        bauer.PaketRelsZusatz = Verschachtelt(256, "x", ersterZusatz: " xmlns=\"urn:coin:test\"");

        Assert.Equal([ZuTief], await AbgelehntOhneSpeichernAsync(Unkomprimiert(bauer).Bytes()));
    }

    [Fact]
    public async Task Content_Types_mit_257_Ebenen_werden_als_zu_tief_abgelehnt()
    {
        var bauer = Gueltig();
        bauer.ContentTypesZusatz = Verschachtelt(256, "x", ersterZusatz: " xmlns=\"urn:coin:test\"");

        Assert.Equal([ZuTief], await AbgelehntOhneSpeichernAsync(Unkomprimiert(bauer).Bytes()));
    }

    [Fact]
    public async Task DOCTYPE_vor_zu_tiefem_Inhalt_wird_als_DTD_abgelehnt()
    {
        var datei = MitTiefemTeil(300, "<!DOCTYPE e [<!ENTITY x \"y\">]>").Bytes();

        Assert.Equal([Unzulaessig(DtdArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Hauptteil_mit_300_verschachtelten_Inhaltssteuerelementen_wird_als_zu_tief_abgelehnt()
    {
        await ZuTiefUndHostLebtAsync(TieferHauptteil(300));
    }

    [Fact]
    [Trait("Kategorie", Absturzgefahr)]
    public async Task Hauptteil_mit_5000_verschachtelten_Inhaltssteuerelementen_wird_als_zu_tief_abgelehnt()
    {
        await ZuTiefUndHostLebtAsync(TieferHauptteil(5_000));
    }

    [Fact]
    [Trait("Kategorie", Absturzgefahr)]
    public async Task Kopfzeile_mit_3000_verschachtelten_Inhaltssteuerelementen_wird_als_zu_tief_abgelehnt()
    {
        await ZuTiefUndHostLebtAsync(Unkomprimiert(Gueltig().Kopfzeile("default", TiefeSdts(3_000, Text("Kopf")))).Bytes());
    }

    [Fact]
    [Trait("Kategorie", Absturzgefahr)]
    public async Task Hauptteil_mit_100000_Ebenen_wird_als_zu_tief_abgelehnt_und_die_API_antwortet_weiter()
    {
        var datei = HauptteilMitEbenen(100_000);
        Assert.True(datei.Length < FuenfMiB, $"Testdatei zu groß: {datei.Length}");

        await ZuTiefUndHostLebtAsync(datei);
    }

    [Fact]
    public async Task Verwaister_XML_Teil_mit_5000_Ebenen_wird_als_zu_tief_abgelehnt()
    {
        await ZuTiefUndHostLebtAsync(MitTiefemTeil(5_000).Bytes());
    }

    [Fact]
    [Trait("Kategorie", Absturzgefahr)]
    public void Analyse_lehnt_100000_Ebenen_ohne_Ausnahme_mit_der_Tiefen_Meldung_ab()
    {
        var analyse = Fixture.Factory.Services.GetRequiredService<IDocxAnalyse>();

        var befund = analyse.Analysieren(HauptteilMitEbenen(100_000));

        Assert.Equal([ZuTief], Assert.IsType<DocxBefund.Abgelehnt>(befund).Meldungen);
    }

    [Fact]
    [Trait("Kategorie", Absturzgefahr)]
    public void Nachpruefung_lehnt_100000_Ebenen_ohne_Ausnahme_mit_der_Tiefen_Meldung_ab()
    {
        var analyse = Fixture.Factory.Services.GetRequiredService<IDocxAnalyse>();

        var befund = analyse.Nachpruefen(HauptteilMitEbenen(100_000));

        Assert.Equal([ZuTief], Assert.IsType<DocxBefund.Abgelehnt>(befund).Meldungen);
    }

    [Fact]
    public async Task Hauptteil_mit_20_verschachtelten_Inhaltssteuerelementen_wird_angenommen()
    {
        await AngenommenAsync(TieferHauptteil(20));
    }

    // ---------- W1: HYPERLINK-Tokenisierung ----------

    public static TheoryData<string> UnzulaessigeHyperlinkAnweisungen =>
    [
        " HYPERLINK \\\\server\\freigabe\\x.docx ",
        " HYPERLINK \\\\server\\share\\x ",
        " HYPERLINK \\\\server\\share\\x \\o \"Tipp\" ",
        " HYPERLINK \"\\\\server\\x\" ",
        " HYPERLINK \\x \"https://example.invalid\" ",
        " HYPERLINK \\lx ",
        // Rev. 5 (W1): „HYPERLINK \l"Anker"“ ist wie in Word zulässig, siehe VorlagenPruefungNachschaerfungTests.
        " HYPERLINK \"https://a\" \"file:///b\" ",
    ];

    [Theory]
    [MemberData(nameof(UnzulaessigeHyperlinkAnweisungen))]
    public async Task HYPERLINK_Feld_mit_unzulaessiger_Adresse_wird_abgelehnt(string anweisung)
    {
        var datei = Gueltig().Absaetze(Testvorlagen.FeldMitAnweisung(SecurityElement.Escape(anweisung))).Bytes();

        Assert.Equal([Unzulaessig(HyperlinkArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Theory]
    [MemberData(nameof(UnzulaessigeHyperlinkAnweisungen))]
    public async Task Einfaches_HYPERLINK_Feld_mit_unzulaessiger_Adresse_wird_abgelehnt(string anweisung)
    {
        var datei = Gueltig().Absaetze(Testvorlagen.EinfachesFeld(SecurityElement.Escape(anweisung), Run("Verweis"))).Bytes();

        Assert.Equal([Unzulaessig(HyperlinkArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    public static TheoryData<string> ZulaessigeHyperlinkAnweisungen =>
    [
        " HYPERLINK \"https://example.invalid\" \\o \"Info\" \\t \"_blank\" ",
        " HYPERLINK \\l \"Anker\" \\o \"Info\" ",
        " hyperlink \\L \"Anker\" ",
        " HYPERLINK \\l \"Marke\" ",
        " HYPERLINK \"https://example.org\" \\o \"Tipp\" ",
    ];

    [Theory]
    [MemberData(nameof(ZulaessigeHyperlinkAnweisungen))]
    public async Task HYPERLINK_Feld_mit_zulaessigen_Token_wird_angenommen(string anweisung)
    {
        await AngenommenAsync(Gueltig().Absaetze(Testvorlagen.FeldMitAnweisung(SecurityElement.Escape(anweisung))).Bytes());
    }

    // ---------- W2: Serienbrief ----------

    private const string MailMerge =
        "<w:mailMerge><w:mainDocumentType w:val=\"formLetters\"/><w:linkToQuery/><w:dataType w:val=\"native\"/>" +
        "<w:connectString w:val=\"Data Source=\\\\srv\\share\\x.accdb\"/>" +
        "<w:query w:val=\"SELECT * FROM `Tabelle`\"/></w:mailMerge>";

    [Fact]
    public async Task Serienbrief_in_den_Einstellungen_wird_abgelehnt()
    {
        var datei = Gueltig().Einstellungen(MailMerge).Bytes();

        Assert.Equal([Unzulaessig(SerienbriefArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Serienbrief_in_mc_Fallback_der_Einstellungen_wird_abgelehnt()
    {
        var datei = Gueltig().Einstellungen(
            "<mc:AlternateContent><mc:Choice Requires=\"w14\"><w:trackRevisions/></mc:Choice>" +
            $"<mc:Fallback>{MailMerge}</mc:Fallback></mc:AlternateContent>").Bytes();

        Assert.Equal([Unzulaessig(SerienbriefArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Interne_recipientData_Beziehung_wird_als_Serienbrief_abgelehnt()
    {
        var bauer = Gueltig().Einstellungen(string.Empty);
        bauer.Teil("word/recipientData.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.mailMergeRecipientData+xml",
            XmlKopf + $"<w:recipients {Namensraeume}><w:recipientData><w:active w:val=\"1\"/><w:column w:val=\"0\"/>" +
            "<w:uniqueTag w:val=\"AQ==\"/></w:recipientData></w:recipients>");
        bauer.Beziehung("word/settings.xml", RelBasis + "/recipientData", "recipientData.xml");

        Assert.Equal([Unzulaessig(SerienbriefArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Externe_mailMergeSource_Beziehung_wird_als_extern_und_Serienbrief_abgelehnt()
    {
        var bauer = Gueltig().Einstellungen(string.Empty);
        bauer.Beziehung("word/settings.xml", RelBasis + "/mailMergeSource", "file:///C:/Daten/x.accdb", istExtern: true);

        Assert.Equal([Unzulaessig(ExternArt, SerienbriefArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    // ---------- W2: subDocument und eingebettete Pakete ----------

    [Fact]
    public async Task Interne_subDocument_Beziehung_wird_als_eingebettetes_Objekt_abgelehnt()
    {
        var bauer = Gueltig();
        var rid = bauer.DokumentTeil("sub.docx", "application/octet-stream", RelSubDocument, Gueltig().Bytes());
        bauer.Absaetze($"<w:subDoc r:id=\"{rid}\"/>");

        Assert.Equal([Unzulaessig(OleArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Externe_subDocument_Beziehung_wird_als_eingebettetes_Objekt_und_extern_abgelehnt()
    {
        var bauer = Gueltig();
        var rid = bauer.DokumentBeziehung(RelSubDocument, "file:///srv/sub.docx", istExtern: true);
        bauer.Absaetze($"<w:subDoc r:id=\"{rid}\"/>");

        Assert.Equal([Unzulaessig(OleArt, ExternArt)], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    public static TheoryData<string> EingebettetePaketTypen =>
    [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
        "application/vnd.ms-word.document.macroEnabled.12",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel.sheet.macroEnabled.12",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/msword",
        "application/vnd.oasis.opendocument.text",
    ];

    [Theory]
    [MemberData(nameof(EingebettetePaketTypen))]
    public async Task Teil_mit_Content_Type_eines_eingebetteten_Pakets_wird_abgelehnt(string contentType)
    {
        var datei = Gueltig().Teil("word/embeddings/x.bin", contentType, Testvorlagen.LeeresZip()).Bytes();

        Assert.Equal([Unzulaessig(OleArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Teil_stylesWithEffects_wird_angenommen()
    {
        var bauer = Gueltig();
        bauer.DokumentTeil("stylesWithEffects.xml", "application/vnd.ms-word.stylesWithEffects+xml",
            "http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects",
            XmlKopf + $"<w:styles {Namensraeume}/>");

        await AngenommenAsync(bauer.Bytes());
    }

    [Fact]
    public async Task Eingebettete_Schrift_wird_angenommen()
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

    // ---------- H1: Teilnamen-Normalform ----------

    /// <summary>Teilname ohne Prozentkodierung, für den Vergleich unabhängig von der Schreibweise im Download.</summary>
    private static string Dekodiert(string name) => Uri.UnescapeDataString(name).ToUpperInvariant();

    [Theory]
    [InlineData("word/media/a%20b.png", "media/a%20b.png")]
    [InlineData("word/media/%C3%A4.png", "media/%c3%a4.png")]
    [InlineData("word/media/ä.png", "media/%C3%A4.png")]
    public async Task Bild_mit_kodiertem_Teilnamen_wird_angenommen_und_bleibt_im_Download_byte_gleich(string eintrag, string ziel)
    {
        var bild = Testbilder.Png(256);
        var bauer = Gueltig();
        // Content-Type über den Default für „png“.
        bauer.Teil(eintrag, null, bild);
        var rid = bauer.DokumentBeziehung(RelImage, ziel);
        bauer.Absaetze(BildMitBlip($"r:embed=\"{rid}\""));

        var coinId = await AngenommenAsync(bauer.Bytes());
        var eintraege = DocxLeser.Eintraege(await LadeAsync(AktiveDateiUrl(coinId)));

        Assert.True(
            eintraege.Any(e => Dekodiert(e.Key) == Dekodiert(eintrag) && e.Value.SequenceEqual(bild)),
            $"Einträge: {string.Join(", ", eintraege.Keys)}");
    }

    [Fact]
    public async Task Kopfzeile_mit_kodiertem_Teilnamen_und_passendem_Override_wird_angenommen()
    {
        await AngenommenAsync(Gueltig().KopfzeileAls("kopf%20zeile.xml", "default", [Text("Kopf")]).Bytes());
    }

    [Fact]
    public async Task Leerzeichen_und_kodiertes_Leerzeichen_im_Namen_sind_doppelte_Eintraege()
    {
        var bauer = Gueltig();
        bauer.Teil("word/media/a%20b.png", null, Testbilder.Png(64));
        var rid = bauer.DokumentBeziehung(RelImage, "media/a%20b.png");
        bauer.Absaetze(BildMitBlip($"r:embed=\"{rid}\""));
        bauer.RohEintrag("word/media/a b.png", Testbilder.Png(64));

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Theory]
    [InlineData("media/%G1.png")]
    [InlineData("media/%2")]
    [InlineData("media%2Fx.png")]
    [InlineData("media%5Cx.png")]
    [InlineData("media/%FF.png")]
    [InlineData("../../x.png")]
    public async Task Bildziel_mit_ungueltiger_Kodierung_ist_kein_Word_Dokument(string ziel)
    {
        var bauer = Gueltig();
        bauer.DokumentTeil("media/x.png", "image/png", RelImage, Testbilder.Png(64));
        var rid = bauer.DokumentBeziehung(RelImage, ziel);
        bauer.Absaetze(BildMitBlip($"r:embed=\"{rid}\""));

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Eintrag_mit_leerem_Segment_ist_kein_Word_Dokument()
    {
        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(Gueltig().RohEintrag("word//a.png", Testbilder.Png(64)).Bytes()));
    }

    // ---------- H2: Strict-Namespaces ----------

    /// <summary>Rev. 7 (AK-10, Namespace-Positivliste): jede Strict-Verwendung ist „kein .docx“ (bis Rev. 6 „Verknüpfungen auf externe Inhalte“).</summary>
    [Fact]
    public async Task Strict_Beziehungsreferenz_an_a_blip_auf_externe_Hyperlink_Beziehung_ist_kein_Word_Dokument()
    {
        var bauer = Gueltig();
        var rid = bauer.DokumentBeziehung(RelHyperlink, "https://beispiel.invalid/bild.png", istExtern: true);
        bauer.Absaetze(BildMitBlip($"xmlns:rs=\"{StrictRelNs}\" rs:link=\"{rid}\""));

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    /// <summary>Rev. 7 (AK-10, Namespace-Positivliste): jede Strict-Verwendung ist „kein .docx“ (bis Rev. 6 „Verknüpfungen auf externe Inhalte“).</summary>
    [Fact]
    public async Task Strict_Beziehungsreferenz_an_v_imagedata_auf_externe_Hyperlink_Beziehung_ist_kein_Word_Dokument()
    {
        var bauer = Gueltig();
        var rid = bauer.DokumentBeziehung(RelHyperlink, "https://beispiel.invalid/bild.png", istExtern: true);
        bauer.Absaetze(P(
            "<w:r><w:pict><v:shape id=\"Bild8\" style=\"width:10pt;height:10pt\">" +
            $"<v:imagedata xmlns:rs=\"{StrictRelNs}\" rs:id=\"{rid}\" o:title=\"\"/>" +
            "</v:shape></w:pict></w:r>"));

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Kopfzeile_im_Strict_Namespace_ist_kein_Word_Dokument()
    {
        var xml = XmlKopf + "<w:hdr xmlns:w=\"http://purl.oclc.org/ooxml/wordprocessingml/main\">" + Text("Kopf") + "</w:hdr>";
        var datei = Gueltig().KopfzeileAls("header1.xml", "default", [], Encoding.UTF8.GetBytes(xml)).Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Formatvorlagen_mit_fremdem_Wurzel_Namespace_sind_kein_Word_Dokument()
    {
        var bauer = Gueltig();
        bauer.DokumentTeil("styles.xml", StylesTyp, RelStyles, XmlKopf + "<x:styles xmlns:x=\"urn:coin:fremd\"/>");

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Verwaister_Teil_mit_Strict_Wurzel_ist_kein_Word_Dokument()
    {
        var datei = Gueltig()
            .Teil("word/strict.xml", "application/xml", XmlKopf + "<w:document xmlns:w=\"http://purl.oclc.org/ooxml/wordprocessingml/main\"/>")
            .Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Beziehung_mit_Strict_Typ_ist_kein_Word_Dokument()
    {
        var bauer = Gueltig();
        bauer.DokumentTeil("embeddings/o.bin", "application/octet-stream", StrictRelNs + "/oleObject", [1, 2, 3, 4]);

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    // ---------- H3: Feldnamen ----------

    public static TheoryData<string> UnzulaessigeFeldnamen =>
    [
        "\"DDE\"",
        "'DDE'",
        "\u201EDDE\u201C",
        "DD\u00ADE",
        "\u200BDDE",
        "D\u200BDE",
        "\uFEFFDDE",
        "\u202EEDD",
        "DD\u0415",
        "INCLUDE1",
        "\"INCLUDEPICTURE\"",
        "D\u00ADDEAUTO",
        "I\u200BNCLUDEPICTURE",
    ];

    [Theory]
    [MemberData(nameof(UnzulaessigeFeldnamen))]
    public async Task Feld_mit_unzulaessigem_Feldnamen_wird_abgelehnt(string feldname)
    {
        var datei = Gueltig().Absaetze(Testvorlagen.FeldMitAnweisung(SecurityElement.Escape($" {feldname} \"x\" "))).Bytes();

        Assert.Equal([Unzulaessig(FeldnameArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Theory]
    [MemberData(nameof(UnzulaessigeFeldnamen))]
    public async Task Einfaches_Feld_mit_unzulaessigem_Feldnamen_wird_abgelehnt(string feldname)
    {
        var datei = Gueltig().Absaetze(Testvorlagen.EinfachesFeld(SecurityElement.Escape($" {feldname} \"x\" "), Run("Ergebnis"))).Bytes();

        Assert.Equal([Unzulaessig(FeldnameArt)], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Theory]
    [InlineData(" PAGE ")]
    [InlineData(" page \\* MERGEFORMAT ")]
    [InlineData(" =SUM(ABOVE) ")]
    [InlineData("")]
    public async Task Feld_mit_zulaessigem_Feldnamen_wird_angenommen(string anweisung)
    {
        await AngenommenAsync(Gueltig().Absaetze(Testvorlagen.FeldMitAnweisung(anweisung)).Bytes());
    }

    // ---------- Reihenfolge der Arten (AK-13) ----------

    [Fact]
    public async Task Mehrere_Arten_erscheinen_in_der_Reihenfolge_aus_AK_13()
    {
        var bauer = Testvorlagen.MitAltChunk(Testvorlagen.MitActiveX());
        bauer.Einstellungen("<w:attachedTemplate r:id=\"rIdVorlage\"/>" + MailMerge);
        bauer.Beziehung("word/settings.xml", RelAttachedTemplate, "https://beispiel.invalid/t.dotm", istExtern: true, id: "rIdVorlage");
        var sub = bauer.DokumentTeil("sub.docx", "application/octet-stream", RelSubDocument, Gueltig().Bytes());
        bauer.Absaetze(
            $"<w:subDoc r:id=\"{sub}\"/>",
            Testvorlagen.FeldMitAnweisung(" \"X\" "),
            Testvorlagen.FeldMitAnweisung(" DDEAUTO excel \"C:\\\\x.xls\" \"R1C1\" "),
            P("<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>",
              "<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r><w:r><w:instrText> QUOTE x </w:instrText></w:r><w:r><w:fldChar w:fldCharType=\"end\"/></w:r>",
              "<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>", Run("Ergebnis"), "<w:r><w:fldChar w:fldCharType=\"end\"/></w:r>"),
            Testvorlagen.FeldMitAnweisung(" HYPERLINK \\\\server\\x "));

        Assert.Equal(
            [Unzulaessig(ActiveXArt, OleArt, ExternArt, HyperlinkArt, AltChunkArt, SerienbriefArt, FeldArt, VerschachteltArt, FeldnameArt)],
            await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    // ---------- H5: Aufbereitung prozessweit ----------

    [Fact]
    public void VorlagenAufbereitung_ist_in_zwei_DI_Scopes_dieselbe_Instanz()
    {
        using var erster = Fixture.Factory.Services.CreateScope();
        using var zweiter = Fixture.Factory.Services.CreateScope();

        Assert.Same(
            erster.ServiceProvider.GetRequiredService<VorlagenAufbereitung>(),
            zweiter.ServiceProvider.GetRequiredService<VorlagenAufbereitung>());
    }
}
