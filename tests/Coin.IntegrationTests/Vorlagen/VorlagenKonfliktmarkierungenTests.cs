using System.Net;
using System.Net.Http.Json;
using Coin.Domain.Vorlagen;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.Extensions.DependencyInjection;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 8, AK-14 (QA-Review 6, Befund 1, F8): Konfliktmarkierungen beim gemeinsamen
/// Bearbeiten im erlaubten Namespace <c>w14</c> (<c>conflictIns</c>, <c>conflictDel</c>, <c>customXmlConflict…Range…</c>)
/// tragen Autorennamen und gelten als nachverfolgte Änderungen: genau die Meldung „Die Vorlage enthält nachverfolgte
/// Änderungen. …“, in allen XML-Teilen, unabhängig von der Verschachtelung. Beide Formen von <c>conflictIns</c>/
/// <c>conflictDel</c> (Container mit Läufen und leere Markierung in <c>w:pPr/w:rPr</c> bzw. <c>w:trPr</c>) und auch ein
/// einzelnes <c>…RangeEnd</c> sind Befunde. <c>w14:conflictMode</c> in <c>settings.xml</c> allein ist kein Befund.
/// </summary>
public class VorlagenKonfliktmarkierungenTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string W14 = "http://schemas.microsoft.com/office/word/2010/wordml";

    /// <summary>Eindeutiger Testname (keine echte Person); darf weder im Download noch im Log stehen.</summary>
    public const string KonfliktAutor = "Konfliktautor Kf71";

    private const string Aenderung = $"w:id=\"31\" w:author=\"{KonfliktAutor}\" w:date=\"2026-10-01T00:00:00Z\"";

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

    // ---------- Formen (Testplan Befund 1, Fälle 1 bis 10) ----------

    public static TheoryData<string> Formen =>
    [
        "1 conflictIns mit Lauf im Absatz",
        "2 conflictDel mit Lauf im Absatz",
        "3 conflictIns in w:pPr/w:rPr",
        "4 conflictDel in w:pPr/w:rPr",
        "5 conflictIns in w:trPr",
        "6 conflictDel in w:trPr",
        "7 customXmlConflictInsRangeStart und -End",
        "8 customXmlConflictDelRangeStart und -End",
        "9 nur customXmlConflictInsRangeEnd",
        "10 nur customXmlConflictDelRangeEnd",
    ];

    private static string Tabellenzeile(string trPr) =>
        "<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/></w:tblPr><w:tblGrid><w:gridCol w:w=\"4531\"/></w:tblGrid>" +
        $"<w:tr>{(trPr.Length == 0 ? string.Empty : $"<w:trPr>{trPr}</w:trPr>")}<w:tc><w:tcPr><w:tcW w:w=\"4531\" w:type=\"dxa\"/></w:tcPr>{Text("Zelle")}</w:tc></w:tr></w:tbl>";

    private static string Absatzmarke(string rPr) => $"<w:p><w:pPr><w:rPr>{rPr}</w:rPr></w:pPr>{Run("Absatz")}</w:p>";

    /// <summary>
    /// Block für den Körper eines Story-Teils mit der Form <paramref name="form"/>. Ohne Markierung
    /// (<paramref name="mitMarkierung"/> = false) entsteht derselbe Block ohne das <c>w14</c>-Element (Gegenprobe).
    /// </summary>
    public static string Block(string form, bool mitMarkierung = true) => form switch
    {
        "1 conflictIns mit Lauf im Absatz" => mitMarkierung
            ? P($"<w14:conflictIns {Aenderung}>{Run("eingefügt")}</w14:conflictIns>")
            : P(Run("eingefügt")),
        "2 conflictDel mit Lauf im Absatz" => mitMarkierung
            ? P($"<w14:conflictDel {Aenderung}><w:r><w:delText>gelöscht</w:delText></w:r></w14:conflictDel>")
            : P(Run("gelöscht")),
        "3 conflictIns in w:pPr/w:rPr" => Absatzmarke(mitMarkierung ? $"<w14:conflictIns {Aenderung}/>" : string.Empty),
        "4 conflictDel in w:pPr/w:rPr" => Absatzmarke(mitMarkierung ? $"<w14:conflictDel {Aenderung}/>" : string.Empty),
        "5 conflictIns in w:trPr" => Tabellenzeile(mitMarkierung ? $"<w14:conflictIns {Aenderung}/>" : string.Empty),
        "6 conflictDel in w:trPr" => Tabellenzeile(mitMarkierung ? $"<w14:conflictDel {Aenderung}/>" : string.Empty),
        "7 customXmlConflictInsRangeStart und -End" => mitMarkierung
            ? P($"<w14:customXmlConflictInsRangeStart {Aenderung}/>", Run("Bereich"), "<w14:customXmlConflictInsRangeEnd w:id=\"31\"/>")
            : P(Run("Bereich")),
        "8 customXmlConflictDelRangeStart und -End" => mitMarkierung
            ? P($"<w14:customXmlConflictDelRangeStart {Aenderung}/>", Run("Bereich"), "<w14:customXmlConflictDelRangeEnd w:id=\"31\"/>")
            : P(Run("Bereich")),
        "9 nur customXmlConflictInsRangeEnd" => mitMarkierung
            ? P(Run("Bereich"), "<w14:customXmlConflictInsRangeEnd w:id=\"31\"/>")
            : P(Run("Bereich")),
        "10 nur customXmlConflictDelRangeEnd" => mitMarkierung
            ? P(Run("Bereich"), "<w14:customXmlConflictDelRangeEnd w:id=\"31\"/>")
            : P(Run("Bereich")),
        _ => throw new ArgumentOutOfRangeException(nameof(form), form, null),
    };

    [Theory]
    [MemberData(nameof(Formen))]
    public async Task Konfliktmarkierung_im_Hauptteil_ergibt_genau_die_Meldung_nachverfolgte_Aenderungen(string form)
    {
        var datei = Gueltig().Absaetze(Block(form)).Bytes();

        Assert.Equal([NachverfolgteAenderungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Theory]
    [MemberData(nameof(Formen))]
    public async Task Gegenprobe_derselbe_Block_ohne_Konfliktmarkierung_wird_angenommen(string form)
    {
        await AngenommenAsync(Gueltig().Absaetze(Block(form, mitMarkierung: false)).Bytes());
    }

    [Theory]
    [MemberData(nameof(Formen))]
    public void Gegenprobe_Testdatei_enthaelt_die_Konfliktmarkierung_im_w14_Namespace(string form)
    {
        Assert.NotEmpty(DocxLeser.Konfliktmarkierungen(Gueltig().Absaetze(Block(form)).Bytes()));
    }

    [Fact]
    public async Task Konfliktmarkierung_im_Koerper_der_Standardvorlage_ergibt_die_Meldung_nachverfolgte_Aenderungen()
    {
        var standard = await StandardvorlageAsync();
        var block = $"<w:p><w14:conflictIns xmlns:w14=\"{W14}\" {Aenderung}>{Run("eingefügt")}</w14:conflictIns></w:p>";
        var datei = DocxLeser.ErsetzeInEintrag(standard, "word/document.xml", "<w:sectPr", block + "<w:sectPr");

        Assert.Equal([NachverfolgteAenderungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    // ---------- Weitere Stellen (Fall 1) ----------

    public static TheoryData<string> Stellen => ["styles.xml", "Kopfzeile", "mc:Fallback", "verwaister application/xml-Teil"];

    private static byte[] Fall1An(string stelle)
    {
        var fall1 = Block("1 conflictIns mit Lauf im Absatz");
        var bauer = Gueltig();
        switch (stelle)
        {
            case "styles.xml":
                bauer.Stile("<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Standard\"><w:name w:val=\"Normal\"/></w:style>" + fall1);
                break;
            case "Kopfzeile":
                bauer.Kopfzeile("default", fall1);
                break;
            case "mc:Fallback":
                bauer.Absaetze(P(
                    "<mc:AlternateContent><mc:Choice Requires=\"w14\">" + Run("neu") + "</mc:Choice>" +
                    $"<mc:Fallback><w14:conflictIns {Aenderung}>{Run("eingefügt")}</w14:conflictIns></mc:Fallback></mc:AlternateContent>"));
                break;
            case "verwaister application/xml-Teil":
                bauer.Teil("word/waise.xml", "application/xml", XmlKopf + $"<w:waise {Namensraeume}>{fall1}</w:waise>");
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(stelle), stelle, null);
        }

        return bauer.Bytes();
    }

    [Theory]
    [MemberData(nameof(Stellen))]
    public async Task Konfliktmarkierung_an_weiterer_Stelle_ergibt_die_Meldung_nachverfolgte_Aenderungen(string stelle)
    {
        Assert.Equal([NachverfolgteAenderungen], await AbgelehntOhneSpeichernAsync(Fall1An(stelle)));
    }

    [Theory]
    [MemberData(nameof(Stellen))]
    public void Gegenprobe_Testdatei_enthaelt_die_Konfliktmarkierung_an_der_genannten_Stelle(string stelle)
    {
        var teil = stelle switch
        {
            "styles.xml" => "word/styles.xml",
            "Kopfzeile" => "word/header1.xml",
            "verwaister application/xml-Teil" => "word/waise.xml",
            _ => "word/document.xml",
        };

        Assert.Contains($"{teil}: w14:conflictIns", DocxLeser.Konfliktmarkierungen(Fall1An(stelle)));
    }

    [Fact]
    public async Task Konfliktmarkierung_und_Kommentar_ergeben_beide_Meldungen_Aenderungen_zuerst()
    {
        var bauer = Gueltig().Absaetze(Block("1 conflictIns mit Lauf im Absatz"), Testvorlagen.KommentarVerweis());
        Testvorlagen.MitKommentarTeil(basis: bauer);

        Assert.Equal([NachverfolgteAenderungen, Kommentare], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Konfliktmodus_in_den_Einstellungen_allein_wird_angenommen()
    {
        await AngenommenAsync(Gueltig().Einstellungen("<w14:conflictMode/>").Bytes());
    }

    [Fact]
    public async Task Konfliktmarkierung_und_fremder_Namespace_im_selben_Teil_ergeben_nur_die_Erweiterungsmeldung()
    {
        var datei = Gueltig().Absaetze(Block("1 conflictIns mit Lauf im Absatz"), P("<w:r><x:zusatz xmlns:x=\"urn:example:fremd\"/></w:r>")).Bytes();

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    // ---------- Nachprüfung (AK-16) umfasst die Konfliktmarkierungen ----------

    private sealed class BereinigungMitKonfliktmarkierung : IDocxBereinigung
    {
        public byte[] Bereinigen(byte[] inhalt) =>
            Gueltig().Absaetze(Block("1 conflictIns mit Lauf im Absatz")).KernEigenschaften("<dc:creator>C.O.I.N.</dc:creator>").Bytes();
    }

    [Fact]
    public async Task Nachpruefung_lehnt_bereinigte_Datei_mit_Konfliktmarkierung_ab()
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Dienste = dienste => dienste.AddSingleton<IDocxBereinigung>(new BereinigungMitKonfliktmarkierung()),
        });
        using var client = factory.CreateClient();
        using var coin = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin($"Coin Nachpruefung {Guid.NewGuid():N}"));
        var coinId = (await JsonAsync(coin)).GetProperty("id").GetGuid();

        using var antwort = await PostVersionAsync(client, coinId, Gueltig().Bytes());

        Assert.Equal(
            ["Die Datei konnte nicht verarbeitet werden. Bitte in Word erneut als Word-Dokument (.docx) speichern und erneut hochladen."],
            await DateiFehlerAsync(antwort));
    }
}
