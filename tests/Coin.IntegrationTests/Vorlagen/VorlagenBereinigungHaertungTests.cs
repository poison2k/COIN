using System.Net;
using System.Text;
using System.Xml.Linq;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 3, AK-16 (e)–(g) (F10, ADR-0024 Punkt 3), Angriffsproben aus dem QA-Review:
/// <list type="bullet">
/// <item>W2: <c>w:permStart</c> mit <c>w:ed</c> (Personenkennung) wird samt <c>w:permEnd</c> entfernt, der Text bleibt;
/// Bereiche mit <c>w:edGrp</c> bleiben.</item>
/// <item>G2: verwaiste Teile (vom Paketstamm nicht erreichbar) werden samt <c>.rels</c> und Override entfernt, auch ein
/// verwaister Zyklus und verwaiste <c>.rels</c>.</item>
/// <item>H2: <c>TitlesOfParts</c> und <c>HeadingPairs</c> in <c>docProps/app.xml</c> werden entfernt.</item>
/// </list>
/// Geprüft werden aktive Datei und Versions-Download. Testwerte sind eindeutig und synthetisch.
/// </summary>
public class VorlagenBereinigungHaertungTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string Bearbeiter = "bearbeiter.bz30@beispiel.invalid";
    private const string EigenschaftWert = "Verwaist Bz31";
    private const string CustomXmlWert = "Verwaist SharePoint Bz32";
    private const string PersonWert = "Verwaiste Person Bz33";
    private const string PersonKennung = "verwaist.bz34@beispiel.invalid";
    private const string TitelTeil = "Titelteil Bz35";
    private const string Ueberschriftenpaar = "Ueberschrift Bz36";
    private const string BinaerWert = "Verwaister Binaerteil Bz37";
    private const string ZyklusWertA = "Zyklus A Bz38";
    private const string ZyklusWertB = "Zyklus B Bz39";
    private const string RelsWert = "Verwaiste Rels Bz40";

    private static readonly XNamespace W = DocxLeser.W;
    private static readonly XNamespace Ep = DocxLeser.Ep;

    private static string XmlKopf => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";

    /// <summary>Lädt hoch (erwartet 201) und liefert aktive Datei und Version 1.</summary>
    private async Task<(byte[] Aktiv, byte[] Version)> HochladenAsync(byte[] datei)
    {
        var coinId = await CoinAsync();
        using (var antwort = await PostVersionAsync(coinId, datei))
        {
            Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"{(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        }

        return (await LadeAsync(AktiveDateiUrl(coinId)), await LadeAsync(VersionDateiUrl(coinId, 1)));
    }

    private static IEnumerable<string> Overrides(byte[] docx) =>
        DocxLeser.Xml(docx, "[Content_Types].xml").Root!.Elements()
            .Select(e => ((string?)e.Attribute("PartName") ?? string.Empty).TrimStart('/'))
            .Where(p => p.Length > 0);

    // ---------- W2: w:permStart w:ed ----------

    private static byte[] MitBearbeitungsbereichen() =>
        Gueltig().Absaetze(
            P($"<w:permStart w:id=\"7\" w:ed=\"{Bearbeiter}\"/>", Run("persönlicher Bereich"), "<w:permEnd w:id=\"7\"/>"),
            P("<w:permStart w:id=\"8\" w:edGrp=\"everyone\"/>", Run("Gruppenbereich"), "<w:permEnd w:id=\"8\"/>")).Bytes();

    [Fact]
    public void Testdatei_mit_Bearbeitungsbereichen_enthaelt_den_Bearbeiter()
    {
        Assert.Contains(Bearbeiter, DocxLeser.AllesAlsText(MitBearbeitungsbereichen()), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Bearbeitungsbereich_mit_Bearbeiter_wird_angenommen()
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, MitBearbeitungsbereichen());

        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"{(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
    }

    [Fact]
    public async Task Download_enthaelt_den_Bearbeiter_nicht_mehr()
    {
        var (aktiv, version) = await HochladenAsync(MitBearbeitungsbereichen());

        Assert.DoesNotContain(Bearbeiter, DocxLeser.AllesAlsText(aktiv), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Bearbeiter, DocxLeser.AllesAlsText(version), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task permStart_mit_w_ed_ist_samt_permEnd_entfernt()
    {
        var (aktiv, _) = await HochladenAsync(MitBearbeitungsbereichen());

        var dokument = DocxLeser.Xml(aktiv, "word/document.xml");
        Assert.DoesNotContain(dokument.Descendants(W + "permStart"), e => (string?)e.Attribute(W + "id") == "7");
        Assert.DoesNotContain(dokument.Descendants(W + "permEnd"), e => (string?)e.Attribute(W + "id") == "7");
        Assert.Empty(dokument.Descendants().Attributes(W + "ed"));
    }

    [Fact]
    public async Task Bereich_mit_w_edGrp_bleibt_unveraendert()
    {
        var (aktiv, _) = await HochladenAsync(MitBearbeitungsbereichen());

        var dokument = DocxLeser.Xml(aktiv, "word/document.xml");
        var start = Assert.Single(dokument.Descendants(W + "permStart"));
        Assert.Equal("8", (string?)start.Attribute(W + "id"));
        Assert.Equal("everyone", (string?)start.Attribute(W + "edGrp"));
        Assert.Equal("8", (string?)Assert.Single(dokument.Descendants(W + "permEnd")).Attribute(W + "id"));
    }

    [Fact]
    public async Task Text_in_Bearbeitungsbereichen_bleibt_unveraendert()
    {
        var original = MitBearbeitungsbereichen();

        var (aktiv, _) = await HochladenAsync(original);

        Assert.Equal(DocxLeser.Absatztexte(original), DocxLeser.Absatztexte(aktiv));
    }

    [Fact]
    public async Task permStart_mit_w_ed_in_der_Kopfzeile_wird_ebenfalls_entfernt()
    {
        var datei = Gueltig()
            .Kopfzeile("default", P($"<w:permStart w:id=\"9\" w:ed=\"{Bearbeiter}\"/>", Run("Kopf"), "<w:permEnd w:id=\"9\"/>"))
            .Bytes();

        var (aktiv, _) = await HochladenAsync(datei);

        Assert.DoesNotContain(Bearbeiter, DocxLeser.AllesAlsText(aktiv), StringComparison.OrdinalIgnoreCase);
    }

    // ---------- G2: verwaiste Teile ----------

    public static TheoryData<string> VerwaisteTeile =>
    [
        "docProps/custom.xml", "customXml/item1.xml", "word/people.xml", "word/media/verwaist.bin",
    ];

    private static (byte[] Datei, string Wert) MitVerwaistemTeil(string teil)
    {
        var bauer = Gueltig();
        switch (teil)
        {
            case "docProps/custom.xml":
                bauer.Teil(teil, "application/vnd.openxmlformats-officedocument.custom-properties+xml",
                    XmlKopf +
                    "<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/custom-properties\" " +
                    "xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\">" +
                    "<property fmtid=\"{D5CDD505-2E9C-101B-9397-08002B2CF9AE}\" pid=\"2\" name=\"Verantwortung\">" +
                    $"<vt:lpwstr>{EigenschaftWert}</vt:lpwstr></property></Properties>");
                return (bauer.Bytes(), EigenschaftWert);
            case "customXml/item1.xml":
                bauer.Teil(teil, null, Testvorlagen.QuellenverzeichnisXml(CustomXmlWert));
                return (bauer.Bytes(), CustomXmlWert);
            case "word/people.xml":
                bauer.Teil(teil, "application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml",
                    XmlKopf +
                    "<w15:people xmlns:w15=\"http://schemas.microsoft.com/office/word/2012/wordml\">" +
                    $"<w15:person w15:author=\"{PersonWert}\"><w15:presenceInfo w15:providerId=\"AD\" w15:userId=\"{PersonKennung}\"/>" +
                    "</w15:person></w15:people>");
                return (bauer.Bytes(), PersonWert);
            case "word/media/verwaist.bin":
                bauer.Teil(teil, "application/octet-stream", Encoding.UTF8.GetBytes(BinaerWert));
                return (bauer.Bytes(), BinaerWert);
            default:
                throw new ArgumentOutOfRangeException(nameof(teil), teil, null);
        }
    }

    [Theory]
    [MemberData(nameof(VerwaisteTeile))]
    public void Testdatei_enthaelt_den_verwaisten_Teil_ohne_Beziehung(string teil)
    {
        var (datei, _) = MitVerwaistemTeil(teil);

        var eintraege = DocxLeser.Eintraege(datei);
        Assert.Contains(teil, eintraege.Keys);
        var beziehungen = string.Concat(eintraege.Where(e => e.Key.EndsWith(".rels", StringComparison.Ordinal))
            .Select(e => Encoding.UTF8.GetString(e.Value)));
        Assert.DoesNotContain(teil.Split('/')[^1], beziehungen, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [MemberData(nameof(VerwaisteTeile))]
    public async Task Verwaister_Teil_ist_im_Download_nicht_mehr_enthalten(string teil)
    {
        var (aktiv, version) = await HochladenAsync(MitVerwaistemTeil(teil).Datei);

        Assert.DoesNotContain(teil, DocxLeser.Eintraege(aktiv).Keys, StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain(teil, DocxLeser.Eintraege(version).Keys, StringComparer.OrdinalIgnoreCase);
    }

    [Theory]
    [MemberData(nameof(VerwaisteTeile))]
    public async Task Wert_aus_dem_verwaisten_Teil_ist_im_Download_nicht_mehr_enthalten(string teil)
    {
        var (datei, wert) = MitVerwaistemTeil(teil);

        var (aktiv, _) = await HochladenAsync(datei);

        Assert.DoesNotContain(wert, DocxLeser.AllesAlsText(aktiv), StringComparison.Ordinal);
    }

    [Theory]
    [MemberData(nameof(VerwaisteTeile))]
    public async Task Verwaister_Teil_hinterlaesst_keinen_Content_Type_Override(string teil)
    {
        var (aktiv, _) = await HochladenAsync(MitVerwaistemTeil(teil).Datei);

        Assert.DoesNotContain(teil, Overrides(aktiv), StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Verwaiste_people_xml_hinterlaesst_keine_Personenkennung()
    {
        var (aktiv, _) = await HochladenAsync(MitVerwaistemTeil("word/people.xml").Datei);

        Assert.DoesNotContain(PersonKennung, DocxLeser.AllesAlsText(aktiv), StringComparison.OrdinalIgnoreCase);
    }

    private static byte[] MitVerwaistemZyklus()
    {
        var bauer = Gueltig();
        bauer.Teil("word/zyklus/a.xml", null, Testvorlagen.QuellenverzeichnisXml(ZyklusWertA));
        bauer.Teil("word/zyklus/b.xml", null, Testvorlagen.QuellenverzeichnisXml(ZyklusWertB));
        bauer.Beziehung("word/zyklus/a.xml", RelCustomXml, "b.xml");
        bauer.Beziehung("word/zyklus/b.xml", RelCustomXml, "a.xml");
        return bauer.Bytes();
    }

    [Fact]
    public async Task Verwaister_Zyklus_aus_zwei_Teilen_ist_im_Download_nicht_mehr_enthalten()
    {
        var (aktiv, _) = await HochladenAsync(MitVerwaistemZyklus());

        var eintraege = DocxLeser.Eintraege(aktiv).Keys;
        Assert.DoesNotContain(eintraege, n => n.StartsWith("word/zyklus/", StringComparison.OrdinalIgnoreCase));
        var text = DocxLeser.AllesAlsText(aktiv);
        Assert.DoesNotContain(ZyklusWertA, text, StringComparison.Ordinal);
        Assert.DoesNotContain(ZyklusWertB, text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Verwaiste_rels_ohne_Quellteil_sind_im_Download_nicht_mehr_enthalten()
    {
        var bauer = Gueltig();
        bauer.Beziehung("word/gibtesnicht.xml", RelHyperlink, $"https://beispiel.invalid/{RelsWert.Replace(' ', '-')}", istExtern: true);

        var (aktiv, _) = await HochladenAsync(bauer.Bytes());

        Assert.DoesNotContain("word/_rels/gibtesnicht.xml.rels", DocxLeser.Eintraege(aktiv).Keys, StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Erreichbare_Teile_bleiben_beim_Entfernen_verwaister_Teile_erhalten()
    {
        var bauer = Testvorlagen.MitBild();
        bauer.Kopfzeile("default", Text("Kopf"));
        bauer.Teil("word/media/verwaist.bin", "application/octet-stream", Encoding.UTF8.GetBytes(BinaerWert));

        var (aktiv, _) = await HochladenAsync(bauer.Bytes());

        Assert.Superset(
            new HashSet<string>(["word/document.xml", "word/header1.xml", "word/media/bild1.png"], StringComparer.OrdinalIgnoreCase),
            DocxLeser.Eintraege(aktiv).Keys.ToHashSet(StringComparer.OrdinalIgnoreCase));
    }

    // ---------- H2: TitlesOfParts und HeadingPairs ----------

    private static byte[] MitTitelteilen()
    {
        var bauer = Gueltig();
        bauer.AppEigenschaften(
            "<Pages>1</Pages><Words>12</Words>" +
            "<HeadingPairs><vt:vector size=\"2\" baseType=\"variant\">" +
            $"<vt:variant><vt:lpstr>{Ueberschriftenpaar}</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant>" +
            "</vt:vector></HeadingPairs>" +
            $"<TitlesOfParts><vt:vector size=\"1\" baseType=\"lpstr\"><vt:lpstr>{TitelTeil}</vt:lpstr></vt:vector></TitlesOfParts>");
        return bauer.Bytes();
    }

    [Fact]
    public void Testdatei_mit_Titelteilen_ist_fuer_den_Validator_fehlerfrei()
    {
        Assert.Empty(DocxLeser.ValidatorFehler(MitTitelteilen()));
    }

    [Fact]
    public async Task TitlesOfParts_ist_im_Download_entfernt()
    {
        var (aktiv, version) = await HochladenAsync(MitTitelteilen());

        Assert.Empty(DocxLeser.Xml(aktiv, "docProps/app.xml").Descendants(Ep + "TitlesOfParts"));
        Assert.Empty(DocxLeser.Xml(version, "docProps/app.xml").Descendants(Ep + "TitlesOfParts"));
    }

    [Fact]
    public async Task HeadingPairs_ist_im_Download_entfernt()
    {
        var (aktiv, _) = await HochladenAsync(MitTitelteilen());

        Assert.Empty(DocxLeser.Xml(aktiv, "docProps/app.xml").Descendants(Ep + "HeadingPairs"));
    }

    [Fact]
    public async Task Titel_aus_TitlesOfParts_und_HeadingPairs_ist_im_Download_nicht_mehr_enthalten()
    {
        var (aktiv, _) = await HochladenAsync(MitTitelteilen());

        var text = DocxLeser.AllesAlsText(aktiv);
        Assert.DoesNotContain(TitelTeil, text, StringComparison.Ordinal);
        Assert.DoesNotContain(Ueberschriftenpaar, text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Statistikwerte_in_app_xml_bleiben_neben_entfernten_Titelteilen_erhalten()
    {
        var (aktiv, _) = await HochladenAsync(MitTitelteilen());

        var app = DocxLeser.Xml(aktiv, "docProps/app.xml");
        Assert.Equal("1", app.Root!.Element(Ep + "Pages")?.Value);
        Assert.Equal("12", app.Root.Element(Ep + "Words")?.Value);
    }
}
