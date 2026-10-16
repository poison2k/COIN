using System.IO.Compression;
using System.Security;
using System.Text;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>
/// Erzeugt DOCX-Testdateien (gültige und bösartige) als ZIP im Speicher (zertifikatsvorlagen, ADR-0022 Punkt 6):
/// keine Binärdateien im Repository. Teile, Content-Types und Beziehungen werden von Hand geschrieben, damit auch
/// kaputte Pakete (doppelte Einträge, fehlende Content-Types, DTD, Makros) möglich sind.
/// </summary>
public sealed class DocxBauer
{
    public const string HauptteilTyp = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
    public const string MakroHauptteilTyp = "application/vnd.ms-word.document.macroEnabled.main+xml";
    public const string VorlageHauptteilTyp = "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml";

    public const string RelBasis = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    public const string RelOfficeDocument = RelBasis + "/officeDocument";
    public const string RelHeader = RelBasis + "/header";
    public const string RelFooter = RelBasis + "/footer";
    public const string RelFootnotes = RelBasis + "/footnotes";
    public const string RelEndnotes = RelBasis + "/endnotes";
    public const string RelComments = RelBasis + "/comments";
    public const string RelSettings = RelBasis + "/settings";
    public const string RelImage = RelBasis + "/image";
    public const string RelHyperlink = RelBasis + "/hyperlink";
    public const string RelCustomXml = RelBasis + "/customXml";
    public const string RelCoreProperties = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
    public const string RelExtendedProperties = RelBasis + "/extended-properties";
    public const string RelCustomProperties = RelBasis + "/custom-properties";
    public const string RelPeople = "http://schemas.microsoft.com/office/2011/relationships/people";
    public const string RelVbaProject = "http://schemas.microsoft.com/office/2006/relationships/vbaProject";

    /// <summary>Namensräume des Hauptdokuments (und der übrigen Story-Teile).</summary>
    public const string Namensraeume =
        "xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" " +
        "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" " +
        "xmlns:mc=\"http://schemas.openxmlformats.org/markup-compatibility/2006\" " +
        "xmlns:wp=\"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing\" " +
        "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" " +
        "xmlns:pic=\"http://schemas.openxmlformats.org/drawingml/2006/picture\" " +
        "xmlns:wps=\"http://schemas.microsoft.com/office/word/2010/wordprocessingShape\" " +
        "xmlns:v=\"urn:schemas-microsoft-com:vml\" " +
        "xmlns:o=\"urn:schemas-microsoft-com:office:office\" " +
        "xmlns:w14=\"http://schemas.microsoft.com/office/word/2010/wordml\" " +
        "mc:Ignorable=\"w14\"";

    private sealed record TeilEintrag(string Pfad, string? ContentType, byte[] Inhalt);

    private sealed record BeziehungEintrag(string Quelle, string Id, string Typ, string Ziel, bool Extern, string? ZielModusXml = null);

    private readonly List<string> _absaetze = [];
    private readonly List<TeilEintrag> _teile = [];
    private readonly List<BeziehungEintrag> _beziehungen = [];
    private readonly List<string> _sektionsVerweise = [];
    private readonly List<(string Name, byte[] Inhalt)> _rohEintraege = [];
    private int _naechsteId = 100;

    /// <summary>Content-Type des Hauptteils (z. B. <see cref="MakroHauptteilTyp"/>).</summary>
    public string HauptTyp { get; set; } = HauptteilTyp;

    /// <summary>Ohne <c>[Content_Types].xml</c>.</summary>
    public bool OhneContentTypes { get; set; }

    /// <summary>Ohne <c>word/document.xml</c> (Content-Type und Beziehung bleiben).</summary>
    public bool OhneHauptteil { get; set; }

    /// <summary>Wird vor das Wurzelelement von <c>word/document.xml</c> geschrieben (z. B. DOCTYPE).</summary>
    public string? DokumentProlog { get; set; }

    /// <summary>Ersetzt das gesamte XML von <c>word/document.xml</c> (z. B. Strict-Namespace).</summary>
    public string? DokumentInhalt { get; set; }

    /// <summary>Rohes XML, das am Ende des Wurzelelements von <c>_rels/.rels</c> eingefügt wird.</summary>
    public string? PaketRelsZusatz { get; set; }

    /// <summary>Rohes XML, das am Ende des Wurzelelements von <c>[Content_Types].xml</c> eingefügt wird.</summary>
    public string? ContentTypesZusatz { get; set; }

    /// <summary>Kompression aller Teile (Standard: optimal).</summary>
    public CompressionLevel Kompression { get; set; } = CompressionLevel.Optimal;

    // ---------- Absätze ----------

    /// <summary>Ein Run mit Text (<c>xml:space="preserve"</c>) und optionalen Run-Eigenschaften (inneres XML von <c>w:rPr</c>).</summary>
    public static string Run(string text, string? rPr = null) =>
        $"<w:r>{(rPr is null ? string.Empty : $"<w:rPr>{rPr}</w:rPr>")}<w:t xml:space=\"preserve\">{SecurityElement.Escape(text)}</w:t></w:r>";

    /// <summary>Ein Absatz aus beliebigem inneren XML.</summary>
    public static string P(params string[] inhalt) => $"<w:p>{string.Concat(inhalt)}</w:p>";

    /// <summary>Ein Absatz mit genau einem Run.</summary>
    public static string Text(string text) => P(Run(text));

    /// <summary>Die vier Pflichtplatzhalter je in einem eigenen Absatz.</summary>
    public static readonly string[] PflichtAbsaetze =
    [
        Text("{{Coin.Name}}"),
        Text("Exemplar Nr. {{Exemplar.Nummer}}"),
        Text("Zertifikat Nr. {{Zertifikat.Nummer}}"),
        Text("verliehen an {{Empfaenger.Name}}"),
    ];

    /// <summary>Die Pflichtplatzhalter außer <c>{{Coin.Name}}</c> (der Test setzt ihn an die zu prüfende Stelle).</summary>
    public static readonly string[] PflichtAbsaetzeOhneCoinName = PflichtAbsaetze[1..];

    /// <summary>Gültiges Dokument mit den vier Pflichtplatzhaltern.</summary>
    public static DocxBauer Gueltig() => new DocxBauer().Absaetze(PflichtAbsaetze);

    /// <summary>Dokument mit den angegebenen Absätzen (rohes XML je Absatz).</summary>
    public static DocxBauer Mit(params string[] absaetze) => new DocxBauer().Absaetze(absaetze);

    public DocxBauer Absaetze(params string[] absaetze)
    {
        _absaetze.AddRange(absaetze);
        return this;
    }

    private string NeueId() => $"rIdT{_naechsteId++}";

    // ---------- Teile und Beziehungen ----------

    /// <summary>Fügt einen Teil hinzu. <paramref name="contentType"/> <c>null</c> = kein Override.</summary>
    public DocxBauer Teil(string pfad, string? contentType, byte[] inhalt)
    {
        _teile.Add(new TeilEintrag(pfad, contentType, inhalt));
        return this;
    }

    public DocxBauer Teil(string pfad, string? contentType, string xml) => Teil(pfad, contentType, Encoding.UTF8.GetBytes(xml));

    /// <summary>Beziehung von <paramref name="quelle"/> (Teilpfad, „“ = Paket) zu <paramref name="ziel"/>; liefert die Id.</summary>
    public string Beziehung(string quelle, string typ, string ziel, bool istExtern = false, string? id = null)
    {
        var rid = id ?? NeueId();
        _beziehungen.Add(new BeziehungEintrag(quelle, rid, typ, ziel, istExtern));
        return rid;
    }

    /// <summary>
    /// Beziehung mit beliebigem <c>TargetMode</c>-Attribut; <paramref name="zielModusXml"/> wird unverändert in das
    /// Attribut geschrieben (bereits XML-kodiert, z. B. <c>&amp;#9;External</c>). Liefert die Id.
    /// </summary>
    public string BeziehungMitZielModus(string quelle, string typ, string ziel, string zielModusXml, string? id = null)
    {
        var rid = id ?? NeueId();
        _beziehungen.Add(new BeziehungEintrag(quelle, rid, typ, ziel, false, zielModusXml));
        return rid;
    }

    /// <summary>Beziehung vom Hauptdokument.</summary>
    public string DokumentBeziehung(string typ, string ziel, bool istExtern = false) => Beziehung("word/document.xml", typ, ziel, istExtern);

    /// <summary>Teil plus Beziehung vom Hauptdokument (Ziel relativ zu <c>word/</c>).</summary>
    public string DokumentTeil(string pfadUnterWord, string contentType, string typ, byte[] inhalt)
    {
        Teil("word/" + pfadUnterWord, contentType, inhalt);
        return DokumentBeziehung(typ, pfadUnterWord);
    }

    public string DokumentTeil(string pfadUnterWord, string contentType, string typ, string xml) =>
        DokumentTeil(pfadUnterWord, contentType, typ, Encoding.UTF8.GetBytes(xml));

    /// <summary>Roher ZIP-Eintrag ohne Content-Type und Beziehung (auch doppelte Namen möglich).</summary>
    public DocxBauer RohEintrag(string name, byte[] inhalt)
    {
        _rohEintraege.Add((name, inhalt));
        return this;
    }

    // ---------- Kopf-/Fußzeilen, Fuß-/Endnoten ----------

    public const string HeaderTyp = "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml";
    public const string FootnotesTyp = "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml";
    public const string EndnotesTyp = "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml";
    public const string CommentsTyp = "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml";
    public const string StylesTyp = "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml";
    public const string RelStyles = RelBasis + "/styles";

    /// <summary>Kopfzeile mit den Absätzen; <paramref name="art"/> <c>default</c>, <c>first</c> oder <c>even</c>.</summary>
    public DocxBauer Kopfzeile(string art, params string[] absaetze) =>
        KopfzeileAls($"header{_sektionsVerweise.Count + 1}.xml", art, absaetze);

    /// <summary>
    /// Kopfzeile unter einem beliebigen Teilnamen (z. B. <c>hdr.bin</c>, Content-Type per Override), Ziel relativ zu
    /// <c>word/</c>. <paramref name="inhalt"/> ersetzt das XML (z. B. für einen Teil, der kein XML ist).
    /// </summary>
    public DocxBauer KopfzeileAls(string pfadUnterWord, string art, string[] absaetze, byte[]? inhalt = null, string contentType = HeaderTyp)
    {
        var rid = DokumentTeil(pfadUnterWord, contentType, RelHeader,
            inhalt ?? Encoding.UTF8.GetBytes(
                $"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:hdr {Namensraeume}>{string.Concat(absaetze)}</w:hdr>"));
        _sektionsVerweise.Add($"<w:headerReference w:type=\"{art}\" r:id=\"{rid}\"/>");
        return this;
    }

    /// <summary>Fußzeile mit den Absätzen; <paramref name="art"/> <c>default</c>, <c>first</c> oder <c>even</c>.</summary>
    public DocxBauer Fusszeile(string art, params string[] absaetze)
    {
        var name = $"footer{_sektionsVerweise.Count + 1}.xml";
        var rid = DokumentTeil(name, "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml", RelFooter,
            $"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:ftr {Namensraeume}>{string.Concat(absaetze)}</w:ftr>");
        _sektionsVerweise.Add($"<w:footerReference w:type=\"{art}\" r:id=\"{rid}\"/>");
        return this;
    }

    public const string FooterTyp = "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml";

    /// <summary>
    /// Fußzeile als ZIP-Eintrag <c>word/{eintragUnterWord}</c> (Override mit demselben Namen) und Beziehung vom
    /// Hauptdokument mit dem davon abweichend geschriebenen Ziel <paramref name="ziel"/> (relativ zu <c>word/</c>),
    /// z. B. Eintrag <c>footer:1.xml</c> mit Ziel <c>footer%3A1.xml</c>.
    /// </summary>
    public DocxBauer FusszeileAls(string eintragUnterWord, string ziel, string art, params string[] absaetze)
    {
        Teil("word/" + eintragUnterWord, FooterTyp,
            $"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:ftr {Namensraeume}>{string.Concat(absaetze)}</w:ftr>");
        var rid = DokumentBeziehung(RelFooter, ziel);
        _sektionsVerweise.Add($"<w:footerReference w:type=\"{art}\" r:id=\"{rid}\"/>");
        return this;
    }

    /// <summary>Fußnote (Id 1) mit den Absätzen und Verweis im Hauptteil.</summary>
    public DocxBauer Fussnote(params string[] absaetze) => FussnoteAls("footnotes.xml", absaetze);

    /// <summary>Fußnote (Id 1) unter einem beliebigen Teilnamen (Content-Type per Override), Ziel relativ zu <c>word/</c>.</summary>
    public DocxBauer FussnoteAls(string pfadUnterWord, params string[] absaetze)
    {
        DokumentTeil(pfadUnterWord, FootnotesTyp, RelFootnotes,
            $"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:footnotes {Namensraeume}><w:footnote w:id=\"1\">{string.Concat(absaetze)}</w:footnote></w:footnotes>");
        _absaetze.Add(P(Run("Fußnote"), "<w:r><w:footnoteReference w:id=\"1\"/></w:r>"));
        return this;
    }

    /// <summary>Endnote (Id 1) mit den Absätzen und Verweis im Hauptteil.</summary>
    public DocxBauer Endnote(params string[] absaetze) => EndnoteAls("endnotes.xml", absaetze);

    /// <summary>Endnote (Id 1) unter einem beliebigen Teilnamen (Content-Type per Override), Ziel relativ zu <c>word/</c>.</summary>
    public DocxBauer EndnoteAls(string pfadUnterWord, params string[] absaetze)
    {
        DokumentTeil(pfadUnterWord, EndnotesTyp, RelEndnotes,
            $"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:endnotes {Namensraeume}><w:endnote w:id=\"1\">{string.Concat(absaetze)}</w:endnote></w:endnotes>");
        _absaetze.Add(P(Run("Endnote"), "<w:r><w:endnoteReference w:id=\"1\"/></w:r>"));
        return this;
    }

    /// <summary><c>word/settings.xml</c> mit dem inneren XML von <c>w:settings</c>; liefert nichts zurück, Beziehungen per <see cref="Beziehung"/>.</summary>
    public DocxBauer Einstellungen(string inneresXml)
    {
        DokumentTeil("settings.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml", RelSettings,
            $"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:settings {Namensraeume}>{inneresXml}</w:settings>");
        return this;
    }

    /// <summary><c>word/styles.xml</c> mit dem inneren XML von <c>w:styles</c>.</summary>
    public DocxBauer Stile(string inneresXml)
    {
        DokumentTeil("styles.xml", StylesTyp, RelStyles,
            $"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:styles {Namensraeume}>{inneresXml}</w:styles>");
        return this;
    }

    // ---------- Dokumenteigenschaften ----------

    /// <summary><c>docProps/core.xml</c> mit dem inneren XML (Präfixe <c>cp</c>, <c>dc</c>, <c>dcterms</c>, <c>xsi</c>).</summary>
    public DocxBauer KernEigenschaften(string inneresXml)
    {
        Teil("docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml",
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" " +
            "xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\" " +
            "xmlns:dcmitype=\"http://purl.org/dc/dcmitype/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">" +
            inneresXml + "</cp:coreProperties>");
        Beziehung(string.Empty, RelCoreProperties, "docProps/core.xml");
        return this;
    }

    /// <summary><c>docProps/app.xml</c> mit dem inneren XML von <c>Properties</c>.</summary>
    public DocxBauer AppEigenschaften(string inneresXml)
    {
        Teil("docProps/app.xml", "application/vnd.openxmlformats-officedocument.extended-properties+xml",
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/extended-properties\" " +
            "xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\">" + inneresXml + "</Properties>");
        Beziehung(string.Empty, RelExtendedProperties, "docProps/app.xml");
        return this;
    }

    /// <summary><c>docProps/custom.xml</c> mit einer Texteigenschaft.</summary>
    public DocxBauer BenutzerdefinierteEigenschaft(string name, string wert)
    {
        Teil("docProps/custom.xml", "application/vnd.openxmlformats-officedocument.custom-properties+xml",
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/custom-properties\" " +
            "xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\">" +
            $"<property fmtid=\"{{D5CDD505-2E9C-101B-9397-08002B2CF9AE}}\" pid=\"2\" name=\"{SecurityElement.Escape(name)}\">" +
            $"<vt:lpwstr>{SecurityElement.Escape(wert)}</vt:lpwstr></property></Properties>");
        Beziehung(string.Empty, RelCustomProperties, "docProps/custom.xml");
        return this;
    }

    // ---------- Bauen ----------

    private string DokumentXml() => DokumentInhalt ?? StandardDokumentXml();

    private string StandardDokumentXml()
    {
        var sektion = $"<w:sectPr>{string.Concat(_sektionsVerweise)}{(_sektionsVerweise.Any(v => v.Contains("\"first\"", StringComparison.Ordinal)) ? "<w:titlePg/>" : string.Empty)}</w:sectPr>";
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" + (DokumentProlog ?? string.Empty) +
            $"<w:document {Namensraeume}><w:body>{string.Concat(_absaetze)}{sektion}</w:body></w:document>";
    }

    private static string RelsPfad(string quelle)
    {
        if (quelle.Length == 0)
        {
            return "_rels/.rels";
        }

        var verzeichnis = Path.GetDirectoryName(quelle)!.Replace('\\', '/');
        return $"{(verzeichnis.Length == 0 ? string.Empty : verzeichnis + "/")}_rels/{Path.GetFileName(quelle)}.rels";
    }

    public byte[] Bytes()
    {
        var beziehungen = new List<BeziehungEintrag>(_beziehungen) { new(string.Empty, "rIdHaupt", RelOfficeDocument, "word/document.xml", false) };
        var teile = new List<TeilEintrag>();
        if (!OhneHauptteil)
        {
            teile.Add(new TeilEintrag("word/document.xml", HauptTyp, Encoding.UTF8.GetBytes(DokumentXml())));
        }

        teile.AddRange(_teile);

        using var puffer = new MemoryStream();
        using (var zip = new ZipArchive(puffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            void Schreibe(string name, byte[] inhalt)
            {
                var eintrag = zip.CreateEntry(name, Kompression);
                using var ziel = eintrag.Open();
                ziel.Write(inhalt);
            }

            if (!OhneContentTypes)
            {
                var ct = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>")
                    .Append("<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">")
                    .Append("<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>")
                    .Append("<Default Extension=\"xml\" ContentType=\"application/xml\"/>")
                    .Append("<Default Extension=\"png\" ContentType=\"image/png\"/>")
                    .Append("<Default Extension=\"bin\" ContentType=\"application/octet-stream\"/>");
                if (OhneHauptteil)
                {
                    ct.Append($"<Override PartName=\"/word/document.xml\" ContentType=\"{HauptTyp}\"/>");
                }

                foreach (var teil in teile.Where(t => t.ContentType is not null))
                {
                    ct.Append($"<Override PartName=\"/{teil.Pfad}\" ContentType=\"{teil.ContentType}\"/>");
                }

                Schreibe("[Content_Types].xml", Encoding.UTF8.GetBytes(ct.Append(ContentTypesZusatz).Append("</Types>").ToString()));
            }

            foreach (var gruppe in beziehungen.GroupBy(b => b.Quelle))
            {
                var rels = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>")
                    .Append("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">");
                foreach (var b in gruppe)
                {
                    rels.Append($"<Relationship Id=\"{b.Id}\" Type=\"{b.Typ}\" Target=\"{SecurityElement.Escape(b.Ziel)}\"{(b.ZielModusXml is not null ? $" TargetMode=\"{b.ZielModusXml}\"" : b.Extern ? " TargetMode=\"External\"" : string.Empty)}/>");
                }

                if (gruppe.Key.Length == 0)
                {
                    rels.Append(PaketRelsZusatz);
                }

                Schreibe(RelsPfad(gruppe.Key), Encoding.UTF8.GetBytes(rels.Append("</Relationships>").ToString()));
            }

            foreach (var teil in teile)
            {
                Schreibe(teil.Pfad, teil.Inhalt);
            }

            foreach (var (name, inhalt) in _rohEintraege)
            {
                Schreibe(name, inhalt);
            }
        }

        return puffer.ToArray();
    }
}
