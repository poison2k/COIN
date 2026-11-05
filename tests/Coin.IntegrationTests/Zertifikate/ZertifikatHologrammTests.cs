using System.Net;
using System.Net.Http.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Zertifikate;

/// <summary>
/// Feature hologrammnummer, AK-23 und AK-24 (Abschnitt 7, H11): Platzhalter <c>{{Zertifikat.Hologrammnummer}}</c> –
/// Wert ist die Anzeigeform der aktuellen Nummer (nach Korrektur die neue), leer ohne Nummer; die Standardvorlage
/// enthält den Absatz „Hologramm Nr. …“ direkt nach „Zertifikat Nr. …“, ohne Nummer bleibt die Beschriftung stehen;
/// Uploads mit dem Platzhalter werden angenommen, bestehende Vorlagen ohne ihn erzeugen unverändert.
/// </summary>
public class ZertifikatHologrammTests(PostgresFixture fixture) : ZertifikatTestBasis(fixture)
{
    private const string Koerper = "word/document.xml";

    private static string HologrammUrl(Guid coinId, Guid ausgabeId) => $"{AusgabeUrl(coinId, ausgabeId)}/hologrammnummer";

    private static Dictionary<string, object?> MitNummer(string? nummer)
    {
        var body = GueltigeAusgabe();
        body["hologrammnummer"] = nummer;
        return body;
    }

    /// <summary>Absatztexte des Körpers ohne Präfix des Story-Teils.</summary>
    private static List<string> KoerperTexte(byte[] docx) =>
        [.. DocxLeser.Absatztexte(docx).Where(t => t.StartsWith($"{Koerper}: ", StringComparison.Ordinal)).Select(t => t[(Koerper.Length + 2)..])];

    // ---------- AK-24: Standardvorlage ----------

    [Fact]
    public async Task Standard_Zertifikat_mit_Nummer_enthaelt_Hologramm_Nr_mit_der_Anzeigeform()
    {
        var k = await AusgabeAsync(ausgabe: MitNummer("ab 12-34"));

        Assert.Contains("Hologramm Nr. AB 12-34", KoerperTexte(await ZertifikatAsync(k)));
    }

    [Fact]
    public async Task Standard_Zertifikat_ohne_Nummer_behaelt_die_Beschriftung_mit_leerem_Wert()
    {
        var k = await AusgabeAsync(ausgabe: MitNummer(null));

        Assert.Contains(KoerperTexte(await ZertifikatAsync(k)), t => t.TrimEnd() == "Hologramm Nr.");
    }

    [Fact]
    public async Task Hologramm_Absatz_folgt_direkt_auf_den_Absatz_mit_der_Zertifikatsnummer()
    {
        var k = await AusgabeAsync(ausgabe: MitNummer("AB1234"));

        var texte = KoerperTexte(await ZertifikatAsync(k));
        var index = texte.IndexOf($"Zertifikat Nr. {k.Nummer}");

        Assert.True(index >= 0, "Absatz „Zertifikat Nr. …“ fehlt.");
        Assert.True(index + 1 < texte.Count, "Nach „Zertifikat Nr. …“ folgt kein Absatz (AK-24).");
        Assert.Equal("Hologramm Nr. AB1234", texte[index + 1]);
    }

    [Fact]
    public async Task Fusszeile_bleibt_ohne_Hologrammnummer()
    {
        var k = await AusgabeAsync(ausgabe: MitNummer("AB1234"));

        var fusszeilen = DocxLeser.Absatztexte(await ZertifikatAsync(k)).Where(t => t.StartsWith("word/footer", StringComparison.Ordinal)).ToList();

        Assert.NotEmpty(fusszeilen);
        Assert.DoesNotContain(fusszeilen, t => t.Contains("Hologramm", StringComparison.Ordinal) || t.Contains("AB1234", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Standard_Zertifikat_enthaelt_keinen_Platzhalter_mehr()
    {
        var k = await AusgabeAsync(ausgabe: MitNummer(null));

        Assert.DoesNotContain(DocxLeser.Absatztexte(await ZertifikatAsync(k)), t => t.Contains("{{", StringComparison.Ordinal));
    }

    // ---------- AK-23: Wert der aktuellen Nummer ----------

    [Fact]
    public async Task Nach_dem_Ergaenzen_enthaelt_das_Zertifikat_die_Nummer()
    {
        var k = await AusgabeAsync(ausgabe: MitNummer(null));
        using (var put = await Client.PutAsJsonAsync(HologrammUrl(k.CoinId, k.AusgabeId), new { hologrammnummer = "ef 90-12" }))
        {
            Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        }

        Assert.Contains("Hologramm Nr. EF 90-12", KoerperTexte(await ZertifikatAsync(k)));
    }

    [Fact]
    public async Task Nach_der_Korrektur_enthaelt_das_Zertifikat_die_neue_und_nicht_die_alte_Nummer()
    {
        var k = await AusgabeAsync(ausgabe: MitNummer("AB1243"));
        using (var put = await Client.PutAsJsonAsync(
            HologrammUrl(k.CoinId, k.AusgabeId), new { hologrammnummer = "AB1234", grund = "Tippfehler", bisherige = "AB1243" }))
        {
            Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        }

        var gesamt = string.Join("\n", DocxLeser.Absatztexte(await ZertifikatAsync(k)));

        Assert.Contains("Hologramm Nr. AB1234", gesamt, StringComparison.Ordinal);
        Assert.DoesNotContain("AB1243", gesamt, StringComparison.Ordinal);
    }

    // ---------- AK-23: eigene Vorlagen ----------

    [Fact]
    public async Task Vorlage_mit_dem_Platzhalter_wird_angenommen()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var vorlage = DocxBauer.Mit([.. DocxBauer.PflichtAbsaetze, DocxBauer.Text("Sticker {{Zertifikat.Hologrammnummer}}")]).Bytes();

        using var antwort = await PostVersionAsync(Client, coinId, vorlage);

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Eigene_Vorlage_mit_dem_Platzhalter_erhaelt_die_Anzeigeform()
    {
        var coinId = await CoinMitAuflageAsync(10);
        await LadeVorlageHochAsync(coinId, DocxBauer.Mit([.. DocxBauer.PflichtAbsaetze, DocxBauer.Text("Sticker {{Zertifikat.Hologrammnummer}}")]).Bytes());
        var k = await AusgabeZuAsync(coinId, ausgabe: MitNummer("ab 12-34"));

        Assert.Contains("Sticker AB 12-34", KoerperTexte(await ZertifikatAsync(k)));
    }

    [Fact]
    public async Task Eigene_Vorlage_mit_dem_Platzhalter_ohne_Nummer_laesst_die_Stelle_leer()
    {
        var coinId = await CoinMitAuflageAsync(10);
        await LadeVorlageHochAsync(coinId, DocxBauer.Mit([.. DocxBauer.PflichtAbsaetze, DocxBauer.Text("Sticker [{{Zertifikat.Hologrammnummer}}]")]).Bytes());
        var k = await AusgabeZuAsync(coinId, ausgabe: MitNummer(null));

        Assert.Contains("Sticker []", KoerperTexte(await ZertifikatAsync(k)));
    }

    [Fact]
    public async Task Bestehende_Vorlage_ohne_den_Platzhalter_erzeugt_mit_und_ohne_Nummer_dieselben_Absaetze()
    {
        var coinId = await CoinMitAuflageAsync(10);
        await LadeVorlageHochAsync(coinId, DocxBauer.Mit([.. DocxBauer.PflichtAbsaetze, DocxBauer.Text("Vorlage ohne Hologramm Hv71")]).Bytes());
        var k = await AusgabeZuAsync(coinId, exemplar: 4, ausgabe: MitNummer(null));
        var ohne = DocxLeser.Absatztexte(await ZertifikatAsync(k));

        using (var put = await Client.PutAsJsonAsync(HologrammUrl(k.CoinId, k.AusgabeId), new { hologrammnummer = "AB1234" }))
        {
            Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        }

        Assert.Equal(ohne, DocxLeser.Absatztexte(await ZertifikatAsync(k)));
    }

    [Fact]
    public async Task Bestehende_Vorlage_ohne_den_Platzhalter_erzeugt_byte_gleiche_Story_Teile()
    {
        var coinId = await CoinMitAuflageAsync(10);
        await LadeVorlageHochAsync(coinId, DocxBauer.Mit([.. DocxBauer.PflichtAbsaetze, DocxBauer.Text("Vorlage ohne Hologramm Hv72")]).Bytes());
        var k = await AusgabeZuAsync(coinId, ausgabe: MitNummer(null));
        var ohne = DocxLeser.Eintraege(await ZertifikatAsync(k));

        using (var put = await Client.PutAsJsonAsync(HologrammUrl(k.CoinId, k.AusgabeId), new { hologrammnummer = "AB1234" }))
        {
            Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        }

        var mit = DocxLeser.Eintraege(await ZertifikatAsync(k));
        Assert.Equal(ohne[Koerper], mit[Koerper]);
    }
}
