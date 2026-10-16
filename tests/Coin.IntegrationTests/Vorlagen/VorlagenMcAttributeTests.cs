using System.Net;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 8, AK-10 „Namespace-Positivliste“ Punkt 9 (QA-Review 6, Hinweis 3, Annahme A35):
/// Jedes Attribut im <c>mc</c>-Namespace außer <c>mc:Ignorable</c>, <c>mc:MustUnderstand</c>, <c>mc:ProcessContent</c>,
/// <c>mc:PreserveElements</c> und <c>mc:PreserveAttributes</c> → „kein .docx“ (auch qualifiziertes
/// <c>mc:Requires</c>). Punkt 3 (Hinweis 5, Annahme A36): Präfixe in <c>mc:</c>-Werten werden im Gültigkeitsbereich
/// des tragenden Elements aufgelöst; Einträge werden an <c>char.IsWhiteSpace</c> getrennt (auch NBSP).
/// </summary>
public class VorlagenMcAttributeTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string Fremd = "urn:example:fremd";
    private const string W15 = "http://schemas.microsoft.com/office/word/2012/wordml";

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

    private static string Alternative(string choiceAttribute) =>
        P($"<w:r><mc:AlternateContent><mc:Choice {choiceAttribute}><w:t>A</w:t></mc:Choice><mc:Fallback><w:t>B</w:t></mc:Fallback></mc:AlternateContent></w:r>");

    // ---------- Punkt 9: unbekannte mc-Attribute ----------

    public static TheoryData<string> UnbekannteMcAttribute =>
    [
        "mc:Choice Requires=wps mc:Requires=x",
        "mc:Choice mc:Requires=wps ohne Requires",
        "mc:Choice Requires=wps mc:Requires=wps",
        "w:p mc:Foo",
        "mc:AlternateContent mc:Bar leer",
    ];

    private static byte[] MitUnbekanntemMcAttribut(string fall) => fall switch
    {
        "mc:Choice Requires=wps mc:Requires=x" => Dokument($"xmlns:x=\"{Fremd}\"", Alternative("Requires=\"wps\" mc:Requires=\"x\"")).Bytes(),
        "mc:Choice mc:Requires=wps ohne Requires" => Gueltig().Absaetze(Alternative("mc:Requires=\"wps\"")).Bytes(),
        "mc:Choice Requires=wps mc:Requires=wps" => Gueltig().Absaetze(Alternative("Requires=\"wps\" mc:Requires=\"wps\"")).Bytes(),
        "w:p mc:Foo" => Gueltig().Absaetze($"<w:p mc:Foo=\"1\">{Run("Text")}</w:p>").Bytes(),
        "mc:AlternateContent mc:Bar leer" => Gueltig().Absaetze(P(
            "<w:r><mc:AlternateContent mc:Bar=\"\"><mc:Choice Requires=\"wps\"><w:t>A</w:t></mc:Choice><mc:Fallback><w:t>B</w:t></mc:Fallback></mc:AlternateContent></w:r>")).Bytes(),
        _ => throw new ArgumentOutOfRangeException(nameof(fall), fall, null),
    };

    [Theory]
    [MemberData(nameof(UnbekannteMcAttribute))]
    public async Task Unbekanntes_mc_Attribut_ist_kein_Word_Dokument(string fall)
    {
        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(MitUnbekanntemMcAttribut(fall)));
    }

    [Theory]
    [MemberData(nameof(UnbekannteMcAttribute))]
    public void Gegenprobe_Testdatei_enthaelt_ein_unbekanntes_mc_Attribut(string fall)
    {
        Assert.NotEmpty(DocxLeser.UnbekannteMcAttribute(MitUnbekanntemMcAttribut(fall)));
    }

    [Fact]
    public async Task Gegenprobe_mc_Choice_mit_unqualifiziertem_Requires_wps_wird_angenommen()
    {
        await AngenommenAsync(Gueltig().Absaetze(Alternative("Requires=\"wps\"")).Bytes());
    }

    [Fact]
    public async Task Die_fuenf_erlaubten_mc_Attribute_mit_erlaubten_Praefixen_werden_angenommen()
    {
        var datei = Dokument(
            "mc:MustUnderstand=\"w14\" mc:ProcessContent=\"w14:*\" mc:PreserveElements=\"w14:a\" mc:PreserveAttributes=\"w14:b\"",
            $"<w:p mc:Ignorable=\"w14\">{Run("Text")}</w:p>").Bytes();

        await AngenommenAsync(datei);
    }

    [Fact]
    public async Task Unbekanntes_mc_Attribut_und_fremder_Namespace_ergeben_nur_kein_Word_Dokument()
    {
        var datei = Gueltig().Absaetze($"<w:p mc:Foo=\"1\">{Run("Text")}</w:p>", P($"<w:r><x:zusatz xmlns:x=\"{Fremd}\"/></w:r>")).Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Unbekanntes_mc_Attribut_und_unqualifiziertes_Attribut_ergeben_nur_kein_Word_Dokument()
    {
        var datei = Gueltig().Absaetze($"<w:p mc:Foo=\"1\" foo=\"1\">{Run("Text")}</w:p>").Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Unbekanntes_mc_Attribut_und_eingeschmuggeltes_vbaProject_ergeben_nur_kein_Word_Dokument()
    {
        var datei = Gueltig().Absaetze($"<w:p mc:Foo=\"1\">{Run("Text")}</w:p>").RohEintrag("word/vbaProject.bin", [0xCC, 0x61, 0xFF, 0xFF, 0x00]).Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task Unbekanntes_mc_Attribut_in_einem_verwaisten_Teil_ist_kein_Word_Dokument()
    {
        var datei = Gueltig().Teil("word/waise.xml", "application/xml",
            XmlKopf + $"<w:waise xmlns:w=\"{DocxLeser.W.NamespaceName}\" xmlns:mc=\"{DocxLeser.McNamespace}\" mc:Requires=\"w\"/>").Bytes();

        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(datei));
    }

    // ---------- Punkt 3 (Hinweis 5): Gültigkeitsbereich und Leerraum ----------

    /// <summary>Hauptteil, dessen Wurzel <c>mc:Ignorable</c> = <paramref name="ignorable"/> trägt; <paramref name="koerperZusatz"/> steht im Start-Tag von <c>w:body</c>.</summary>
    private static byte[] MitIgnorable(string ignorable, string koerperZusatz = "", string wurzelZusatz = "") => new DocxBauer
    {
        DokumentInhalt = XmlKopf +
            $"<w:document {Namensraeume.Replace("mc:Ignorable=\"w14\"", $"mc:Ignorable=\"{ignorable}\"", StringComparison.Ordinal)} {wurzelZusatz}>" +
            $"<w:body {koerperZusatz}>{string.Concat(PflichtAbsaetze)}<w:sectPr/></w:body></w:document>",
    }.Bytes();

    [Fact]
    public async Task Praefix_in_mc_Ignorable_das_erst_an_einem_Kind_deklariert_ist_ist_kein_Word_Dokument()
    {
        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(MitIgnorable("w15", koerperZusatz: $"xmlns:w15=\"{W15}\"")));
    }

    [Fact]
    public async Task Gegenprobe_Praefix_in_mc_Ignorable_an_der_Wurzel_deklariert_wird_angenommen()
    {
        await AngenommenAsync(MitIgnorable("w15", wurzelZusatz: $"xmlns:w15=\"{W15}\""));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Neudeklaration_von_w14_mit_fremdem_URI_am_tragenden_Element_ergibt_die_Erweiterungsmeldung(bool mitKind)
    {
        var kind = mitKind ? "<w:r><w14:zusatz/></w:r>" : string.Empty;
        var datei = Gueltig().Absaetze($"<w:p xmlns:w14=\"{Fremd}\" mc:Ignorable=\"w14\">{Run("Text")}{kind}</w:p>").Bytes();

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(datei));
    }

    [Fact]
    public async Task NBSP_mitten_in_einem_nicht_deklarierten_Praefix_ist_kein_Word_Dokument()
    {
        Assert.Equal([KeinDocx], await AbgelehntOhneSpeichernAsync(MitIgnorable("w1&#xA0;4")));
    }

    [Fact]
    public async Task NBSP_als_Trenner_zwischen_deklarierten_Praefixen_an_der_Word_365_Wurzel_wird_angenommen()
    {
        var datei = DocxLeser.ErsetzeInEintrag(Word365Nachbildung.Word365(), "word/document.xml",
            $"mc:Ignorable=\"{Word365Nachbildung.Ignorable}\"", "mc:Ignorable=\"w14&#xA0;w15\"");

        await AngenommenAsync(datei);
    }

    [Fact]
    public void Gegenprobe_Word_365_Wurzel_trennt_w14_und_w15_mit_NBSP()
    {
        var datei = DocxLeser.ErsetzeInEintrag(Word365Nachbildung.Word365(), "word/document.xml",
            $"mc:Ignorable=\"{Word365Nachbildung.Ignorable}\"", "mc:Ignorable=\"w14&#xA0;w15\"");

        var wurzel = DocxLeser.Xml(datei, "word/document.xml").Root!;

        Assert.Equal("w14 w15", (string?)wurzel.Attribute(System.Xml.Linq.XName.Get("Ignorable", DocxLeser.McNamespace)));
    }
}
