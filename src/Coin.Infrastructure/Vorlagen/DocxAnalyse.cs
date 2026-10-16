using System.Text;
using System.Xml.Linq;
using Coin.Domain.Vorlagen;

namespace Coin.Infrastructure.Vorlagen;

/// <summary>
/// Prüft eine hochgeladene DOCX-Datei als nicht vertrauenswürdige Eingabe (zertifikatsvorlagen AK-10 bis AK-15,
/// ADR-0024 Punkt 1): Signatur, ZIP-Vorprüfung, sicheres XML (ohne DTD, höchstens 256 Ebenen), Paket-Typ, Makros,
/// unzulässige Inhalte, nachverfolgte Änderungen und Kommentare; danach die Absatztexte der geprüften Teile. Die
/// Nachprüfung verlangt zusätzlich den bereinigten Zustand (AK-16). Ausnahmen werden ohne Details zu einem Befund,
/// nichts wird geloggt (ADR-0024 Punkt 5). Alle Durchläufe über Elementbäume und Beziehungen sind iterativ.
/// </summary>
internal sealed class DocxAnalyse : IDocxAnalyse
{
    public const string KeinDocx = "Die Datei ist kein Word-Dokument im Format .docx.";

    public const string AltesWord =
        "Die Datei ist ein älteres Word-Dokument (.doc) oder mit einem Kennwort geschützt. Bitte als Word-Dokument (.docx) ohne Kennwort speichern.";

    public const string Makros = "Die Datei enthält Makros. Bitte als Word-Dokument ohne Makros (.docx) speichern.";

    public const string ZuGrossEntpackt = "Die Datei ist entpackt zu groß oder enthält zu viele Bestandteile.";

    public const string ZuTief =
        "Die Datei ist zu tief verschachtelt. Bitte verschachtelte Tabellen, Textfelder oder Formen vereinfachen.";

    public const string NachverfolgteAenderungen =
        "Die Vorlage enthält nachverfolgte Änderungen. Bitte alle Änderungen annehmen oder ablehnen und erneut hochladen.";

    public const string Kommentare = "Die Vorlage enthält Kommentare. Bitte alle Kommentare löschen und erneut hochladen.";

    /// <summary>SVG-Grafiken (AK-10 Rev. 7, Entscheidung F15).</summary>
    public const string SvgGrafiken = "Die Vorlage enthält SVG-Grafiken. Bitte Bilder als PNG oder JPEG einfügen und erneut hochladen.";

    /// <summary>Nicht erlaubter Namespace (AK-10 Rev. 7, Wortlaut O7/F14).</summary>
    public const string Erweiterungen =
        "Die Datei enthält nicht unterstützte Word-Erweiterungen, z. B. Diagramme, SmartArt, Freihandzeichnungen oder Add-ins. Bitte diese Inhalte entfernen und erneut hochladen.";

    /// <summary>Interner Befund der Nachprüfung (wird nie an Benutzer gegeben, AK-16 meldet „nicht verarbeitbar“).</summary>
    public const string NichtBereinigt = "Die Datei ist nicht bereinigt.";

    public const string DtdArt = "Dokumenttypdefinitionen (DTD)";
    public const string ActiveXArt = "ActiveX-Steuerelemente";
    public const string OleArt = "eingebettete Objekte";
    public const string ExternArt = "Verknüpfungen auf externe Inhalte";
    public const string HyperlinkArt = "Hyperlinks mit unzulässigem Ziel";
    public const string AltChunkArt = "importierte Fremdinhalte";
    public const string SerienbriefArt = "Serienbrief-Verknüpfungen";
    public const string FeldArt = "Felder mit externen Verknüpfungen oder DDE";
    public const string VerschachteltArt = "Felder mit verschachtelten Feldanweisungen";
    public const string AlternativArt = "Feldanweisungen in Alternativ- oder Fremdinhalten";
    public const string FeldnameArt = "Felder mit unzulässigem Feldnamen";

    /// <summary>Höchstzahl der Zeichen je XML-Teil (auch für <c>OpenSettings.MaxCharactersInPart</c>, AK-12).</summary>
    public const long MaxZeichenJeTeil = SicheresXml.MaxZeichenJeTeil;

    private const string HauptteilTyp = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
    private const string MakroHauptteilTyp = "application/vnd.ms-word.document.macroEnabled.main+xml";
    private const string SvgTyp = "image/svg+xml";
    private const string RelBasis = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private const string HyperlinkTyp = RelBasis + "/hyperlink";

    /// <summary>Strict-OOXML (ISO/IEC 29500 Strict): Namespaces und Beziehungstypen beginnen so (AK-10, H2).</summary>
    private const string StrictPraefix = WordNamespaces.StrictPraefix;

    private static readonly XNamespace RNs = RelBasis;
    private static readonly XNamespace StrictRNs = StrictPraefix + "officeDocument/relationships";
    private static readonly XNamespace ONs = "urn:schemas-microsoft-com:office:office";
    private static readonly XNamespace VNs = "urn:schemas-microsoft-com:vml";
    private static readonly XNamespace ANs = "http://schemas.openxmlformats.org/drawingml/2006/main";
    private static readonly XName ORelid = ONs + "relid";
    private static readonly XName OHref = ONs + "href";
    private static readonly XName OAlthref = ONs + "althref";

    /// <summary>Online-Video (Rev. 5, H1): bettet externe Inhalte ein, auch in <c>a:extLst</c> und <c>mc:Fallback</c>.</summary>
    private static readonly XName WebVideo = XNamespace.Get("http://schemas.microsoft.com/office/word/2012/wordprocessingDrawing") + "webVideoPr";

    /// <summary>Elemente, an denen eine externe Hyperlink-Beziehung referenziert werden darf (AK-13).</summary>
    private static readonly HashSet<XName> HyperlinkElemente = [W.Hyperlink, ANs + "hlinkClick", ANs + "hlinkHover"];

    private static readonly byte[] OleSignatur = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    private static readonly byte[] ZipSignatur = [0x50, 0x4B, 0x03, 0x04];

    private static readonly string[] MakroTypen =
    [
        "application/vnd.ms-office.vbaProject",
        "application/vnd.ms-word.vbaData+xml",
    ];

    /// <summary>Story- und Strukturteile, die existieren und XML-Teile sein müssen (AK-10, Endungen der Beziehungstypen).</summary>
    private static readonly string[] PflichtXmlBeziehungen =
    [
        "/header", "/footer", "/footnotes", "/endnotes", "/comments", "/commentsExtended", "/commentsIds",
        "/commentsExtensible", "/glossaryDocument", "/styles", "/numbering", "/settings",
    ];

    /// <summary>Story-Teile, deren Wurzelelement im Transitional-<c>w</c>-Namespace liegen muss (AK-10, H2).</summary>
    private static readonly string[] StoryBeziehungen =
    [
        "/header", "/footer", "/footnotes", "/endnotes", "/comments", "/glossaryDocument", "/styles", "/numbering", "/settings",
    ];

    /// <summary>Content-Types eingebetteter Office- und OLE-Pakete, exakt (AK-13, W2).</summary>
    private static readonly HashSet<string> EingebettetePaketTypen = new(
        new[]
        {
            "wordprocessingml.document", "wordprocessingml.template", "spreadsheetml.sheet", "spreadsheetml.template",
            "presentationml.presentation", "presentationml.slideshow", "presentationml.template", "presentationml.slide",
            "oleObject",
        }.Select(t => "application/vnd.openxmlformats-officedocument." + t),
        StringComparer.OrdinalIgnoreCase);

    /// <summary>Anfänge von Content-Types eingebetteter Office- und OLE-Pakete (AK-13, W2).</summary>
    private static readonly string[] EingebettetePaketPraefixe =
    [
        "application/vnd.ms-word.document.", "application/vnd.ms-word.template.", "application/vnd.ms-excel",
        "application/vnd.ms-powerpoint", "application/msword", "application/vnd.oasis.opendocument.",
    ];

    /// <summary>Beziehungstypen von Serienbrief-Datenquellen (AK-13, W2), unabhängig vom <c>TargetMode</c>.</summary>
    private static readonly string[] SerienbriefBeziehungen = ["/mailMergeSource", "/mailMergeHeaderSource", "/recipientData"];

    private static readonly string[] GefaehrlicheFelder = ["DDE", "DDEAUTO", "INCLUDETEXT", "INCLUDEPICTURE", "LINK", "IMPORT", "DATABASE"];

    private static readonly string[] ErlaubteSchemata = ["http:", "https:", "mailto:"];

    public DocxBefund Analysieren(byte[] inhalt) => Sicher(inhalt, nachpruefen: false);

    public DocxBefund Nachpruefen(byte[] inhalt) => Sicher(inhalt, nachpruefen: true);

    private static DocxBefund Sicher(byte[] inhalt, bool nachpruefen)
    {
        ArgumentNullException.ThrowIfNull(inhalt);
        try
        {
            return AnalysierenIntern(inhalt, nachpruefen);
        }
        catch (Exception)
        {
            // Ausnahmetexte können Dokumentinhalt enthalten und werden nicht weitergegeben (ADR-0024 Punkt 5).
            return Abgelehnt(KeinDocx);
        }
    }

    private static DocxBefund.Abgelehnt Abgelehnt(params string[] meldungen) => new(meldungen);

    private static DocxBefund AnalysierenIntern(byte[] inhalt, bool nachpruefen)
    {
        if (inhalt.AsSpan().StartsWith(OleSignatur))
        {
            return Abgelehnt(AltesWord);
        }

        if (!inhalt.AsSpan().StartsWith(ZipSignatur))
        {
            return Abgelehnt(KeinDocx);
        }

        switch (ZipVorpruefung.Pruefen(inhalt))
        {
            case ZipErgebnis.ZuGross:
                return Abgelehnt(ZuGrossEntpackt);
            case ZipErgebnis.Gelesen gelesen:
                return Analysieren(gelesen, nachpruefen);
            default:
                return Abgelehnt(KeinDocx);
        }
    }

    private static DocxBefund Analysieren(ZipErgebnis.Gelesen zip, bool nachpruefen)
    {
        // Sicheres XML: jeder XML-Teil vollständig, ohne DTD, Tiefe und Attribute vor jedem DOM geprüft (Stufe 4).
        // Die Namespace-Positivliste (AK-10 Rev. 7) wird im selben Durchlauf ermittelt, aber erst nach Struktur und
        // Makros gemeldet; bis dahin werten nur Strukturregeln (Content-Types, Beziehungen, Wurzelnamen) die DOMs aus.
        var xml = new Dictionary<string, XDocument>(Teilname.Vergleich);
        var namespaces = NamespaceBefund.Keiner;
        foreach (var (name, bytes) in zip.XmlTeile)
        {
            switch (SicheresXml.Lesen(bytes, IstPersonenTeil(zip.Typen?.Typ(name)), out var dokument, out var befund))
            {
                case XmlStatus.Gelesen:
                    xml[name] = dokument!;
                    namespaces |= befund;
                    break;
                case XmlStatus.Dtd:
                    return Abgelehnt(Unzulaessig([DtdArt]));
                case XmlStatus.ZuTief:
                    return Abgelehnt(ZuTief);
                case XmlStatus.ZuVieleAttribute:
                    return Abgelehnt(ZuGrossEntpackt);
                default:
                    return Abgelehnt(KeinDocx);
            }
        }

        var paket = OpcPaket.Lesen(zip.Namen, xml);
        if (paket is null || OhneContentType(paket) || !InterneZieleVorhanden(paket) || EnthaeltStrict(paket, xml)
            || namespaces.HasFlag(NamespaceBefund.KeinDocx))
        {
            return Abgelehnt(KeinDocx);
        }

        // Paket-Typ (Stufe 5).
        var hauptTyp = paket.ContentType(paket.Hauptteil);
        if (string.Equals(hauptTyp, MakroHauptteilTyp, StringComparison.OrdinalIgnoreCase))
        {
            return Abgelehnt(Makros);
        }

        if (!string.Equals(hauptTyp, HauptteilTyp, StringComparison.OrdinalIgnoreCase)
            || !xml.TryGetValue(paket.Hauptteil, out var hauptteil) || hauptteil.Root?.Name.Namespace != W.Ns
            || !PflichtXmlTeileVorhanden(paket, xml))
        {
            return Abgelehnt(KeinDocx);
        }

        // Makros (Stufe 6).
        if (EnthaeltMakros(paket))
        {
            return Abgelehnt(Makros);
        }

        // Namespace-Positivliste (AK-10 Rev. 7, ADR-0026 Punkt 3): SVG zuerst, dann die Erweiterungsmeldung. Kein Teil
        // mit Befund erreicht die Inhaltsregeln, die Platzhalterprüfung, das SDK oder die Bereinigung.
        var namensraumMeldungen = new List<string>();
        if (namespaces.HasFlag(NamespaceBefund.Svg) || EnthaeltSvgTeil(paket))
        {
            namensraumMeldungen.Add(SvgGrafiken);
        }

        if (namespaces.HasFlag(NamespaceBefund.Erweiterung))
        {
            namensraumMeldungen.Add(Erweiterungen);
        }

        if (namensraumMeldungen.Count > 0)
        {
            return new DocxBefund.Abgelehnt(namensraumMeldungen);
        }

        var arten = UnzulaessigeArten(paket, xml);
        if (arten.Count > 0)
        {
            return Abgelehnt(Unzulaessig(arten));
        }

        // Nachverfolgte Änderungen und Kommentare in allen XML-Teilen (Stufe 7).
        var befunde = new List<string>();
        if (xml.Values.Any(teil => teil.Descendants().Any(e => W.NachverfolgteAenderungen.Contains(e.Name))))
        {
            befunde.Add(NachverfolgteAenderungen);
        }

        if (EnthaeltKommentare(paket, xml))
        {
            befunde.Add(Kommentare);
        }

        if (befunde.Count > 0)
        {
            return new DocxBefund.Abgelehnt(befunde);
        }

        if (nachpruefen && !BereinigterZustand.Erfuellt(paket, xml))
        {
            return Abgelehnt(NichtBereinigt);
        }

        // Absatztexte für die Platzhalterprüfung (Stufe 8).
        var geschichten = paket.Geschichten().Select(n => xml[n]).ToList();
        return new DocxBefund.Gelesen(geschichten.SelectMany(Absatztexte.Lesen).ToList());
    }

    /// <summary>
    /// Content-Type des Personen-Teils (ohne Parameter und Groß-/Kleinschreibung); dort sind Personenlisten kein Befund
    /// (AK-10 Punkt 10), der Teil wird bei der Bereinigung entfernt (AK-16).
    /// </summary>
    internal static bool IstPersonenTeil(string? typ) =>
        typ is not null && ContentTypen.Basis(typ).Equals(WordNamespaces.PersonenTeilTyp, StringComparison.OrdinalIgnoreCase);

    private static string Unzulaessig(IEnumerable<string> arten) => $"Die Datei enthält unzulässige Inhalte: {string.Join(", ", arten)}.";

    /// <summary>Eintrag ohne Content-Type (außer <c>[Content_Types].xml</c>, <c>.rels</c>, Verzeichnisse) → kein .docx.</summary>
    private static bool OhneContentType(OpcPaket paket) =>
        paket.Namen.Any(n => !ContentTypen.IstVerzeichnis(n) && !ContentTypen.IstImmerXml(n) && paket.ContentType(n) is null);

    /// <summary>
    /// Jede interne Beziehung jedes <c>.rels</c>-Teils (auch verwaister Teile, ohne Quellteil und des Pakets) zeigt in
    /// der Normalform auf einen vorhandenen Teil (Rev. 5, H5); <c>[Content_Types].xml</c>, <c>.rels</c>-Einträge und
    /// Verzeichnisse sind keine Teile. Externe Beziehungen sind nicht betroffen.
    /// </summary>
    private static bool InterneZieleVorhanden(OpcPaket paket)
    {
        var teile = paket.Namen
            .Where(n => !ContentTypen.IstVerzeichnis(n) && !ContentTypen.IstImmerXml(n))
            .ToHashSet(Teilname.Vergleich);
        return paket.Beziehungen.All(b => b.Extern || teile.Contains(b.Ziel));
    }

    /// <summary>Strict-OOXML (H2): Wurzelelement irgendeines XML-Teils oder ein Beziehungstyp im Strict-Namespace.</summary>
    private static bool EnthaeltStrict(OpcPaket paket, Dictionary<string, XDocument> xml) =>
        xml.Values.Any(teil => teil.Root?.Name.NamespaceName.StartsWith(StrictPraefix, StringComparison.OrdinalIgnoreCase) == true)
        || paket.Beziehungen.Any(b => b.Typ.StartsWith(StrictPraefix, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Per interner Beziehung referenzierte Story- und Strukturteile existieren und sind XML-Teile; die Wurzel der
    /// Story-Teile liegt im Transitional-<c>w</c>-Namespace (H2).
    /// </summary>
    private static bool PflichtXmlTeileVorhanden(OpcPaket paket, Dictionary<string, XDocument> xml)
    {
        foreach (var beziehung in paket.Beziehungen.Where(b => !b.Extern))
        {
            if (!PflichtXmlBeziehungen.Any(ende => TypEndetMit(beziehung.Typ, ende)))
            {
                continue;
            }

            if (!xml.TryGetValue(beziehung.Ziel, out var teil))
            {
                return false;
            }

            if (StoryBeziehungen.Any(ende => TypEndetMit(beziehung.Typ, ende)) && teil.Root?.Name.Namespace != W.Ns)
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>
    /// Ein Teil (außer <c>[Content_Types].xml</c>, <c>.rels</c> und Verzeichnissen, auch verwaist) mit Content-Type
    /// <c>image/svg+xml</c> (Override oder Default, ohne Parameter und Groß-/Kleinschreibung; F15).
    /// </summary>
    private static bool EnthaeltSvgTeil(OpcPaket paket) =>
        paket.Namen.Any(n => !ContentTypen.IstVerzeichnis(n) && !ContentTypen.IstImmerXml(n)
            && paket.ContentType(n) is { } typ && ContentTypen.Basis(typ).Equals(SvgTyp, StringComparison.OrdinalIgnoreCase));

    private static bool EnthaeltMakros(OpcPaket paket) =>
        paket.Namen.Any(n => Path.GetFileName(n).Equals("vbaProject.bin", StringComparison.OrdinalIgnoreCase))
        || paket.Namen.Any(n => MakroTypen.Contains(paket.ContentType(n), StringComparer.OrdinalIgnoreCase))
        || paket.Beziehungen.Any(b => TypEndetMit(b.Typ, "/vbaProject"));

    /// <summary>
    /// Arten unzulässiger Inhalte in der verbindlichen Reihenfolge aus AK-13 (DTD wird vorher beim Lesen erkannt und
    /// allein gemeldet).
    /// </summary>
    private static List<string> UnzulaessigeArten(OpcPaket paket, Dictionary<string, XDocument> xml)
    {
        var arten = new List<string>();
        var typen = paket.Namen.Select(n => paket.ContentType(n) ?? string.Empty).ToList();

        if (typen.Any(t => t.Contains("activex", StringComparison.OrdinalIgnoreCase))
            || paket.Beziehungen.Any(b => TypEndetMit(b.Typ, "/control") || TypEndetMit(b.Typ, "/activeXControlBinary")))
        {
            arten.Add(ActiveXArt);
        }

        if (typen.Any(IstEingebettetesPaket)
            || paket.Beziehungen.Any(b => TypEndetMit(b.Typ, "/oleObject") || TypEndetMit(b.Typ, "/package") || TypEndetMit(b.Typ, "/subDocument")))
        {
            arten.Add(OleArt);
        }

        if (EnthaeltUnzulaessigeExterneBeziehung(paket, xml) || xml.Values.Any(EnthaeltVmlAdresse)
            || xml.Values.Any(teil => teil.Descendants(WebVideo).Any()))
        {
            arten.Add(ExternArt);
        }

        var felder = xml.Values.Select(Feldpruefung.Pruefen).ToList();

        if (paket.Beziehungen.Any(b => b.Extern && string.Equals(b.Typ, HyperlinkTyp, StringComparison.OrdinalIgnoreCase)
                && !IstErlaubtesZiel(b.Ziel))
            || felder.Any(f => f.UnzulaessigesHyperlinkZiel)
            || xml.Values.Any(EnthaeltUnzulaessigesVmlHref))
        {
            arten.Add(HyperlinkArt);
        }

        if (paket.Beziehungen.Any(b => TypEndetMit(b.Typ, "/aFChunk")) || xml.Values.Any(teil => teil.Descendants(W.AltChunk).Any()))
        {
            arten.Add(AltChunkArt);
        }

        if (xml.Values.Any(teil => teil.Descendants(W.MailMerge).Any())
            || paket.Beziehungen.Any(b => SerienbriefBeziehungen.Any(ende => TypEndetMit(b.Typ, ende))))
        {
            arten.Add(SerienbriefArt);
        }

        if (felder.Any(f => f.Gefaehrlich))
        {
            arten.Add(FeldArt);
        }

        if (felder.Any(f => f.Verschachtelt))
        {
            arten.Add(VerschachteltArt);
        }

        if (felder.Any(f => f.AlternativInhalt))
        {
            arten.Add(AlternativArt);
        }

        if (felder.Any(f => f.UnzulaessigerName))
        {
            arten.Add(FeldnameArt);
        }

        return arten;
    }

    private static bool TypEndetMit(string typ, string ende) => typ.EndsWith(ende, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Content-Type eines eingebetteten Office- oder OLE-Pakets (AK-13, W2), ohne Parameter und Groß-/Kleinschreibung.
    /// Reguläre Word-Teile wie <c>stylesWithEffects+xml</c> und eingebettete Schriften fallen nicht darunter.
    /// </summary>
    private static bool IstEingebettetesPaket(string typ)
    {
        var basis = ContentTypen.Basis(typ);
        return EingebettetePaketTypen.Contains(basis)
            || EingebettetePaketPraefixe.Any(p => basis.StartsWith(p, StringComparison.OrdinalIgnoreCase))
            || basis.Contains("oleObject", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Externe Beziehungen, die nicht zulässig sind (AK-13). Zulässig ist nur der Typ <c>hyperlink</c>, wenn jede
    /// Referenz auf ihre Id im Quellteil (Attribute im Transitional- oder Strict-<c>r</c>-Namespace und <c>o:relid</c>)
    /// als Transitional-<c>r:id</c> an <c>w:hyperlink</c>, <c>a:hlinkClick</c> oder <c>a:hlinkHover</c> steht; ohne
    /// Referenz ist sie zulässig. Jeder Quellteil wird dafür nur einmal durchlaufen.
    /// </summary>
    private static bool EnthaeltUnzulaessigeExterneBeziehung(OpcPaket paket, Dictionary<string, XDocument> xml)
    {
        var externe = paket.Beziehungen.Where(b => b.Extern).ToList();
        if (externe.Any(b => !string.Equals(b.Typ, HyperlinkTyp, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        foreach (var gruppe in externe.GroupBy(b => b.Quelle, Teilname.Vergleich))
        {
            if (gruppe.Key.Length == 0 || !xml.TryGetValue(gruppe.Key, out var quelle))
            {
                continue;
            }

            var ids = gruppe.Select(b => b.Id).ToHashSet(StringComparer.Ordinal);
            var falschReferenziert = quelle.Descendants()
                .SelectMany(e => e.Attributes())
                .Any(attribut => IstReferenzAttribut(attribut.Name) && ids.Contains(attribut.Value)
                    && !(attribut.Name == RNs + "id" && attribut.Parent is { } element && HyperlinkElemente.Contains(element.Name)));
            if (falschReferenziert)
            {
                return true;
            }
        }

        return false;
    }

    private static bool IstReferenzAttribut(XName name) => name.Namespace == RNs || name.Namespace == StrictRNs || name == ORelid;

    /// <summary>VML-Verweise ohne Beziehung (H3): <c>src</c> an VML-Elementen, <c>o:href</c>/<c>o:althref</c> überall.</summary>
    private static bool EnthaeltVmlAdresse(XDocument teil) =>
        teil.Descendants().Any(e =>
            (e.Name.Namespace == VNs && !string.IsNullOrWhiteSpace((string?)e.Attribute("src")))
            || !string.IsNullOrWhiteSpace((string?)e.Attribute(OHref))
            || !string.IsNullOrWhiteSpace((string?)e.Attribute(OAlthref)));

    /// <summary>
    /// <c>href</c> ohne Namespace an Elementen im VML-Namespace (Rev. 5, W2): ein nicht leerer Wert muss die
    /// Hyperlink-Positivliste erfüllen (<see cref="IstErlaubtesZiel"/>).
    /// </summary>
    private static bool EnthaeltUnzulaessigesVmlHref(XDocument teil) =>
        teil.Descendants().Any(e =>
            e.Name.Namespace == VNs && (string?)e.Attribute("href") is { Length: > 0 } ziel && !IstErlaubtesZiel(ziel));

    /// <summary>
    /// Positivliste für Hyperlink-Ziele (AK-13): nach Entfernen führender Leer- und Steuerzeichen und aller Tab- und
    /// Zeilenumbruchzeichen beginnt das Ziel ohne Groß-/Kleinschreibung mit <c>http:</c>, <c>https:</c> oder <c>mailto:</c>.
    /// </summary>
    internal static bool IstErlaubtesZiel(string ziel)
    {
        var start = 0;
        while (start < ziel.Length && (char.IsWhiteSpace(ziel[start]) || char.IsControl(ziel[start])))
        {
            start++;
        }

        var bereinigt = new StringBuilder(Math.Min(ziel.Length - start, 16));
        for (var i = start; i < ziel.Length && bereinigt.Length < 16; i++)
        {
            if (ziel[i] is not ('\t' or '\r' or '\n'))
            {
                bereinigt.Append(ziel[i]);
            }
        }

        var anfang = bereinigt.ToString();
        return ErlaubteSchemata.Any(s => anfang.StartsWith(s, StringComparison.OrdinalIgnoreCase));
    }

    private static bool EnthaeltKommentare(OpcPaket paket, Dictionary<string, XDocument> xml)
    {
        if (xml.Values.Any(teil => teil.Descendants().Any(e => W.KommentarVerweise.Contains(e.Name))))
        {
            return true;
        }

        var kommentarTeile = paket.Beziehungen
            .Where(b => !b.Extern && TypEndetMit(b.Typ, "/comments"))
            .Select(b => b.Ziel)
            .ToHashSet(Teilname.Vergleich);
        return xml
            .Where(t => kommentarTeile.Contains(t.Key)
                || (paket.ContentType(t.Key) ?? string.Empty).Contains("wordprocessingml.comments+xml", StringComparison.OrdinalIgnoreCase))
            .Any(t => t.Value.Descendants(W.Comment).Any());
    }

    /// <summary>Ergebnis der Feldprüfung eines XML-Teils.</summary>
    private sealed record Feldbefund(
        bool Gefaehrlich, bool UnzulaessigesHyperlinkZiel, bool Verschachtelt, bool AlternativInhalt, bool UnzulaessigerName);

    /// <summary>
    /// Feldanweisungen (AK-13, Rev. 6) je Feldkontext (nächstes <c>w:txbxContent</c>, sonst Teilwurzel): bei komplexen
    /// Feldern die Verkettung aller <c>w:instrText</c> desselben Feldkontexts zwischen <c>begin</c> und <c>separate</c>
    /// bzw. <c>end</c> derselben Ebene (über Runs und Absätze hinweg, nie über <c>mc:AlternateContent</c> hinweg, ohne
    /// Ende bis zum Ende des Feldkontexts), bei einfachen Feldern <c>w:fldSimple/@w:instr</c>. Beginnt innerhalb einer
    /// Anweisung ein weiteres Feld, ist das äußere Feld verschachtelt; innere Felder werden dann nicht einzeln bewertet.
    /// Felder im Feldergebnis sind gewöhnliche Felder.
    /// <para>
    /// Vorfahrenregel (K1): Liegt zwischen einem Feldelement und seinem Feldkontext (einschließlich) ein Element außerhalb
    /// des <c>w</c>-Namespace (<c>mc:*</c>, ignorierbare Fremdelemente, <c>m:oMath</c> …), oder beginnt in einer offenen
    /// Anweisung ein <c>mc:AlternateContent</c> oder <c>w:txbxContent</c>, ist das ein Befund „Feldanweisungen in
    /// Alternativ- oder Fremdinhalten“; der Feldkontext wird dann für die übrigen Feldregeln nicht ausgewertet. Maßgeblich
    /// ist der Namespace-URI, <c>mc:Ignorable</c> wird nicht ausgewertet.
    /// </para>
    /// Der Durchlauf ist iterativ: ein Stapel offener Elemente (mit dem Merkmal „fremder Vorfahr bis zum Feldkontext“),
    /// ein Stapel offener Feldkontexte und je Feldkontext ein Stapel offener Felder.
    /// </summary>
    private static class Feldpruefung
    {
        private static readonly XName AlternateContent =
            XNamespace.Get("http://schemas.openxmlformats.org/markup-compatibility/2006") + "AlternateContent";

        private enum Feldbewertung
        {
            Zulaessig,
            UnzulaessigerName,
            Gefaehrlich,
            UnzulaessigesHyperlinkZiel,
        }

        /// <summary>
        /// Offenes Element im Durchlauf; <see cref="Fremd"/>: das Element oder ein Vorfahr bis einschließlich des
        /// Feldkontexts liegt außerhalb des <c>w</c>-Namespace.
        /// </summary>
        private sealed class OffenesElement(XElement element, bool fremd, Feldkontext? eigenerKontext)
        {
            private XNode? _naechster = element.FirstNode;

            public bool Fremd { get; } = fremd;

            /// <summary>Feldkontext, den dieses Element eröffnet (Teilwurzel oder <c>w:txbxContent</c>).</summary>
            public Feldkontext? EigenerKontext { get; } = eigenerKontext;

            public XElement? NaechstesKind()
            {
                while (_naechster is not null)
                {
                    var knoten = _naechster;
                    _naechster = knoten.NextNode;
                    if (knoten is XElement kind)
                    {
                        return kind;
                    }
                }

                return null;
            }
        }

        private sealed class OffenesFeld(bool innerhalbAnweisung)
        {
            public StringBuilder Anweisung { get; } = new();

            public bool ImAnweisungsteil { get; set; } = true;

            public bool Verschachtelt { get; set; }

            public bool InnerhalbAnweisung { get; } = innerhalbAnweisung;
        }

        /// <summary>Auswertung der Felder eines Feldkontexts.</summary>
        private sealed class Feldkontext
        {
            private readonly Stack<OffenesFeld> _offen = new();

            // Anzahl offener Felder, die selbst innerhalb einer Anweisung begonnen haben (statt einer Suche im Stapel).
            private int _innerhalb;

            public bool Gefaehrlich { get; private set; }

            public bool Hyperlink { get; private set; }

            public bool Verschachtelt { get; private set; }

            public bool UnzulaessigerName { get; private set; }

            public bool AlternativInhalt { get; set; }

            /// <summary>
            /// Ob gerade eine Feldanweisung offen ist (zwischen <c>begin</c> und <c>separate</c> bzw. <c>end</c>). Ein
            /// offenes Feld, das innerhalb einer Anweisung begonnen hat, liegt immer in der noch offenen äußeren Anweisung.
            /// </summary>
            public bool AnweisungOffen => _innerhalb > 0 || (_offen.Count > 0 && _offen.Peek().ImAnweisungsteil);

            public void Feldelement(XElement element)
            {
                var aktuell = _offen.Count > 0 ? _offen.Peek() : null;
                var inAnweisung = aktuell is { ImAnweisungsteil: true };
                if (element.Name == W.FldSimple)
                {
                    if (inAnweisung)
                    {
                        aktuell!.Verschachtelt = true;
                    }
                    else if (_innerhalb == 0)
                    {
                        Bewerten((string?)element.Attribute(W.Instr) ?? string.Empty);
                    }
                }
                else if (element.Name == W.InstrText)
                {
                    if (inAnweisung)
                    {
                        aktuell!.Anweisung.Append(element.Value);
                    }
                    else if (_innerhalb == 0)
                    {
                        // Anweisung ohne zugehörigen Feldbeginn: für sich bewerten.
                        Bewerten(element.Value);
                    }
                }
                else
                {
                    switch ((string?)element.Attribute(W.FldCharType))
                    {
                        case "begin":
                            if (inAnweisung)
                            {
                                aktuell!.Verschachtelt = true;
                            }

                            var neu = new OffenesFeld(inAnweisung || _innerhalb > 0);
                            if (neu.InnerhalbAnweisung)
                            {
                                _innerhalb++;
                            }

                            _offen.Push(neu);
                            break;
                        case "separate" when aktuell is not null:
                            aktuell.ImAnweisungsteil = false;
                            break;
                        case "end" when aktuell is not null:
                            Schliessen(_offen.Pop());
                            break;
                    }
                }
            }

            /// <summary>Schließt am Ende des Feldkontexts alle noch offenen Felder.</summary>
            public void Abschliessen()
            {
                while (_offen.Count > 0)
                {
                    Schliessen(_offen.Pop());
                }
            }

            private void Schliessen(OffenesFeld feld)
            {
                if (feld.InnerhalbAnweisung)
                {
                    _innerhalb--;
                }

                if (feld.Verschachtelt)
                {
                    Verschachtelt = true;
                }
                else if (!feld.InnerhalbAnweisung)
                {
                    Bewerten(feld.Anweisung.ToString());
                }
            }

            private void Bewerten(string anweisung)
            {
                switch (Bewertung(anweisung))
                {
                    case Feldbewertung.UnzulaessigerName:
                        UnzulaessigerName = true;
                        break;
                    case Feldbewertung.Gefaehrlich:
                        Gefaehrlich = true;
                        break;
                    case Feldbewertung.UnzulaessigesHyperlinkZiel:
                        Hyperlink = true;
                        break;
                }
            }
        }

        private static bool IstFeldelement(XName name) => name == W.FldChar || name == W.InstrText || name == W.FldSimple;

        public static Feldbefund Pruefen(XDocument teil)
        {
            var gefaehrlich = false;
            var hyperlink = false;
            var verschachtelt = false;
            var alternativ = false;
            var unzulaessigerName = false;

            if (teil.Root is not { } wurzel)
            {
                return new Feldbefund(false, false, false, false, false);
            }

            var elemente = new Stack<OffenesElement>();
            var kontexte = new Stack<Feldkontext>();

            void Betreten(XElement element)
            {
                var eltern = elemente.Count > 0 ? elemente.Peek() : null;
                var istTextfeld = element.Name == W.TxbxContent;

                // Alternativinhalt oder Textfeld beginnt in einer offenen Anweisung desselben Feldkontexts.
                if ((istTextfeld || element.Name == AlternateContent) && kontexte.Count > 0 && kontexte.Peek().AnweisungOffen)
                {
                    kontexte.Peek().AlternativInhalt = true;
                }

                Feldkontext? eigener = null;
                bool fremd;
                if (eltern is null || istTextfeld)
                {
                    eigener = new Feldkontext();
                    kontexte.Push(eigener);
                    fremd = element.Name.Namespace != W.Ns;
                }
                else
                {
                    fremd = eltern.Fremd || element.Name.Namespace != W.Ns;
                }

                if (IstFeldelement(element.Name))
                {
                    if (fremd)
                    {
                        // Feldelemente in Alternativ- oder Fremdinhalten werden nicht verkettet, sondern abgelehnt.
                        kontexte.Peek().AlternativInhalt = true;
                    }
                    else
                    {
                        kontexte.Peek().Feldelement(element);
                    }
                }

                elemente.Push(new OffenesElement(element, fremd, eigener));
            }

            void Verlassen(OffenesElement offen)
            {
                if (offen.EigenerKontext is not { } kontext)
                {
                    return;
                }

                kontexte.Pop();
                kontext.Abschliessen();
                if (kontext.AlternativInhalt)
                {
                    // Ein Feldkontext mit diesem Befund wird für die übrigen Feldregeln nicht ausgewertet.
                    alternativ = true;
                    return;
                }

                gefaehrlich |= kontext.Gefaehrlich;
                hyperlink |= kontext.Hyperlink;
                verschachtelt |= kontext.Verschachtelt;
                unzulaessigerName |= kontext.UnzulaessigerName;
            }

            Betreten(wurzel);
            while (elemente.Count > 0)
            {
                if (elemente.Peek().NaechstesKind() is { } kind)
                {
                    Betreten(kind);
                }
                else
                {
                    Verlassen(elemente.Pop());
                }
            }

            return new Feldbefund(gefaehrlich, hyperlink, verschachtelt, alternativ, unzulaessigerName);
        }

        /// <summary>
        /// Bewertet eine Feldanweisung (AK-13). Ein unzulässiger Feldname (H3) ist der einzige Befund des Felds; sonst
        /// gelten DDE-/Include-Namen und die Adressen eines <c>HYPERLINK</c>-Felds (W1).
        /// </summary>
        private static Feldbewertung Bewertung(string anweisung)
        {
            var (name, argumente) = Feldname(anweisung);
            if (!IstZulaessigerFeldname(name, argumente))
            {
                return Feldbewertung.UnzulaessigerName;
            }

            // Auch das ältere „INCLUDE“ (Synonym für INCLUDETEXT) und weitere INCLUDE-Varianten.
            if (GefaehrlicheFelder.Contains(name, StringComparer.OrdinalIgnoreCase)
                || name.StartsWith("INCLUDE", StringComparison.OrdinalIgnoreCase))
            {
                return Feldbewertung.Gefaehrlich;
            }

            // Rev. 6, Hinweis 1 (A22): Word liest „\"“ als maskiertes Anführungszeichen, die Zerlegung nicht; jede
            // HYPERLINK-Anweisung mit „\"“ nach dem Feldnamen ist deshalb ein Befund.
            return name.Equals("HYPERLINK", StringComparison.OrdinalIgnoreCase)
                && (argumente.Contains("\\\"", StringComparison.Ordinal) || HyperlinkHatUnzulaessigeAdresse(argumente))
                ? Feldbewertung.UnzulaessigesHyperlinkZiel
                : Feldbewertung.Zulaessig;
        }

        /// <summary>
        /// Feldname (H3): Zeichenfolge nach führendem Leerraum bis zum nächsten Leerraum, <c>\</c> oder Ende; der Rest
        /// sind die Argumente.
        /// </summary>
        private static (string Name, string Argumente) Feldname(string anweisung)
        {
            var start = 0;
            while (start < anweisung.Length && char.IsWhiteSpace(anweisung[start]))
            {
                start++;
            }

            var ende = start;
            while (ende < anweisung.Length && !char.IsWhiteSpace(anweisung[ende]) && anweisung[ende] != '\\')
            {
                ende++;
            }

            return (anweisung[start..ende], anweisung[ende..]);
        }

        /// <summary>
        /// Zulässig sind Namen nur aus ASCII-Buchstaben und Formelfelder (<c>=</c> am Anfang); eine leere Anweisung ist
        /// zulässig, ein leerer Name vor weiterem Inhalt (z. B. <c>\x</c>) nicht.
        /// </summary>
        private static bool IstZulaessigerFeldname(string name, string argumente)
        {
            if (name.Length == 0)
            {
                return string.IsNullOrWhiteSpace(argumente);
            }

            return name[0] == '=' || name.All(char.IsAsciiLetter);
        }

        /// <summary>
        /// Adressen eines <c>HYPERLINK</c>-Felds (W1): Schalter ist nur ein Token ohne Anführungszeichen, das genau aus
        /// <c>\</c> und einem der Buchstaben <c>l o t m n h</c> besteht (ohne Groß-/Kleinschreibung); <c>\l</c>,
        /// <c>\o</c> und <c>\t</c> verbrauchen das folgende Token als Argument. Jedes übrige Token ist eine Adresse und
        /// muss die Positivliste erfüllen. <c>\"</c> wird vorher in <see cref="Bewertung"/> abgelehnt.
        /// </summary>
        private static bool HyperlinkHatUnzulaessigeAdresse(string argumente)
        {
            var argumentFolgt = false;
            foreach (var (wert, inAnfuehrung) in Token(argumente))
            {
                if (argumentFolgt)
                {
                    argumentFolgt = false;
                    continue;
                }

                var schalter = !inAnfuehrung && wert.Length == 2 && wert[0] == '\\' ? char.ToLowerInvariant(wert[1]) : '\0';
                if (schalter is 'l' or 'o' or 't' or 'm' or 'n' or 'h')
                {
                    argumentFolgt = schalter is 'l' or 'o' or 't';
                    continue;
                }

                if (!IstErlaubtesZiel(wert))
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Zerlegt Feldargumente wie Word in Token (Rev. 5, W1): Ein Token, das mit <c>"</c> beginnt, reicht bis zum
        /// nächsten <c>"</c> (ohne Escapes; ohne schließendes <c>"</c> bis zum Ende), sein Wert ist der Inhalt ohne
        /// Anführungszeichen; direkt danach beginnt das nächste Token. Ein Token ohne Anführungszeichen endet an
        /// Leerraum oder am nächsten <c>"</c> (<c>tip"\\evil\x"</c> ergibt <c>tip</c> und <c>\\evil\x</c>). Linear,
        /// ohne Rückverfolgung.
        /// </summary>
        private static IEnumerable<(string Wert, bool InAnfuehrung)> Token(string text)
        {
            var i = 0;
            while (i < text.Length)
            {
                if (char.IsWhiteSpace(text[i]))
                {
                    i++;
                    continue;
                }

                if (text[i] == '"')
                {
                    var ende = text.IndexOf('"', i + 1);
                    if (ende < 0)
                    {
                        ende = text.Length;
                    }

                    yield return (text[(i + 1)..ende], true);
                    i = ende + 1;
                    continue;
                }

                var start = i;
                while (i < text.Length && !char.IsWhiteSpace(text[i]) && text[i] != '"')
                {
                    i++;
                }

                yield return (text[start..i], false);
            }
        }
    }
}
