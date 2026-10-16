using System.Net;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 8, Entscheidung F16 (AK-10 „Namespace-Positivliste“ Punkt 10 „Signaturzeilen“,
/// ADR-0026 Punkt 9): Vorlagen mit Signaturzeilen (VML-Element <c>o:signatureline</c> mit Name und E-Mail-Adresse des
/// vorgeschlagenen Unterzeichners) ergeben genau die Erweiterungsmeldung – an jeder Stelle, in jedem XML-Teil und
/// unabhängig von den Attributen. Jede Ablehnung speichert nichts (kein Audit).
/// </summary>
public class VorlagenSignaturzeilenTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string O = "urn:schemas-microsoft-com:office:office";
    private const string V = "urn:schemas-microsoft-com:vml";
    private const string S = "http://purl.oclc.org/ooxml/wordprocessingml/main";

    /// <summary>Eindeutige Testwerte (keine echte Person).</summary>
    private const string Unterzeichner = "Unterzeichner Sz71";
    private const string UnterzeichnerEmail = "sz72@example.invalid";

    private static string XmlKopf => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";

    /// <summary><c>o:signatureline</c> mit den Attributen, die Word beim Einfügen › Signaturzeile schreibt.</summary>
    private static string Signaturzeile =>
        "<o:signatureline v:ext=\"edit\" id=\"{3C1D2E4F-0000-4000-8000-0000000000A1}\" provid=\"{00000000-0000-0000-0000-000000000000}\" " +
        $"o:suggestedsigner=\"{Unterzeichner}\" o:suggestedsigner2=\"Leiter Testabteilung\" o:suggestedsigneremail=\"{UnterzeichnerEmail}\" " +
        "signinginstructions=\"Bitte unterschreiben\" issignatureline=\"t\"/>";

    /// <summary>
    /// Signaturzeile wie in Word: <c>w:pict/v:shape</c> mit Bild und <c>o:lock</c>; ohne <paramref name="zeile"/>
    /// (leer) entsteht dieselbe Form ohne Signaturzeile (Gegenprobe).
    /// </summary>
    private static string Pict(string ridBild, string zeile) =>
        "<w:pict><v:shapetype id=\"_x0000_t75\" coordsize=\"21600,21600\" o:spt=\"75\" o:preferrelative=\"t\" path=\"m@4@5l@4@11@9@11@9@5xe\" filled=\"f\" stroked=\"f\">" +
        "<v:stroke joinstyle=\"miter\"/><v:path o:extrusionok=\"f\" gradientshapeok=\"t\" o:connecttype=\"rect\"/><o:lock v:ext=\"edit\" aspectratio=\"t\"/></v:shapetype>" +
        "<v:shape id=\"_x0000_i1025\" type=\"#_x0000_t75\" alt=\"Signaturzeile\" style=\"width:192pt;height:96pt\">" +
        $"<v:imagedata r:id=\"{ridBild}\" o:title=\"\"/><o:lock v:ext=\"edit\" ungrouping=\"t\" rotation=\"t\" cropping=\"t\" verticies=\"t\" text=\"t\" grouping=\"t\"/>" +
        $"{zeile}</v:shape></w:pict>";

    private async Task<string[]> AbgelehntOhneSpeichernAsync(byte[] datei)
    {
        var coinId = await CoinAsync();
        var vorher = await SpeicherZustandAsync(coinId);

        var meldungen = await AbgelehntAsync(coinId, datei);

        Assert.Equal(vorher, await SpeicherZustandAsync(coinId));
        return meldungen;
    }

    /// <summary>Gültige Datei mit Bild im Hauptteil und <paramref name="absatz"/> (erhält die Bild-Id).</summary>
    private static DocxBauer MitBildImHauptteil(Func<string, string> absatz, params string[] weitere)
    {
        var bauer = Gueltig();
        var rid = bauer.DokumentTeil("media/image1.png", "image/png", RelImage, Testbilder.Png(64));
        return bauer.Absaetze([absatz(rid), .. weitere]);
    }

    // ---------- Fälle 1 bis 5 ----------

    public static TheoryData<string> Faelle =>
    [
        "1 w:pict/v:shape im Hauptteil",
        "2 Kopfzeile",
        "3 mc:Fallback",
        "4 verwaister application/xml-Teil",
        "5 ohne Attribute",
    ];

    private static byte[] MitSignaturzeile(string fall)
    {
        switch (fall)
        {
            case "1 w:pict/v:shape im Hauptteil":
                return MitBildImHauptteil(rid => P($"<w:r>{Pict(rid, Signaturzeile)}</w:r>")).Bytes();
            case "2 Kopfzeile":
            {
                var bauer = Gueltig().Kopfzeile("default", P($"<w:r>{Pict("rIdKopfBild", Signaturzeile)}</w:r>"));
                bauer.Beziehung("word/header1.xml", RelImage, "media/image1.png", id: "rIdKopfBild");
                bauer.Teil("word/media/image1.png", null, Testbilder.Png(64));
                return bauer.Bytes();
            }

            case "3 mc:Fallback":
                return MitBildImHauptteil(rid => P(
                    "<w:r><mc:AlternateContent><mc:Choice Requires=\"w14\"><w:t>Unterschrift</w:t></mc:Choice>" +
                    $"<mc:Fallback>{Pict(rid, Signaturzeile)}</mc:Fallback></mc:AlternateContent></w:r>")).Bytes();
            case "4 verwaister application/xml-Teil":
                return Gueltig().Teil("word/waise.xml", "application/xml",
                    XmlKopf + $"<w:waise xmlns:w=\"{DocxLeser.W.NamespaceName}\" xmlns:o=\"{O}\" xmlns:v=\"{V}\">{Signaturzeile}</w:waise>").Bytes();
            case "5 ohne Attribute":
                return MitBildImHauptteil(rid => P($"<w:r>{Pict(rid, "<o:signatureline/>")}</w:r>")).Bytes();
            default:
                throw new ArgumentOutOfRangeException(nameof(fall), fall, null);
        }
    }

    [Theory]
    [MemberData(nameof(Faelle))]
    public async Task Signaturzeile_ergibt_genau_die_Erweiterungsmeldung(string fall)
    {
        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(MitSignaturzeile(fall)));
    }

    [Theory]
    [MemberData(nameof(Faelle))]
    public void Gegenprobe_Testdatei_verwendet_nur_erlaubte_Namespaces_und_qualifizierte_Attribute_an_w_Elementen(string fall)
    {
        var datei = MitSignaturzeile(fall);
        var nichtErlaubt = DocxLeser.VerwendeteNamespaces(datei)
            .Where(e => !Coin.Domain.Vorlagen.WordNamespaces.IstErlaubt(e[(e.IndexOf(": ", StringComparison.Ordinal) + 2)..]));

        Assert.Empty(nichtErlaubt);
        Assert.Empty(DocxLeser.UnqualifizierteWordprocessingMlAttribute(datei));
    }

    // ---------- Reihenfolge ----------

    [Fact]
    public async Task Signaturzeile_und_DDE_Feld_ergeben_nur_die_Erweiterungsmeldung()
    {
        var datei = MitBildImHauptteil(rid => P($"<w:r>{Pict(rid, Signaturzeile)}</w:r>"), Testvorlagen.FeldMitAnweisung(" DDE excel x ")).Bytes();

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Signaturzeile_und_Strict_ergeben_nur_kein_Word_Dokument()
    {
        var datei = MitBildImHauptteil(rid => P($"<w:r>{Pict(rid, Signaturzeile)}</w:r>"),
            $"<w:p xmlns:s=\"{S}\" s:rsidR=\"00A1B2C3\">{Run("Text")}</w:p>").Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    // ---------- Gegenprobe ----------

    [Fact]
    public async Task Gegenprobe_v_shape_mit_o_lock_ohne_Signaturzeile_wird_angenommen()
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, MitBildImHauptteil(rid => P($"<w:r>{Pict(rid, string.Empty)}</w:r>")).Bytes());

        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"{(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
    }
}
