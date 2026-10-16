namespace Coin.Domain.Vorlagen;

/// <summary>Ein erlaubter Namespace in den XML-Teilen hochgeladener Word-Dateien; <see cref="Praefix"/> dient nur der Orientierung.</summary>
public sealed record WordNamespace(string Praefix, string Uri, string Zweck);

/// <summary>Ein Element, bestimmt durch Namespace-URI und lokalen Namen.</summary>
public sealed record WordElement(string Uri, string Name);

/// <summary>
/// Namespace-Positivliste für hochgeladene Word-Dateien (zertifikatsvorlagen AK-10 Rev. 7, ADR-0026). Einzige Stelle der
/// erlaubten Namespace-URIs; <c>docs/word-namespaces.md</c> wird per Test abgeglichen. Nicht konfigurierbar.
/// </summary>
public static class WordNamespaces
{
    /// <summary>Präfix aller Strict-OOXML-Namespaces; nie erlaubt.</summary>
    public const string StrictPraefix = "http://purl.oclc.org/ooxml/";

    /// <summary>Erlaubte Namespaces in der Reihenfolge von <c>docs/word-namespaces.md</c>.</summary>
    public static IReadOnlyList<WordNamespace> Alle { get; } =
    [
        new("ct", "http://schemas.openxmlformats.org/package/2006/content-types", "[Content_Types].xml"),
        new("pr", "http://schemas.openxmlformats.org/package/2006/relationships", "Beziehungen (.rels)"),
        new("cp", "http://schemas.openxmlformats.org/package/2006/metadata/core-properties", "Dokumenteigenschaften (core.xml)"),
        new("dc", "http://purl.org/dc/elements/1.1/", "Dublin Core in core.xml"),
        new("dcterms", "http://purl.org/dc/terms/", "Datumswerte in core.xml"),
        new("dcmitype", "http://purl.org/dc/dcmitype/", "Dublin-Core-Typen in core.xml"),
        new("xsi", "http://www.w3.org/2001/XMLSchema-instance", "xsi:type in Eigenschaften"),
        new("ep", "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties", "app.xml"),
        new("vt", "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes", "Werttypen in app.xml/custom.xml"),
        new("op", "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties", "custom.xml"),
        new("ds", "http://schemas.openxmlformats.org/officeDocument/2006/customXml", "Eigenschaften von customXml-Teilen"),
        new("b", "http://schemas.openxmlformats.org/officeDocument/2006/bibliography", "Quellenverzeichnis (customXml, schreibt Word fast immer)"),
        new("cppr", "http://schemas.microsoft.com/office/2006/coverPageProps", "Deckblatt-Eigenschaften (customXml)"),
        new("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main", "WordprocessingML (Transitional)"),
        new("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships", "Verweise auf Beziehungen (r:id, r:embed)"),
        new("mc", "http://schemas.openxmlformats.org/markup-compatibility/2006", "Markup Compatibility (mc:AlternateContent)"),
        new("w14", "http://schemas.microsoft.com/office/word/2010/wordml", "Word-2010-Erweiterungen (Absatz-Ids, Effekte)"),
        new("w15", "http://schemas.microsoft.com/office/word/2012/wordml", "Word-2013-Erweiterungen (Dokument-Id, Kommentarerweiterungen, Personen)"),
        new("w16", "http://schemas.microsoft.com/office/word/2018/wordml", "Word-2019-Erweiterungen"),
        new("w16se", "http://schemas.microsoft.com/office/word/2015/wordml/symex", "Symbol-Erweiterungen (Emoji)"),
        new("w16cid", "http://schemas.microsoft.com/office/word/2016/wordml/cid", "Kommentar-Ids"),
        new("w16cex", "http://schemas.microsoft.com/office/word/2018/wordml/cex", "erweiterte Kommentare"),
        new("w16sdtdh", "http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash", "Prüfsumme gebundener Inhaltssteuerelemente"),
        new("w16sdtfl", "http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock", "Formatsperre von Inhaltssteuerelementen"),
        new("w16du", "http://schemas.microsoft.com/office/word/2023/wordml/word16du", "Datum/Uhrzeit nachverfolgter Änderungen"),
        new("m", "http://schemas.openxmlformats.org/officeDocument/2006/math", "Formeln (OMML)"),
        new("wp", "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", "Verankerung von Bildern und Formen"),
        new("wp14", "http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing", "relative Größe/Position"),
        new("wp15", "http://schemas.microsoft.com/office/word/2012/wordprocessingDrawing", "Online-Video (wp15:webVideoPr)"),
        new("wps", "http://schemas.microsoft.com/office/word/2010/wordprocessingShape", "Formen und Textfelder"),
        new("wpg", "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup", "gruppierte Formen"),
        new("wpc", "http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas", "Zeichenbereich"),
        new("a", "http://schemas.openxmlformats.org/drawingml/2006/main", "DrawingML (Bilder, Formen, Design theme1.xml)"),
        new("pic", "http://schemas.openxmlformats.org/drawingml/2006/picture", "Bilder"),
        new("a14", "http://schemas.microsoft.com/office/drawing/2010/main", "Bild- und Formerweiterungen (useLocalDpi, Effekte)"),
        new("a16", "http://schemas.microsoft.com/office/drawing/2014/main", "Ids von Formen (a16:creationId)"),
        new("adec", "http://schemas.microsoft.com/office/drawing/2017/decorative", "„Als dekorativ markieren“"),
        new("thm15", "http://schemas.microsoft.com/office/thememl/2012/main", "Designfamilie in theme1.xml"),
        new("v", "urn:schemas-microsoft-com:vml", "VML (Textfeld-Rückfall, Wasserzeichen)"),
        new("o", "urn:schemas-microsoft-com:office:office", "Office-VML-Erweiterungen"),
        new("w10", "urn:schemas-microsoft-com:office:word", "VML-Textumbruch"),
        new("ax", "http://schemas.microsoft.com/office/2006/activeX", "ActiveX-Teile"),
    ];

    /// <summary>SVG-Namespaces (Entscheidung F15): nicht erlaubt, eigene SVG-Meldung.</summary>
    public static IReadOnlySet<string> SvgNamespaces { get; } = new HashSet<string>(StringComparer.Ordinal)
    {
        "http://www.w3.org/2000/svg",
        "http://www.w3.org/1999/xlink",
        "http://schemas.microsoft.com/office/drawing/2016/SVG/main",
    };

    /// <summary>
    /// WordprocessingML-Namespaces (AK-10 Punkt 8, Rev. 8): An Elementen dieser Namespaces ist jedes Attribut ohne
    /// Namespace ein Befund (Erweiterungsmeldung). Nicht enthalten sind u. a. <c>w10</c>, <c>m</c>, <c>r</c>, <c>mc</c>,
    /// DrawingML und VML, deren Elemente unqualifizierte Attribute tragen dürfen.
    /// </summary>
    public static IReadOnlySet<string> WordprocessingMl { get; } = new HashSet<string>(StringComparer.Ordinal)
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

    /// <summary>
    /// Elemente in erlaubten Namespaces, die an jeder Stelle und in jedem XML-Teil die Erweiterungsmeldung ergeben
    /// (AK-10 Punkt 10, Rev. 8): Freihand (<c>w:contentPart</c>, <c>w14:contentPart</c>, <c>a14:contentPart</c>,
    /// <c>o:ink</c>, Entscheidung O1) und Signaturzeilen (<c>o:signatureline</c>, Entscheidung F16).
    /// </summary>
    public static IReadOnlyList<WordElement> ErweiterungsElemente { get; } =
    [
        new("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "contentPart"),
        new("http://schemas.microsoft.com/office/word/2010/wordml", "contentPart"),
        new("http://schemas.microsoft.com/office/drawing/2010/main", "contentPart"),
        new("urn:schemas-microsoft-com:office:office", "ink"),
        new("urn:schemas-microsoft-com:office:office", "signatureline"),
    ];

    /// <summary>
    /// Personenlisten (AK-10 Punkt 10, Rev. 8): ergeben außerhalb des Personen-Teils
    /// (<see cref="PersonenTeilTyp"/>) die Erweiterungsmeldung.
    /// </summary>
    public static IReadOnlyList<WordElement> PersonenElemente { get; } =
    [
        new("http://schemas.microsoft.com/office/word/2012/wordml", "people"),
        new("http://schemas.microsoft.com/office/word/2012/wordml", "person"),
        new("http://schemas.microsoft.com/office/word/2012/wordml", "presenceInfo"),
    ];

    /// <summary>Content-Type des Personen-Teils (üblich <c>word/people.xml</c>).</summary>
    public const string PersonenTeilTyp = "application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml";

    private static readonly HashSet<string> Erlaubte = new(Alle.Select(n => n.Uri), StringComparer.Ordinal);

    /// <summary>Steht der URI in der Positivliste? Vergleich ordinal und exakt (ohne Trimmen oder Normalisieren).</summary>
    public static bool IstErlaubt(string uri) => uri is not null && Erlaubte.Contains(uri);

    /// <summary>Ist der URI ein Strict-OOXML-Namespace (beginnt mit <see cref="StrictPraefix"/>)?</summary>
    public static bool IstStrict(string uri) => uri is not null && uri.StartsWith(StrictPraefix, StringComparison.Ordinal);
}
