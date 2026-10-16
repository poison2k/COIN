using System.Xml.Linq;

namespace Coin.Infrastructure.Vorlagen;

/// <summary>Namen aus WordprocessingML (Transitional), die Prüfung, Bereinigung und Standardvorlage verwenden.</summary>
internal static class W
{
    public static readonly XNamespace Ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

    public static readonly XName P = Ns + "p";
    public static readonly XName R = Ns + "r";
    public static readonly XName T = Ns + "t";
    public static readonly XName Tab = Ns + "tab";
    public static readonly XName Br = Ns + "br";
    public static readonly XName Cr = Ns + "cr";
    public static readonly XName Comment = Ns + "comment";
    public static readonly XName CommentReference = Ns + "commentReference";
    public static readonly XName CommentRangeStart = Ns + "commentRangeStart";
    public static readonly XName CommentRangeEnd = Ns + "commentRangeEnd";
    public static readonly XName AltChunk = Ns + "altChunk";
    public static readonly XName FldSimple = Ns + "fldSimple";
    public static readonly XName TxbxContent = Ns + "txbxContent";
    public static readonly XName Instr = Ns + "instr";
    public static readonly XName InstrText = Ns + "instrText";
    public static readonly XName FldChar = Ns + "fldChar";
    public static readonly XName FldCharType = Ns + "fldCharType";
    public static readonly XName Hyperlink = Ns + "hyperlink";
    public static readonly XName PermStart = Ns + "permStart";
    public static readonly XName PermEnd = Ns + "permEnd";
    public static readonly XName Ed = Ns + "ed";
    public static readonly XName Id = Ns + "id";
    public static readonly XName DocVars = Ns + "docVars";
    public static readonly XName DataBinding = Ns + "dataBinding";
    public static readonly XName MailMerge = Ns + "mailMerge";

    /// <summary>Namespace der Word-2010-Erweiterungen (<c>w14</c>).</summary>
    public static readonly XNamespace W14 = "http://schemas.microsoft.com/office/word/2010/wordml";

    /// <summary>
    /// Nachverfolgte Änderungen (AK-14, ADR-0024 Punkt 1.7), vollständige Liste; Rev. 8 mit den Konfliktmarkierungen
    /// beim gemeinsamen Bearbeiten in <c>w14</c> (als Container und als leere Markierung, auch einzelnes <c>…RangeEnd</c>).
    /// </summary>
    public static readonly HashSet<XName> NachverfolgteAenderungen =
    [
        W14 + "conflictIns", W14 + "conflictDel", W14 + "customXmlConflictInsRangeStart", W14 + "customXmlConflictInsRangeEnd",
        W14 + "customXmlConflictDelRangeStart", W14 + "customXmlConflictDelRangeEnd",
        Ns + "ins", Ns + "del", Ns + "moveFrom", Ns + "moveTo", Ns + "moveFromRangeStart", Ns + "moveToRangeStart",
        Ns + "rPrChange", Ns + "pPrChange", Ns + "sectPrChange", Ns + "tblPrChange", Ns + "tblPrExChange",
        Ns + "tblGridChange", Ns + "trPrChange", Ns + "tcPrChange", Ns + "numberingChange", Ns + "cellIns",
        Ns + "cellDel", Ns + "cellMerge", Ns + "customXmlInsRangeStart", Ns + "customXmlDelRangeStart",
        Ns + "customXmlMoveFromRangeStart", Ns + "customXmlMoveToRangeStart",
    ];

    /// <summary>Kommentar-Verweise im Text (AK-14).</summary>
    public static readonly HashSet<XName> KommentarVerweise = [CommentReference, CommentRangeStart, CommentRangeEnd];
}

/// <summary>
/// Eine Beziehung aus einem <c>.rels</c>-Teil; <see cref="Ziel"/> ist bei internen Zielen der aufgelöste Teilname in der
/// <see cref="Teilname">Normalform</see>, bei externen das rohe <c>Target</c>.
/// </summary>
internal sealed record OpcBeziehung(string Quelle, string Id, string Typ, string Ziel, bool Extern);


/// <summary>
/// Sicht auf ein OPC-Paket aus bereits sicher gelesenen XML-Teilen (ADR-0024 Punkt 1.5): Content-Types, Beziehungen,
/// Hauptteil und die Teile mit Dokumenttext. Alle Teilnamen in der <see cref="Teilname">Normalform</see> ohne führenden
/// Schrägstrich, Vergleich mit <see cref="Teilname.Vergleich"/>.
/// </summary>
internal sealed class OpcPaket
{
    private static readonly XNamespace Rel = "http://schemas.openxmlformats.org/package/2006/relationships";

    /// <summary>Voller Name der Beziehungselemente; Analyse und Bereinigung wählen nur danach aus (AK-16, Rev. 6).</summary>
    internal static readonly XName Beziehung = Rel + "Relationship";

    private static readonly char[] Leerraum = [' ', '\t', '\r', '\n'];

    private readonly ContentTypen _typen;

    private OpcPaket(IReadOnlyList<string> namen, ContentTypen typen, List<OpcBeziehung> beziehungen, string hauptteil)
    {
        Namen = namen;
        _typen = typen;
        Beziehungen = beziehungen;
        Hauptteil = hauptteil;
    }

    /// <summary>Alle ZIP-Eintragsnamen in der Normalform.</summary>
    public IReadOnlyList<string> Namen { get; }

    public IReadOnlyList<OpcBeziehung> Beziehungen { get; }

    /// <summary>Ziel der <c>officeDocument</c>-Beziehung des Pakets.</summary>
    public string Hauptteil { get; }

    /// <summary>
    /// <c>null</c>, wenn Content-Types, Paketbeziehungen oder die <c>officeDocument</c>-Beziehung fehlen oder eine
    /// Beziehung ungültig ist (<see cref="BeziehungenLesen"/>).
    /// </summary>
    public static OpcPaket? Lesen(IReadOnlyList<string> namen, IReadOnlyDictionary<string, XDocument> xml)
    {
        if (!xml.TryGetValue(ContentTypen.Teilname, out var contentTypes) || ContentTypen.Lesen(contentTypes) is not { } typen
            || !xml.ContainsKey("_rels/.rels") || BeziehungenLesen(xml) is not { } beziehungen)
        {
            return null;
        }

        var haupt = beziehungen.FirstOrDefault(b => b.Quelle.Length == 0 && !b.Extern
            && b.Typ.EndsWith("/officeDocument", StringComparison.OrdinalIgnoreCase));
        return haupt is null ? null : new OpcPaket(namen, typen, beziehungen, haupt.Ziel);
    }

    /// <summary>
    /// Alle Beziehungen aus den <c>.rels</c>-Teilen (Quelle „“ = Paket; Namen in der Normalform). <c>null</c>, wenn eine
    /// Beziehung ungültig ist (AK-10, Rev. 4): <c>TargetMode</c> nach <c>xsd:token</c>-Normalisierung weder
    /// <c>Internal</c> noch <c>External</c> (fehlend = <c>Internal</c>) oder internes Ziel nach
    /// <see cref="IstZulaessigesInternesZiel"/> bzw. <see cref="Teilname.Aufloesen"/> unzulässig.
    /// </summary>
    public static List<OpcBeziehung>? BeziehungenLesen(IEnumerable<KeyValuePair<string, XDocument>> xml)
    {
        var beziehungen = new List<OpcBeziehung>();
        foreach (var (name, dokument) in xml)
        {
            if (!name.EndsWith(".rels", StringComparison.OrdinalIgnoreCase) || QuelleZu(name) is not { } quelle)
            {
                continue;
            }

            foreach (var beziehung in dokument.Root?.Elements(Beziehung) ?? [])
            {
                var id = (string?)beziehung.Attribute("Id") ?? string.Empty;
                var typ = (string?)beziehung.Attribute("Type") ?? string.Empty;
                var ziel = (string?)beziehung.Attribute("Target") ?? string.Empty;
                switch (ZielModus((string?)beziehung.Attribute("TargetMode")))
                {
                    case "External":
                        beziehungen.Add(new OpcBeziehung(quelle, id, typ, ziel, Extern: true));
                        break;
                    case "Internal" when InternesZiel(quelle, ziel) is { } teil:
                        beziehungen.Add(new OpcBeziehung(quelle, id, typ, teil, Extern: false));
                        break;
                    default:
                        return null;
                }
            }
        }

        return beziehungen;
    }

    /// <summary>
    /// <c>TargetMode</c> wie <c>xsd:token</c>: Leerraum (Leerzeichen, Tab, CR, LF) am Rand entfernt, innere Folgen zu
    /// einem Leerzeichen; fehlt das Attribut, gilt <c>Internal</c>. Verglichen wird danach mit Groß-/Kleinschreibung.
    /// </summary>
    internal static string ZielModus(string? wert) =>
        wert is null ? "Internal" : string.Join(' ', wert.Split(Leerraum, StringSplitOptions.RemoveEmptyEntries));

    /// <summary>Aufgelöstes internes Ziel in der Normalform oder <c>null</c>, wenn es unzulässig ist.</summary>
    private static string? InternesZiel(string quelle, string ziel)
    {
        var bereinigt = ziel.Trim();
        return IstZulaessigesInternesZiel(bereinigt) ? Teilname.Aufloesen(quelle, bereinigt) : null;
    }

    /// <summary>
    /// Internes Ziel (AK-10 K1, Annahme A13): nicht leer, kein Schema (Buchstabe, dann Buchstaben, Ziffern, <c>+</c>,
    /// <c>-</c>, <c>.</c> bis zu einem <c>:</c>), beginnt nicht mit <c>//</c>, enthält weder <c>\</c> noch <c>?</c> noch
    /// <c>#</c>. Solche Ziele werden nicht als extern gewertet, sondern abgelehnt.
    /// </summary>
    internal static bool IstZulaessigesInternesZiel(string ziel)
    {
        if (ziel.Length == 0 || ziel.StartsWith("//", StringComparison.Ordinal) || ziel.AsSpan().IndexOfAny('\\', '?', '#') >= 0)
        {
            return false;
        }

        if (!char.IsAsciiLetter(ziel[0]))
        {
            return true;
        }

        var i = 1;
        while (i < ziel.Length && (char.IsAsciiLetterOrDigit(ziel[i]) || ziel[i] is '+' or '-' or '.'))
        {
            i++;
        }

        return i >= ziel.Length || ziel[i] != ':';
    }

    /// <summary>Content-Type eines Teils (Override vor Default) oder <c>null</c>.</summary>
    public string? ContentType(string teil) => _typen.Typ(teil);

    /// <summary>Interne Ziele der Beziehungen von <paramref name="quelle"/>, deren Typ auf <paramref name="typEnde"/> endet.</summary>
    public IEnumerable<string> ZieleVomTyp(string quelle, string typEnde) =>
        Beziehungen
            .Where(b => !b.Extern && Teilname.Vergleich.Equals(b.Quelle, quelle)
                && b.Typ.EndsWith(typEnde, StringComparison.OrdinalIgnoreCase))
            .Select(b => b.Ziel);

    /// <summary>Hauptdokument, Kopf- und Fußzeilen, Fuß- und Endnoten (AK-15); ohne Glossar.</summary>
    public IEnumerable<string> Geschichten() =>
        new[] { Hauptteil }
            .Concat(ZieleVomTyp(Hauptteil, "/header"))
            .Concat(ZieleVomTyp(Hauptteil, "/footer"))
            .Concat(ZieleVomTyp(Hauptteil, "/footnotes"))
            .Concat(ZieleVomTyp(Hauptteil, "/endnotes"))
            .Distinct(Teilname.Vergleich);

    /// <summary>Teile, die vom Paketstamm transitiv über interne Beziehungen erreichbar sind (AK-16; iterativ).</summary>
    public static HashSet<string> Erreichbar(IReadOnlyList<OpcBeziehung> beziehungen)
    {
        var nachQuelle = beziehungen.Where(b => !b.Extern).ToLookup(b => b.Quelle, Teilname.Vergleich);
        var erreichbar = new HashSet<string>(Teilname.Vergleich);
        var offen = new Queue<string>([string.Empty]);
        while (offen.Count > 0)
        {
            foreach (var beziehung in nachQuelle[offen.Dequeue()])
            {
                if (erreichbar.Add(beziehung.Ziel))
                {
                    offen.Enqueue(beziehung.Ziel);
                }
            }
        }

        return erreichbar;
    }

    /// <summary>
    /// Verwaiste Einträge (AK-16, Namen in der Normalform): Teile (außer <c>[Content_Types].xml</c>, <c>.rels</c> und
    /// Verzeichnissen), die vom Paketstamm nicht erreichbar sind, und <c>.rels</c>-Einträge, deren Quellteil nicht
    /// erreichbar ist bzw. fehlt.
    /// </summary>
    public static List<string> Verwaist(IReadOnlyList<string> namen, IReadOnlyList<OpcBeziehung> beziehungen)
    {
        var erreichbar = Erreichbar(beziehungen);
        var verwaist = new List<string>();
        foreach (var name in namen)
        {
            if (ContentTypen.IstVerzeichnis(name) || name.Equals(ContentTypen.Teilname, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (name.EndsWith(".rels", StringComparison.OrdinalIgnoreCase))
            {
                if (QuelleZu(name) is not { } quelle || (quelle.Length > 0 && !erreichbar.Contains(quelle)))
                {
                    verwaist.Add(name);
                }
            }
            else if (!erreichbar.Contains(name))
            {
                verwaist.Add(name);
            }
        }

        return verwaist;
    }

    /// <summary>Quellteil zu einem <c>.rels</c>-Teil („“ = Paket), z. B. <c>word/_rels/document.xml.rels</c> → <c>word/document.xml</c>.</summary>
    internal static string? QuelleZu(string rels)
    {
        var teile = rels.Split('/');
        if (teile.Length < 2 || !teile[^2].Equals("_rels", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var datei = teile[^1][..^".rels".Length];
        var verzeichnis = string.Join('/', teile[..^2]);
        return verzeichnis.Length == 0 ? datei : $"{verzeichnis}/{datei}";
    }
}
