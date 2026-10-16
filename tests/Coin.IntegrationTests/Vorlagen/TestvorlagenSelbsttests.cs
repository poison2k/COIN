using Coin.IntegrationTests.Infrastruktur;
using DocumentFormat.OpenXml.Packaging;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Absicherung der Testdateien selbst (ohne API): Die als gültig gedachten Dateien lassen sich mit dem OpenXML SDK
/// öffnen und sind für den <c>OpenXmlValidator</c> fehlerfrei, und die Absatztexte enthalten die verteilten
/// Platzhalter. Sonst würden die Tests zu AK-15/AK-16 aus dem falschen Grund rot.
/// </summary>
public class TestvorlagenSelbsttests
{
    public static TheoryData<string> GueltigeDateien =>
        ["gueltig", "Kopf- und Fusszeilen", "Fuss- und Endnote", "verschachtelte Tabelle", "Textfeld", "Inhaltssteuerelement", "Hyperlink", "Feldergebnis", "Bild"];

    private static byte[] Datei(string art) => art switch
    {
        "gueltig" => Gueltig().Bytes(),
        "Kopf- und Fusszeilen" => Testvorlagen.OhneCoinName().Kopfzeile("default", Testvorlagen.GeteilterCoinName).Kopfzeile("first", Text("x")).Fusszeile("even", Text("y")).Bytes(),
        "Fuss- und Endnote" => Testvorlagen.OhneCoinName().Fussnote(Testvorlagen.GeteilterCoinName).Endnote(Text("z")).Bytes(),
        "verschachtelte Tabelle" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.VerschachtelteTabelle(Testvorlagen.GeteilterCoinName), "<w:p/>").Bytes(),
        "Textfeld" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.TextfeldAlternateContent(Testvorlagen.GeteilterCoinName)).Bytes(),
        "Inhaltssteuerelement" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.SdtBlock(Testvorlagen.GeteilterCoinName)).Bytes(),
        "Hyperlink" => Testvorlagen.MitHyperlink().Bytes(),
        "Feldergebnis" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.Feldergebnis(Testvorlagen.GeteilterCoinNameRuns)).Bytes(),
        "Bild" => Testvorlagen.MitBild().Bytes(),
        _ => throw new ArgumentOutOfRangeException(nameof(art), art, null),
    };

    [Theory]
    [MemberData(nameof(GueltigeDateien))]
    public void Gueltige_Testdatei_laesst_sich_mit_dem_SDK_oeffnen(string art)
    {
        using var dokument = WordprocessingDocument.Open(new MemoryStream(Datei(art)), false);

        Assert.NotNull(dokument.MainDocumentPart?.Document?.Body);
    }

    [Theory]
    [MemberData(nameof(GueltigeDateien))]
    public void Gueltige_Testdatei_ist_fuer_den_Validator_fehlerfrei(string art)
    {
        Assert.Empty(DocxLeser.ValidatorFehler(Datei(art)));
    }

    [Theory]
    [MemberData(nameof(GueltigeDateien))]
    public void Gueltige_Testdatei_enthaelt_Coin_Name_in_einem_Absatztext(string art)
    {
        Assert.Contains(DocxLeser.Absatztexte(Datei(art)), t => t.Contains("{{Coin.Name}}", StringComparison.Ordinal));
    }

    [Fact]
    public void Datei_mit_genauer_Groesse_hat_genau_5_MiB()
    {
        Assert.Equal(5_242_880, Testvorlagen.MitGenauerGroesse(5_242_880).Length);
    }
}
