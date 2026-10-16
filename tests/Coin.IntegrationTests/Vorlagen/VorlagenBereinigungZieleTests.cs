using System.Net;
using System.Text;
using System.Xml.Linq;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 6 (nach QA-Review 4), AK-10 und AK-16 (j)/(k) (ADR-0024 Punkt 3, Hinweise 2 und 5):
/// Die Bereinigung schreibt interne <c>Target</c>-Werte in die Teilnamen-Normalform um. Rev. 7 (Hinweis a, A27):
/// ein <c>:</c> im dekodierten Teilnamen (<c>:</c>, <c>%3A</c>, <c>%3a</c> in Eintragsname, <c>PartName</c> oder
/// aufgelöstem internem Ziel) ist „kein .docx“; ein Rohwert <c>footer:1.xml</c> im Upload ist zudem ein Ziel mit Schema.
/// </summary>
public class VorlagenBereinigungZieleTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private static readonly XNamespace Rel = "http://schemas.openxmlformats.org/package/2006/relationships";

    private const string FusszeilenText = "Fußzeile mit Doppelpunkt im Teilnamen";

    private async Task<Guid> AngenommenAsync(byte[] datei)
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, datei);

        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"{(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return coinId;
    }

    private static byte[] MitFusszeile(string eintragUnterWord, string ziel) =>
        Gueltig().FusszeileAls(eintragUnterWord, ziel, "default", Text(FusszeilenText)).Bytes();

    /// <summary>Interne Beziehungen aller <c>.rels</c>-Einträge: (Quellteil, Typ, Target).</summary>
    private static List<(string Quelle, string Typ, string Ziel)> InterneBeziehungen(byte[] docx)
    {
        var ergebnis = new List<(string, string, string)>();
        foreach (var (name, inhalt) in DocxLeser.Eintraege(docx).Where(e => e.Key.EndsWith(".rels", StringComparison.OrdinalIgnoreCase)))
        {
            var verzeichnis = name.Contains('/', StringComparison.Ordinal) ? name[..name.LastIndexOf('/')] : string.Empty;
            var ordner = verzeichnis.EndsWith("_rels", StringComparison.Ordinal) ? verzeichnis[..^"_rels".Length].TrimEnd('/') : verzeichnis;
            var dateiname = name[(name.LastIndexOf('/') + 1)..^".rels".Length];
            var quelle = dateiname.Length == 0 ? string.Empty : (ordner.Length == 0 ? dateiname : ordner + "/" + dateiname);
            foreach (var beziehung in XDocument.Load(new MemoryStream(inhalt)).Root!.Elements(Rel + "Relationship"))
            {
                if ((string?)beziehung.Attribute("TargetMode") == "External")
                {
                    continue;
                }

                ergebnis.Add((quelle, (string)beziehung.Attribute("Type")!, (string)beziehung.Attribute("Target")!));
            }
        }

        return ergebnis;
    }

    /// <summary>Zeichen, die in der Normalform unkodiert bleiben (AK-10 Schritt 3), ohne <c>:</c> (geschriebene Ziele, AK-16).</summary>
    private static bool BleibtUnkodiert(byte b) =>
        b is >= (byte)'A' and <= (byte)'Z' or >= (byte)'a' and <= (byte)'z' or >= (byte)'0' and <= (byte)'9'
        || "-._~!$&'()*+,;=@[]".Contains((char)b, StringComparison.Ordinal);

    /// <summary>Segment dekodiert und nach AK-10 Schritt 3 erneut kodiert, <c>:</c> als <c>%3A</c>.</summary>
    private static string NormalformFuerZiel(string segment)
    {
        var bytes = new List<byte>();
        for (var i = 0; i < segment.Length; i++)
        {
            if (segment[i] == '%' && i + 2 < segment.Length && Uri.IsHexDigit(segment[i + 1]) && Uri.IsHexDigit(segment[i + 2]))
            {
                bytes.Add(Convert.ToByte(segment.Substring(i + 1, 2), 16));
                i += 2;
            }
            else
            {
                bytes.AddRange(Encoding.UTF8.GetBytes(segment[i].ToString()));
            }
        }

        return string.Concat(bytes.Select(b => BleibtUnkodiert(b) ? ((char)b).ToString() : $"%{b:X2}"));
    }

    /// <summary>Löst ein Ziel relativ zum Quellteil auf (führendes <c>/</c> = Paketstamm) und liefert den Eintragsnamen (<c>%3A</c> → <c>:</c>).</summary>
    private static string AufgeloesterEintrag(string quelle, string ziel)
    {
        var verzeichnis = quelle.Contains('/', StringComparison.Ordinal) ? quelle[..quelle.LastIndexOf('/')] : string.Empty;
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

        return string.Join("/", teile).Replace("%3A", ":", StringComparison.OrdinalIgnoreCase);
    }

    private static void AssertAlleInternenZieleInNormalformUndVorhanden(byte[] docx)
    {
        var teile = DocxLeser.Eintraege(docx).Keys
            .Where(n => n != "[Content_Types].xml" && !n.EndsWith(".rels", StringComparison.OrdinalIgnoreCase) && !n.EndsWith('/'))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var beziehungen = InterneBeziehungen(docx);

        Assert.NotEmpty(beziehungen);
        Assert.All(beziehungen, b =>
        {
            var segmente = b.Ziel.TrimStart('/').Split('/');
            Assert.True(
                segmente.All(s => s == NormalformFuerZiel(s)),
                $"Ziel nicht in Normalform: {b.Quelle} -> {b.Ziel}");
            Assert.True(
                teile.Contains(AufgeloesterEintrag(b.Quelle, b.Ziel)),
                $"Ziel ohne Teil: {b.Quelle} -> {b.Ziel} (Teile: {string.Join(", ", teile)})");
        });
    }

    // ---------- AK-16 (j), Rev. 7 Hinweis a: „:“ bzw. %3A in Teilnamen ist „kein .docx“ ----------

    private async Task KeinDocxOhneSpeichernAsync(byte[] datei)
    {
        var coinId = await CoinAsync();
        var vorher = await SpeicherZustandAsync(coinId);

        var meldungen = await AbgelehntAsync(coinId, datei);

        Assert.Equal([KeinDocx], meldungen);
        Assert.Equal(vorher, await SpeicherZustandAsync(coinId));
    }

    /// <summary>Rev. 7 kehrt AK-16 (j) um: bis Rev. 6 wurde die Fußzeile mit <c>201</c> angenommen.</summary>
    [Theory]
    [InlineData("footer%3A1.xml")]
    [InlineData("footer:1.xml")]
    public async Task Fusszeile_mit_Doppelpunkt_im_Teilnamen_und_Ziel_footer_3A1_ist_kein_Word_Dokument(string eintrag)
    {
        await KeinDocxOhneSpeichernAsync(MitFusszeile(eintrag, "footer%3A1.xml"));
    }

    [Theory]
    [InlineData("a%3ab.png")]
    [InlineData("a%3Ab.png")]
    public async Task Bild_mit_kodiertem_Doppelpunkt_im_Eintrag_und_Ziel_ist_kein_Word_Dokument(string name)
    {
        var bauer = Gueltig();
        bauer.Teil("word/media/" + name, null, Testbilder.Png(404));
        bauer.DokumentBeziehung(RelImage, "media/" + name);

        await KeinDocxOhneSpeichernAsync(bauer.Bytes());
    }

    [Fact]
    public async Task Override_mit_kodiertem_Doppelpunkt_im_PartName_ist_kein_Word_Dokument()
    {
        var datei = Gueltig()
            .Teil("word/x%3A.xml", "application/xml", $"<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:x {Namensraeume}/>")
            .Bytes();
        Assert.Contains("PartName=\"/word/x%3A.xml\"", Encoding.UTF8.GetString(DocxLeser.Eintraege(datei)["[Content_Types].xml"]), StringComparison.Ordinal);

        await KeinDocxOhneSpeichernAsync(datei);
    }

    [Fact]
    public async Task Verwaister_Eintrag_mit_Doppelpunkt_im_Namen_ist_kein_Word_Dokument()
    {
        var datei = Gueltig()
            .Teil("word/a:b.xml", null, $"<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:x {Namensraeume}/>")
            .Bytes();

        await KeinDocxOhneSpeichernAsync(datei);
    }

    [Fact]
    public async Task Internes_Ziel_footer_Doppelpunkt_1_im_Upload_ist_kein_Word_Dokument()
    {
        var coinId = await CoinAsync();
        var vorher = await SpeicherZustandAsync(coinId);

        var meldungen = await AbgelehntAsync(coinId, MitFusszeile("footer:1.xml", "footer:1.xml"));

        Assert.Equal([KeinDocx], meldungen);
        Assert.Equal(vorher, await SpeicherZustandAsync(coinId));
    }

    // ---------- AK-16 (k): interne Ziele in Normalform ----------

    private static byte[] MitVerschiedenenZielen()
    {
        var bauer = Gueltig();
        bauer.Teil("word/media/ä.png", null, Testbilder.Png(401));
        bauer.DokumentBeziehung(RelImage, "media/%c3%a4.png");
        bauer.Teil("word/media/a%5B1%5D.png", null, Testbilder.Png(402));
        bauer.DokumentBeziehung(RelImage, "media/a%5B1%5D.png");
        bauer.Teil("word/media/b.png", null, Testbilder.Png(403));
        bauer.DokumentBeziehung(RelImage, "./media/b.png");
        bauer.KopfzeileAls("kopf%20zeile.xml", "default", [Text("Kopfzeile")]);
        bauer.Fusszeile("default", Text(FusszeilenText));

        return bauer.Bytes();
    }

    [Fact]
    public async Task Im_Download_zeigt_jedes_interne_Ziel_in_der_Normalform_auf_einen_vorhandenen_Teil()
    {
        var coinId = await AngenommenAsync(MitVerschiedenenZielen());

        AssertAlleInternenZieleInNormalformUndVorhanden(await LadeAsync(AktiveDateiUrl(coinId)));
    }

    [Fact]
    public async Task Im_Versions_Download_zeigt_jedes_interne_Ziel_in_der_Normalform_auf_einen_vorhandenen_Teil()
    {
        var coinId = await AngenommenAsync(MitVerschiedenenZielen());

        AssertAlleInternenZieleInNormalformUndVorhanden(await LadeAsync(VersionDateiUrl(coinId, 1)));
    }
}
