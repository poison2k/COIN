using System.Net;
using System.Xml.Linq;
using Coin.IntegrationTests.Infrastruktur;
using DocumentFormat.OpenXml.Packaging;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen, AK-2 bis AK-6 (ADR-0022 Punkt 5): <c>GET /api/zertifikatsvorlagen/standard</c>
/// liefert ein im Backend erzeugtes, gültiges, metadatenfreies DOCX mit allen Platzhaltern.
/// </summary>
public class StandardvorlageTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    /// <summary>Platzhalter laut Abschnitt 4.1 (Literale, unabhängig vom Produktivcode).</summary>
    public static TheoryData<string> AllePlatzhalter =>
    [
        "Coin.Name", "Exemplar.Nummer", "Zertifikat.Nummer", "Empfaenger.Name", "Coin.Herausgeber", "Coin.Beschreibung",
        "Coin.Auflage", "Empfaenger.Dienstgrad", "Empfaenger.Dienststelle", "Ausgabe.Datum", "Ausgabe.Gelegenheit",
        "Ausgabe.Begruendung", "Ausgabe.AusgebendeStelle",
    ];

    private static readonly XNamespace W = DocxLeser.W;

    private static XElement Koerper(byte[] docx) => DocxLeser.Xml(docx, "word/document.xml").Root!.Element(W + "body")!;

    private static string Text(XElement element) => string.Concat(element.Descendants(W + "t").Select(t => t.Value));

    /// <summary>Absätze des Hauptteils vor bzw. ab der Überschrift „Erläuterung der Platzhalter“.</summary>
    private static (List<XElement> Urkunde, List<XElement> Erlaeuterung) Abschnitte(byte[] docx)
    {
        var absaetze = Koerper(docx).Elements().ToList();
        var index = absaetze.FindIndex(e => e.Name == W + "p" && Text(e) == "Erläuterung der Platzhalter");
        Assert.True(index > 0, "Überschrift „Erläuterung der Platzhalter“ fehlt.");
        return (absaetze[..index], absaetze[index..]);
    }

    // ---------- AK-2: Abruf, Format, Validität ----------

    [Fact]
    public async Task Get_liefert_200()
    {
        using var antwort = await Client.GetAsync(StandardUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Antwort_laesst_sich_mit_WordprocessingDocument_Open_laden()
    {
        var docx = await StandardvorlageAsync();

        using var dokument = WordprocessingDocument.Open(new MemoryStream(docx), false);

        Assert.NotNull(dokument.MainDocumentPart?.Document?.Body);
    }

    [Fact]
    public async Task OpenXmlValidator_meldet_keine_Fehler()
    {
        var docx = await StandardvorlageAsync();

        Assert.Empty(DocxLeser.ValidatorFehler(docx));
    }

    [Fact]
    public void Im_Repository_liegt_keine_DOCX_Datei()
    {
        var wurzel = new DirectoryInfo(AppContext.BaseDirectory);
        while (wurzel is not null && !File.Exists(Path.Combine(wurzel.FullName, "CLAUDE.md")))
        {
            wurzel = wurzel.Parent;
        }

        Assert.NotNull(wurzel);
        var trenner = Path.DirectorySeparatorChar;
        var dateien = Directory.EnumerateFiles(wurzel!.FullName, "*.*", SearchOption.AllDirectories)
            .Where(d => d.EndsWith(".docx", StringComparison.OrdinalIgnoreCase) || d.EndsWith(".dotx", StringComparison.OrdinalIgnoreCase))
            .Where(d => !d.Contains($"{trenner}node_modules{trenner}", StringComparison.Ordinal)
                && !d.Contains($"{trenner}bin{trenner}", StringComparison.Ordinal)
                && !d.Contains($"{trenner}obj{trenner}", StringComparison.Ordinal)
                && !d.Contains($"{trenner}.git{trenner}", StringComparison.Ordinal)
                && !d.Contains($"{trenner}test-results{trenner}", StringComparison.Ordinal)
                && !d.Contains($"{trenner}playwright-report{trenner}", StringComparison.Ordinal))
            .ToList();

        Assert.Empty(dateien);
    }

    [Theory]
    [MemberData(nameof(AllePlatzhalter))]
    public async Task Hauptteil_enthaelt_den_Platzhalter(string name)
    {
        var (urkunde, _) = Abschnitte(await StandardvorlageAsync());

        Assert.Contains(urkunde, absatz => Text(absatz).Contains($"{{{{{name}}}}}", StringComparison.Ordinal));
    }

    // ---------- AK-3: Gestaltung ----------

    [Theory]
    [MemberData(nameof(AllePlatzhalter))]
    public async Task Jeder_Platzhalter_steht_vollstaendig_in_einem_Run(string name)
    {
        var docx = await StandardvorlageAsync();

        var runs = Koerper(docx).Descendants(W + "t").Select(t => t.Value);

        Assert.Contains(runs, t => t.Contains($"{{{{{name}}}}}", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Kein_Run_enthaelt_einen_angeschnittenen_Platzhalter()
    {
        var docx = await StandardvorlageAsync();
        var teile = DocxLeser.GepruefteTeile(docx).Select(t => DocxLeser.Xml(docx, t));

        var angeschnitten = teile
            .SelectMany(x => x.Descendants(W + "t"))
            .Select(t => t.Value)
            .Where(t => t.Split("{{").Length != t.Split("}}").Length)
            .ToList();

        Assert.Empty(angeschnitten);
    }

    [Fact]
    public async Task Seite_ist_A4_hochkant()
    {
        var docx = await StandardvorlageAsync();

        var groesse = Koerper(docx).Descendants(W + "pgSz").Single();

        Assert.Equal(("11906", "16838"), ((string?)groesse.Attribute(W + "w"), (string?)groesse.Attribute(W + "h")));
        Assert.NotEqual("landscape", (string?)groesse.Attribute(W + "orient"));
    }

    [Fact]
    public async Task Raender_sind_2_cm()
    {
        var docx = await StandardvorlageAsync();

        var rand = Koerper(docx).Descendants(W + "pgMar").Single();

        Assert.Equal(
            ["1134", "1134", "1134", "1134"],
            new[] { "top", "right", "bottom", "left" }.Select(s => (string?)rand.Attribute(W + s)));
    }

    [Fact]
    public async Task Erste_Ueberschrift_ist_Echtheitszertifikat()
    {
        var (urkunde, _) = Abschnitte(await StandardvorlageAsync());

        Assert.Equal("Echtheitszertifikat", urkunde.Select(Text).First(t => t.Trim().Length > 0));
    }

    [Fact]
    public async Task Schrift_ist_einheitlich()
    {
        var docx = await StandardvorlageAsync();
        var eintraege = DocxLeser.Eintraege(docx);
        var teile = eintraege.Keys.Where(k => k.StartsWith("word/", StringComparison.Ordinal) && k.EndsWith(".xml", StringComparison.Ordinal));

        var schriften = teile
            .SelectMany(t => DocxLeser.Xml(docx, t).Descendants(W + "rFonts"))
            .SelectMany(f => f.Attributes().Where(a => a.Name.LocalName is "ascii" or "hAnsi" or "cs").Select(a => a.Value))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        Assert.True(schriften.Count <= 1, "Mehrere Schriften: " + string.Join(", ", schriften));
    }

    [Fact]
    public async Task Fusszeile_enthaelt_Zertifikat_Nummer()
    {
        var docx = await StandardvorlageAsync();
        var fusszeilen = DocxLeser.Eintraege(docx).Keys.Where(k => k.StartsWith("word/footer", StringComparison.Ordinal)).ToList();

        Assert.NotEmpty(fusszeilen);
        Assert.Contains(fusszeilen, f => Text(DocxLeser.Xml(docx, f).Root!).Contains("{{Zertifikat.Nummer}}", StringComparison.Ordinal));
    }

    // ---------- zertifikat-erzeugen AK-12 (F8): Dienststelle in einem eigenen Absatz ----------

    [Fact]
    public async Task Dienstgrad_und_Name_stehen_ohne_Dienststelle_in_einem_Absatz()
    {
        var (urkunde, _) = Abschnitte(await StandardvorlageAsync());

        Assert.Contains(urkunde, absatz => Text(absatz) == "{{Empfaenger.Dienstgrad}} {{Empfaenger.Name}}");
    }

    [Fact]
    public async Task Dienststelle_steht_allein_in_einem_eigenen_Absatz()
    {
        var (urkunde, _) = Abschnitte(await StandardvorlageAsync());

        Assert.Single(urkunde, absatz => Text(absatz) == "{{Empfaenger.Dienststelle}}");
    }

    [Fact]
    public async Task Dienststellen_Absatz_folgt_direkt_auf_den_Namens_Absatz()
    {
        var (urkunde, _) = Abschnitte(await StandardvorlageAsync());
        var texte = urkunde.Where(e => e.Name == W + "p").Select(Text).ToList();

        var name = texte.IndexOf("{{Empfaenger.Dienstgrad}} {{Empfaenger.Name}}");

        Assert.True(name >= 0 && name + 1 < texte.Count, "Absatz mit Dienstgrad und Name fehlt.");
        Assert.Equal("{{Empfaenger.Dienststelle}}", texte[name + 1]);
    }

    [Fact]
    public async Task Vor_der_Dienststelle_steht_kein_Komma()
    {
        var docx = await StandardvorlageAsync();

        Assert.DoesNotContain(DocxLeser.Absatztexte(docx), t => t.Contains(", {{Empfaenger.Dienststelle}}", StringComparison.Ordinal));
    }

    // ---------- AK-4: Erläuterung ----------

    [Fact]
    public async Task Vor_der_Erlaeuterung_steht_ein_Seitenumbruch()
    {
        var (urkunde, erlaeuterung) = Abschnitte(await StandardvorlageAsync());

        var umbruch = urkunde.Descendants(W + "br").Any(b => (string?)b.Attribute(W + "type") == "page")
            || erlaeuterung[0].Descendants(W + "pageBreakBefore").Any();

        Assert.True(umbruch, "Kein Seitenumbruch vor „Erläuterung der Platzhalter“.");
    }

    [Fact]
    public async Task Erlaeuterung_enthaelt_den_Hinweissatz()
    {
        var (_, erlaeuterung) = Abschnitte(await StandardvorlageAsync());

        Assert.Contains(
            erlaeuterung.Where(e => e.Name == W + "p").Select(Text),
            t => t.Contains("Dieser Abschnitt dient nur zur Information und kann vor dem Druck gelöscht werden.", StringComparison.Ordinal));
    }

    private static List<string[]> Tabelle(List<XElement> erlaeuterung)
    {
        var tabelle = Assert.Single(erlaeuterung, e => e.Name == W + "tbl");
        return tabelle.Elements(W + "tr").Select(z => z.Elements(W + "tc").Select(c => Text(c).Trim()).ToArray()).ToList();
    }

    [Fact]
    public async Task Erlaeuterungstabelle_hat_die_Kopfzeile_Platzhalter_Bedeutung_Pflicht_Beispiel()
    {
        var (_, erlaeuterung) = Abschnitte(await StandardvorlageAsync());

        Assert.Equal(["Platzhalter", "Bedeutung", "Pflicht", "Beispiel"], Tabelle(erlaeuterung)[0]);
    }

    [Fact]
    public async Task Erlaeuterungstabelle_nennt_alle_Platzhalter_ohne_Klammern_in_Katalogreihenfolge()
    {
        var (_, erlaeuterung) = Abschnitte(await StandardvorlageAsync());

        var namen = Tabelle(erlaeuterung).Skip(1).Select(z => z[0]);

        Assert.Equal(AllePlatzhalter.Cast<object[]>().Select(d => (string)d[0]), namen);
    }

    [Theory]
    [InlineData("Coin.Name", "Name des Coins", "ja", "Einsatzkontingent Beispiel 2025")]
    [InlineData("Empfaenger.Name", "Name des Empfängers", "ja", "Max Beispiel")]
    [InlineData("Coin.Auflage", "Auflage des Coins", "nein", "500")]
    // zertifikat-erzeugen Rev. 2 (Abschnitt 1.2): neues Beispiel der Zertifikatsnummer.
    [InlineData("Zertifikat.Nummer", "Eindeutige Nummer des Zertifikats", "ja", "C0042-0012")]
    public async Task Erlaeuterungstabelle_zeigt_Bedeutung_Pflicht_und_Beispiel_aus_dem_Katalog(
        string name, string bedeutung, string pflicht, string beispiel)
    {
        var (_, erlaeuterung) = Abschnitte(await StandardvorlageAsync());

        var zeile = Assert.Single(Tabelle(erlaeuterung), z => z[0] == name);

        Assert.Equal([name, bedeutung, pflicht, beispiel], zeile);
    }

    [Fact]
    public async Task Erlaeuterung_enthaelt_keine_geschweiften_Klammern_in_der_Tabelle()
    {
        var (_, erlaeuterung) = Abschnitte(await StandardvorlageAsync());

        var tabelle = Assert.Single(erlaeuterung, e => e.Name == W + "tbl");

        Assert.DoesNotContain("{{", Text(tabelle), StringComparison.Ordinal);
    }

    // ---------- AK-5: eigene Prüfung, metadatenfrei ----------

    [Fact]
    public async Task Standardvorlage_besteht_die_Upload_Pruefung()
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, await StandardvorlageAsync());

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Kerneigenschaften_enthalten_nur_den_Autor_COIN()
    {
        var docx = await StandardvorlageAsync();

        var eigenschaften = DocxLeser.KernEigenschaften(docx);

        Assert.Equal([$"{DocxLeser.Dc}|creator"], eigenschaften.Keys);
        Assert.Equal("C.O.I.N.", eigenschaften[$"{DocxLeser.Dc}|creator"]);
    }

    [Theory]
    [InlineData("Company")]
    [InlineData("Manager")]
    [InlineData("Template")]
    [InlineData("HyperlinkBase")]
    public async Task App_Eigenschaften_enthalten_nicht(string eigenschaft)
    {
        var docx = await StandardvorlageAsync();

        Assert.DoesNotContain(eigenschaft, DocxLeser.AppEigenschaften(docx));
    }

    [Fact]
    public async Task Es_gibt_keine_benutzerdefinierten_Eigenschaften_customXml_oder_people()
    {
        var docx = await StandardvorlageAsync();

        var namen = DocxLeser.Eintraege(docx).Keys
            .Where(k => k == "docProps/custom.xml" || k.StartsWith("customXml/", StringComparison.Ordinal) || k == "word/people.xml")
            .ToList();

        Assert.Empty(namen);
    }

    [Fact]
    public async Task Es_gibt_keine_Dokumentvariablen()
    {
        var docx = await StandardvorlageAsync();

        var settings = DocxLeser.Eintraege(docx).ContainsKey("word/settings.xml")
            ? DocxLeser.Xml(docx, "word/settings.xml").Descendants(W + "docVars").Count()
            : 0;

        Assert.Equal(0, settings);
    }

    [Fact]
    public async Task Bereinigung_aendert_an_der_Standardvorlage_keine_Eigenschaft()
    {
        var standard = await StandardvorlageAsync();
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId, standard);

        var bereinigt = await LadeAsync(AktiveDateiUrl(coinId));

        Assert.Equal(DocxLeser.KernEigenschaften(standard), DocxLeser.KernEigenschaften(bereinigt));
        Assert.Equal(DocxLeser.AppEigenschaften(standard), DocxLeser.AppEigenschaften(bereinigt));
    }

    [Fact]
    public async Task Bereinigung_aendert_an_der_Standardvorlage_keinen_Absatztext()
    {
        var standard = await StandardvorlageAsync();
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId, standard);

        var bereinigt = await LadeAsync(AktiveDateiUrl(coinId));

        Assert.Equal(DocxLeser.Absatztexte(standard), DocxLeser.Absatztexte(bereinigt));
    }

    [Fact]
    public async Task Inhalt_ist_unabhaengig_vom_Benutzer()
    {
        var sachbearbeiter = await ClientMitRolleAsync("Sachbearbeiter");
        var vonAdmin = await StandardvorlageAsync();

        using var antwort = await sachbearbeiter.GetAsync(StandardUrl);
        var vonSachbearbeiter = await antwort.Content.ReadAsByteArrayAsync();

        Assert.Equal(DocxLeser.Absatztexte(vonAdmin), DocxLeser.Absatztexte(vonSachbearbeiter));
        Assert.Equal(DocxLeser.KernEigenschaften(vonAdmin), DocxLeser.KernEigenschaften(vonSachbearbeiter));
    }

    [Fact]
    public async Task Inhalt_ist_unabhaengig_vom_Coin()
    {
        var erster = await CoinAsync("Coin Standard Eins");
        var zweiter = await CoinAsync("Coin Standard Zwei");

        var a = await LadeAsync(AktiveDateiUrl(erster));
        var b = await LadeAsync(AktiveDateiUrl(zweiter));

        Assert.Equal(DocxLeser.Absatztexte(a), DocxLeser.Absatztexte(b));
        Assert.Equal(DocxLeser.Absatztexte(await StandardvorlageAsync()), DocxLeser.Absatztexte(a));
    }

    [Fact]
    public async Task Inhalt_enthaelt_weder_Coin_Namen_noch_Benutzernamen()
    {
        var coinId = await CoinAsync("Coin Standard Qx71");

        var text = DocxLeser.AllesAlsText(await LadeAsync(AktiveDateiUrl(coinId)));

        Assert.DoesNotContain("Qx71", text, StringComparison.Ordinal);
        Assert.DoesNotContain(Testbenutzer.AdminEmail, text, StringComparison.OrdinalIgnoreCase);
    }

    // ---------- AK-6: Header ----------

    [Fact]
    public async Task Download_Header_der_Standardvorlage()
    {
        using var antwort = await Client.GetAsync(StandardUrl);

        AssertDownloadHeader(antwort, "zertifikatsvorlage-standard.docx");
    }

    // ---------- Rev. 7: Namespace-Positivliste, Teilnamen ----------

    [Fact]
    public async Task Standardvorlage_verwendet_in_allen_XML_Teilen_nur_Namespaces_aus_der_Positivliste()
    {
        var docx = await StandardvorlageAsync();

        var nichtErlaubt = DocxLeser.VerwendeteNamespaces(docx)
            .Where(e => !Coin.Domain.Vorlagen.WordNamespaces.IstErlaubt(e[(e.IndexOf(": ", StringComparison.Ordinal) + 2)..]));

        Assert.Empty(nichtErlaubt);
    }

    [Fact]
    public async Task Standardvorlage_enthaelt_keine_SVG_Grafik()
    {
        var docx = await StandardvorlageAsync();

        Assert.DoesNotContain("image/svg+xml", System.Text.Encoding.UTF8.GetString(DocxLeser.Eintraege(docx)["[Content_Types].xml"]), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(DocxLeser.Eintraege(docx).Keys, n => n.EndsWith(".svg", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Standardvorlage_enthaelt_keinen_Doppelpunkt_in_Eintragsnamen()
    {
        var docx = await StandardvorlageAsync();

        Assert.DoesNotContain(DocxLeser.Eintraege(docx).Keys, n => n.Contains(':', StringComparison.Ordinal) || n.Contains("%3A", StringComparison.OrdinalIgnoreCase));
    }

    // ---------- Rev. 8: AK-5 (AK-10 Punkt 8 und 9, AK-14) ----------

    [Fact]
    public async Task Standardvorlage_hat_kein_unqualifiziertes_Attribut_an_WordprocessingML_Elementen()
    {
        Assert.Empty(DocxLeser.UnqualifizierteWordprocessingMlAttribute(await StandardvorlageAsync()));
    }

    [Fact]
    public async Task Standardvorlage_hat_kein_mc_Attribut_ausser_den_fuenf_erlaubten()
    {
        Assert.Empty(DocxLeser.UnbekannteMcAttribute(await StandardvorlageAsync()));
    }

    [Fact]
    public async Task Standardvorlage_enthaelt_keine_Konfliktmarkierung()
    {
        Assert.Empty(DocxLeser.Konfliktmarkierungen(await StandardvorlageAsync()));
    }
}
