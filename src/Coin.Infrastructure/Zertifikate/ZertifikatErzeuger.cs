using System.IO.Compression;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using Coin.Domain.Zertifikate;
using Coin.Infrastructure.Vorlagen;

namespace Coin.Infrastructure.Zertifikate;

/// <summary>
/// Erzeugt ein Zertifikat aus einer gespeicherten Vorlage (zertifikat-erzeugen AK-8 bis AK-17, ADR-0028): ZIP lesen mit
/// <see cref="ZipArchive"/>, Story-Teile (<see cref="OpcPaket.Geschichten"/>) mit <see cref="SicheresXml"/> lesen,
/// Platzhalter über denselben Absatz-Durchlauf wie die Prüfung (<see cref="Absatztexte.Segmente"/>) mit
/// <see cref="PlatzhalterErsetzung"/> ersetzen und ein neues Paket in einem <see cref="MemoryStream"/> schreiben. Teile
/// ohne Fundstelle werden unverändert und in derselben Reihenfolge übernommen. Kein Dateisystem, kein
/// <c>System.IO.Packaging</c>. Als Singleton höchstens <see cref="MaxGleichzeitig"/> Erzeugungen gleichzeitig (AK-16).
/// </summary>
internal sealed class ZertifikatErzeuger : IZertifikatErzeuger
{
    /// <summary>Höchstzahl gleichzeitiger Erzeugungen je Prozess (AK-16, getrennt von der Vorlagen-Aufbereitung).</summary>
    public const int MaxGleichzeitig = 2;

    private static readonly XName XmlSpace = XNamespace.Xml + "space";

    private readonly SemaphoreSlim _plaetze = new(MaxGleichzeitig, MaxGleichzeitig);

    public async Task<ZertifikatErzeugenErgebnis> ErzeugenAsync(
        byte[] vorlage, IReadOnlyDictionary<string, string> werte, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(vorlage);
        ArgumentNullException.ThrowIfNull(werte);

        await _plaetze.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            return Erzeugen(vorlage, werte);
        }
        catch (Exception)
        {
            // Ausnahmetexte können Dokumentinhalt enthalten; sie verlassen den Erzeuger nicht (AK-17, ADR-0028 Punkt 9).
            return new ZertifikatErzeugenErgebnis.Fehlgeschlagen();
        }
        finally
        {
            _plaetze.Release();
        }
    }

    internal static ZertifikatErzeugenErgebnis Erzeugen(byte[] vorlage, IReadOnlyDictionary<string, string> werte)
    {
        using var eingabe = new ZipArchive(new MemoryStream(vorlage, writable: false), ZipArchiveMode.Read);
        var eintraege = eingabe.Entries.ToList();
        var namen = eintraege
            .Select(e => Teilname.EintragNormalisieren(e.FullName) ?? throw new InvalidDataException("Ungültiger Teilname."))
            .ToList();

        // Struktur: nur Content-Types und Beziehungen als XML, daraus die Story-Teile wie bei der Prüfung.
        var struktur = new Dictionary<string, XDocument>(Teilname.Vergleich);
        for (var i = 0; i < eintraege.Count; i++)
        {
            if (namen[i].Equals(ContentTypen.Teilname, StringComparison.OrdinalIgnoreCase)
                || namen[i].EndsWith(".rels", StringComparison.OrdinalIgnoreCase))
            {
                struktur[namen[i]] = XmlLesen(Inhalt(eintraege[i]));
            }
        }

        var paket = OpcPaket.Lesen(namen, struktur) ?? throw new InvalidDataException("Paketstruktur unvollständig.");
        var geschichten = new Dictionary<int, XDocument>();
        foreach (var teil in paket.Geschichten())
        {
            var index = namen.FindIndex(n => Teilname.Vergleich.Equals(n, teil));
            if (index < 0)
            {
                throw new InvalidDataException("Story-Teil fehlt.");
            }

            geschichten[index] = XmlLesen(Inhalt(eintraege[index]));
        }

        // Grenze vor jeder Änderung, über alle Story-Teile zusammen (AK-14).
        var absaetze = geschichten.ToDictionary(g => g.Key, g => Absatztexte.Segmente(g.Value));
        var vorkommen = PlatzhalterErsetzung.Zaehlen(
            absaetze.Values.SelectMany(teil => teil).SelectMany(a => string.Concat(a.Select(s => s.Text)).Split('\n')));
        if (vorkommen > PlatzhalterErsetzung.MaxVorkommen)
        {
            return new ZertifikatErzeugenErgebnis.ZuVielePlatzhalter();
        }

        var geaendert = new HashSet<int>();
        foreach (var (index, teil) in absaetze)
        {
            foreach (var absatz in teil)
            {
                if (AbsatzErsetzen(absatz, werte))
                {
                    geaendert.Add(index);
                }
            }
        }

        return new ZertifikatErzeugenErgebnis.Erzeugt(Schreiben(eintraege, geschichten, geaendert));
    }

    /// <summary>Ersetzt in einem Absatz; <c>true</c>, wenn sich ein <c>w:t</c> geändert hat.</summary>
    private static bool AbsatzErsetzen(List<Absatzsegment> absatz, IReadOnlyDictionary<string, string> werte)
    {
        if (absatz.Count == 0)
        {
            return false;
        }

        var neu = PlatzhalterErsetzung.Ersetzen(absatz.Select(s => s.Text).ToList(), werte);
        var geaendert = false;
        for (var i = 0; i < absatz.Count; i++)
        {
            var segment = absatz[i];
            if (!segment.IstText || Unveraendert(segment.Text, neu[i]))
            {
                continue;
            }

            segment.Element.ReplaceWith(Knoten(neu[i], segment.Element.Parent?.Name == W.R));
            geaendert = true;
        }

        return geaendert;
    }

    private static bool Unveraendert(string original, IReadOnlyList<Baustein> bausteine) =>
        bausteine switch
        {
            [] => original.Length == 0,
            [Baustein.Text text] => text.Wert == original,
            _ => false,
        };

    /// <summary>
    /// Neue Knoten an Stelle eines <c>w:t</c>, im selben Run (ADR-0028 Punkt 4 und 5): Text als <c>w:t</c> mit
    /// <c>xml:space="preserve"</c>, Umbruch als <c>w:br</c>, Tabulator als <c>w:tab</c>. Der Wert wird als Textknoten
    /// eingefügt, das Escaping übernimmt der Writer. Ohne Inhalt bleibt ein leeres <c>w:t</c>.
    /// </summary>
    private static List<XElement> Knoten(IReadOnlyList<Baustein> bausteine, bool imRun)
    {
        var knoten = new List<XElement>();
        foreach (var baustein in bausteine)
        {
            switch (baustein)
            {
                case Baustein.Text text:
                    knoten.Add(Text(text.Wert));
                    break;
                case Baustein.Umbruch:
                    knoten.Add(imRun ? new XElement(W.Br) : Text(" "));
                    break;
                case Baustein.Tabulator:
                    knoten.Add(imRun ? new XElement(W.Tab) : Text(" "));
                    break;
                default:
                    throw new InvalidOperationException("Unbekannter Baustein.");
            }
        }

        if (knoten.Count == 0)
        {
            knoten.Add(Text(string.Empty));
        }

        return knoten;
    }

    private static XElement Text(string wert) => new(W.T, new XAttribute(XmlSpace, "preserve"), wert);

    /// <summary>Neues Paket: gleiche Einträge in gleicher Reihenfolge, nur geänderte Story-Teile neu geschrieben.</summary>
    private static byte[] Schreiben(List<ZipArchiveEntry> eintraege, Dictionary<int, XDocument> geschichten, HashSet<int> geaendert)
    {
        using var puffer = new MemoryStream();
        using (var ausgabe = new ZipArchive(puffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            for (var i = 0; i < eintraege.Count; i++)
            {
                var quelle = eintraege[i];
                var ziel = ausgabe.CreateEntry(quelle.FullName, CompressionLevel.Optimal);
                ziel.LastWriteTime = quelle.LastWriteTime;
                if (quelle.FullName.EndsWith('/'))
                {
                    continue;
                }

                var inhalt = geaendert.Contains(i) ? XmlSchreiben(geschichten[i]) : Inhalt(quelle);
                using var strom = ziel.Open();
                strom.Write(inhalt);
            }
        }

        return puffer.ToArray();
    }

    /// <summary>Entpackt einen Eintrag in den Speicher, höchstens <see cref="ZipVorpruefung.MaxBytesJeEintrag"/> Bytes.</summary>
    private static byte[] Inhalt(ZipArchiveEntry eintrag)
    {
        using var strom = eintrag.Open();
        using var puffer = new MemoryStream();
        var block = new byte[81920];
        int gelesen;
        while ((gelesen = strom.Read(block, 0, block.Length)) > 0)
        {
            if (puffer.Length + gelesen > ZipVorpruefung.MaxBytesJeEintrag)
            {
                throw new InvalidDataException("Eintrag zu groß.");
            }

            puffer.Write(block, 0, gelesen);
        }

        return puffer.ToArray();
    }

    private static XDocument XmlLesen(byte[] bytes) =>
        SicheresXml.Lesen(bytes, out var dokument) == XmlStatus.Gelesen && dokument is not null
            ? dokument
            : throw new InvalidDataException("XML-Teil nicht lesbar.");

    /// <summary>UTF-8 ohne BOM, gleiche XML-Deklaration, ohne Einrückung; Zeilenumbrüche in Werten bleiben erhalten.</summary>
    private static byte[] XmlSchreiben(XDocument dokument)
    {
        using var puffer = new MemoryStream();
        var einstellungen = new XmlWriterSettings
        {
            Encoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false),
            Indent = false,
            OmitXmlDeclaration = dokument.Declaration is null,
            NewLineHandling = NewLineHandling.Entitize,
            CloseOutput = false,
        };
        using (var schreiber = XmlWriter.Create(puffer, einstellungen))
        {
            dokument.Save(schreiber);
        }

        return puffer.ToArray();
    }
}
