using System.IO.Compression;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using Coin.Domain.Vorlagen;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace Coin.Infrastructure.Vorlagen;

/// <summary>
/// Entfernt personenbezogene Dokumenteigenschaften aus einer bereits geprüften DOCX-Datei (zertifikatsvorlagen AK-16,
/// F10, ADR-0024 Punkt 3) mit dem OpenXML SDK auf einer Kopie im Speicher. Text, Formatierung, Bilder, rsid-Werte und
/// Dokument-Ids bleiben unverändert; nur geänderte Teile werden neu geschrieben. Verwaiste Teile werden auf Paketebene
/// entfernt (vor und nach dem SDK, damit auch durch die Bereinigung verwaiste Teile verschwinden).
/// </summary>
internal sealed class DocxBereinigung : IDocxBereinigung
{
    /// <summary>Einziger Autor in bereinigten Dateien und in der Standardvorlage.</summary>
    public const string Autor = BereinigterZustand.Autor;

    public byte[] Bereinigen(byte[] inhalt)
    {
        ArgumentNullException.ThrowIfNull(inhalt);

        using var puffer = new MemoryStream();
        puffer.Write(VerwaisteTeileEntfernen(inhalt));
        puffer.Position = 0;
        var einstellungen = new OpenSettings { AutoSave = false, MaxCharactersInPart = DocxAnalyse.MaxZeichenJeTeil };
        using (var dokument = WordprocessingDocument.Open(puffer, true, einstellungen))
        {
            // Vor jedem DOM des SDK: kein Teil, den das SDK oder diese Klasse parst, ist zu tief (AK-12, K2).
            TiefeSichern(dokument);

            // Zuerst die Bearbeitungsbereiche über die Teil-Streams, bevor das SDK ein DOM eines Teils lädt.
            PersoenlicheBearbeitungsbereicheEntfernen(dokument);
            KernEigenschaftenBereinigen(dokument);
            AppEigenschaftenBereinigen(dokument);
            TeileEntfernen(dokument);
            DokumentvariablenEntfernen(dokument);
            DatenbindungenEntfernen(dokument);
        }

        return VerwaisteTeileEntfernen(puffer.ToArray());
    }

    /// <summary>
    /// Stellt vor jedem DOM sicher, dass jeder erreichbare XML-Teil und jeder Teil, dessen DOM die Bereinigung über das
    /// SDK lädt, sicher lesbar ist und höchstens 256 Ebenen hat (AK-12, K2). Die Prüfung hat das bereits verlangt; hier
    /// wird es unabhängig davon erzwungen, damit das (rekursiv arbeitende) SDK nie zu tiefes XML sieht. Ebenso darf kein
    /// solcher Teil einen Befund der Namespace-Positivliste haben (Rev. 7, ADR-0026 Punkt 4). Sonst wird eine
    /// Ausnahme ausgelöst; die Aufbereitung meldet dann „nicht verarbeitbar“ (AK-16).
    /// </summary>
    private static void TiefeSichern(WordprocessingDocument dokument)
    {
        foreach (var teil in AlleBeziehungen(dokument).Select(b => b.Teil).Distinct())
        {
            if ((ContentTypen.IstXmlTyp(teil.ContentType) || HatSdkDom(teil))
                && (SicheresXml.Pruefen(TeilLesen(teil), DocxAnalyse.IstPersonenTeil(teil.ContentType), out var namespaces) != XmlStatus.Gelesen || namespaces != NamespaceBefund.Keiner))
            {
                throw new InvalidDataException("Teil nicht sicher lesbar.");
            }
        }
    }

    /// <summary>Teile, deren DOM die Bereinigung über das SDK lädt.</summary>
    private static bool HatSdkDom(OpenXmlPart teil) =>
        teil is ExtendedFilePropertiesPart or DocumentSettingsPart or MainDocumentPart or HeaderPart or FooterPart or FootnotesPart
            or EndnotesPart or GlossaryDocumentPart;

    private static byte[] TeilLesen(OpenXmlPart teil)
    {
        using var quelle = teil.GetStream(FileMode.Open, FileAccess.Read);
        using var kopie = new MemoryStream();
        quelle.CopyTo(kopie);
        return kopie.ToArray();
    }

    /// <summary>
    /// <c>docProps/core.xml</c>: alle Eigenschaften entfernen, danach nur den Autor „C.O.I.N.“ setzen. Der Teil wird
    /// vollständig neu geschrieben (unbekannte Elemente verschwinden mit). Ohne Kern-Teil wird keiner angelegt.
    /// </summary>
    private static void KernEigenschaftenBereinigen(WordprocessingDocument dokument)
    {
        if (dokument.CoreFilePropertiesPart is { } kern)
        {
            KernEigenschaftenSchreiben(kern);
        }
    }

    /// <summary>Schreibt <c>docProps/core.xml</c> mit <c>dc:creator</c> „C.O.I.N.“ als einziger Eigenschaft.</summary>
    internal static void KernEigenschaftenSchreiben(CoreFilePropertiesPart kern)
    {
        XNamespace cp = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
        var dc = BereinigterZustand.Dc;
        var xml = new XDocument(
            new XDeclaration("1.0", "UTF-8", "yes"),
            new XElement(
                cp + "coreProperties",
                new XAttribute(XNamespace.Xmlns + "cp", cp),
                new XAttribute(XNamespace.Xmlns + "dc", dc),
                new XElement(dc + "creator", Autor)));
        using var ziel = kern.GetStream(FileMode.Create, FileAccess.Write);
        xml.Save(ziel);
    }

    /// <summary>
    /// <c>docProps/app.xml</c>: Firma, Manager, Vorlage, Hyperlink-Basis, Titel der Teile und Überschriftenpaare
    /// entfernen; Statistik bleibt.
    /// </summary>
    private static void AppEigenschaftenBereinigen(WordprocessingDocument dokument)
    {
        if (dokument.ExtendedFilePropertiesPart?.Properties is not { } eigenschaften)
        {
            return;
        }

        var entfernen = eigenschaften.Elements()
            .Where(e => e.NamespaceUri == BereinigterZustand.Ep.NamespaceName && BereinigterZustand.AppEntfernen.Contains(e.LocalName))
            .ToList();
        if (entfernen.Count == 0)
        {
            return;
        }

        entfernen.ForEach(e => e.Remove());
        eigenschaften.Save();
    }

    /// <summary>Benutzerdefinierte Eigenschaften, <c>customXml</c>-Teile und <c>people.xml</c> samt Beziehungen entfernen.</summary>
    private static void TeileEntfernen(WordprocessingDocument dokument)
    {
        if (dokument.CustomFilePropertiesPart is { } benutzerdefiniert)
        {
            dokument.DeletePart(benutzerdefiniert);
        }

        var zuEntfernen = AlleBeziehungen(dokument)
            .Where(b => b.Teil is CustomXmlPart or WordprocessingPeoplePart)
            .ToList();
        foreach (var (eltern, id, _) in zuEntfernen)
        {
            eltern.DeletePart(id);
        }
    }

    /// <summary><c>w:docVars</c> in <c>word/settings.xml</c> entfernen.</summary>
    private static void DokumentvariablenEntfernen(WordprocessingDocument dokument)
    {
        if (dokument.MainDocumentPart?.DocumentSettingsPart?.Settings is not { } einstellungen)
        {
            return;
        }

        var variablen = einstellungen.Elements<DocumentVariables>().ToList();
        if (variablen.Count == 0)
        {
            return;
        }

        variablen.ForEach(v => v.Remove());
        einstellungen.Save();
    }

    /// <summary><c>w:dataBinding</c> in Inhaltssteuerelementen entfernen; der angezeigte Text bleibt.</summary>
    private static void DatenbindungenEntfernen(WordprocessingDocument dokument)
    {
        foreach (var teil in AlleBeziehungen(dokument).Select(b => b.Teil).Distinct())
        {
            if (teil is not (MainDocumentPart or HeaderPart or FooterPart or FootnotesPart or EndnotesPart or GlossaryDocumentPart))
            {
                continue;
            }

            if (teil.RootElement is not { } wurzel)
            {
                continue;
            }

            var bindungen = wurzel.Descendants<DataBinding>().ToList();
            if (bindungen.Count == 0)
            {
                continue;
            }

            bindungen.ForEach(b => b.Remove());
            ((OpenXmlPartRootElement)wurzel).Save();
        }
    }

    /// <summary>
    /// <c>w:permStart</c> mit <c>w:ed</c> samt zugehörigem <c>w:permEnd</c> (gleiche <c>w:id</c>) in allen XML-Teilen
    /// entfernen; der umschlossene Text bleibt, Bereiche nur mit <c>w:edGrp</c> bleiben unverändert.
    /// </summary>
    private static void PersoenlicheBearbeitungsbereicheEntfernen(WordprocessingDocument dokument)
    {
        foreach (var teil in AlleBeziehungen(dokument).Select(b => b.Teil).Distinct())
        {
            if (!ContentTypen.IstXmlTyp(teil.ContentType))
            {
                continue;
            }

            // Geprüfte XML-Teile sind immer lesbar; sonst lieber abbrechen als still überspringen.
            var xml = SicheresXml.LesenOderNull(TeilLesen(teil)) ?? throw new InvalidDataException("Teil nicht sicher lesbar.");

            var starts = xml.Descendants().Where(BereinigterZustand.IstPersoenlicherBereich).ToList();
            if (starts.Count == 0)
            {
                continue;
            }

            var ids = starts.Select(s => (string?)s.Attribute(W.Id)).OfType<string>().ToHashSet(StringComparer.Ordinal);
            var bleibend = xml.Descendants(W.PermStart).Except(starts).Select(s => (string?)s.Attribute(W.Id)).OfType<string>()
                .ToHashSet(StringComparer.Ordinal);
            var enden = xml.Descendants(W.PermEnd)
                .Where(e => (string?)e.Attribute(W.Id) is { } id && ids.Contains(id) && !bleibend.Contains(id))
                .ToList();
            starts.ForEach(s => s.Remove());
            enden.ForEach(e => e.Remove());

            using var ziel = teil.GetStream(FileMode.Create, FileAccess.Write);
            XmlSchreiben(xml, ziel);
        }
    }

    /// <summary>Schreibt XML ohne BOM und ohne Formatierung (Leerraum bleibt wie gelesen).</summary>
    private static void XmlSchreiben(XDocument xml, Stream ziel)
    {
        var einstellungen = new XmlWriterSettings { Encoding = new UTF8Encoding(false), Indent = false, CloseOutput = false };
        using var schreiber = XmlWriter.Create(ziel, einstellungen);
        xml.Save(schreiber);
    }

    /// <summary>
    /// Entfernt verwaiste Teile (vom Paketstamm nicht über interne Beziehungen erreichbar) samt <c>.rels</c> und
    /// Content-Type-Override sowie <c>.rels</c> ohne Quellteil (AK-16). Erreichbarkeit iterativ und in der
    /// <see cref="Teilname">Teilnamen-Normalform</see> (Rev. 4), damit kodierte Namen nicht als verwaist gelten. Ohne
    /// Fund bleibt die Datei unverändert; ein ungültiger Name oder eine unlesbare Beziehung löst eine Ausnahme aus.
    /// Zugleich werden Eintragsnamen, Override-<c>PartName</c>s und interne Beziehungsziele, die nicht in der Normalform
    /// stehen (z. B. UTF-8-Name <c>word/media/ä.png</c>, <c>%c3%a4</c> oder <c>a%5B1%5D.png</c>), in diese umgeschrieben:
    /// OPC-gleichwertig, Inhalt unverändert, aber nur so findet das OpenXML SDK (<c>System.IO.Packaging</c>) den Teil über
    /// seine Beziehung. Kindelemente von <c>Types</c> bzw. <c>Relationships</c>, die nicht nach vollem Namen
    /// <c>Default</c>/<c>Override</c> bzw. <c>Relationship</c> sind (z. B. <c>w:Override</c>), bestimmen nichts und werden
    /// entfernt (Rev. 7, Hinweis c), weil <c>System.IO.Packaging</c> sie nicht liest. Teilnamen mit <c>:</c> hat die
    /// Prüfung bereits abgelehnt (Rev. 7, Hinweis a).
    /// </summary>
    /// <param name="inhalt">DOCX-Datei.</param>
    internal static byte[] VerwaisteTeileEntfernen(byte[] inhalt)
    {
        var normalform = new Dictionary<string, string>(StringComparer.Ordinal);
        var rels = new Dictionary<string, XDocument>(StringComparer.Ordinal);
        List<OpcBeziehung> beziehungen;
        using (var archiv = new ZipArchive(new MemoryStream(inhalt, writable: false), ZipArchiveMode.Read))
        {
            foreach (var eintrag in archiv.Entries)
            {
                var name = Teilname.EintragNormalisieren(eintrag.FullName) ?? throw new InvalidDataException("Ungültiger Teilname.");
                normalform[eintrag.FullName] = name;
                if (name.EndsWith(".rels", StringComparison.OrdinalIgnoreCase))
                {
                    rels[eintrag.FullName] = SicheresXml.LesenOderNull(Lesen(eintrag)) ?? throw new InvalidDataException("Beziehungen nicht sicher lesbar.");
                }
            }

            beziehungen = OpcPaket.BeziehungenLesen(rels.Select(r => KeyValuePair.Create(normalform[r.Key], r.Value)))
                ?? throw new InvalidDataException("Ungültige Beziehung.");
        }

        var verwaist = OpcPaket.Verwaist([.. normalform.Values], beziehungen).ToHashSet(Teilname.Vergleich);
        var umbenennen = normalform.Where(n => !string.Equals(n.Key, n.Value, StringComparison.Ordinal) && !verwaist.Contains(n.Value))
            .ToDictionary(n => n.Key, n => n.Value, StringComparer.Ordinal);
        var neueZiele = rels.Where(r => !verwaist.Contains(normalform[r.Key]) && ZieleUmschreiben(r.Value))
            .ToDictionary(r => r.Key, r => r.Value, StringComparer.Ordinal);
        if (verwaist.Count == 0 && umbenennen.Count == 0 && neueZiele.Count == 0 && !OverridesAbweichend(inhalt, verwaist))
        {
            return inhalt;
        }

        using var puffer = new MemoryStream();
        puffer.Write(inhalt);
        using (var archiv = new ZipArchive(puffer, ZipArchiveMode.Update, leaveOpen: true))
        {
            foreach (var eintrag in archiv.Entries.Where(e => verwaist.Contains(normalform[e.FullName])).ToList())
            {
                eintrag.Delete();
            }

            foreach (var roh in umbenennen.Keys.Union(neueZiele.Keys, StringComparer.Ordinal).ToList())
            {
                var eintrag = archiv.GetEntry(roh)!;
                var bytes = Lesen(eintrag);
                eintrag.Delete();
                using var ziel = archiv.CreateEntry(umbenennen.GetValueOrDefault(roh, roh), CompressionLevel.Optimal).Open();
                if (neueZiele.TryGetValue(roh, out var xml))
                {
                    XmlSchreiben(xml, ziel);
                }
                else
                {
                    ziel.Write(bytes);
                }
            }

            if (archiv.Entries.FirstOrDefault(e => e.FullName.Equals(ContentTypen.Teilname, StringComparison.OrdinalIgnoreCase)) is { } typenEintrag
                && SicheresXml.LesenOderNull(Lesen(typenEintrag)) is { } typen
                && OverridesUmschreiben(typen, verwaist))
            {
                var name = typenEintrag.FullName;
                typenEintrag.Delete();
                using var ziel = archiv.CreateEntry(name, CompressionLevel.Optimal).Open();
                XmlSchreiben(typen, ziel);
            }
        }

        return puffer.ToArray();
    }

    /// <summary>
    /// Schreibt jedes interne <c>Target</c> segmentweise in die <see cref="Teilname">Teilnamen-Normalform</see> (<c>.</c>,
    /// <c>..</c> und der führende Schrägstrich bleiben), z. B. <c>media/a%5B1%5D.png</c> → <c>media/a[1].png</c> (Rev. 5,
    /// H4). Das OpenXML SDK vergleicht <c>%5B</c> und <c>[</c> nicht als gleich; nur so findet es den umbenannten Eintrag.
    /// Kindelemente, die nicht nach vollem Namen <c>Relationship</c> sind, werden entfernt (Rev. 7). <c>true</c>, wenn sich
    /// etwas geändert hat.
    /// </summary>
    private static bool ZieleUmschreiben(XDocument rels)
    {
        var geaendert = FremdeKinderEntfernen(rels, OpcPaket.Beziehung);
        foreach (var beziehung in rels.Root?.Elements(OpcPaket.Beziehung) ?? [])
        {
            if (OpcPaket.ZielModus((string?)beziehung.Attribute("TargetMode")) != "Internal"
                || (string?)beziehung.Attribute("Target") is not { } roh)
            {
                continue;
            }

            var kanonisch = string.Join('/', roh.Trim().Split('/').Select(segment =>
                segment is "" or "." or ".." ? segment : Teilname.Segment(segment) ?? throw new InvalidDataException("Ungültiges Ziel.")));
            if (!string.Equals(kanonisch, roh, StringComparison.Ordinal))
            {
                beziehung.SetAttributeValue("Target", kanonisch);
                geaendert = true;
            }
        }

        return geaendert;
    }

    /// <summary>
    /// Entfernt Kindelemente der Wurzel, die keinen der <paramref name="erlaubt"/> vollen Namen tragen (Rev. 7, Hinweis c:
    /// Auswahl nach vollem Namen; z. B. <c>w:Override</c>); <c>true</c>, wenn eines entfernt wurde.
    /// </summary>
    private static bool FremdeKinderEntfernen(XDocument xml, params XName[] erlaubt)
    {
        var fremd = xml.Root?.Elements().Where(e => !erlaubt.Contains(e.Name)).ToList() ?? [];
        fremd.ForEach(e => e.Remove());
        return fremd.Count > 0;
    }

    /// <summary>
    /// Ob <see cref="OverridesUmschreiben(XDocument, HashSet{string})"/> etwas ändern würde; geprüft auf einer eigens
    /// gelesenen Kopie, <paramref name="inhalt"/> bleibt unverändert.
    /// </summary>
    private static bool OverridesAbweichend(byte[] inhalt, HashSet<string> verwaist)
    {
        using var archiv = new ZipArchive(new MemoryStream(inhalt, writable: false), ZipArchiveMode.Read);
        return archiv.Entries.FirstOrDefault(e => e.FullName.Equals(ContentTypen.Teilname, StringComparison.OrdinalIgnoreCase)) is { } eintrag
            && SicheresXml.LesenOderNull(Lesen(eintrag)) is { } kopie
            && OverridesUmschreiben(kopie, verwaist);
    }

    /// <summary>
    /// Entfernt Overrides verwaister Teile und schreibt die übrigen <c>PartName</c>s in die Normalform; Kindelemente, die
    /// nach vollem Namen weder <c>Default</c> noch <c>Override</c> sind, werden entfernt (Rev. 7, Hinweis c). <c>true</c>,
    /// wenn sich etwas geändert hat.
    /// </summary>
    private static bool OverridesUmschreiben(XDocument typen, HashSet<string> verwaist)
    {
        var geaendert = FremdeKinderEntfernen(typen, ContentTypen.Default, ContentTypen.Override);
        foreach (var eintrag in typen.Root!.Elements(ContentTypen.Override).ToList())
        {
            if (OverrideTeil(eintrag) is not { } teil)
            {
                continue;
            }

            if (verwaist.Contains(teil))
            {
                eintrag.Remove();
                geaendert = true;
            }
            else if (!string.Equals((string?)eintrag.Attribute("PartName"), "/" + teil, StringComparison.Ordinal))
            {
                eintrag.SetAttributeValue("PartName", "/" + teil);
                geaendert = true;
            }
        }

        return geaendert;
    }

    /// <summary><c>PartName</c> eines Override-Eintrags in der Teilnamen-Normalform oder <c>null</c>.</summary>
    private static string? OverrideTeil(XElement eintrag)
    {
        var teil = (string?)eintrag.Attribute("PartName") ?? string.Empty;
        return Teilname.Normalisieren(teil.StartsWith('/') ? teil[1..] : teil);
    }

    private static byte[] Lesen(ZipArchiveEntry eintrag)
    {
        using var quelle = eintrag.Open();
        using var kopie = new MemoryStream();
        quelle.CopyTo(kopie);
        return kopie.ToArray();
    }

    /// <summary>Alle Beziehungen auf Teile im Paket (Eltern, Beziehungs-Id, Teil), jede einmal.</summary>
    private static List<(OpenXmlPartContainer Eltern, string Id, OpenXmlPart Teil)> AlleBeziehungen(WordprocessingDocument dokument)
    {
        var ergebnis = new List<(OpenXmlPartContainer, string, OpenXmlPart)>();
        var besucht = new HashSet<OpenXmlPart>();
        var offen = new Queue<OpenXmlPartContainer>([dokument]);
        while (offen.Count > 0)
        {
            var eltern = offen.Dequeue();
            foreach (var paar in eltern.Parts)
            {
                ergebnis.Add((eltern, paar.RelationshipId, paar.OpenXmlPart));
                if (besucht.Add(paar.OpenXmlPart))
                {
                    offen.Enqueue(paar.OpenXmlPart);
                }
            }
        }

        return ergebnis;
    }
}
