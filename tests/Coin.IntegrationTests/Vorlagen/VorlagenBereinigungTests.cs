using System.Net;
using System.Security.Cryptography;
using System.Xml.Linq;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen, AK-16 a–d (F10, ADR-0024 Punkt 3): Nach bestandener Prüfung wird die Datei bereinigt;
/// gespeichert und ausgeliefert wird nur die bereinigte Fassung. Testwerte sind eindeutig und synthetisch.
/// </summary>
public class VorlagenBereinigungTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string Autor = "Test Autor Bz01";
    private const string ZuletztGeaendertVon = "Test Bearbeiter Bz02";
    private const string Titel = "Titel Bz03";
    private const string Betreff = "Betreff Bz04";
    private const string Stichwoerter = "Stichwort Bz05";
    private const string KommentarEigenschaft = "Kommentar Bz06";
    private const string Kategorie = "Kategorie Bz07";
    private const string Inhaltsstatus = "Status Bz08";
    private const string Kennung = "Kennung Bz09";
    private const string Firma = "Firma Bz10";
    private const string Manager = "Manager Bz11";
    private const string Vorlagenpfad = "C:\\Users\\testnutzer-Bz12\\Vorlagen\\Normal.dotm";
    private const string HyperlinkBasis = "https://hyperlinkbasis-bz13.invalid/";
    private const string Benutzerdefiniert = "Benutzerdefiniert Bz14";
    private const string CustomXmlWert = "SharePoint Bz15";
    private const string Person = "Person Bz17";
    private const string PersonKennung = "person.bz18@beispiel.invalid";
    private const string Dokumentvariable = "Variable Bz19";
    private const string StoreItemId = "{6E2C2A41-0C59-4C2B-9E1A-3B7D5F2A9C10}";
    private const string GebundenerText = "Gebundener Anzeigetext";
    private const string Rsid = "00A1B2C3";
    private const string DocId = "1A2B3C4D";

    public static TheoryData<string> EntfernteWerte =>
    [
        Autor, ZuletztGeaendertVon, Titel, Betreff, Stichwoerter, KommentarEigenschaft, Kategorie, Inhaltsstatus, Kennung,
        Firma, Manager, Vorlagenpfad, HyperlinkBasis, Benutzerdefiniert, CustomXmlWert, Person, PersonKennung, Dokumentvariable,
    ];

    private static readonly XNamespace W = DocxLeser.W;

    /// <summary>Datei mit allen personenbezogenen Eigenschaften aus AK-16 und Inhalten, die unverändert bleiben müssen.</summary>
    public static byte[] DateiMitMetadaten()
    {
        var bauer = new DocxBauer().Absaetze(
            $"<w:p w:rsidR=\"{Rsid}\" w:rsidRDefault=\"{Rsid}\"><w:r><w:rPr><w:b/><w:color w:val=\"1F3864\"/></w:rPr><w:t>{{{{Coin.Name}}}}</w:t></w:r></w:p>",
            PflichtAbsaetze[1],
            PflichtAbsaetze[2],
            P(Run("verliehen an "), Run("{{Empfaenger.", "<w:i/>"), "<w:proofErr w:type=\"spellStart\"/>", Run("Name}}", "<w:i/>"), "<w:proofErr w:type=\"spellEnd\"/>"),
            $"<w:sdt><w:sdtPr><w:dataBinding w:prefixMappings=\"xmlns:b='{Testvorlagen.BibliographyNs}'\" w:xpath=\"/b:Sources[1]/b:Source[1]/b:Tag[1]\" w:storeItemID=\"{StoreItemId}\"/><w:text/></w:sdtPr>" +
            $"<w:sdtContent><w:p><w:r><w:t>{GebundenerText}</w:t></w:r></w:p></w:sdtContent></w:sdt>");
        bauer.Kopfzeile("default", Text("Kopfzeile {{Zertifikat.Nummer}}"));
        bauer.DokumentTeil("media/bild1.png", "image/png", RelImage, Testbilder.Png(777));
        bauer.KernEigenschaften(
            $"<dc:title>{Titel}</dc:title><dc:subject>{Betreff}</dc:subject><dc:creator>{Autor}</dc:creator>" +
            $"<cp:keywords>{Stichwoerter}</cp:keywords><dc:description>{KommentarEigenschaft}</dc:description>" +
            $"<cp:lastModifiedBy>{ZuletztGeaendertVon}</cp:lastModifiedBy><cp:revision>17</cp:revision>" +
            "<cp:lastPrinted>2026-09-30T08:00:00Z</cp:lastPrinted>" +
            "<dcterms:created xsi:type=\"dcterms:W3CDTF\">2026-09-01T08:00:00Z</dcterms:created>" +
            "<dcterms:modified xsi:type=\"dcterms:W3CDTF\">2026-09-02T08:00:00Z</dcterms:modified>" +
            $"<cp:category>{Kategorie}</cp:category><cp:contentStatus>{Inhaltsstatus}</cp:contentStatus><dc:identifier>{Kennung}</dc:identifier>");
        bauer.AppEigenschaften(
            $"<Template>{Vorlagenpfad}</Template><Pages>1</Pages><Words>12</Words><Manager>{Manager}</Manager>" +
            $"<Company>{Firma}</Company><HyperlinkBase>{HyperlinkBasis}</HyperlinkBase>");
        bauer.BenutzerdefinierteEigenschaft("Projektverantwortung", Benutzerdefiniert);
        bauer.Teil("customXml/item1.xml", null, Testvorlagen.QuellenverzeichnisXml(CustomXmlWert));
        bauer.Teil("customXml/itemProps1.xml", "application/vnd.openxmlformats-officedocument.customXmlProperties+xml",
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
            $"<ds:datastoreItem ds:itemID=\"{StoreItemId}\" xmlns:ds=\"http://schemas.openxmlformats.org/officeDocument/2006/customXml\"><ds:schemaRefs/></ds:datastoreItem>");
        bauer.Beziehung("customXml/item1.xml", RelBasis + "/customXmlProps", "itemProps1.xml");
        bauer.DokumentBeziehung(RelCustomXml, "../customXml/item1.xml");
        bauer.DokumentTeil("people.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml", RelPeople,
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<w15:people xmlns:w15=\"http://schemas.microsoft.com/office/word/2012/wordml\">" +
            $"<w15:person w15:author=\"{Person}\"><w15:presenceInfo w15:providerId=\"AD\" w15:userId=\"{PersonKennung}\"/></w15:person></w15:people>");
        bauer.Einstellungen(
            $"<w:docVars><w:docVar w:name=\"Bearbeitung\" w:val=\"{Dokumentvariable}\"/></w:docVars>" +
            $"<w:rsids><w:rsidRoot w:val=\"{Rsid}\"/><w:rsid w:val=\"{Rsid}\"/></w:rsids><w14:docId w14:val=\"{DocId}\"/>");
        return bauer.Bytes();
    }

    private sealed record Ergebnis(byte[] Original, byte[] Aktiv, byte[] Version, Guid CoinId);

    private async Task<Ergebnis> HochladenAsync()
    {
        var coinId = await CoinAsync();
        var original = DateiMitMetadaten();
        await LadeVorlageHochAsync(coinId, original);
        return new Ergebnis(original, await LadeAsync(AktiveDateiUrl(coinId)), await LadeAsync(VersionDateiUrl(coinId, 1)), coinId);
    }

    // ---------- Testdatei ----------

    [Fact]
    public void Testdatei_enthaelt_alle_Testwerte()
    {
        var text = DocxLeser.AllesAlsText(DateiMitMetadaten());

        Assert.All(EntfernteWerte.Cast<object[]>().Select(w => (string)w[0]), w => Assert.Contains(w, text, StringComparison.Ordinal));
    }

    [Fact]
    public void Testdatei_ist_fuer_den_Validator_fehlerfrei()
    {
        Assert.Empty(DocxLeser.ValidatorFehler(DateiMitMetadaten()));
    }

    // ---------- (a) Werte entfernt ----------

    [Fact]
    public async Task Datei_mit_Metadaten_wird_angenommen()
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, DateiMitMetadaten());

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Theory]
    [MemberData(nameof(EntfernteWerte))]
    public async Task Aktiver_Download_enthaelt_den_Testwert_nicht_mehr(string wert)
    {
        var ergebnis = await HochladenAsync();

        Assert.DoesNotContain(wert, DocxLeser.AllesAlsText(ergebnis.Aktiv), StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [MemberData(nameof(EntfernteWerte))]
    public async Task Versions_Download_enthaelt_den_Testwert_nicht_mehr(string wert)
    {
        var ergebnis = await HochladenAsync();

        Assert.DoesNotContain(wert, DocxLeser.AllesAlsText(ergebnis.Version), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Gespeicherte_Bytes_enthalten_keinen_Testwert()
    {
        var ergebnis = await HochladenAsync();

        var gespeichert = DocxLeser.AllesAlsText(Assert.Single(await VorlageDb.VersionenAsync(ergebnis.CoinId)).Inhalt);

        Assert.All(EntfernteWerte.Cast<object[]>().Select(w => (string)w[0]), w => Assert.DoesNotContain(w, gespeichert, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Autor_ist_COIN_und_sonst_keine_Kerneigenschaft()
    {
        var ergebnis = await HochladenAsync();

        var eigenschaften = DocxLeser.KernEigenschaften(ergebnis.Aktiv);

        Assert.Equal([$"{DocxLeser.Dc}|creator"], eigenschaften.Keys);
        Assert.Equal("C.O.I.N.", eigenschaften[$"{DocxLeser.Dc}|creator"]);
    }

    [Fact]
    public async Task App_Eigenschaften_behalten_Statistik_ohne_Firma_Manager_Vorlage_und_Hyperlinkbasis()
    {
        var ergebnis = await HochladenAsync();

        var app = DocxLeser.AppEigenschaften(ergebnis.Aktiv);

        Assert.Contains("Pages", app);
        Assert.Contains("Words", app);
        Assert.DoesNotContain("Company", app);
        Assert.DoesNotContain("Manager", app);
        Assert.DoesNotContain("Template", app);
        Assert.DoesNotContain("HyperlinkBase", app);
    }

    [Fact]
    public async Task Benutzerdefinierte_Eigenschaften_customXml_und_people_sind_entfernt()
    {
        var ergebnis = await HochladenAsync();

        var namen = DocxLeser.Eintraege(ergebnis.Aktiv).Keys
            .Where(k => k == "docProps/custom.xml" || k.StartsWith("customXml/", StringComparison.Ordinal) || k == "word/people.xml")
            .ToList();

        Assert.Empty(namen);
    }

    [Fact]
    public async Task Keine_Beziehung_zeigt_auf_entfernte_Teile()
    {
        var ergebnis = await HochladenAsync();
        var eintraege = DocxLeser.Eintraege(ergebnis.Aktiv);

        var ziele = eintraege.Keys
            .Where(k => k.EndsWith(".rels", StringComparison.Ordinal))
            .SelectMany(k => DocxLeser.Xml(ergebnis.Aktiv, k).Root!.Elements().Select(e => (string?)e.Attribute("Target") ?? string.Empty))
            .Where(z => z.Contains("custom", StringComparison.OrdinalIgnoreCase) || z.Contains("people", StringComparison.OrdinalIgnoreCase))
            .ToList();

        Assert.Empty(ziele);
    }

    [Fact]
    public async Task Dokumentvariablen_sind_entfernt()
    {
        var ergebnis = await HochladenAsync();

        Assert.Empty(DocxLeser.Xml(ergebnis.Aktiv, "word/settings.xml").Descendants(W + "docVars"));
    }

    [Fact]
    public async Task Datenbindung_ist_entfernt_und_der_angezeigte_Text_bleibt()
    {
        var ergebnis = await HochladenAsync();
        var dokument = DocxLeser.Xml(ergebnis.Aktiv, "word/document.xml");

        Assert.Empty(dokument.Descendants(W + "dataBinding"));
        Assert.Contains(GebundenerText, string.Concat(dokument.Descendants(W + "t").Select(t => t.Value)), StringComparison.Ordinal);
    }

    // ---------- (b) Inhalt unverändert ----------

    [Fact]
    public async Task Absatztexte_aller_geprueften_Teile_sind_vor_und_nach_der_Bereinigung_gleich()
    {
        var ergebnis = await HochladenAsync();

        Assert.Equal(DocxLeser.Absatztexte(ergebnis.Original), DocxLeser.Absatztexte(ergebnis.Aktiv));
    }

    /// <summary>Elementbaum ohne Namensraum-Deklarationen, Attribute sortiert (Formatierung, Text, rsid).</summary>
    private static string Normalform(XElement element) =>
        $"<{element.Name}{string.Concat(element.Attributes().Where(a => !a.IsNamespaceDeclaration).OrderBy(a => a.Name.ToString(), StringComparer.Ordinal).Select(a => $" {a.Name}=\"{a.Value}\""))}>" +
        string.Concat(element.Nodes().Select(n => n is XElement e ? Normalform(e) : n is XText t ? t.Value : string.Empty)) +
        $"</{element.Name}>";

    [Fact]
    public async Task Hauptteil_ist_bis_auf_die_Datenbindung_unveraendert()
    {
        var ergebnis = await HochladenAsync();
        var vorher = DocxLeser.Xml(ergebnis.Original, "word/document.xml");
        vorher.Descendants(W + "dataBinding").Remove();

        var nachher = DocxLeser.Xml(ergebnis.Aktiv, "word/document.xml");

        Assert.Equal(Normalform(vorher.Root!.Element(W + "body")!), Normalform(nachher.Root!.Element(W + "body")!));
    }

    [Fact]
    public async Task Kopfzeile_ist_unveraendert()
    {
        var ergebnis = await HochladenAsync();

        Assert.Equal(
            Normalform(DocxLeser.Xml(ergebnis.Original, "word/header1.xml").Root!),
            Normalform(DocxLeser.Xml(ergebnis.Aktiv, "word/header1.xml").Root!));
    }

    [Fact]
    public async Task Rsid_Werte_und_Dokument_Id_bleiben_erhalten()
    {
        var ergebnis = await HochladenAsync();
        var settings = DocxLeser.Xml(ergebnis.Aktiv, "word/settings.xml");
        XNamespace w14 = "http://schemas.microsoft.com/office/word/2010/wordml";

        Assert.Contains(settings.Descendants(W + "rsid"), r => (string?)r.Attribute(W + "val") == Rsid);
        Assert.Equal(DocId, (string?)settings.Descendants(w14 + "docId").Single().Attribute(w14 + "val"));
    }

    [Fact]
    public async Task Bilder_bleiben_byte_gleich()
    {
        var ergebnis = await HochladenAsync();

        Assert.Equal(DocxLeser.Eintraege(ergebnis.Original)["word/media/bild1.png"], DocxLeser.Eintraege(ergebnis.Aktiv)["word/media/bild1.png"]);
    }

    // ---------- (c) Validator ----------

    [Fact]
    public async Task Validator_meldet_fuer_die_bereinigte_Datei_keine_neuen_Fehler()
    {
        var ergebnis = await HochladenAsync();
        var vorher = DocxLeser.ValidatorFehler(ergebnis.Original).ToHashSet(StringComparer.Ordinal);

        var neu = DocxLeser.ValidatorFehler(ergebnis.Aktiv).Where(f => !vorher.Contains(f)).ToList();

        Assert.Empty(neu);
    }

    // ---------- (d) Größe und SHA-256 der bereinigten Fassung ----------

    [Fact]
    public async Task Gespeicherte_Datei_ist_die_bereinigte_nicht_das_Original()
    {
        var ergebnis = await HochladenAsync();

        var zeile = Assert.Single(await VorlageDb.VersionenAsync(ergebnis.CoinId));

        Assert.Equal(ergebnis.Aktiv, zeile.Inhalt);
        Assert.NotEqual(ergebnis.Original, zeile.Inhalt);
    }

    [Fact]
    public async Task Groesse_und_SHA_256_in_der_Datenbank_gehoeren_zur_bereinigten_Fassung()
    {
        var ergebnis = await HochladenAsync();

        var zeile = Assert.Single(await VorlageDb.VersionenAsync(ergebnis.CoinId));

        Assert.Equal(ergebnis.Aktiv.Length, zeile.GroesseBytes);
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(ergebnis.Aktiv)), zeile.Sha256.ToLowerInvariant());
    }

    [Fact]
    public async Task Status_meldet_die_Groesse_der_bereinigten_Fassung()
    {
        var ergebnis = await HochladenAsync();

        var version = (await StatusAsync(ergebnis.CoinId)).GetProperty("versionen")[0];

        Assert.Equal(ergebnis.Aktiv.Length, version.GetProperty("groesseBytes").GetInt32());
    }

    [Fact]
    public async Task Aktiver_Download_und_Versions_Download_sind_byte_gleich()
    {
        var ergebnis = await HochladenAsync();

        Assert.Equal(ergebnis.Aktiv, ergebnis.Version);
    }

    [Fact]
    public async Task Bereinigte_Datei_besteht_die_Pruefung_erneut()
    {
        var ergebnis = await HochladenAsync();

        using var antwort = await PostVersionAsync(ergebnis.CoinId, ergebnis.Aktiv);

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }
}
