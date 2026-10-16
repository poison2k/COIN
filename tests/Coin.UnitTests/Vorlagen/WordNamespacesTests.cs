using System.Reflection;
using Coin.Domain.Vorlagen;

namespace Coin.UnitTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 7, AK-10 (Namespace-Positivliste), Entscheidungen F13/F14, ADR-0026 Punkt 1, 3, 6
/// und 8: Die Liste <see cref="WordNamespaces"/> ist eindeutig, enthält keinen Strict-URI und keinen der vom
/// Auftraggeber abgelehnten URIs; „erlaubt“ vergleicht ordinal und exakt, „Strict“ erkennt das Präfix
/// <c>http://purl.oclc.org/ooxml/</c>.
/// </summary>
public class WordNamespacesTests
{
    private const string W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

    [Fact]
    public void Liste_ist_nicht_leer()
    {
        Assert.NotEmpty(WordNamespaces.Alle);
    }

    [Fact]
    public void Liste_enthaelt_keinen_URI_doppelt()
    {
        var doppelt = WordNamespaces.Alle.GroupBy(n => n.Uri, StringComparer.Ordinal).Where(g => g.Count() > 1).Select(g => g.Key);

        Assert.Empty(doppelt);
    }

    [Fact]
    public void Liste_enthaelt_kein_Praefix_doppelt()
    {
        var doppelt = WordNamespaces.Alle.GroupBy(n => n.Praefix, StringComparer.Ordinal).Where(g => g.Count() > 1).Select(g => g.Key);

        Assert.Empty(doppelt);
    }

    [Fact]
    public void Jeder_Eintrag_hat_Praefix_URI_und_Zweck()
    {
        Assert.All(WordNamespaces.Alle, n =>
        {
            Assert.False(string.IsNullOrWhiteSpace(n.Praefix), n.Uri);
            Assert.False(string.IsNullOrWhiteSpace(n.Uri), n.Praefix);
            Assert.False(string.IsNullOrWhiteSpace(n.Zweck), n.Uri);
            Assert.Equal(n.Uri.Trim(), n.Uri);
        });
    }

    [Fact]
    public void Kein_URI_der_Liste_ist_Strict()
    {
        Assert.DoesNotContain(WordNamespaces.Alle, n => n.Uri.StartsWith("http://purl.oclc.org/ooxml/", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData("ct", "http://schemas.openxmlformats.org/package/2006/content-types")]
    [InlineData("pr", "http://schemas.openxmlformats.org/package/2006/relationships")]
    [InlineData("w", W)]
    [InlineData("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")]
    [InlineData("mc", "http://schemas.openxmlformats.org/markup-compatibility/2006")]
    public void Liste_enthaelt_die_Pflicht_Namespaces(string praefix, string uri)
    {
        Assert.Contains(WordNamespaces.Alle, n => n.Praefix == praefix && n.Uri == uri);
    }

    /// <summary>Entscheidungen F14 (O1–O6), F15 (SVG) und ADR-0026 Punkt 8: diese URIs stehen nicht in der Liste.</summary>
    [Theory]
    [InlineData("http://schemas.openxmlformats.org/drawingml/2006/chart")]
    [InlineData("http://schemas.openxmlformats.org/drawingml/2006/diagram")]
    [InlineData("http://schemas.microsoft.com/office/word/2010/wordprocessingInk")]
    [InlineData("http://schemas.microsoft.com/office/drawing/2016/ink")]
    [InlineData("http://schemas.microsoft.com/office/drawing/2017/model3d")]
    [InlineData("http://schemas.microsoft.com/office/2006/metadata/properties")]
    [InlineData("http://schemas.microsoft.com/office/2020/mipLabelMetadata")]
    [InlineData("http://www.w3.org/2000/svg")]
    [InlineData("http://www.w3.org/1999/xlink")]
    [InlineData("http://schemas.microsoft.com/office/drawing/2016/SVG/main")]
    public void Liste_enthaelt_keinen_nach_F14_oder_F15_abgelehnten_URI(string uri)
    {
        Assert.DoesNotContain(WordNamespaces.Alle, n => n.Uri == uri);
        Assert.False(WordNamespaces.IstErlaubt(uri));
    }

    /// <summary>Weitere Einträge der Erläuterungstabelle „nicht erlaubt“ (u. a. ChartEx, SmartArt-Zeichnung, wne, Add-ins).</summary>
    [Theory]
    [InlineData("http://schemas.microsoft.com/office/drawing/2014/chartex")]
    [InlineData("http://schemas.microsoft.com/office/drawing/2008/diagram")]
    [InlineData("http://www.w3.org/2003/InkML")]
    [InlineData("http://schemas.microsoft.com/office/word/2006/wordml")]
    [InlineData("http://schemas.microsoft.com/office/webextensions/webextension/2010/11")]
    [InlineData("http://schemas.microsoft.com/office/2006/01/customui")]
    [InlineData("http://schemas.openxmlformats.org/schemaLibrary/2006/main")]
    public void Weitere_nicht_erlaubte_URIs_sind_nicht_erlaubt(string uri)
    {
        Assert.False(WordNamespaces.IstErlaubt(uri));
    }

    /// <summary>F15: SVG-Namespaces als eigene Menge (für die SVG-Meldung), genau diese drei.</summary>
    [Fact]
    public void SvgNamespaces_enthaelt_genau_svg_xlink_und_asvg()
    {
        string[] erwartet =
        [
            "http://schemas.microsoft.com/office/drawing/2016/SVG/main",
            "http://www.w3.org/1999/xlink",
            "http://www.w3.org/2000/svg",
        ];

        Assert.Equal(erwartet, WordNamespaces.SvgNamespaces.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void Kein_SVG_Namespace_ist_erlaubt()
    {
        Assert.All(WordNamespaces.SvgNamespaces, uri => Assert.False(WordNamespaces.IstErlaubt(uri), uri));
    }

    [Fact]
    public void Jeder_URI_der_Liste_ist_erlaubt()
    {
        Assert.All(WordNamespaces.Alle, n => Assert.True(WordNamespaces.IstErlaubt(n.Uri), n.Uri));
    }

    [Theory]
    [InlineData("HTTP://schemas.openxmlformats.org/wordprocessingml/2006/main")]
    [InlineData("http://schemas.openxmlformats.org/wordprocessingml/2006/MAIN")]
    [InlineData("http://schemas.openxmlformats.org/wordprocessingml/2006/main ")]
    [InlineData(" http://schemas.openxmlformats.org/wordprocessingml/2006/main")]
    [InlineData("http://schemas.openxmlformats.org/wordprocessingml/2006/main/")]
    public void Erlaubt_vergleicht_ordinal_und_exakt(string uri)
    {
        Assert.False(WordNamespaces.IstErlaubt(uri));
    }

    [Theory]
    [InlineData("")]
    [InlineData("urn:example:fremd")]
    [InlineData("http://www.w3.org/2000/xmlns/")]
    public void Leerer_fremder_und_xmlns_URI_sind_nicht_erlaubt(string uri)
    {
        Assert.False(WordNamespaces.IstErlaubt(uri));
    }

    [Theory]
    [InlineData("http://purl.oclc.org/ooxml/wordprocessingml/main")]
    [InlineData("http://purl.oclc.org/ooxml/officeDocument/relationships")]
    [InlineData("http://purl.oclc.org/ooxml/drawingml/main")]
    [InlineData("http://purl.oclc.org/ooxml/")]
    [InlineData("http://purl.oclc.org/ooxml/beliebig/neu")]
    public void Strict_erkennt_jeden_URI_mit_dem_Strict_Praefix(string uri)
    {
        Assert.True(WordNamespaces.IstStrict(uri));
        Assert.False(WordNamespaces.IstErlaubt(uri));
    }

    // ---------- Rev. 8: WordprocessingML-Namespaces (AK-10 Punkt 8) ----------

    /// <summary>
    /// <c>WordNamespaces.WordprocessingMl</c> per Reflexion (Eigenschaft oder Feld), damit das Testprojekt auch vor der
    /// Umsetzung übersetzt und nur dieser Test rot ist.
    /// </summary>
    private static IReadOnlyCollection<string> WordprocessingMl()
    {
        const BindingFlags Flags = BindingFlags.Public | BindingFlags.Static;
        var wert = typeof(WordNamespaces).GetProperty("WordprocessingMl", Flags)?.GetValue(null)
            ?? typeof(WordNamespaces).GetField("WordprocessingMl", Flags)?.GetValue(null);
        var menge = Assert.IsAssignableFrom<IEnumerable<string>>(wert ?? throw new Xunit.Sdk.XunitException("WordNamespaces.WordprocessingMl fehlt (Rev. 8, AK-10 Punkt 8)."));
        return menge.ToArray();
    }

    [Fact]
    public void WordprocessingMl_enthaelt_genau_die_zehn_URIs_aus_AK_10_Punkt_8()
    {
        string[] erwartet =
        [
            "http://schemas.microsoft.com/office/word/2010/wordml",
            "http://schemas.microsoft.com/office/word/2012/wordml",
            "http://schemas.microsoft.com/office/word/2015/wordml/symex",
            "http://schemas.microsoft.com/office/word/2016/wordml/cid",
            "http://schemas.microsoft.com/office/word/2018/wordml",
            "http://schemas.microsoft.com/office/word/2018/wordml/cex",
            "http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash",
            "http://schemas.microsoft.com/office/word/2023/wordml/word16du",
            "http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock",
            W,
        ];

        Assert.Equal(erwartet.Order(StringComparer.Ordinal), WordprocessingMl().Order(StringComparer.Ordinal));
    }

    [Fact]
    public void Jeder_WordprocessingML_Namespace_steht_in_der_Positivliste()
    {
        Assert.All(WordprocessingMl(), uri => Assert.True(WordNamespaces.IstErlaubt(uri), uri));
    }

    [Theory]
    [InlineData("urn:schemas-microsoft-com:office:word")]
    [InlineData("http://schemas.openxmlformats.org/officeDocument/2006/math")]
    [InlineData("http://schemas.openxmlformats.org/markup-compatibility/2006")]
    [InlineData("http://schemas.openxmlformats.org/officeDocument/2006/relationships")]
    [InlineData("http://schemas.openxmlformats.org/drawingml/2006/main")]
    [InlineData("urn:schemas-microsoft-com:vml")]
    [InlineData("http://schemas.microsoft.com/office/2006/activeX")]
    public void WordprocessingMl_enthaelt_w10_m_mc_und_andere_Namespaces_nicht(string uri)
    {
        Assert.DoesNotContain(uri, WordprocessingMl());
    }

    [Theory]
    [InlineData(W)]
    [InlineData("urn:example:fremd")]
    [InlineData("http://purl.oclc.org/ooxml")]
    [InlineData("http://purl.org/dc/elements/1.1/")]
    [InlineData("")]
    public void Strict_erkennt_andere_URIs_nicht(string uri)
    {
        Assert.False(WordNamespaces.IstStrict(uri));
    }
}
