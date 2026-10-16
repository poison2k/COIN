using System.Buffers.Binary;
using System.IO.Compression;
using System.Text;

namespace Coin.Infrastructure.Vorlagen;

/// <summary>Ergebnis von <see cref="ZipVorpruefung.Pruefen"/>.</summary>
internal abstract record ZipErgebnis
{
    private ZipErgebnis()
    {
    }

    /// <summary>Kein, beschädigtes oder nicht unterstütztes ZIP (verschlüsselt, unbekannte Kompression, doppelte Namen).</summary>
    public sealed record Ungueltig : ZipErgebnis;

    /// <summary>Grenzen beim Entpacken überschritten (AK-12).</summary>
    public sealed record ZuGross : ZipErgebnis;

    /// <summary>
    /// Alle Eintragsnamen und die entpackten XML-Teile (nach Content-Type, AK-10); Namen in der Teilnamen-Normalform.
    /// <see cref="Typen"/> sind die Content-Types aus <c>[Content_Types].xml</c> (<c>null</c>, wenn sie fehlen oder
    /// unlesbar sind).
    /// </summary>
    public sealed record Gelesen(IReadOnlyList<string> Namen, IReadOnlyDictionary<string, byte[]> XmlTeile, ContentTypen? Typen) : ZipErgebnis;
}

/// <summary>
/// ZIP-Vorprüfung einer hochgeladenen Datei im Speicher (zertifikatsvorlagen AK-12, ADR-0024 Punkt 1.3), bevor das
/// OpenXML SDK sie sieht. Das Zentralverzeichnis wird selbst gelesen und jeder Eintrag selbst entpackt, weil
/// <see cref="ZipArchive"/> beim Lesen auf die (fälschbare) Größenangabe im Verzeichnis kürzt. Gezählt werden die
/// tatsächlich entpackten Bytes; das Entpacken bricht beim ersten Überschreiten ab. Nichts wird auf die Platte geschrieben.
/// </summary>
internal static class ZipVorpruefung
{
    public const int MaxEintraege = 1_000;
    public const long MaxBytesJeEintrag = 20L * 1024 * 1024;
    public const long MaxBytesGesamt = 50L * 1024 * 1024;
    public const long VerhaeltnisAbBytes = 1L * 1024 * 1024;
    public const long MaxVerhaeltnis = 100;

    /// <summary>Alle XML-Teile zusammen höchstens 10 MiB entpackt (AK-12, Rev. 3).</summary>
    public const long MaxXmlBytesGesamt = 10L * 1024 * 1024;

    private const uint EndeSignatur = 0x06054b50;
    private const uint VerzeichnisSignatur = 0x02014b50;
    private const uint LokaleSignatur = 0x04034b50;
    private const uint Voll32 = 0xFFFFFFFF;

    private sealed record Eintrag(string Name, ushort Methode, ushort Flags, long Komprimiert, long Entpackt, long LokalerKopf);

    private sealed class UngueltigException : Exception;

    private sealed class ZuGrossException : Exception;

    public static ZipErgebnis Pruefen(byte[] zip)
    {
        try
        {
            var eintraege = Verzeichnis(zip);
            if (Normalformen(eintraege) is not { } namen || !GleicheSichtWieZipArchive(zip, eintraege))
            {
                return new ZipErgebnis.Ungueltig();
            }

            var xml = new Dictionary<string, byte[]>(Teilname.Vergleich);
            var zaehler = new Zaehler();

            // [Content_Types].xml zuerst: erst damit steht fest, welche Einträge XML-Teile sind (AK-10). Fehlt es oder
            // ist es unlesbar, gelten nur .rels-Einträge als XML; die Analyse lehnt die Datei dann ohnehin ab.
            var typenIndex = namen.FindIndex(n => n.Equals(ContentTypen.Teilname, StringComparison.OrdinalIgnoreCase));
            ContentTypen? typen = null;
            if (typenIndex >= 0)
            {
                var bytes = Entpacken(zip, eintraege[typenIndex], behalten: true, zaehler)!;
                xml[ContentTypen.Teilname] = bytes;
                typen = ContentTypen.Lesen(bytes);
            }

            for (var i = 0; i < eintraege.Count; i++)
            {
                if (i == typenIndex)
                {
                    continue;
                }

                var behalten = IstXmlTeil(namen[i], typen);
                var inhalt = Entpacken(zip, eintraege[i], behalten, zaehler);
                if (behalten)
                {
                    xml[namen[i]] = inhalt!;
                }
            }

            return new ZipErgebnis.Gelesen(namen, xml, typen);
        }
        catch (ZuGrossException)
        {
            return new ZipErgebnis.ZuGross();
        }
        catch (Exception ex) when (ex is UngueltigException or InvalidDataException or ArgumentException or IOException)
        {
            return new ZipErgebnis.Ungueltig();
        }
    }

    /// <summary>
    /// Eintragsnamen in der <see cref="Teilname">Teilnamen-Normalform</see> (AK-10, H1), in Verzeichnisreihenfolge;
    /// <c>null</c> bei ungültiger Kodierung oder doppelten Namen (auch <c>a b.png</c> neben <c>a%20b.png</c> oder nur in
    /// Groß-/Kleinschreibung verschieden). Ein Eintrag, dessen Normalform <c>[Content_Types].xml</c> ist, muss auch roh so
    /// heißen.
    /// </summary>
    private static List<string>? Normalformen(List<Eintrag> eintraege)
    {
        var namen = new List<string>(eintraege.Count);
        var gesehen = new HashSet<string>(Teilname.Vergleich);
        foreach (var eintrag in eintraege)
        {
            if (Teilname.EintragNormalisieren(eintrag.Name) is not { } name || !gesehen.Add(name)
                || (name.Equals(ContentTypen.Teilname, StringComparison.OrdinalIgnoreCase)
                    && !eintrag.Name.Equals(ContentTypen.Teilname, StringComparison.OrdinalIgnoreCase)))
            {
                return null;
            }

            namen.Add(name);
        }

        return namen;
    }

    /// <summary>XML-Teil nach Content-Type (AK-10); Verzeichniseinträge nie.</summary>
    private static bool IstXmlTeil(string name, ContentTypen? typen) =>
        !ContentTypen.IstVerzeichnis(name) && (typen?.IstXmlTeil(name) ?? ContentTypen.IstImmerXml(name));

    /// <summary>Tatsächlich entpackte Bytes: insgesamt und nur XML-Teile.</summary>
    private sealed class Zaehler
    {
        public long Gesamt { get; set; }

        public long Xml { get; set; }
    }

    /// <summary>Liest das Zentralverzeichnis; höchstens <see cref="MaxEintraege"/> Einträge.</summary>
    private static List<Eintrag> Verzeichnis(byte[] zip)
    {
        var ende = EndeFinden(zip);
        var anzahl = Wort(zip, ende + 10);
        var groesse = Doppelwort(zip, ende + 12);
        var start = Doppelwort(zip, ende + 16);
        if (Wort(zip, ende + 4) != 0 || Wort(zip, ende + 6) != 0 || groesse == Voll32 || start == Voll32
            || (long)start + groesse > ende)
        {
            throw new UngueltigException();
        }

        if (anzahl > MaxEintraege)
        {
            throw new ZuGrossException();
        }

        var eintraege = new List<Eintrag>();
        var position = (int)start;
        var verzeichnisEnde = (int)(start + groesse);
        while (position < verzeichnisEnde)
        {
            if (Doppelwort(zip, position) != VerzeichnisSignatur)
            {
                throw new UngueltigException();
            }

            if (eintraege.Count == MaxEintraege)
            {
                throw new ZuGrossException();
            }

            var flags = Wort(zip, position + 8);
            var methode = Wort(zip, position + 10);
            long komprimiert = Doppelwort(zip, position + 20);
            long entpackt = Doppelwort(zip, position + 24);
            var nameLaenge = Wort(zip, position + 28);
            var extraLaenge = Wort(zip, position + 30);
            var kommentarLaenge = Wort(zip, position + 32);
            long lokal = Doppelwort(zip, position + 42);
            var name = Encoding.UTF8.GetString(Ausschnitt(zip, position + 46, nameLaenge));
            var extra = Ausschnitt(zip, position + 46 + nameLaenge, extraLaenge);
            (entpackt, komprimiert, lokal) = Zip64(extra, entpackt, komprimiert, lokal);

            eintraege.Add(new Eintrag(name, methode, flags, komprimiert, entpackt, lokal));
            position += 46 + nameLaenge + extraLaenge + kommentarLaenge;
        }

        if (eintraege.Count != anzahl)
        {
            throw new UngueltigException();
        }

        return eintraege;
    }

    private static int EndeFinden(byte[] zip)
    {
        for (var i = zip.Length - 22; i >= Math.Max(0, zip.Length - 22 - ushort.MaxValue); i--)
        {
            if (Doppelwort(zip, i) == EndeSignatur && i + 22 + Wort(zip, i + 20) == zip.Length)
            {
                return i;
            }
        }

        throw new UngueltigException();
    }

    /// <summary>Werte aus dem Zip64-Zusatzfeld (Kennung 1), nur für Felder mit dem Wert 0xFFFFFFFF.</summary>
    private static (long Entpackt, long Komprimiert, long Lokal) Zip64(ReadOnlySpan<byte> extra, long entpackt, long komprimiert, long lokal)
    {
        if (entpackt != Voll32 && komprimiert != Voll32 && lokal != Voll32)
        {
            return (entpackt, komprimiert, lokal);
        }

        var position = 0;
        while (position + 4 <= extra.Length)
        {
            var kennung = BinaryPrimitives.ReadUInt16LittleEndian(extra[position..]);
            var laenge = BinaryPrimitives.ReadUInt16LittleEndian(extra[(position + 2)..]);
            if (kennung == 1)
            {
                var daten = extra.Slice(position + 4, Math.Min(laenge, extra.Length - position - 4));
                var feld = 0;
                entpackt = Zip64Wert(daten, entpackt, ref feld);
                komprimiert = Zip64Wert(daten, komprimiert, ref feld);
                lokal = Zip64Wert(daten, lokal, ref feld);
                return (entpackt, komprimiert, lokal);
            }

            position += 4 + laenge;
        }

        throw new UngueltigException();
    }

    private static long Zip64Wert(ReadOnlySpan<byte> daten, long wert, ref int feld)
    {
        if (wert != Voll32)
        {
            return wert;
        }

        if (feld + 8 > daten.Length)
        {
            throw new UngueltigException();
        }

        var gelesen = BinaryPrimitives.ReadInt64LittleEndian(daten[feld..]);
        feld += 8;
        return gelesen;
    }

    /// <summary>Gleiche Eintragsnamen wie <see cref="ZipArchive"/> (das OpenXML SDK liest damit), sonst ungültig.</summary>
    private static bool GleicheSichtWieZipArchive(byte[] zip, List<Eintrag> eintraege)
    {
        using var archiv = new ZipArchive(new MemoryStream(zip, writable: false), ZipArchiveMode.Read);
        return archiv.Entries.Select(e => e.FullName).SequenceEqual(eintraege.Select(e => e.Name), StringComparer.Ordinal);
    }

    /// <summary>Entpackt einen Eintrag zählend; liefert den Inhalt nur, wenn <paramref name="behalten"/>.</summary>
    private static byte[]? Entpacken(byte[] zip, Eintrag eintrag, bool behalten, Zaehler zaehler)
    {
        if ((eintrag.Flags & 1) != 0 || eintrag.Methode is not (0 or 8) || eintrag.Komprimiert < 0
            || eintrag.LokalerKopf < 0 || eintrag.LokalerKopf + 30 > zip.Length
            || Doppelwort(zip, (int)eintrag.LokalerKopf) != LokaleSignatur)
        {
            throw new UngueltigException();
        }

        var kopf = (int)eintrag.LokalerKopf;
        var datenStart = (long)kopf + 30 + Wort(zip, kopf + 26) + Wort(zip, kopf + 28);
        if (datenStart + eintrag.Komprimiert > zip.Length)
        {
            throw new UngueltigException();
        }

        using var roh = new MemoryStream(zip, (int)datenStart, (int)eintrag.Komprimiert, writable: false);
        using Stream quelle = eintrag.Methode == 8 ? new DeflateStream(roh, CompressionMode.Decompress) : roh;
        using var ziel = behalten ? new MemoryStream() : null;
        var puffer = new byte[81_920];
        long entpackt = 0;
        int gelesen;
        while ((gelesen = quelle.Read(puffer, 0, puffer.Length)) > 0)
        {
            entpackt += gelesen;
            zaehler.Gesamt += gelesen;
            if (behalten)
            {
                zaehler.Xml += gelesen;
            }

            if (entpackt > MaxBytesJeEintrag || zaehler.Gesamt > MaxBytesGesamt || zaehler.Xml > MaxXmlBytesGesamt
                || (entpackt > VerhaeltnisAbBytes && entpackt > MaxVerhaeltnis * Math.Max(1, eintrag.Komprimiert)))
            {
                throw new ZuGrossException();
            }

            ziel?.Write(puffer, 0, gelesen);
        }

        // Abweichung von der Angabe im Verzeichnis: beschädigt oder manipuliert.
        if (entpackt != eintrag.Entpackt)
        {
            throw new UngueltigException();
        }

        return ziel?.ToArray();
    }

    private static ReadOnlySpan<byte> Ausschnitt(byte[] zip, int start, int laenge) =>
        start < 0 || start + laenge > zip.Length ? throw new UngueltigException() : zip.AsSpan(start, laenge);

    private static ushort Wort(byte[] zip, int position) => BinaryPrimitives.ReadUInt16LittleEndian(Ausschnitt(zip, position, 2));

    private static uint Doppelwort(byte[] zip, int position) => BinaryPrimitives.ReadUInt32LittleEndian(Ausschnitt(zip, position, 4));
}
