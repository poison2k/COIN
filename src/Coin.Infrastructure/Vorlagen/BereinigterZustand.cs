using System.Xml.Linq;

namespace Coin.Infrastructure.Vorlagen;

/// <summary>
/// Bereinigter Zustand einer DOCX-Datei (zertifikatsvorlagen AK-16, ADR-0024 Punkt 3): Die Nachprüfung verlangt ihn
/// zusätzlich zur vollständigen Prüfung, die Standardvorlage hat ihn bereits (AK-5). Eine Liste der entfernten
/// Eigenschaften, Teile und Elemente, gemeinsam genutzt von <see cref="DocxBereinigung"/> und <see cref="DocxAnalyse"/>.
/// </summary>
internal static class BereinigterZustand
{
    public const string Autor = "C.O.I.N.";

    public const string KernTyp = "application/vnd.openxmlformats-package.core-properties+xml";
    public const string AppTyp = "application/vnd.openxmlformats-officedocument.extended-properties+xml";

    public static readonly XNamespace Ep = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";
    public static readonly XNamespace Dc = "http://purl.org/dc/elements/1.1/";

    /// <summary>Elemente aus <c>docProps/app.xml</c>, die entfernt werden (Statistikwerte bleiben).</summary>
    public static readonly string[] AppEntfernen = ["Company", "Manager", "Template", "HyperlinkBase", "TitlesOfParts", "HeadingPairs"];

    /// <summary>Teile, die samt Beziehung entfernt werden: benutzerdefinierte Eigenschaften, customXml, Personen.</summary>
    private static readonly string[] EntfernteBeziehungstypen = ["/custom-properties", "/customXml", "/customXmlProps", "/people"];

    private static readonly string[] EntfernteContentTypen =
    [
        "application/vnd.openxmlformats-officedocument.custom-properties+xml",
        "application/vnd.openxmlformats-officedocument.customXmlProperties+xml",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml",
    ];

    public static bool Erfuellt(OpcPaket paket, IReadOnlyDictionary<string, XDocument> xml)
    {
        foreach (var (name, teil) in xml)
        {
            var typ = paket.ContentType(name);
            if (IstTyp(typ, KernTyp) && !KernBereinigt(teil))
            {
                return false;
            }

            if (IstTyp(typ, AppTyp) && teil.Root?.Elements().Any(e => e.Name.Namespace == Ep && AppEntfernen.Contains(e.Name.LocalName)) == true)
            {
                return false;
            }

            if (teil.Descendants().Any(e => e.Name == W.DocVars || e.Name == W.DataBinding || IstPersoenlicherBereich(e)))
            {
                return false;
            }
        }

        var entfernteTeile = paket.Namen.Any(n =>
            n.StartsWith("customXml/", StringComparison.OrdinalIgnoreCase)
            || EntfernteContentTypen.Any(t => IstTyp(paket.ContentType(n), t)));
        var entfernteBeziehungen = paket.Beziehungen.Any(b =>
            EntfernteBeziehungstypen.Any(t => b.Typ.EndsWith(t, StringComparison.OrdinalIgnoreCase)));

        return !entfernteTeile && !entfernteBeziehungen && OpcPaket.Verwaist(paket.Namen, paket.Beziehungen).Count == 0;
    }

    /// <summary><c>w:permStart</c> mit <c>w:ed</c> (Name oder E-Mail-Adresse einer Person).</summary>
    public static bool IstPersoenlicherBereich(XElement element) => element.Name == W.PermStart && element.Attribute(W.Ed) is not null;

    /// <summary><c>core.xml</c> enthält genau <c>dc:creator</c> „C.O.I.N.“.</summary>
    private static bool KernBereinigt(XDocument kern) =>
        kern.Root?.Elements().ToList() is [var einziges] && einziges.Name == Dc + "creator" && einziges.Value == Autor;

    private static bool IstTyp(string? typ, string erwartet) =>
        typ is not null && typ.Split(';')[0].Trim().Equals(erwartet, StringComparison.OrdinalIgnoreCase);
}
