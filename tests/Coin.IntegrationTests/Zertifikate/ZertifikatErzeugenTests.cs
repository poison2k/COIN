using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Xml.Linq;
using Coin.IntegrationTests.Infrastruktur;
using Coin.IntegrationTests.Vorlagen;
using DocumentFormat.OpenXml.Packaging;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-8 bis AK-14 (ADR-0028) über die API: Testvorlage hochladen, Ausgabe erfassen,
/// Zertifikat herunterladen. Jeder Platzhalter an jeder Stelle wird ersetzt (Fließtext, verschachtelte Tabelle, Kopf- und
/// Fußzeile, Fuß- und Endnote, Textfeld in <c>mc:Choice</c> und <c>mc:Fallback</c>, Steuerelement, Hyperlink,
/// Feldergebnis, über Runs verteilt); Formatierung des ersten Runs; Werte als Text; übrige Teile byte-gleich; Vorlage
/// unverändert; Standardvorlage als Zertifikatsfassung; Grenze von 200 Vorkommen.
/// </summary>
public class ZertifikatErzeugenTests(PostgresFixture fixture) : ZertifikatTestBasis(fixture)
{
    private static readonly XNamespace W = DocxLeser.W;

    private const string CoinName = "Zertifikat Coin Zx01";
    private const string Herausgeber = "Zertifikat Herausgeber Zx02";
    private const string Beschreibung = "Zertifikat Beschreibung Zx03";
    private const string Empfaenger = "Zertifikat Empfänger Zx04";
    private const string Dienstgrad = "Zertifikat Dienstgrad Zx05";
    private const string Dienststelle = "Zertifikat Dienststelle Zx06";
    private const string Gelegenheit = "Zertifikat Gelegenheit Zx07";
    private const string Begruendung = "Zertifikat Begründung Zx08";
    private const string Stelle = "Zertifikat Stelle Zx09";

    /// <summary>Ein Durchlauf: gespeicherte Vorlage (<c>null</c> = Standardvorlage), Zertifikat und erwartete Werte.</summary>
    private sealed record Lauf(ZertifikatKontext K, byte[]? Vorlage, byte[] Zertifikat, Dictionary<string, string> Werte, int? Version);

    private static Dictionary<string, object?> Ausgabe() =>
        GueltigeAusgabe(12, Empfaenger, Dienstgrad, Dienststelle, Datum, Gelegenheit, Begruendung, Stelle);

    /// <summary>Coin mit Auflage 1500 anlegen, Vorlage hochladen (optional), Exemplar 12 ausgeben, Zertifikat laden.</summary>
    private async Task<Lauf> ErzeugeAsync(byte[]? vorlage, Action<Dictionary<string, object?>>? aendern = null)
    {
        var coinId = (await LegeCoinAnAsync(CoinName, Herausgeber, 1500, Beschreibung)).GetProperty("id").GetGuid();
        int? version = vorlage is null ? null : await LadeVorlageHochAsync(coinId, vorlage);
        var gespeichert = version is { } v ? await GespeicherteVersionAsync(coinId, v) : null;
        var body = Ausgabe();
        aendern?.Invoke(body);
        var k = await AusgabeZuAsync(coinId, 12, body);
        var zertifikat = await ZertifikatAsync(k);
        var werte = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["Coin.Name"] = CoinName, ["Exemplar.Nummer"] = "12", ["Zertifikat.Nummer"] = k.Nummer,
            ["Empfaenger.Name"] = Empfaenger, ["Coin.Herausgeber"] = Herausgeber, ["Coin.Beschreibung"] = Beschreibung,
            ["Coin.Auflage"] = "1500", ["Empfaenger.Dienstgrad"] = Dienstgrad, ["Empfaenger.Dienststelle"] = Dienststelle,
            ["Ausgabe.Datum"] = "01.10.2026", ["Ausgabe.Gelegenheit"] = Gelegenheit, ["Ausgabe.Begruendung"] = Begruendung,
            ["Ausgabe.AusgebendeStelle"] = Stelle,
        };
        return new Lauf(k, gespeichert, zertifikat, werte, version);
    }

    private Task<Lauf> JedeStelleAsync() => ErzeugeAsync(Zertifikatvorlagen.JedeStelle().Bytes());

    private static string Text(XElement element) => string.Concat(element.Descendants(W + "t").Select(t => t.Value));

    private static IEnumerable<XElement> Absaetze(byte[] docx, string teil = "word/document.xml") =>
        DocxLeser.Xml(docx, teil).Descendants(W + "p");

    // ---------- AK-9, AK-13: jede Stelle ----------

    [Fact]
    public void Testvorlage_besteht_die_eigene_Absatzpruefung_mit_jedem_Platzhalter_an_jeder_Stelle()
    {
        var texte = DocxLeser.Absatztexte(Zertifikatvorlagen.JedeStelle().Bytes());

        Assert.All(Zertifikatvorlagen.Orte, o => Assert.Contains(texte, t => t.StartsWith(o.Teil, StringComparison.Ordinal)
            && t.EndsWith(Zertifikatvorlagen.AlleText(o.Ort), StringComparison.Ordinal)));
    }

    [Fact]
    public async Task Testvorlage_wird_beim_Upload_angenommen()
    {
        var coinId = await LegeCoinAnUndLiefereIdAsync("Coin Testvorlage Jede Stelle");

        using var antwort = await PostVersionAsync(Client, coinId, Zertifikatvorlagen.JedeStelle().Bytes());

        Assert.True(antwort.StatusCode == HttpStatusCode.Created, await antwort.Content.ReadAsStringAsync());
    }

    public static TheoryData<string, string> Orte()
    {
        var daten = new TheoryData<string, string>();
        foreach (var (ort, teil) in Zertifikatvorlagen.Orte)
        {
            daten.Add(ort, teil);
        }

        return daten;
    }

    [Theory]
    [MemberData(nameof(Orte))]
    public async Task Alle_Platzhalter_werden_an_der_Stelle_ersetzt(string ort, string teil)
    {
        var lauf = await JedeStelleAsync();

        var texte = DocxLeser.Absatztexte(lauf.Zertifikat);

        Assert.Contains(texte, t => t.StartsWith(teil, StringComparison.Ordinal)
            && t.EndsWith(": " + Zertifikatvorlagen.AlleErwartet(ort, lauf.Werte), StringComparison.Ordinal));
    }

    [Fact]
    public async Task Textfeld_wird_in_Choice_und_Fallback_ersetzt()
    {
        var lauf = await JedeStelleAsync();
        var erwartet = Zertifikatvorlagen.AlleErwartet("Textfeld", lauf.Werte);

        var treffer = Absaetze(lauf.Zertifikat).Where(p => Text(p) == erwartet).ToList();

        Assert.Equal(2, treffer.Count);
        Assert.Contains(treffer, p => p.Ancestors().Any(a => a.Name.LocalName == "Choice"));
        Assert.Contains(treffer, p => p.Ancestors().Any(a => a.Name.LocalName == "Fallback"));
    }

    [Fact]
    public async Task Danach_steht_in_keinem_Story_Teil_ein_Katalog_Platzhalter()
    {
        var lauf = await JedeStelleAsync();

        var reste = DocxLeser.Absatztexte(lauf.Zertifikat)
            .Where(t => Zertifikatvorlagen.Namen.Any(n => t.Contains($"{{{{{n}}}}}", StringComparison.Ordinal)))
            .ToList();

        Assert.Empty(reste);
    }

    [Fact]
    public async Task Danach_enthaelt_kein_Absatz_mehr_doppelte_geschweifte_Klammern()
    {
        var lauf = await JedeStelleAsync();

        Assert.DoesNotContain(DocxLeser.Absatztexte(lauf.Zertifikat), t => t.Contains("{{", StringComparison.Ordinal) || t.Contains("}}", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Ergebnis_laesst_sich_mit_WordprocessingDocument_Open_laden()
    {
        var lauf = await JedeStelleAsync();

        using var dokument = WordprocessingDocument.Open(new MemoryStream(lauf.Zertifikat), false);

        Assert.NotNull(dokument.MainDocumentPart?.Document?.Body);
    }

    [Fact]
    public async Task OpenXmlValidator_meldet_keine_Fehler_die_die_Vorlage_nicht_schon_hatte()
    {
        var lauf = await JedeStelleAsync();
        var vorher = DocxLeser.ValidatorFehler(lauf.Vorlage!).Select(Beschreibung).ToHashSet(StringComparer.Ordinal);

        var neu = DocxLeser.ValidatorFehler(lauf.Zertifikat).Select(Beschreibung).Where(f => !vorher.Contains(f)).ToList();

        Assert.Empty(neu);

        static string Beschreibung(string fehler) => fehler[(fehler.IndexOf(": ", StringComparison.Ordinal) + 2)..];
    }

    // ---------- AK-9: was nicht verändert wird ----------

    [Fact]
    public async Task Glossar_bleibt_byte_gleich()
    {
        var lauf = await JedeStelleAsync();

        Assert.Equal(DocxLeser.Eintraege(lauf.Vorlage!)["word/glossary/document.xml"], DocxLeser.Eintraege(lauf.Zertifikat)["word/glossary/document.xml"]);
    }

    [Fact]
    public async Task Glossar_enthaelt_den_Platzhalter_weiterhin()
    {
        var lauf = await JedeStelleAsync();

        Assert.Contains(Zertifikatvorlagen.Glossartext, Text(DocxLeser.Xml(lauf.Zertifikat, "word/glossary/document.xml").Root!), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Feldanweisungen_bleiben_unveraendert()
    {
        var lauf = await JedeStelleAsync();

        static List<string> Anweisungen(byte[] docx) => DocxLeser.Xml(docx, "word/document.xml").Descendants(W + "instrText").Select(e => e.Value).ToList();

        Assert.Equal(Anweisungen(lauf.Vorlage!), Anweisungen(lauf.Zertifikat));
    }

    [Fact]
    public async Task Alias_und_Tag_eines_Steuerelements_bleiben_unveraendert()
    {
        var lauf = await JedeStelleAsync();

        static List<string?> Attribute(byte[] docx) => DocxLeser.Xml(docx, "word/document.xml").Descendants()
            .Where(e => e.Name == W + "alias" || e.Name == W + "tag")
            .Select(e => (string?)e.Attribute(W + "val"))
            .ToList();

        Assert.Equal(Attribute(lauf.Vorlage!), Attribute(lauf.Zertifikat));
    }

    [Fact]
    public async Task Alternativtexte_bleiben_unveraendert()
    {
        var lauf = await JedeStelleAsync();
        XNamespace wp = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";

        List<string> Attribute(byte[] docx) => DocxLeser.Xml(docx, "word/document.xml").Descendants(wp + "docPr")
            .SelectMany(e => e.Attributes().Select(a => $"{a.Name}={a.Value}"))
            .ToList();

        Assert.Equal(Attribute(lauf.Vorlage!), Attribute(lauf.Zertifikat));
    }

    [Fact]
    public async Task Story_Teil_ohne_Platzhalter_bleibt_byte_gleich()
    {
        var lauf = await JedeStelleAsync();
        var vorlage = DocxLeser.Eintraege(lauf.Vorlage!);
        var teil = Assert.Single(vorlage, e => Encoding.UTF8.GetString(e.Value).Contains(Zertifikatvorlagen.OhnePlatzhalter, StringComparison.Ordinal)).Key;

        Assert.Equal(vorlage[teil], DocxLeser.Eintraege(lauf.Zertifikat)[teil]);
    }

    [Fact]
    public async Task Alle_anderen_ZIP_Eintraege_sind_byte_gleich()
    {
        var lauf = await JedeStelleAsync();
        var vorlage = DocxLeser.Eintraege(lauf.Vorlage!);
        var ergebnis = DocxLeser.Eintraege(lauf.Zertifikat);
        var geschichten = DocxLeser.GepruefteTeile(lauf.Vorlage!).ToHashSet(StringComparer.Ordinal);

        var abweichend = vorlage.Keys
            .Where(n => !geschichten.Contains(n))
            .Where(n => !ergebnis.TryGetValue(n, out var neu) || !neu.AsSpan().SequenceEqual(vorlage[n]))
            .ToList();

        Assert.Empty(abweichend);
    }

    [Fact]
    public async Task ZIP_Eintraege_stehen_in_derselben_Reihenfolge()
    {
        var lauf = await JedeStelleAsync();

        static List<string> Namen(byte[] docx)
        {
            using var zip = new System.IO.Compression.ZipArchive(new MemoryStream(docx), System.IO.Compression.ZipArchiveMode.Read);
            return zip.Entries.Select(e => e.FullName).ToList();
        }

        Assert.Equal(Namen(lauf.Vorlage!), Namen(lauf.Zertifikat));
    }

    [Fact]
    public async Task Dokumenteigenschaften_bleiben_byte_gleich_und_ohne_Werte_der_Ausgabe()
    {
        var lauf = await JedeStelleAsync();
        var vorlage = DocxLeser.Eintraege(lauf.Vorlage!);
        var ergebnis = DocxLeser.Eintraege(lauf.Zertifikat);

        var eigenschaften = ergebnis.Where(e => e.Key.StartsWith("docProps/", StringComparison.Ordinal)).ToList();

        Assert.All(eigenschaften, e => Assert.Equal(vorlage[e.Key], e.Value));
        Assert.All(eigenschaften, e => Assert.DoesNotContain("Zx0", Encoding.UTF8.GetString(e.Value), StringComparison.Ordinal));
        Assert.All(eigenschaften, e => Assert.DoesNotContain(lauf.K.Nummer, Encoding.UTF8.GetString(e.Value), StringComparison.Ordinal));
    }

    [Fact]
    public async Task Gespeicherte_Vorlage_bleibt_byte_gleich()
    {
        var lauf = await JedeStelleAsync();
        var vorher = (await VorlageDb.VersionenAsync(lauf.K.CoinId)).Single();

        await ZertifikatAsync(lauf.K);

        var nachher = (await VorlageDb.VersionenAsync(lauf.K.CoinId)).Single();
        Assert.Equal(vorher.Sha256, nachher.Sha256);
        Assert.Equal(vorher.Inhalt, nachher.Inhalt);
        Assert.Equal(lauf.Vorlage, await GespeicherteVersionAsync(lauf.K.CoinId, lauf.Version!.Value));
    }

    // ---------- AK-10: Formatierung ----------

    private static XElement RunMit(byte[] docx, string text) =>
        Absaetze(docx).SelectMany(p => p.Elements(W + "r")).First(r => Text(r).Contains(text, StringComparison.Ordinal));

    private static bool Hat(XElement run, string eigenschaft) => run.Element(W + "rPr")?.Element(W + eigenschaft) is not null;

    [Fact]
    public async Task Wert_steht_im_ersten_Run_und_traegt_dessen_Formatierung()
    {
        var vorlage = Zertifikatvorlagen.MitAbsaetzen(P(
            Run("Vor {{Empfaenger.", "<w:b/><w:color w:val=\"FF0000\"/>"),
            Run("Name}} nach", "<w:i/>"))).Bytes();

        var lauf = await ErzeugeAsync(vorlage);
        var run = RunMit(lauf.Zertifikat, "Vor ");

        Assert.Equal("Vor " + Empfaenger, Text(run));
        Assert.True(Hat(run, "b"), "Wert nicht fett.");
        Assert.Equal("FF0000", (string?)run.Element(W + "rPr")!.Element(W + "color")!.Attribute(W + "val"));
        Assert.False(Hat(run, "i"), "Wert kursiv.");
    }

    [Fact]
    public async Task Text_nach_dem_Platzhalter_behaelt_seinen_Run_und_seine_Formatierung()
    {
        var vorlage = Zertifikatvorlagen.MitAbsaetzen(P(
            Run("Vor {{Empfaenger.", "<w:b/><w:color w:val=\"FF0000\"/>"),
            Run("Name}} nach", "<w:i/>"))).Bytes();

        var lauf = await ErzeugeAsync(vorlage);
        var absatz = Absaetze(lauf.Zertifikat).Single(p => Text(p).StartsWith("Vor ", StringComparison.Ordinal));
        var danach = absatz.Elements(W + "r").Single(r => Text(r) == " nach");

        Assert.True(Hat(danach, "i"));
        Assert.False(Hat(danach, "b"));
        Assert.Equal("Vor " + Empfaenger + " nach", Text(absatz));
    }

    [Fact]
    public async Task Ueber_Lesezeichen_und_Rechtschreibmarken_verteilter_Platzhalter_wird_im_ersten_Run_ersetzt()
    {
        var vorlage = Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.GeteilterCoinName).Bytes();

        var lauf = await ErzeugeAsync(vorlage);
        var run = RunMit(lauf.Zertifikat, CoinName);

        Assert.Equal(CoinName, Text(run));
        Assert.True(Hat(run, "b"));
        Assert.False(Hat(run, "i"));
        Assert.Contains(Absaetze(lauf.Zertifikat).Descendants(W + "bookmarkStart"), b => (string?)b.Attribute(W + "name") == "Marke");
    }

    [Fact]
    public async Task Verteilte_Platzhalter_stehen_in_den_fetten_Runs_und_die_kursiven_Runs_sind_leer()
    {
        var lauf = await JedeStelleAsync();
        var absatz = Absaetze(lauf.Zertifikat).Single(p => Text(p).StartsWith("Ort Verteilt: ", StringComparison.Ordinal));

        var kursiv = absatz.Elements(W + "r").Where(r => Hat(r, "i")).Select(Text).ToList();
        var fett = absatz.Elements(W + "r").Where(r => Hat(r, "b")).Select(Text).ToList();

        Assert.All(kursiv, t => Assert.Equal(string.Empty, t));
        Assert.Equal(Zertifikatvorlagen.Namen.Select(n => lauf.Werte[n]), fett);
    }

    // ---------- AK-11: Werte als Text ----------

    private const string SonderName = "Jürgen Öztürk-Weiß & <Söhne> \"Ä\" 'ß' € 😀";

    private static readonly string LangeBegruendung = Begruendungstext();

    private static string Begruendungstext()
    {
        var anfang = "Zeile 1\r\nZeile 2\nTab\tEnde\u0001X";
        return anfang + new string('b', 2000 - anfang.Length);
    }

    private Task<Lauf> SonderzeichenAsync() =>
        ErzeugeAsync(
            Zertifikatvorlagen.MitAbsaetzen(
                DocxBauer.Text("Name: {{Empfaenger.Name}}"),
                DocxBauer.Text("Begründung: {{Ausgabe.Begruendung}}"),
                DocxBauer.Text("Gelegenheit: {{Ausgabe.Gelegenheit}}"),
                DocxBauer.Text("Stelle: {{Ausgabe.AusgebendeStelle}}")).Bytes(),
            body =>
            {
                body["empfaengerName"] = SonderName;
                body["begruendung"] = LangeBegruendung;
                body["gelegenheit"] = "{{Coin.Name}}";
                body["ausgebendeStelle"] = "Stelle mit   drei Leerzeichen und {{Zertifikat.Nummer}}";
            });

    [Fact]
    public async Task Umlaute_und_Sonderzeichen_im_Namen_erscheinen_unveraendert()
    {
        var lauf = await SonderzeichenAsync();

        Assert.Contains($"word/document.xml: Name: {SonderName}", DocxLeser.Absatztexte(lauf.Zertifikat));
    }

    [Fact]
    public async Task Wert_mit_Platzhalter_Coin_Name_steht_woertlich_im_Ergebnis()
    {
        var lauf = await SonderzeichenAsync();

        Assert.Contains("word/document.xml: Gelegenheit: {{Coin.Name}}", DocxLeser.Absatztexte(lauf.Zertifikat));
    }

    [Fact]
    public async Task Wert_mit_Platzhalter_Zertifikat_Nummer_steht_woertlich_und_mehrfache_Leerzeichen_bleiben()
    {
        var lauf = await SonderzeichenAsync();

        Assert.Contains("word/document.xml: Stelle: Stelle mit   drei Leerzeichen und {{Zertifikat.Nummer}}", DocxLeser.Absatztexte(lauf.Zertifikat));
    }

    [Fact]
    public async Task Begruendung_mit_2000_Zeichen_steht_vollstaendig_mit_Umbruechen_und_Tab_ohne_Steuerzeichen()
    {
        var lauf = await SonderzeichenAsync();

        var erwartet = "Zeile 1\nZeile 2\nTab\tEndeX" + new string('b', 2000 - "Zeile 1\r\nZeile 2\nTab\tEnde\u0001X".Length);
        Assert.Contains($"word/document.xml: Begründung: {erwartet}", DocxLeser.Absatztexte(lauf.Zertifikat));
    }

    [Fact]
    public async Task Zeilenumbrueche_werden_zu_w_br_und_Tab_zu_w_tab_im_Absatz_des_Werts()
    {
        var lauf = await SonderzeichenAsync();
        var absatz = Absaetze(lauf.Zertifikat).Single(p => Text(p).StartsWith("Begründung: ", StringComparison.Ordinal));

        Assert.Equal((2, 1), (absatz.Descendants(W + "br").Count(), absatz.Descendants(W + "tab").Count()));
        Assert.Single(absatz.Elements(W + "r"));
    }

    [Fact]
    public async Task Steuerzeichen_stehen_nicht_im_Dokument()
    {
        var lauf = await SonderzeichenAsync();

        Assert.DoesNotContain("\u0001", Encoding.UTF8.GetString(DocxLeser.Eintraege(lauf.Zertifikat)["word/document.xml"]), StringComparison.Ordinal);
        Assert.DoesNotContain("&#x1;", Encoding.UTF8.GetString(DocxLeser.Eintraege(lauf.Zertifikat)["word/document.xml"]), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Ergebnis_mit_Sonderzeichen_ist_wohlgeformt_und_ohne_neue_Validatorfehler()
    {
        var lauf = await SonderzeichenAsync();
        var vorher = DocxLeser.ValidatorFehler(lauf.Vorlage!).Count;

        Assert.Equal(vorher, DocxLeser.ValidatorFehler(lauf.Zertifikat).Count);
    }

    [Fact]
    public async Task Mehrfache_Leerzeichen_im_Wert_bleiben_auch_in_einem_w_t_ohne_preserve_erhalten()
    {
        var lauf = await ErzeugeAsync(
            Zertifikatvorlagen.MitAbsaetzen(P(Run("Leer:"), "<w:r><w:t>{{Empfaenger.Dienstgrad}}</w:t></w:r>", Run("Ende"))).Bytes(),
            body => body["empfaengerDienstgrad"] = "Dienstgrad   mit Lücken");

        var absatz = Absaetze(lauf.Zertifikat).Single(p => Text(p).StartsWith("Leer:", StringComparison.Ordinal));

        Assert.Equal("Leer:Dienstgrad   mit LückenEnde", Text(absatz));
    }

    // ---------- AK-12: Werte, Formate, leere Felder ----------

    [Fact]
    public async Task Datum_Auflage_und_Exemplar_haben_das_Format_aus_Abschnitt_4()
    {
        var lauf = await ErzeugeAsync(Zertifikatvorlagen.MitAbsaetzen(DocxBauer.Text("Formate: {{Ausgabe.Datum}} {{Coin.Auflage}} {{Exemplar.Nummer}}")).Bytes());

        Assert.Contains("word/document.xml: Formate: 01.10.2026 1500 12", DocxLeser.Absatztexte(lauf.Zertifikat));
    }

    [Fact]
    public async Task Leere_optionale_Felder_ergeben_leeren_Text()
    {
        var lauf = await ErzeugeAsync(
            Zertifikatvorlagen.MitAbsaetzen(DocxBauer.Text("[{{Empfaenger.Dienstgrad}}][{{Empfaenger.Dienststelle}}]")).Bytes(),
            body =>
            {
                body["empfaengerDienstgrad"] = null;
                body["empfaengerDienststelle"] = null;
            });

        Assert.Contains("word/document.xml: [][]", DocxLeser.Absatztexte(lauf.Zertifikat));
    }

    [Fact]
    public async Task Coin_Daten_im_Zertifikat_sind_der_aktuelle_Stand()
    {
        var lauf = await ErzeugeAsync(Zertifikatvorlagen.MitAbsaetzen(DocxBauer.Text("Aktuell: {{Coin.Name}} / {{Coin.Herausgeber}}")).Bytes());
        using (var put = await Client.PutAsJsonAsync($"{CoinsUrl}/{lauf.K.CoinId}",
            new { name = "Zertifikat Coin Umbenannt Zx10", herausgeber = "Zertifikat Herausgeber Neu Zx11", auflage = 1500, beschreibung = Beschreibung }))
        {
            Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        }

        var neu = await ZertifikatAsync(lauf.K);

        Assert.Contains("word/document.xml: Aktuell: Zertifikat Coin Umbenannt Zx10 / Zertifikat Herausgeber Neu Zx11", DocxLeser.Absatztexte(neu));
    }

    // ---------- AK-8, F7: Standardvorlage ----------

    [Fact]
    public async Task Ohne_eigene_Vorlage_entsteht_das_Zertifikat_aus_der_Standardvorlage_ohne_Erlaeuterung()
    {
        var lauf = await ErzeugeAsync(null);

        var texte = DocxLeser.Absatztexte(lauf.Zertifikat);

        Assert.Contains(texte, t => t.EndsWith(": Echtheitszertifikat", StringComparison.Ordinal));
        Assert.DoesNotContain(texte, t => t.Contains("Erläuterung der Platzhalter", StringComparison.Ordinal));
        Assert.DoesNotContain(texte, t => t.Contains("Dieser Abschnitt dient nur zur Information", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Standardvorlage_enthaelt_alle_Werte_und_keinen_Platzhalter()
    {
        var lauf = await ErzeugeAsync(null);
        var gesamt = string.Join("\n", DocxLeser.Absatztexte(lauf.Zertifikat));

        Assert.All(lauf.Werte.Values, w => Assert.Contains(w, gesamt, StringComparison.Ordinal));
        Assert.DoesNotContain("{{", gesamt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Standardvorlage_zeigt_die_Zertifikatsnummer_in_der_Fusszeile()
    {
        var lauf = await ErzeugeAsync(null);

        Assert.Contains(DocxLeser.Absatztexte(lauf.Zertifikat), t => t.StartsWith("word/footer", StringComparison.Ordinal) && t.Contains(lauf.K.Nummer, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Standardvorlage_zeigt_die_Dienststelle_in_einem_eigenen_Absatz()
    {
        var lauf = await ErzeugeAsync(null);
        var texte = DocxLeser.Absatztexte(lauf.Zertifikat);

        var name = texte.IndexOf($"word/document.xml: {Dienstgrad} {Empfaenger}");

        Assert.True(name >= 0, "Absatz „Dienstgrad Name“ fehlt.");
        Assert.Equal($"word/document.xml: {Dienststelle}", texte[name + 1]);
    }

    [Fact]
    public async Task Standardvorlage_ohne_Dienstgrad_und_Dienststelle_enthaelt_kein_Komma_mit_Leerzeichen()
    {
        var lauf = await ErzeugeAsync(null, body =>
        {
            body["empfaengerDienstgrad"] = null;
            body["empfaengerDienststelle"] = null;
        });

        Assert.DoesNotContain(DocxLeser.Absatztexte(lauf.Zertifikat), t => t.Contains(", ", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Standard_Zertifikat_besteht_den_OpenXmlValidator()
    {
        var lauf = await ErzeugeAsync(null);

        Assert.Empty(DocxLeser.ValidatorFehler(lauf.Zertifikat));
    }

    // ---------- AK-8: Vorlage ersetzen, zurücksetzen ----------

    [Fact]
    public async Task Nach_dem_Ersetzen_der_Vorlage_nutzt_der_naechste_Download_die_neue_mit_gleicher_Nummer()
    {
        var lauf = await ErzeugeAsync(Zertifikatvorlagen.MitAbsaetzen(DocxBauer.Text("Vorlage Version Eins")).Bytes());
        await LadeVorlageHochAsync(lauf.K.CoinId, Zertifikatvorlagen.MitAbsaetzen(DocxBauer.Text("Vorlage Version Zwei")).Bytes());

        var texte = DocxLeser.Absatztexte(await ZertifikatAsync(lauf.K));

        Assert.Contains("word/document.xml: Vorlage Version Zwei", texte);
        Assert.DoesNotContain("word/document.xml: Vorlage Version Eins", texte);
        Assert.Contains($"word/document.xml: Zertifikat Nr. {lauf.K.Nummer}", texte);
    }

    [Fact]
    public async Task Ersetzen_der_Vorlage_aendert_die_gespeicherte_Nummer_nicht()
    {
        var lauf = await ErzeugeAsync(Zertifikatvorlagen.MitAbsaetzen(DocxBauer.Text("Vorlage Version Eins")).Bytes());

        await LadeVorlageHochAsync(lauf.K.CoinId, Zertifikatvorlagen.MitAbsaetzen(DocxBauer.Text("Vorlage Version Zwei")).Bytes());
        await ZertifikatAsync(lauf.K);

        Assert.Equal(lauf.K.Nummer, await AusgabeDb.ZertifikatsnummerAsync(lauf.K.AusgabeId));
    }

    [Fact]
    public async Task Nach_dem_Zuruecksetzen_nutzt_der_naechste_Download_die_Standardvorlage()
    {
        var lauf = await ErzeugeAsync(Zertifikatvorlagen.MitAbsaetzen(DocxBauer.Text("Vorlage Version Eins")).Bytes());
        using (var zurueck = await Client.PostAsync(ZuruecksetzenUrl(lauf.K.CoinId), null))
        {
            Assert.Equal(HttpStatusCode.OK, zurueck.StatusCode);
        }

        var texte = DocxLeser.Absatztexte(await ZertifikatAsync(lauf.K));

        Assert.Contains(texte, t => t.EndsWith(": Echtheitszertifikat", StringComparison.Ordinal));
        Assert.DoesNotContain("word/document.xml: Vorlage Version Eins", texte);
    }

    [Fact]
    public async Task Fruehere_Version_wird_nicht_verwendet_nur_die_aktive()
    {
        var lauf = await ErzeugeAsync(Zertifikatvorlagen.MitAbsaetzen(DocxBauer.Text("Vorlage Version Eins")).Bytes());
        await LadeVorlageHochAsync(lauf.K.CoinId, Zertifikatvorlagen.MitAbsaetzen(DocxBauer.Text("Vorlage Version Zwei")).Bytes());
        await LadeVorlageHochAsync(lauf.K.CoinId, Zertifikatvorlagen.MitAbsaetzen(DocxBauer.Text("Vorlage Version Drei")).Bytes());

        var texte = DocxLeser.Absatztexte(await ZertifikatAsync(lauf.K));

        Assert.Equal(1, texte.Count(t => t.StartsWith("word/document.xml: Vorlage Version ", StringComparison.Ordinal)));
        Assert.Contains("word/document.xml: Vorlage Version Drei", texte);
    }

    // ---------- AK-14: Grenze 200 ----------

    [Fact]
    public async Task Gespeicherte_Version_mit_201_Vorkommen_liefert_409_vorlage_zu_viele_platzhalter()
    {
        var k = await AusgabeAsync(exemplar: 1);
        await VersionPerSqlAktivierenAsync(k.CoinId, Zertifikatvorlagen.MitVorkommen(201));

        using var antwort = await GetZertifikatAsync(k);

        await AssertZertifikatKonfliktAsync(antwort, "vorlage_zu_viele_platzhalter", DetailZuVielePlatzhalter);
    }

    [Fact]
    public async Task Gespeicherte_Version_mit_201_Vorkommen_schreibt_kein_Audit()
    {
        var k = await AusgabeAsync(exemplar: 1);
        await VersionPerSqlAktivierenAsync(k.CoinId, Zertifikatvorlagen.MitVorkommen(201));

        using (await GetZertifikatAsync(k))
        {
        }

        Assert.Equal(0L, await ZertifikatDb.AnzahlAsync());
    }

    [Fact]
    public async Task Gespeicherte_Version_mit_genau_200_Vorkommen_wird_erzeugt()
    {
        var k = await AusgabeAsync(exemplar: 1);
        await VersionPerSqlAktivierenAsync(k.CoinId, Zertifikatvorlagen.MitVorkommen(200));

        using var antwort = await GetZertifikatAsync(k);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Gespeicherte_Version_ueber_der_Grenze_bleibt_herunterladbar()
    {
        var k = await AusgabeAsync(exemplar: 1);
        var inhalt = Zertifikatvorlagen.MitVorkommen(201);
        await VersionPerSqlAktivierenAsync(k.CoinId, inhalt);

        Assert.Equal(inhalt, await GespeicherteVersionAsync(k.CoinId, 1));
    }

    [Fact]
    public async Task Upload_mit_201_Vorkommen_wird_mit_400_und_der_Grenzmeldung_abgelehnt()
    {
        var coinId = await LegeCoinAnUndLiefereIdAsync("Coin Grenze Upload");

        using var antwort = await PostVersionAsync(Client, coinId, Zertifikatvorlagen.MitVorkommen(201));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
        Assert.Equal([UploadZuVielePlatzhalter], json.GetProperty("errors").GetProperty("datei").EnumerateArray().Select(m => m.GetString()));
    }

    [Fact]
    public async Task Upload_mit_genau_200_Vorkommen_wird_angenommen()
    {
        var coinId = await LegeCoinAnUndLiefereIdAsync("Coin Grenze Upload 200");

        using var antwort = await PostVersionAsync(Client, coinId, Zertifikatvorlagen.MitVorkommen(200));

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Vorkommen_in_Kopf_und_Fusszeilen_zaehlen_beim_Upload_mit()
    {
        var coinId = await LegeCoinAnUndLiefereIdAsync("Coin Grenze Kopfzeile");
        var bauer = Mit([.. PflichtAbsaetze, .. Enumerable.Range(0, 196).Select(_ => DocxBauer.Text("{{Coin.Name}}"))]);
        bauer.Kopfzeile("default", DocxBauer.Text("{{Coin.Name}}"));

        using var antwort = await PostVersionAsync(Client, coinId, bauer.Bytes());

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        Assert.Contains(UploadZuVielePlatzhalter, await antwort.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Standardvorlage_liegt_deutlich_unter_der_Grenze()
    {
        using var antwort = await Client.GetAsync("/api/zertifikatsvorlagen/standard");
        var texte = DocxLeser.Absatztexte(await antwort.Content.ReadAsByteArrayAsync());

        var vorkommen = texte.Sum(t => Zertifikatvorlagen.Namen.Sum(n => (t.Length - t.Replace($"{{{{{n}}}}}", string.Empty, StringComparison.Ordinal).Length) / (n.Length + 4)));

        Assert.InRange(vorkommen, 13, 50);
    }
}
