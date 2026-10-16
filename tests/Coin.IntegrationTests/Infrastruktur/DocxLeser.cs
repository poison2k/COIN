using System.IO.Compression;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>
/// Liest DOCX-Dateien aus Antworten (zertifikatsvorlagen): Einträge entpacken, Absatztexte unabhängig vom
/// Produktivcode bilden (Regel aus AK-15), Fehler des <see cref="OpenXmlValidator"/>, Kerneigenschaften.
/// </summary>
public static class DocxLeser
{
    public static readonly XNamespace W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    public static readonly XNamespace Cp = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
    public static readonly XNamespace Dc = "http://purl.org/dc/elements/1.1/";
    public static readonly XNamespace Ep = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";

    /// <summary>Alle ZIP-Einträge mit Inhalt.</summary>
    public static Dictionary<string, byte[]> Eintraege(byte[] docx)
    {
        using var zip = new ZipArchive(new MemoryStream(docx), ZipArchiveMode.Read);
        var ergebnis = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        foreach (var eintrag in zip.Entries)
        {
            using var quelle = eintrag.Open();
            using var ziel = new MemoryStream();
            quelle.CopyTo(ziel);
            ergebnis[eintrag.FullName] = ziel.ToArray();
        }

        return ergebnis;
    }

    private static readonly XNamespace Ct = "http://schemas.openxmlformats.org/package/2006/content-types";

    /// <summary>
    /// XML-Teile nach der Definition aus AK-10 (unabhängig vom Produktivcode): <c>[Content_Types].xml</c>, jede
    /// <c>.rels</c> und jeder Eintrag, dessen Content-Type (Override, sonst Default nach Endung; ohne Parameter, ohne
    /// Groß-/Kleinschreibung) auf <c>+xml</c> oder <c>/xml</c> endet oder VML ist.
    /// </summary>
    public static Dictionary<string, byte[]> XmlTeile(byte[] docx)
    {
        var eintraege = Eintraege(docx);
        var typen = XDocument.Load(new MemoryStream(eintraege["[Content_Types].xml"])).Root!;
        var overrides = typen.Elements(Ct + "Override").ToDictionary(
            o => ((string)o.Attribute("PartName")!).TrimStart('/'), o => (string)o.Attribute("ContentType")!, StringComparer.OrdinalIgnoreCase);
        var defaults = typen.Elements(Ct + "Default").ToDictionary(
            d => (string)d.Attribute("Extension")!, d => (string)d.Attribute("ContentType")!, StringComparer.OrdinalIgnoreCase);

        bool IstXml(string name)
        {
            if (name == "[Content_Types].xml" || name.EndsWith(".rels", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var endung = name.Contains('.', StringComparison.Ordinal) ? name[(name.LastIndexOf('.') + 1)..] : string.Empty;
            if (!overrides.TryGetValue(name, out var typ) && !defaults.TryGetValue(endung, out typ))
            {
                return false;
            }

            typ = typ.Split(';')[0].Trim().ToLowerInvariant();
            return typ.EndsWith("+xml", StringComparison.Ordinal) || typ.EndsWith("/xml", StringComparison.Ordinal)
                || typ == "application/vnd.openxmlformats-officedocument.vmldrawing";
        }

        return eintraege.Where(e => !e.Key.EndsWith('/') && IstXml(e.Key)).ToDictionary(e => e.Key, e => e.Value, StringComparer.Ordinal);
    }

    /// <summary>
    /// Namespace-URIs aller Elemente und aller Attribute mit Namespace je XML-Teil (ohne Namespace-Deklarationen und
    /// ohne <c>xml:*</c>), als „Teil: URI“; ein Element ohne Namespace erscheint mit leerem URI.
    /// </summary>
    public static SortedSet<string> VerwendeteNamespaces(byte[] docx)
    {
        var ergebnis = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var (name, inhalt) in XmlTeile(docx))
        {
            using var leser = XmlReader.Create(new MemoryStream(inhalt), new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null });
            while (leser.Read())
            {
                if (leser.NodeType != XmlNodeType.Element)
                {
                    continue;
                }

                ergebnis.Add($"{name}: {leser.NamespaceURI}");
                while (leser.MoveToNextAttribute())
                {
                    if (leser.NamespaceURI.Length > 0
                        && leser.NamespaceURI != "http://www.w3.org/2000/xmlns/"
                        && leser.NamespaceURI != "http://www.w3.org/XML/1998/namespace")
                    {
                        ergebnis.Add($"{name}: {leser.NamespaceURI}");
                    }
                }

                leser.MoveToElement();
            }
        }

        return ergebnis;
    }

    /// <summary>
    /// Rev. 8 (AK-10 Punkt 8): die zehn WordprocessingML-Namespaces, an deren Elementen kein unqualifiziertes Attribut
    /// stehen darf (eigene Liste, unabhängig vom Produktivcode).
    /// </summary>
    public static readonly IReadOnlySet<string> WordprocessingMl = new HashSet<string>(StringComparer.Ordinal)
    {
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "http://schemas.microsoft.com/office/word/2010/wordml",
        "http://schemas.microsoft.com/office/word/2012/wordml",
        "http://schemas.microsoft.com/office/word/2018/wordml",
        "http://schemas.microsoft.com/office/word/2015/wordml/symex",
        "http://schemas.microsoft.com/office/word/2016/wordml/cid",
        "http://schemas.microsoft.com/office/word/2018/wordml/cex",
        "http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash",
        "http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock",
        "http://schemas.microsoft.com/office/word/2023/wordml/word16du",
    };

    public const string McNamespace = "http://schemas.openxmlformats.org/markup-compatibility/2006";

    public const string W14Namespace = "http://schemas.microsoft.com/office/word/2010/wordml";

    private static readonly HashSet<string> ErlaubteMcAttribute = new(StringComparer.Ordinal)
    {
        "Ignorable", "MustUnderstand", "ProcessContent", "PreserveElements", "PreserveAttributes",
    };

    private static readonly HashSet<string> Konfliktelemente = new(StringComparer.Ordinal)
    {
        "conflictIns", "conflictDel", "customXmlConflictInsRangeStart", "customXmlConflictInsRangeEnd",
        "customXmlConflictDelRangeStart", "customXmlConflictDelRangeEnd",
    };

    /// <summary>Durchläuft alle Elemente aller XML-Teile; <paramref name="pruefe"/> steht auf dem Element.</summary>
    private static SortedSet<string> JedesElement(byte[] docx, Action<string, XmlReader, SortedSet<string>> pruefe)
    {
        var ergebnis = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var (name, inhalt) in XmlTeile(docx))
        {
            using var leser = XmlReader.Create(new MemoryStream(inhalt), new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null });
            while (leser.Read())
            {
                if (leser.NodeType == XmlNodeType.Element)
                {
                    pruefe(name, leser, ergebnis);
                    leser.MoveToElement();
                }
            }
        }

        return ergebnis;
    }

    /// <summary>Rev. 8 (AK-10 Punkt 8): unqualifizierte Attribute an Elementen der WordprocessingML-Namespaces, als „Teil: Element Attribut“.</summary>
    public static SortedSet<string> UnqualifizierteWordprocessingMlAttribute(byte[] docx) =>
        JedesElement(docx, (teil, leser, ergebnis) =>
        {
            if (!WordprocessingMl.Contains(leser.NamespaceURI))
            {
                return;
            }

            var element = leser.Name;
            while (leser.MoveToNextAttribute())
            {
                if (leser.NamespaceURI.Length == 0)
                {
                    ergebnis.Add($"{teil}: {element} {leser.Name}");
                }
            }
        });

    /// <summary>Rev. 8 (AK-10 Punkt 9): Attribute im <c>mc</c>-Namespace außer den fünf erlaubten, als „Teil: Element Attribut“.</summary>
    public static SortedSet<string> UnbekannteMcAttribute(byte[] docx) =>
        JedesElement(docx, (teil, leser, ergebnis) =>
        {
            var element = leser.Name;
            while (leser.MoveToNextAttribute())
            {
                if (leser.NamespaceURI == McNamespace && !ErlaubteMcAttribute.Contains(leser.LocalName))
                {
                    ergebnis.Add($"{teil}: {element} {leser.Name}");
                }
            }
        });

    /// <summary>Rev. 8 (AK-14): Konfliktmarkierungen im <c>w14</c>-Namespace, als „Teil: Element“.</summary>
    public static SortedSet<string> Konfliktmarkierungen(byte[] docx) =>
        JedesElement(docx, (teil, leser, ergebnis) =>
        {
            if (leser.NamespaceURI == W14Namespace && Konfliktelemente.Contains(leser.LocalName))
            {
                ergebnis.Add($"{teil}: {leser.Name}");
            }
        });

    /// <summary>
    /// Ersetzt in einem ZIP-Eintrag den ersten Treffer von <paramref name="alt"/> und packt neu (Testdatei nachträglich
    /// ändern, z. B. die heruntergeladene Standardvorlage).
    /// </summary>
    public static byte[] ErsetzeInEintrag(byte[] docx, string eintrag, string alt, string neu)
    {
        var eintraege = Eintraege(docx);
        var text = Encoding.UTF8.GetString(eintraege[eintrag]);
        var index = text.IndexOf(alt, StringComparison.Ordinal);
        if (index < 0)
        {
            throw new InvalidOperationException($"„{alt}“ kommt in {eintrag} nicht vor.");
        }

        eintraege[eintrag] = Encoding.UTF8.GetBytes(text[..index] + neu + text[(index + alt.Length)..]);
        using var puffer = new MemoryStream();
        using (var zip = new ZipArchive(puffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, inhalt) in eintraege)
            {
                using var ziel = zip.CreateEntry(name).Open();
                ziel.Write(inhalt);
            }
        }

        return puffer.ToArray();
    }

    /// <summary>Alle entpackten Teile als UTF-8-Text hintereinander (für die Suche nach Testwerten).</summary>
    public static string AllesAlsText(byte[] docx) =>
        string.Join("\n", Eintraege(docx).Select(e => e.Key + "\n" + Encoding.UTF8.GetString(e.Value)));

    public static XDocument Xml(byte[] docx, string teil)
    {
        var eintraege = Eintraege(docx);
        Assert.True(eintraege.ContainsKey(teil), $"Teil {teil} fehlt.");
        using var leser = XmlReader.Create(new MemoryStream(eintraege[teil]), new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null });
        return XDocument.Load(leser);
    }

    /// <summary>Geprüfte Teile laut AK-15: Hauptdokument, Kopf-/Fußzeilen, Fuß- und Endnoten.</summary>
    public static IEnumerable<string> GepruefteTeile(byte[] docx) =>
        Eintraege(docx).Keys
            .Where(n => n == "word/document.xml"
                || (n.StartsWith("word/header", StringComparison.Ordinal) && n.EndsWith(".xml", StringComparison.Ordinal))
                || (n.StartsWith("word/footer", StringComparison.Ordinal) && n.EndsWith(".xml", StringComparison.Ordinal))
                || n is "word/footnotes.xml" or "word/endnotes.xml")
            .Order(StringComparer.Ordinal);

    /// <summary>
    /// Absatztexte je geprüftem Teil: Text aller <c>w:t</c>, deren nächster Absatz-Vorfahr der Absatz ist.
    /// <c>w:tab</c> als Tab, <c>w:br</c>/<c>w:cr</c> als Zeilenumbruch.
    /// </summary>
    public static List<string> Absatztexte(byte[] docx)
    {
        var texte = new List<string>();
        foreach (var teil in GepruefteTeile(docx))
        {
            foreach (var absatz in Xml(docx, teil).Descendants(W + "p"))
            {
                var text = new StringBuilder();
                foreach (var element in absatz.Descendants())
                {
                    if (element.Ancestors(W + "p").FirstOrDefault() != absatz)
                    {
                        continue;
                    }

                    if (element.Name == W + "t")
                    {
                        text.Append(element.Value);
                    }
                    else if (element.Name == W + "tab")
                    {
                        text.Append('\t');
                    }
                    else if (element.Name == W + "br" || element.Name == W + "cr")
                    {
                        text.Append('\n');
                    }
                }

                texte.Add($"{teil}: {text}");
            }
        }

        return texte;
    }

    /// <summary>Fehler des <see cref="OpenXmlValidator"/> als Text (Pfad und Beschreibung).</summary>
    public static List<string> ValidatorFehler(byte[] docx)
    {
        using var dokument = WordprocessingDocument.Open(new MemoryStream(docx), false);
        return new OpenXmlValidator()
            .Validate(dokument)
            .Select(f => $"{f.Part?.Uri} {f.Path?.XPath}: {f.Description}")
            .ToList();
    }

    /// <summary>Kerneigenschaften (lokaler Name → Wert) aus <c>docProps/core.xml</c>; leer, wenn der Teil fehlt.</summary>
    public static Dictionary<string, string> KernEigenschaften(byte[] docx)
    {
        if (!Eintraege(docx).ContainsKey("docProps/core.xml"))
        {
            return [];
        }

        return Xml(docx, "docProps/core.xml").Root!.Elements()
            .ToDictionary(e => $"{e.Name.Namespace}|{e.Name.LocalName}", e => e.Value);
    }

    /// <summary>Lokale Namen der Elemente in <c>docProps/app.xml</c>; leer, wenn der Teil fehlt.</summary>
    public static List<string> AppEigenschaften(byte[] docx) =>
        Eintraege(docx).ContainsKey("docProps/app.xml")
            ? Xml(docx, "docProps/app.xml").Root!.Elements().Select(e => e.Name.LocalName).ToList()
            : [];
}
