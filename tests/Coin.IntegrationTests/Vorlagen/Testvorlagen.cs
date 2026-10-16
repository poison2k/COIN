using System.IO.Compression;
using System.Security;
using System.Text;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Testdateien für zertifikatsvorlagen (AK-9 bis AK-16), alle im Speicher erzeugt. Bausteine für Platzhalter an
/// verschiedenen Stellen und bösartige Inhalte. Keine echten Personendaten.
/// </summary>
public static class Testvorlagen
{
    public const int MiB = 1024 * 1024;

    /// <summary><c>{{Coin.Name}}</c> auf drei Runs mit Formatwechsel, dazwischen <c>w:proofErr</c> und Lesezeichen (AK-15).</summary>
    public static readonly string GeteilterCoinNameRuns =
        Run("{{Co", "<w:b/>") +
        "<w:proofErr w:type=\"spellStart\"/>" +
        Run("in.Na", "<w:i/><w:color w:val=\"C00000\"/>") +
        "<w:bookmarkStart w:id=\"0\" w:name=\"Marke\"/>" +
        Run("me}}", "<w:u w:val=\"single\"/>") +
        "<w:bookmarkEnd w:id=\"0\"/>" +
        "<w:proofErr w:type=\"spellEnd\"/>";

    /// <summary>Absatz mit dem verteilten <c>{{Coin.Name}}</c>.</summary>
    public static readonly string GeteilterCoinName = P(GeteilterCoinNameRuns);

    /// <summary>Gültiges Dokument ohne <c>{{Coin.Name}}</c> im Hauptteil; der Test fügt ihn an der zu prüfenden Stelle ein.</summary>
    public static DocxBauer OhneCoinName() => Mit(PflichtAbsaetzeOhneCoinName);

    public static string Tabelle(params string[] zellinhalt) =>
        "<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/></w:tblPr><w:tblGrid><w:gridCol w:w=\"4000\"/></w:tblGrid>" +
        $"<w:tr><w:tc><w:tcPr><w:tcW w:w=\"4000\" w:type=\"dxa\"/></w:tcPr>{string.Concat(zellinhalt)}</w:tc></w:tr></w:tbl>";

    /// <summary>Tabelle in einer Tabelle; der Absatz steht in der inneren Zelle.</summary>
    public static string VerschachtelteTabelle(string absatz) => Tabelle(Tabelle(absatz), "<w:p/>");

    /// <summary>Textfeld als <c>mc:AlternateContent</c> (DrawingML mit VML-Fallback), beide mit demselben Absatz.</summary>
    public static string TextfeldAlternateContent(string absatz) =>
        P("<w:r><mc:AlternateContent><mc:Choice Requires=\"wps\"><w:drawing>" +
          "<wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"2000000\" cy=\"500000\"/>" +
          "<wp:docPr id=\"1\" name=\"Textfeld 1\"/><a:graphic><a:graphicData uri=\"http://schemas.microsoft.com/office/word/2010/wordprocessingShape\">" +
          $"<wps:wsp><wps:cNvSpPr txBox=\"1\"/><wps:spPr/><wps:txbx><w:txbxContent>{absatz}</w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp>" +
          "</a:graphicData></a:graphic></wp:inline></w:drawing></mc:Choice><mc:Fallback><w:pict>" +
          $"<v:shape id=\"Textfeld1\" style=\"width:100pt;height:30pt\"><v:textbox><w:txbxContent>{absatz}</w:txbxContent></v:textbox></v:shape>" +
          "</w:pict></mc:Fallback></mc:AlternateContent></w:r>");

    /// <summary>Textfeld nur als VML (älteres Format).</summary>
    public static string TextfeldVml(string absatz) =>
        P($"<w:r><w:pict><v:shape id=\"Textfeld2\" style=\"width:100pt;height:30pt\"><v:textbox><w:txbxContent>{absatz}</w:txbxContent></v:textbox></v:shape></w:pict></w:r>");

    public static string SdtBlock(string absatz) =>
        $"<w:sdt><w:sdtPr><w:alias w:val=\"Feld\"/><w:id w:val=\"11\"/></w:sdtPr><w:sdtContent>{absatz}</w:sdtContent></w:sdt>";

    public static string SdtImAbsatz(string runs) =>
        P($"<w:sdt><w:sdtPr><w:id w:val=\"12\"/></w:sdtPr><w:sdtContent>{runs}</w:sdtContent></w:sdt>");

    public static string SmartTag(string runs) => P($"<w:smartTag w:uri=\"urn:beispiel\" w:element=\"name\">{runs}</w:smartTag>");

    /// <summary>Feld mit unverdächtiger Anweisung; die Runs bilden das Feldergebnis.</summary>
    public static string Feldergebnis(string runs, string anweisung = " QUOTE \"x\" ") =>
        P("<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>" +
          $"<w:r><w:instrText xml:space=\"preserve\">{anweisung}</w:instrText></w:r>" +
          "<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>" + runs +
          "<w:r><w:fldChar w:fldCharType=\"end\"/></w:r>");

    public static string EinfachesFeld(string anweisung, string runs) =>
        P($"<w:fldSimple w:instr=\"{anweisung}\">{runs}</w:fldSimple>");

    /// <summary>Datei mit externem Hyperlink, dessen Text <c>{{Coin.Name}}</c> verteilt enthält.</summary>
    public static DocxBauer MitHyperlink()
    {
        var bauer = OhneCoinName();
        var rid = bauer.DokumentBeziehung(RelHyperlink, "https://beispiel.invalid/", istExtern: true);
        return bauer.Absaetze(P($"<w:hyperlink r:id=\"{rid}\">{GeteilterCoinNameRuns}</w:hyperlink>"));
    }

    public static DocxBauer MitGlossar(string absatz, DocxBauer? basis = null)
    {
        var bauer = basis ?? Gueltig();
        bauer.DokumentTeil("glossary/document.xml",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml",
            RelBasis + "/glossaryDocument",
            $"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:glossaryDocument {Namensraeume}><w:docParts><w:docPart>" +
            $"<w:docPartPr><w:name w:val=\"Baustein\"/></w:docPartPr><w:docPartBody>{absatz}</w:docPartBody></w:docPart></w:docParts></w:glossaryDocument>");
        return bauer;
    }

    public const string BibliographyNs = "http://schemas.openxmlformats.org/officeDocument/2006/bibliography";

    /// <summary>
    /// <c>customXml</c>-Datenteil wie das Quellenverzeichnis, das Word schreibt (<c>b:Sources</c>), mit
    /// <paramref name="wert"/> in <c>b:Tag</c>. Rev. 7 (AK-16 a/e): Testwerte in <c>customXml</c>- und verwaisten Teilen
    /// stehen in einem erlaubten Namespace, damit die Namespace-Positivliste nicht anschlägt.
    /// </summary>
    public static string QuellenverzeichnisXml(string wert) =>
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?>" +
        $"<b:Sources xmlns:b=\"{BibliographyNs}\" xmlns=\"{BibliographyNs}\" SelectedStyle=\"\\APASixthEditionOfficeOnline.xsl\" StyleName=\"APA\">" +
        $"<b:Source><b:Tag>{SecurityElement.Escape(wert)}</b:Tag></b:Source></b:Sources>";

    // ---------- bösartige und ungültige Dateien ----------

    public static byte[] Pdf() => Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

    public static byte[] Textdatei() => Encoding.UTF8.GetBytes("Dies ist nur Text mit {{Coin.Name}} und keine Word-Datei.");

    public static byte[] OleVerbund()
    {
        var inhalt = new byte[1024];
        new byte[] { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 }.CopyTo(inhalt, 0);
        return inhalt;
    }

    public static byte[] LeeresZip()
    {
        using var puffer = new MemoryStream();
        using (new ZipArchive(puffer, ZipArchiveMode.Create, leaveOpen: true))
        {
        }

        return puffer.ToArray();
    }

    public static byte[] Beschaedigt()
    {
        var gueltig = Gueltig().Bytes();
        return gueltig[..(gueltig.Length / 2)];
    }

    public static byte[] DoppelteEintraege() =>
        Gueltig().RohEintrag("word/document.xml", Encoding.UTF8.GetBytes("<doppelt/>")).Bytes();

    public static byte[] MitHauptTyp(string typ)
    {
        var bauer = Gueltig();
        bauer.HauptTyp = typ;
        return bauer.Bytes();
    }

    public static byte[] Docm()
    {
        var bauer = Gueltig();
        bauer.HauptTyp = MakroHauptteilTyp;
        bauer.DokumentTeil("vbaProject.bin", "application/vnd.ms-office.vbaProject", RelVbaProject, [0xCC, 0x61, 0xFF, 0xFF, 0x00]);
        return bauer.Bytes();
    }

    /// <summary>Gültiges DOCX (Content-Type ohne Makros) mit eingeschmuggeltem <c>vbaProject.bin</c> ohne Beziehung.</summary>
    public static byte[] EingeschmuggeltesVbaProjekt(string pfad = "word/vbaProject.bin") =>
        Gueltig().RohEintrag(pfad, [0xCC, 0x61, 0xFF, 0xFF, 0x00]).Bytes();

    public static byte[] VbaProjektPerContentType()
    {
        var bauer = Gueltig();
        bauer.Teil("word/daten.bin", "application/vnd.ms-office.vbaProject", [0xCC, 0x61, 0x00]);
        return bauer.Bytes();
    }

    public static byte[] VbaDaten()
    {
        var bauer = Gueltig();
        bauer.Teil("word/vbaData.xml", "application/vnd.ms-word.vbaData+xml",
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><wne:vbaSuppData xmlns:wne=\"http://schemas.microsoft.com/office/word/2006/wordml\"/>");
        return bauer.Bytes();
    }

    public static byte[] VbaBeziehung()
    {
        var bauer = Gueltig();
        bauer.DokumentTeil("daten.bin", "application/octet-stream", RelVbaProject, [0xCC, 0x61, 0x00]);
        return bauer.Bytes();
    }

    /// <summary>Ein Eintrag aus <paramref name="bytes"/> Nullen (stark komprimierbar).</summary>
    public static byte[] MitNullen(int bytes, int anzahl = 1)
    {
        var bauer = Gueltig();
        var nullen = new byte[bytes];
        for (var i = 0; i < anzahl; i++)
        {
            bauer.RohEintrag($"word/media/fuellung{i}.bin", nullen);
        }

        return bauer.Bytes();
    }

    /// <summary>Gültiges DOCX mit insgesamt <paramref name="eintraege"/> ZIP-Einträgen.</summary>
    public static byte[] MitEintraegen(int eintraege)
    {
        var bauer = Gueltig();
        var vorhanden = DocxLeser.Eintraege(bauer.Bytes()).Count;
        for (var i = 0; i < eintraege - vorhanden; i++)
        {
            bauer.RohEintrag($"word/media/e{i}.bin", [(byte)i]);
        }

        return bauer.Bytes();
    }

    /// <summary>Ein Eintrag über 20 MiB mit Kompressionsverhältnis deutlich unter 100 : 1.</summary>
    public static byte[] GrosserEintragMitMaessigerKompression(int bytes = 21 * MiB)
    {
        var daten = new byte[bytes];
        var zufall = new Random(4711);
        var block = new byte[160];
        for (var i = 0; i < bytes; i += 4096)
        {
            zufall.NextBytes(block);
            block.AsSpan(0, Math.Min(block.Length, bytes - i)).CopyTo(daten.AsSpan(i));
        }

        return Gueltig().RohEintrag("word/media/gross.bin", daten).Bytes();
    }

    public static byte[] Xxe()
    {
        var bauer = Mit([.. PflichtAbsaetze, P("<w:r><w:t>&xxe;</w:t></w:r>")]);
        bauer.DokumentProlog = "<!DOCTYPE w:document [<!ENTITY xxe SYSTEM \"file:///c:/windows/win.ini\">]>";
        return bauer.Bytes();
    }

    public static byte[] BillionLaughs()
    {
        var bauer = Mit([.. PflichtAbsaetze, P("<w:r><w:t>&lol9;</w:t></w:r>")]);
        var entitaeten = new StringBuilder("<!ENTITY lol \"lol\">");
        for (var i = 1; i <= 9; i++)
        {
            var vorher = i == 1 ? "lol" : $"lol{i - 1}";
            entitaeten.Append($"<!ENTITY lol{i} \"{string.Concat(Enumerable.Repeat($"&{vorher};", 10))}\">");
        }

        bauer.DokumentProlog = $"<!DOCTYPE w:document [{entitaeten}]>";
        return bauer.Bytes();
    }

    /// <summary>DOCTYPE in einem Nicht-Word-Teil (<c>docProps/core.xml</c>).</summary>
    public static byte[] DtdInKernEigenschaften()
    {
        var bauer = Gueltig();
        bauer.Teil("docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml",
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><!DOCTYPE cp:coreProperties [<!ENTITY x \"y\">]>" +
            "<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" " +
            "xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><dc:title>&x;</dc:title></cp:coreProperties>");
        bauer.Beziehung(string.Empty, RelCoreProperties, "docProps/core.xml");
        return bauer.Bytes();
    }

    public static DocxBauer MitActiveX(DocxBauer? basis = null)
    {
        var bauer = basis ?? Gueltig();
        bauer.DokumentTeil("activeX/activeX1.xml", "application/vnd.ms-office.activeX+xml", RelBasis + "/control",
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ax:ocx xmlns:ax=\"http://schemas.microsoft.com/office/2006/activeX\" ax:classid=\"{8BD21D40-EC42-11CE-9E0D-00AA006002F3}\"/>");
        return bauer;
    }

    public static DocxBauer MitOleObjekt(DocxBauer? basis = null)
    {
        var bauer = basis ?? Gueltig();
        bauer.DokumentTeil("embeddings/oleObject1.bin", "application/vnd.openxmlformats-officedocument.oleObject", RelBasis + "/oleObject", OleVerbund());
        return bauer;
    }

    public static DocxBauer MitEingebettetemPaket()
    {
        var bauer = Gueltig();
        bauer.DokumentTeil("embeddings/Tabelle1.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", RelBasis + "/package", LeeresZip());
        return bauer;
    }

    public static DocxBauer MitAttachedTemplate()
    {
        var bauer = Gueltig();
        bauer.Einstellungen("<w:attachedTemplate r:id=\"rIdVorlage\"/>");
        bauer.Beziehung("word/settings.xml", RelBasis + "/attachedTemplate", "file:///C:/Vorlagen/Normal.dotm", istExtern: true, id: "rIdVorlage");
        return bauer;
    }

    public static DocxBauer MitExternerBeziehung(string typ, string ziel, DocxBauer? basis = null)
    {
        var bauer = basis ?? Gueltig();
        bauer.DokumentBeziehung(typ, ziel, istExtern: true);
        return bauer;
    }

    public static DocxBauer MitAltChunk(DocxBauer? basis = null)
    {
        var bauer = basis ?? Gueltig();
        var rid = bauer.DokumentTeil("afchunk.htm", "text/html", RelBasis + "/aFChunk", "<html><body>Fremd</body></html>");
        return bauer.Absaetze($"<w:altChunk r:id=\"{rid}\"/>");
    }

    public static string FeldMitAnweisung(string anweisung) => Feldergebnis(Run("Ergebnis"), anweisung);

    public static DocxBauer MitBild()
    {
        var bauer = Gueltig();
        bauer.DokumentTeil("media/bild1.png", "image/png", RelImage, Testbilder.Png(512));
        return bauer;
    }

    // ---------- nachverfolgte Änderungen, Kommentare ----------

    private const string Revision = "w:author=\"Test Autor Revision\" w:date=\"2026-10-01T00:00:00Z\"";

    public static string Eingefuegt() => P($"<w:ins w:id=\"21\" {Revision}>{Run("eingefügt")}</w:ins>");

    public static string Geloescht() => P($"<w:del w:id=\"22\" {Revision}><w:r><w:delText>gelöscht</w:delText></w:r></w:del>");

    public static string Weggeschoben() => P($"<w:moveFrom w:id=\"23\" {Revision}>{Run("verschoben")}</w:moveFrom>");

    public static string Hingeschoben() => P($"<w:moveTo w:id=\"24\" {Revision}>{Run("verschoben")}</w:moveTo>");

    public static DocxBauer MitKommentarTeil(bool mitKommentar = true, DocxBauer? basis = null)
    {
        var bauer = basis ?? Gueltig();
        var kommentar = mitKommentar
            ? $"<w:comment w:id=\"0\" w:author=\"Test Autor Kommentar\" w:date=\"2026-10-01T00:00:00Z\">{Text("Bitte prüfen")}</w:comment>"
            : string.Empty;
        bauer.DokumentTeil("comments.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml", RelComments,
            $"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:comments {Namensraeume}>{kommentar}</w:comments>");
        return bauer;
    }

    public static string KommentarVerweis() =>
        P("<w:commentRangeStart w:id=\"0\"/>", Run("kommentiert"), "<w:commentRangeEnd w:id=\"0\"/>",
          "<w:r><w:commentReference w:id=\"0\"/></w:r>");

    /// <summary>Gültiges DOCX mit genau <paramref name="zielGroesse"/> Bytes (unkomprimierte, gut komprimierbare Füllung).</summary>
    public static byte[] MitGenauerGroesse(int zielGroesse)
    {
        DocxBauer Bauer(int fuellung)
        {
            var bauer = Gueltig();
            bauer.Kompression = CompressionLevel.NoCompression;
            bauer.KernEigenschaften(
                "<dc:creator>Test Autor Fuellung</dc:creator><dc:description>" + new string('d', 4000) + "</dc:description>");
            bauer.DokumentTeil("media/fuellbild.png", "image/png", RelImage, Encoding.ASCII.GetBytes(new string('F', fuellung)));
            return bauer;
        }

        var start = 1024;
        var groesse = Bauer(start).Bytes().Length;
        var bytes = Bauer(start + zielGroesse - groesse).Bytes();
        Assert.Equal(zielGroesse, bytes.Length);
        return bytes;
    }
}
