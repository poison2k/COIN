using System.Xml.Linq;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 3, AK-5 und AK-6: Die Standardvorlage ist auch nach den erweiterten Regeln bereits
/// bereinigt (keine <c>TitlesOfParts</c>/<c>HeadingPairs</c>, kein <c>w:permStart</c> mit <c>w:ed</c>, keine verwaisten
/// Teile; die Bereinigung entfernt keinen Teil). Die CORS-Policy gibt <c>Content-Disposition</c> für den
/// Frontend-Ursprung frei, damit das Frontend den Dateinamen lesen kann.
/// </summary>
public class StandardvorlageHaertungTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private static readonly XNamespace W = DocxLeser.W;
    private static readonly XNamespace Ep = DocxLeser.Ep;
    private static readonly XNamespace Rel = "http://schemas.openxmlformats.org/package/2006/relationships";

    private static string[] Werte(HttpResponseMessage antwort, string header) =>
        antwort.Headers.TryGetValues(header, out var werte)
            ? werte.SelectMany(w => w.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)).ToArray()
            : [];

    /// <summary>Teile, die vom Paketstamm über interne Beziehungen erreichbar sind (unabhängig vom Produktivcode).</summary>
    private static HashSet<string> ErreichbareTeile(byte[] docx)
    {
        var eintraege = DocxLeser.Eintraege(docx);
        var erreichbar = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var offen = new Queue<string>([string.Empty]);
        while (offen.Count > 0)
        {
            var quelle = offen.Dequeue();
            var verzeichnis = quelle.Contains('/', StringComparison.Ordinal) ? quelle[..quelle.LastIndexOf('/')] : string.Empty;
            var rels = quelle.Length == 0
                ? "_rels/.rels"
                : $"{(verzeichnis.Length == 0 ? string.Empty : verzeichnis + "/")}_rels/{quelle[(quelle.LastIndexOf('/') + 1)..]}.rels";
            if (!eintraege.TryGetValue(rels, out var inhalt))
            {
                continue;
            }

            var xml = XDocument.Load(new MemoryStream(inhalt));
            foreach (var beziehung in xml.Root!.Elements(Rel + "Relationship"))
            {
                if (string.Equals((string?)beziehung.Attribute("TargetMode"), "External", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var ziel = (string)beziehung.Attribute("Target")!;
                List<string> teile = ziel.StartsWith('/') || verzeichnis.Length == 0 ? [] : [.. verzeichnis.Split('/')];
                foreach (var stueck in ziel.TrimStart('/').Split('/'))
                {
                    if (stueck == "..")
                    {
                        teile.RemoveAt(teile.Count - 1);
                    }
                    else if (stueck != ".")
                    {
                        teile.Add(stueck);
                    }
                }

                var name = string.Join('/', teile);
                if (erreichbar.Add(name))
                {
                    offen.Enqueue(name);
                }
            }
        }

        return erreichbar;
    }

    [Fact]
    public async Task App_Eigenschaften_enthalten_weder_TitlesOfParts_noch_HeadingPairs()
    {
        var docx = await StandardvorlageAsync();

        if (DocxLeser.Eintraege(docx).ContainsKey("docProps/app.xml"))
        {
            var app = DocxLeser.Xml(docx, "docProps/app.xml");
            Assert.Empty(app.Descendants(Ep + "TitlesOfParts"));
            Assert.Empty(app.Descendants(Ep + "HeadingPairs"));
        }
    }

    [Fact]
    public async Task Es_gibt_kein_permStart_mit_w_ed()
    {
        var docx = await StandardvorlageAsync();

        foreach (var teil in DocxLeser.Eintraege(docx).Keys.Where(n => n.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)))
        {
            Assert.Empty(DocxLeser.Xml(docx, teil).Descendants().Attributes(W + "ed"));
        }
    }

    [Fact]
    public async Task Es_gibt_keine_verwaisten_Teile()
    {
        var docx = await StandardvorlageAsync();

        var teile = DocxLeser.Eintraege(docx).Keys
            .Where(n => n != "[Content_Types].xml" && !n.EndsWith(".rels", StringComparison.OrdinalIgnoreCase) && !n.EndsWith('/'));
        Assert.Subset(ErreichbareTeile(docx), teile.ToHashSet(StringComparer.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Bereinigung_entfernt_an_der_Standardvorlage_keinen_Teil()
    {
        var standard = await StandardvorlageAsync();
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId, standard);

        var bereinigt = await LadeAsync(AktiveDateiUrl(coinId));

        Assert.Equal(
            DocxLeser.Eintraege(standard).Keys.Order(StringComparer.Ordinal),
            DocxLeser.Eintraege(bereinigt).Keys.Order(StringComparer.Ordinal));
    }

    // ---------- AK-6: CORS gibt Content-Disposition frei ----------

    [Fact]
    public async Task Download_vom_Frontend_Ursprung_gibt_Content_Disposition_frei()
    {
        using var anfrage = new HttpRequestMessage(HttpMethod.Get, StandardUrl);
        anfrage.Headers.Add("Origin", CoinApiFactory.FrontendUrsprung);

        using var antwort = await Client.SendAsync(anfrage);

        Assert.Contains("Content-Disposition", Werte(antwort, "Access-Control-Expose-Headers"), StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Download_von_fremdem_Ursprung_bekommt_keinen_Expose_Header()
    {
        using var anfrage = new HttpRequestMessage(HttpMethod.Get, StandardUrl);
        anfrage.Headers.Add("Origin", "http://localhost:5999");

        using var antwort = await Client.SendAsync(anfrage);

        Assert.Empty(Werte(antwort, "Access-Control-Expose-Headers"));
    }

    [Fact]
    public async Task Download_der_aktiven_Datei_vom_Frontend_Ursprung_gibt_Content_Disposition_frei()
    {
        var coinId = await CoinAsync();
        using var anfrage = new HttpRequestMessage(HttpMethod.Get, AktiveDateiUrl(coinId));
        anfrage.Headers.Add("Origin", CoinApiFactory.FrontendUrsprung);

        using var antwort = await Client.SendAsync(anfrage);

        Assert.Contains("Content-Disposition", Werte(antwort, "Access-Control-Expose-Headers"), StringComparer.OrdinalIgnoreCase);
    }
}
