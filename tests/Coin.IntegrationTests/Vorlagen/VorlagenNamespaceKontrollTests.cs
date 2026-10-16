using System.Net;
using System.Text;
using System.Xml.Linq;
using Coin.Domain.Vorlagen;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 7/8, Kontrollfälle der Namespace-Positivliste (Testplan „Kontrollfälle, angenommen“,
/// AK-10, AK-16 (l), Hinweis c, ADR-0026): typische Word-365- und LibreOffice-Dateien werden angenommen; der Download
/// enthält nur Namespaces aus der Positivliste und kein <c>:</c> bzw. <c>%3A</c> in Eintragsnamen oder internen Zielen.
/// <c>Override</c>/<c>Default</c> in <c>[Content_Types].xml</c> zählen nur mit vollem Namen. Rev. 8: Die Nachbildungen
/// und ihr Download tragen an WordprocessingML-Elementen keine unqualifizierten Attribute (AK-10 Punkt 8, AK-16 l).
/// </summary>
public class VorlagenNamespaceKontrollTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private static readonly XNamespace Ct = "http://schemas.openxmlformats.org/package/2006/content-types";
    private static readonly XNamespace Rel = "http://schemas.openxmlformats.org/package/2006/relationships";

    private async Task<Guid> AngenommenAsync(byte[] datei)
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, datei);

        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"{(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return coinId;
    }

    private static IEnumerable<string> NichtErlaubteNamespaces(byte[] docx) =>
        DocxLeser.VerwendeteNamespaces(docx).Where(e => !WordNamespaces.IstErlaubt(e[(e.IndexOf(": ", StringComparison.Ordinal) + 2)..]));

    private static IEnumerable<string> DoppelpunktInNamenOderZielen(byte[] docx)
    {
        var eintraege = DocxLeser.Eintraege(docx);
        foreach (var name in eintraege.Keys.Where(n => n.Contains(':', StringComparison.Ordinal) || n.Contains("%3A", StringComparison.OrdinalIgnoreCase)))
        {
            yield return $"Eintrag {name}";
        }

        foreach (var (name, inhalt) in eintraege.Where(e => e.Key.EndsWith(".rels", StringComparison.OrdinalIgnoreCase)))
        {
            foreach (var beziehung in XDocument.Load(new MemoryStream(inhalt)).Root!.Elements(Rel + "Relationship"))
            {
                var ziel = (string?)beziehung.Attribute("Target") ?? string.Empty;
                if ((string?)beziehung.Attribute("TargetMode") != "External"
                    && (ziel.Contains(':', StringComparison.Ordinal) || ziel.Contains("%3A", StringComparison.OrdinalIgnoreCase)))
                {
                    yield return $"{name}: {ziel}";
                }
            }
        }
    }

    // ---------- (a) Standardvorlage ----------

    [Fact]
    public async Task Standardvorlage_wird_angenommen()
    {
        await AngenommenAsync(await StandardvorlageAsync());
    }

    // ---------- (b) Word 365 ----------

    [Fact]
    public void Word_365_Nachbildung_ist_fuer_den_Validator_fehlerfrei()
    {
        Assert.Empty(DocxLeser.ValidatorFehler(Word365Nachbildung.Word365()));
    }

    [Fact]
    public void Word_365_Nachbildung_deklariert_nicht_erlaubte_Namespaces_ohne_sie_zu_verwenden()
    {
        var datei = Word365Nachbildung.Word365();
        var dokument = Encoding.UTF8.GetString(DocxLeser.Eintraege(datei)["word/document.xml"]);

        Assert.Contains("xmlns:cx8=", dokument, StringComparison.Ordinal);
        Assert.Contains("xmlns:asvg=", dokument, StringComparison.Ordinal);
        Assert.Empty(NichtErlaubteNamespaces(datei));
    }

    [Fact]
    public void Word_365_Nachbildung_enthaelt_PNG_und_JPEG_aber_kein_SVG()
    {
        var eintraege = DocxLeser.Eintraege(Word365Nachbildung.Word365()).Keys;

        Assert.Contains("word/media/image1.png", eintraege);
        Assert.Contains("word/media/image2.jpeg", eintraege);
        Assert.DoesNotContain(eintraege, n => n.EndsWith(".svg", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Word_365_Nachbildung_wird_angenommen()
    {
        await AngenommenAsync(Word365Nachbildung.Word365());
    }

    [Fact]
    public async Task Download_der_Word_365_Nachbildung_verwendet_nur_Namespaces_aus_der_Positivliste()
    {
        var coinId = await AngenommenAsync(Word365Nachbildung.Word365());

        Assert.Empty(NichtErlaubteNamespaces(await LadeAsync(AktiveDateiUrl(coinId))));
    }

    [Fact]
    public async Task Download_der_Word_365_Nachbildung_enthaelt_keinen_Doppelpunkt_in_Namen_oder_Zielen()
    {
        var coinId = await AngenommenAsync(Word365Nachbildung.Word365());

        Assert.Empty(DoppelpunktInNamenOderZielen(await LadeAsync(AktiveDateiUrl(coinId))));
    }

    [Fact]
    public void Word_365_Nachbildung_hat_kein_unqualifiziertes_Attribut_an_WordprocessingML_Elementen()
    {
        Assert.Empty(DocxLeser.UnqualifizierteWordprocessingMlAttribute(Word365Nachbildung.Word365()));
    }

    [Fact]
    public async Task Download_der_Word_365_Nachbildung_hat_kein_unqualifiziertes_Attribut_an_WordprocessingML_Elementen()
    {
        var coinId = await AngenommenAsync(Word365Nachbildung.Word365());

        Assert.Empty(DocxLeser.UnqualifizierteWordprocessingMlAttribute(await LadeAsync(AktiveDateiUrl(coinId))));
    }

    [Fact]
    public async Task Download_der_Word_365_Nachbildung_hat_kein_mc_Attribut_ausser_den_fuenf_erlaubten()
    {
        var coinId = await AngenommenAsync(Word365Nachbildung.Word365());

        Assert.Empty(DocxLeser.UnbekannteMcAttribute(await LadeAsync(AktiveDateiUrl(coinId))));
    }

    // ---------- (c) LibreOffice ----------

    [Fact]
    public void LibreOffice_Nachbildung_ist_fuer_den_Validator_fehlerfrei()
    {
        Assert.Empty(DocxLeser.ValidatorFehler(Word365Nachbildung.LibreOffice()));
    }

    [Fact]
    public async Task LibreOffice_Nachbildung_wird_angenommen()
    {
        await AngenommenAsync(Word365Nachbildung.LibreOffice());
    }

    [Fact]
    public async Task Download_der_LibreOffice_Nachbildung_verwendet_nur_Namespaces_aus_der_Positivliste()
    {
        var coinId = await AngenommenAsync(Word365Nachbildung.LibreOffice());

        Assert.Empty(NichtErlaubteNamespaces(await LadeAsync(AktiveDateiUrl(coinId))));
    }

    [Fact]
    public async Task Download_der_LibreOffice_Nachbildung_enthaelt_keinen_Doppelpunkt_in_Namen_oder_Zielen()
    {
        var coinId = await AngenommenAsync(Word365Nachbildung.LibreOffice());

        Assert.Empty(DoppelpunktInNamenOderZielen(await LadeAsync(AktiveDateiUrl(coinId))));
    }

    [Fact]
    public void LibreOffice_Nachbildung_hat_kein_unqualifiziertes_Attribut_an_WordprocessingML_Elementen()
    {
        Assert.Empty(DocxLeser.UnqualifizierteWordprocessingMlAttribute(Word365Nachbildung.LibreOffice()));
    }

    [Fact]
    public async Task Download_der_LibreOffice_Nachbildung_hat_kein_unqualifiziertes_Attribut_an_WordprocessingML_Elementen()
    {
        var coinId = await AngenommenAsync(Word365Nachbildung.LibreOffice());

        Assert.Empty(DocxLeser.UnqualifizierteWordprocessingMlAttribute(await LadeAsync(AktiveDateiUrl(coinId))));
    }

    // ---------- Hinweis c: Content-Types nach vollem Namen ----------

    private const string DrawingMl = "http://schemas.openxmlformats.org/drawingml/2006/main";

    /// <summary>
    /// <c>Override</c>/<c>Default</c> mit den Attributen des Content-Types-Namespace, aber im Namespace
    /// <paramref name="uri"/> (Präfix <paramref name="praefix"/>). Rev. 8: Für „angenommen“ ein erlaubter Namespace
    /// außerhalb der WordprocessingML-Menge (DrawingML <c>a</c>), weil unqualifizierte Attribute an <c>w:</c>-Elementen
    /// ein Befund sind (AK-10 Punkt 8).
    /// </summary>
    private static byte[] MitFremdenContentTypeElementen(string praefix = "a", string uri = DrawingMl)
    {
        var bauer = Testvorlagen.MitBild();
        bauer.ContentTypesZusatz =
            $"<{praefix}:Override xmlns:{praefix}=\"{uri}\" PartName=\"/word/document.xml\" ContentType=\"{MakroHauptteilTyp}\"/>" +
            $"<{praefix}:Default xmlns:{praefix}=\"{uri}\" Extension=\"png\" ContentType=\"{HeaderTyp}\"/>";
        return bauer.Bytes();
    }

    [Fact]
    public async Task Override_und_Default_in_fremdem_Namespace_werden_uebergangen_und_die_Datei_angenommen()
    {
        await AngenommenAsync(MitFremdenContentTypeElementen());
    }

    [Fact]
    public async Task Override_und_Default_im_w_Namespace_mit_unqualifizierten_Attributen_ergeben_die_Erweiterungsmeldung()
    {
        var coinId = await CoinAsync();
        var vorher = await SpeicherZustandAsync(coinId);

        var meldungen = await AbgelehntAsync(coinId, MitFremdenContentTypeElementen("w", DocxLeser.W.NamespaceName));

        Assert.Equal([Erweiterungen], meldungen);
        Assert.Equal(vorher, await SpeicherZustandAsync(coinId));
    }

    [Fact]
    public async Task Download_behaelt_die_Bedeutung_der_echten_Content_Types()
    {
        var coinId = await AngenommenAsync(MitFremdenContentTypeElementen());
        var typen = DocxLeser.Xml(await LadeAsync(AktiveDateiUrl(coinId)), "[Content_Types].xml").Root!;

        var hauptteil = typen.Elements(Ct + "Override").Single(o => (string?)o.Attribute("PartName") == "/word/document.xml");
        var png = typen.Elements(Ct + "Default").Single(d => string.Equals((string?)d.Attribute("Extension"), "png", StringComparison.OrdinalIgnoreCase));

        Assert.Equal(HauptteilTyp, (string?)hauptteil.Attribute("ContentType"));
        Assert.Equal("image/png", (string?)png.Attribute("ContentType"));
    }
}
