using System.Xml.Linq;

namespace Coin.Infrastructure.Vorlagen;

/// <summary>
/// Content-Types eines OPC-Pakets aus <c>[Content_Types].xml</c> (zertifikatsvorlagen AK-10, ADR-0024 Punkt 1.4):
/// Override für den Teilnamen vor Default für die Endung. Teilnamen in der <see cref="Teilname">Normalform</see> ohne
/// führenden Schrägstrich, Vergleich ohne Groß-/Kleinschreibung (wie OPC).
/// </summary>
internal sealed class ContentTypen
{
    public const string Teilname = "[Content_Types].xml";

    /// <summary>VML-Zeichnungen sind XML, obwohl ihr Content-Type nicht auf <c>xml</c> endet (AK-10, Rev. 4).</summary>
    public const string VmlDrawingTyp = "application/vnd.openxmlformats-officedocument.vmlDrawing";

    private static readonly XNamespace Ct = "http://schemas.openxmlformats.org/package/2006/content-types";

    /// <summary>Volle Namen der Einträge; Analyse, Bereinigung und Nachprüfung wählen nur danach aus (Rev. 7, Hinweis c).</summary>
    internal static readonly XName Default = Ct + "Default";

    /// <inheritdoc cref="Default"/>
    internal static readonly XName Override = Ct + "Override";

    private readonly Dictionary<string, string> _standard;
    private readonly Dictionary<string, string> _teile;

    private ContentTypen(Dictionary<string, string> standard, Dictionary<string, string> teile)
    {
        _standard = standard;
        _teile = teile;
    }

    /// <summary>
    /// <c>null</c>, wenn das Dokument kein <c>Types</c>-Element des OPC-Namespace als Wurzel hat, ein <c>PartName</c>
    /// bzw. eine Endung nicht in die Teilnamen-Normalform gebracht werden kann oder doppelt vorkommt.
    /// </summary>
    public static ContentTypen? Lesen(XDocument dokument)
    {
        if (dokument.Root is not { } wurzel || wurzel.Name != Ct + "Types")
        {
            return null;
        }

        var standard = new Dictionary<string, string>(Vorlagen.Teilname.Vergleich);
        var teile = new Dictionary<string, string>(Vorlagen.Teilname.Vergleich);
        foreach (var element in wurzel.Elements())
        {
            var typ = (string?)element.Attribute("ContentType") ?? string.Empty;
            if (element.Name == Default && (string?)element.Attribute("Extension") is { } endung)
            {
                if (Vorlagen.Teilname.Segment(endung) is not { } norm || !standard.TryAdd(norm, typ))
                {
                    return null;
                }
            }
            else if (element.Name == Override && (string?)element.Attribute("PartName") is { } teil)
            {
                var ohneSchraegstrich = teil.StartsWith('/') ? teil[1..] : teil;
                if (Vorlagen.Teilname.Normalisieren(ohneSchraegstrich) is not { } norm || !teile.TryAdd(norm, typ))
                {
                    return null;
                }
            }
        }

        return new ContentTypen(standard, teile);
    }

    /// <summary>Liest die rohen Bytes sicher (ADR-0024 Punkt 1.4); <c>null</c> bei jedem Fehler.</summary>
    public static ContentTypen? Lesen(byte[] bytes) => SicheresXml.LesenOderNull(bytes) is { } dokument ? Lesen(dokument) : null;

    /// <summary>Content-Type eines Teils (Normalform; Override vor Default) oder <c>null</c>.</summary>
    public string? Typ(string teil)
    {
        // [Content_Types].xml ist kein Teil des Pakets; der Default für „xml“ gilt nicht für ihn.
        if (teil.Equals(Teilname, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (_teile.TryGetValue(teil, out var typ))
        {
            return typ;
        }

        return Endung(teil) is { } endung && _standard.TryGetValue(endung, out var standard) ? standard : null;
    }

    /// <summary>
    /// XML-Teil (AK-10): Content-Type endet – ohne Parameter, ohne Groß-/Kleinschreibung – auf <c>+xml</c> oder
    /// <c>/xml</c> oder ist <see cref="VmlDrawingTyp"/>; außerdem jeder <c>.rels</c>-Eintrag und <c>[Content_Types].xml</c>,
    /// unabhängig von der Endung.
    /// </summary>
    public bool IstXmlTeil(string name) => IstImmerXml(name) || IstXmlTyp(Typ(name));

    /// <summary><c>.rels</c>-Einträge und <c>[Content_Types].xml</c> sind immer XML, auch ohne Content-Type.</summary>
    public static bool IstImmerXml(string name) =>
        name.Equals(Teilname, StringComparison.OrdinalIgnoreCase) || name.EndsWith(".rels", StringComparison.OrdinalIgnoreCase);

    public static bool IstVerzeichnis(string name) => name.EndsWith('/');

    public static bool IstXmlTyp(string? typ)
    {
        if (typ is null)
        {
            return false;
        }

        var basis = Basis(typ);
        return basis.EndsWith("+xml", StringComparison.OrdinalIgnoreCase) || basis.EndsWith("/xml", StringComparison.OrdinalIgnoreCase)
            || basis.Equals(VmlDrawingTyp, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>Content-Type ohne Parameter (ab <c>;</c>) und ohne Leerraum am Rand.</summary>
    public static string Basis(string typ)
    {
        var semikolon = typ.IndexOf(';', StringComparison.Ordinal);
        return (semikolon < 0 ? typ : typ[..semikolon]).Trim();
    }

    private static string? Endung(string teil)
    {
        var datei = teil[(teil.LastIndexOf('/') + 1)..];
        var punkt = datei.LastIndexOf('.');
        return punkt < 0 ? null : datei[(punkt + 1)..];
    }
}
