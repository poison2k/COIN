using System.Xml;
using System.Xml.Linq;
using Coin.Domain.Vorlagen;

namespace Coin.Infrastructure.Vorlagen;

/// <summary>Ergebnis von <see cref="SicheresXml.Lesen"/> bzw. <see cref="SicheresXml.Pruefen"/>.</summary>
internal enum XmlStatus
{
    /// <summary>Wohlgeformt, ohne DTD, höchstens <see cref="SicheresXml.MaxEbenen"/> Element-Ebenen.</summary>
    Gelesen,

    /// <summary>Enthält eine DOCTYPE-Deklaration (AK-13).</summary>
    Dtd,

    /// <summary>Mehr als <see cref="SicheresXml.MaxEbenen"/> Element-Ebenen (AK-12, Rev. 4).</summary>
    ZuTief,

    /// <summary>
    /// Ein Element mit mehr als <see cref="SicheresXml.MaxAttribute"/> Attributen inklusive Namespace-Deklarationen
    /// (AK-12, Rev. 5).
    /// </summary>
    ZuVieleAttribute,

    /// <summary>Nicht wohlgeformt oder zu groß.</summary>
    Ungueltig,
}

/// <summary>
/// Befunde der Namespace-Positivliste eines XML-Teils (zertifikatsvorlagen AK-10 Rev. 7, ADR-0026). Enthält bewusst
/// keinen Namespace-URI: Er ist frei wählbarer Dokumentinhalt und wird weder gemeldet noch geloggt.
/// </summary>
[Flags]
internal enum NamespaceBefund
{
    Keiner = 0,

    /// <summary>
    /// Strict-OOXML verwendet, nicht deklariertes Präfix in einem <c>mc:</c>-Attribut oder unbekanntes <c>mc:</c>-Attribut
    /// (AK-10 Punkt 9) → „kein .docx“.
    /// </summary>
    KeinDocx = 1,

    /// <summary>SVG-Namespace (<c>svg</c>, <c>xlink</c>, <c>asvg</c>) verwendet (F15).</summary>
    Svg = 2,

    /// <summary>
    /// Anderer nicht erlaubter Namespace, Element ohne Namespace, unqualifiziertes Attribut an einem
    /// WordprocessingML-Element (AK-10 Punkt 8) oder Freihand-, Personen- bzw. Signaturzeilen-Element (Punkt 10) →
    /// Erweiterungsmeldung.
    /// </summary>
    Erweiterung = 4,
}

/// <summary>
/// Sicheres Lesen nicht vertrauenswürdiger XML-Teile (zertifikatsvorlagen AK-12, AK-13, ADR-0024 Punkt 1.4): ohne DTD,
/// ohne Resolver, mit Zeichengrenze, höchstens 256 Element-Ebenen und höchstens 1.000 Attributen je Element. Tiefe und
/// Attribute werden in einem reinen <see cref="XmlReader"/>-Durchlauf geprüft, <b>bevor</b> ein <see cref="XDocument"/>
/// (oder das OpenXML SDK) den Teil lädt; so kann kein rekursiver Durchlauf über zu tiefes XML den Prozess per
/// Stapelüberlauf beenden. Weil der <see cref="XmlReader"/> ein Start-Tag erst vollständig liest, bevor er die Attribute
/// zählen lässt, und das bei Hunderttausenden Attributen Sekunden dauert, zählt vorher ein linearer
/// <see cref="XmlVorlauf">Vorlauf</see> auf dem dekodierten Text und bricht beim 1.001. Attribut ab (Rev. 5, H2).
/// </summary>
internal static class SicheresXml
{
    /// <summary>Höchstzahl der Element-Ebenen je XML-Teil (Wurzelelement = Ebene 1).</summary>
    public const int MaxEbenen = 256;

    /// <summary>Höchstzahl der Attribute je Element inklusive Namespace-Deklarationen (AK-12, Rev. 5).</summary>
    public const int MaxAttribute = 1_000;

    /// <summary>Höchstzahl der Zeichen je XML-Teil (auch für <c>OpenSettings.MaxCharactersInPart</c>, AK-12).</summary>
    public const long MaxZeichenJeTeil = 10_000_000;

    private const string McNamespace = "http://schemas.openxmlformats.org/markup-compatibility/2006";
    private const string XmlnsNamespace = "http://www.w3.org/2000/xmlns/";
    private const string XmlNamespace = "http://www.w3.org/XML/1998/namespace";

    /// <summary><c>mc:</c>-Attribute, deren Werte Präfixe enthalten (ADR-0026 Punkt 2).</summary>
    private static readonly HashSet<string> McPraefixAttribute =
        new(["Ignorable", "MustUnderstand", "ProcessContent", "PreserveElements", "PreserveAttributes"], StringComparer.Ordinal);

    /// <summary>Prüft und lädt einen Teil; <paramref name="dokument"/> ist nur bei <see cref="XmlStatus.Gelesen"/> gesetzt.</summary>
    public static XmlStatus Lesen(byte[] bytes, out XDocument? dokument) => Lesen(bytes, out dokument, out _);

    /// <summary>
    /// Wie <see cref="Lesen(byte[], out XDocument?)"/>, liefert zusätzlich die Befunde der Namespace-Positivliste. Ein
    /// Namespace-Befund ändert den Status nicht; der Aufrufer darf das Dokument dann keiner Inhaltsregel übergeben.
    /// </summary>
    public static XmlStatus Lesen(byte[] bytes, out XDocument? dokument, out NamespaceBefund namespaces) =>
        Lesen(bytes, istPersonenTeil: false, out dokument, out namespaces);

    /// <summary>
    /// Wie <see cref="Lesen(byte[], out XDocument?, out NamespaceBefund)"/>; <paramref name="istPersonenTeil"/> gibt an,
    /// ob der Teil der Personen-Teil (<see cref="WordNamespaces.PersonenTeilTyp"/>) ist, in dem Personenlisten zulässig
    /// sind (AK-10 Punkt 10).
    /// </summary>
    public static XmlStatus Lesen(byte[] bytes, bool istPersonenTeil, out XDocument? dokument, out NamespaceBefund namespaces)
    {
        dokument = null;
        var status = Pruefen(bytes, istPersonenTeil, out namespaces);
        if (status != XmlStatus.Gelesen)
        {
            return status;
        }

        try
        {
            using var leser = Leser(bytes);
            dokument = XDocument.Load(leser, LoadOptions.PreserveWhitespace);
            return XmlStatus.Gelesen;
        }
        catch (XmlException)
        {
            return XmlStatus.Ungueltig;
        }
    }

    /// <summary>Wie <see cref="Lesen"/>, aber <c>null</c> bei jedem Befund.</summary>
    public static XDocument? LesenOderNull(byte[] bytes) => Lesen(bytes, out var dokument) == XmlStatus.Gelesen ? dokument : null;

    /// <summary>Wie <see cref="Pruefen(byte[], out NamespaceBefund)"/> ohne die Namespace-Befunde.</summary>
    public static XmlStatus Pruefen(byte[] bytes) => Pruefen(bytes, out _);

    /// <summary>
    /// Ein Durchlauf ohne DOM: Wohlgeformtheit, DTD, Zeichengrenze und Tiefe. Bricht beim ersten dieser Befunde ab; eine
    /// DOCTYPE-Deklaration steht immer vor dem Wurzelelement und wird daher vor einem zu tiefen Element erkannt. Je
    /// Element danach die Namespace-Positivliste (<see cref="NamespacesPruefen"/>); deren Befunde brechen nicht ab, damit
    /// DTD, Tiefe, Attributzahl und Wohlgeformtheit im ganzen Teil Vorrang behalten (ADR-0026 Punkt 4).
    /// <paramref name="namespaces"/> ist nur bei <see cref="XmlStatus.Gelesen"/> aussagekräftig.
    /// </summary>
    public static XmlStatus Pruefen(byte[] bytes, out NamespaceBefund namespaces) => Pruefen(bytes, istPersonenTeil: false, out namespaces);

    /// <inheritdoc cref="Pruefen(byte[], out NamespaceBefund)"/>
    /// <param name="istPersonenTeil">Der Teil ist der Personen-Teil; Personenlisten sind dort kein Befund (AK-10 Punkt 10).</param>
    public static XmlStatus Pruefen(byte[] bytes, bool istPersonenTeil, out NamespaceBefund namespaces)
    {
        namespaces = NamespaceBefund.Keiner;
        var text = XmlVorlauf.Dekodieren(bytes);
        if (XmlVorlauf.Pruefen(text, MaxAttribute) is { } vorlauf)
        {
            return vorlauf;
        }

        var befund = NamespaceBefund.Keiner;
        try
        {
            using var leser = Leser(bytes);
            while (leser.Read())
            {
                if (leser.NodeType != XmlNodeType.Element)
                {
                    continue;
                }

                if (leser.Depth >= MaxEbenen)
                {
                    return XmlStatus.ZuTief;
                }

                if (leser.AttributeCount > MaxAttribute)
                {
                    return XmlStatus.ZuVieleAttribute;
                }

                befund |= NamespacesPruefen(leser, istPersonenTeil);
            }

            namespaces = befund;
            return XmlStatus.Gelesen;
        }
        catch (XmlException)
        {
            // Eine DOCTYPE-Deklaration ergibt immer die DTD-Meldung (Rev. 5, H3), auch wenn der Leser vorher scheitert.
            return text.Contains("<!DOCTYPE", StringComparison.Ordinal) ? XmlStatus.Dtd : XmlStatus.Ungueltig;
        }
    }

    /// <summary>
    /// Namespace-Positivliste für das Element, auf dem <paramref name="leser"/> steht (AK-10 Rev. 7, ADR-0026 Punkt 1/2):
    /// Namespace des Elements (ohne Namespace = Verstoß) und jedes qualifizierten Attributs; Namespace-Deklarationen,
    /// unqualifizierte Attribute und <c>xml:*</c> nicht. Präfixe in <c>mc:Ignorable</c>, <c>mc:MustUnderstand</c>,
    /// <c>mc:ProcessContent</c>, <c>mc:PreserveElements</c>, <c>mc:PreserveAttributes</c> und in <c>Requires</c> an
    /// <c>mc:Choice</c> werden im Gültigkeitsbereich des Elements aufgelöst und wie verwendete Namespaces bewertet; ein
    /// nicht deklariertes Präfix ist „kein .docx“. Rev. 8: unqualifizierte Attribute an WordprocessingML-Elementen
    /// (Punkt 8) und Freihand-, Personen- und Signaturzeilen-Elemente (Punkt 10) → Erweiterung; jedes andere Attribut im
    /// <c>mc</c>-Namespace (Punkt 9) → „kein .docx“. Der Leser steht danach wieder auf dem Element.
    /// </summary>
    private static NamespaceBefund NamespacesPruefen(XmlReader leser, bool istPersonenTeil)
    {
        var elementNs = leser.NamespaceURI;
        var befund = Bewerten(elementNs);
        if (IstErweiterungsElement(elementNs, leser.LocalName, istPersonenTeil))
        {
            befund |= NamespaceBefund.Erweiterung;
        }

        var istChoice = elementNs == McNamespace && leser.LocalName == "Choice";
        var istWordprocessingMl = WordNamespaces.WordprocessingMl.Contains(elementNs);
        if (!leser.MoveToFirstAttribute())
        {
            return befund;
        }

        do
        {
            var ns = leser.NamespaceURI;
            if (ns.Length == 0)
            {
                if (istWordprocessingMl)
                {
                    befund |= NamespaceBefund.Erweiterung;
                }
                else if (istChoice && leser.LocalName == "Requires")
                {
                    befund |= PraefixePruefen(leser, leser.Value);
                }
            }
            else if (ns != XmlnsNamespace && ns != XmlNamespace)
            {
                befund |= Bewerten(ns);
                if (ns == McNamespace)
                {
                    befund |= McPraefixAttribute.Contains(leser.LocalName) ? PraefixePruefen(leser, leser.Value) : NamespaceBefund.KeinDocx;
                }
            }
        }
        while (leser.MoveToNextAttribute());

        leser.MoveToElement();
        return befund;
    }

    /// <summary>
    /// Einträge eines <c>mc:</c>-Attributs, getrennt an Leerraum (<see cref="char.IsWhiteSpace(char)"/>); bei
    /// <c>präfix:name</c> bzw. <c>präfix:*</c> zählt das Präfix, sonst der ganze Eintrag. Ein leeres oder nicht
    /// deklariertes Präfix ist „kein .docx“.
    /// </summary>
    private static NamespaceBefund PraefixePruefen(XmlReader leser, string wert)
    {
        var befund = NamespaceBefund.Keiner;
        var start = -1;
        for (var i = 0; i <= wert.Length; i++)
        {
            if (i < wert.Length && !char.IsWhiteSpace(wert[i]))
            {
                if (start < 0)
                {
                    start = i;
                }

                continue;
            }

            if (start < 0)
            {
                continue;
            }

            var eintrag = wert.AsSpan(start, i - start);
            var doppelpunkt = eintrag.IndexOf(':');
            var praefix = (doppelpunkt < 0 ? eintrag : eintrag[..doppelpunkt]).ToString();
            befund |= praefix.Length == 0 || leser.LookupNamespace(praefix) is not { } uri ? NamespaceBefund.KeinDocx : Bewerten(uri);
            start = -1;
        }

        return befund;
    }

    /// <summary>
    /// Freihand- und Signaturzeilen-Element an beliebiger Stelle oder Personenliste außerhalb des Personen-Teils
    /// (AK-10 Punkt 10); verglichen werden Namespace-URI und lokaler Name, ordinal.
    /// </summary>
    private static bool IstErweiterungsElement(string ns, string name, bool istPersonenTeil) =>
        ErweiterungsElemente.Contains((ns, name)) || (!istPersonenTeil && PersonenElemente.Contains((ns, name)));

    /// <summary>Bewertet einen verwendeten Namespace-URI (ordinal und exakt; „“ = ohne Namespace).</summary>
    private static NamespaceBefund Bewerten(string uri)
    {
        if (WordNamespaces.IstErlaubt(uri))
        {
            return NamespaceBefund.Keiner;
        }

        if (WordNamespaces.IstStrict(uri))
        {
            return NamespaceBefund.KeinDocx;
        }

        return WordNamespaces.SvgNamespaces.Contains(uri) ? NamespaceBefund.Svg : NamespaceBefund.Erweiterung;
    }

    private static readonly HashSet<(string Uri, string Name)> ErweiterungsElemente =
        [.. WordNamespaces.ErweiterungsElemente.Select(e => (e.Uri, e.Name))];

    private static readonly HashSet<(string Uri, string Name)> PersonenElemente =
        [.. WordNamespaces.PersonenElemente.Select(e => (e.Uri, e.Name))];

    private static XmlReader Leser(byte[] bytes)
    {
        var einstellungen = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            MaxCharactersFromEntities = 0,
            MaxCharactersInDocument = MaxZeichenJeTeil,
            CloseInput = true,
        };
        return XmlReader.Create(new MemoryStream(bytes, writable: false), einstellungen);
    }
}
