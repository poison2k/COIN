using System.Buffers.Binary;
using Coin.Domain.Katalog;

namespace Coin.Domain.Startseite;

/// <summary>Ergebnis der Logoprüfung: <see cref="Meldung"/> <c>null</c> = gültig, sonst genau eine Meldung aus 5.5.</summary>
public sealed record LogoPruefErgebnis(string? Meldung, BildFormat? Format, int Breite, int Hoehe)
{
    public bool IstGueltig => Meldung is null;
}

/// <summary>
/// Prüft ein Logo am Inhalt, ohne zu dekodieren (Feature startseite AK-11, Abschnitt 5.5, ADR-0031 Punkt 2): Format über
/// Magic Bytes, Maße aus dem Kopf (PNG <c>IHDR</c>, JPEG <c>SOFn</c> vor <c>SOS</c>, WebP <c>VP8 </c>/<c>VP8L</c>/<c>VP8X</c>),
/// Animation (APNG, animiertes WebP) und Pixelgrenze. Linear in der Dateigröße. Dateiname und deklarierter Typ zählen nicht.
/// </summary>
public static class LogoPruefung
{
    /// <summary>2 MiB, Grenze inklusive (Annahme A1).</summary>
    public const int MaxGroesseBytes = 2 * 1024 * 1024;

    /// <summary>Höchste Breite und Höhe in Pixeln (S5).</summary>
    public const int MaxPixel = 2048;

    public const string MeldungLeer = "Die Datei ist leer.";
    public const string MeldungSvg = "SVG-Dateien sind nicht erlaubt. Bitte das Logo als PNG, JPEG oder WebP hochladen.";
    public const string MeldungKeinBild = "Die Datei ist kein Bild im Format PNG, JPEG oder WebP.";
    public const string MeldungBeschaedigt = "Die Bilddatei ist beschädigt oder unvollständig.";
    public const string MeldungAnimiert = "Animierte Bilder sind nicht erlaubt.";

    /// <summary>Bereich am Dateianfang, in dem nach <c>&lt;svg</c> gesucht wird (5.5).</summary>
    private const int SvgSuchbereich = 4096;

    public static string MeldungZuGross(int breite, int hoehe) =>
        $"Das Logo ist {breite} × {hoehe} Pixel groß; erlaubt sind höchstens {MaxPixel} × {MaxPixel} Pixel.";

    public static LogoPruefErgebnis Pruefen(byte[] daten)
    {
        ArgumentNullException.ThrowIfNull(daten);
        return Pruefen(new ReadOnlyMemory<byte>(daten));
    }

    public static LogoPruefErgebnis Pruefen(ReadOnlyMemory<byte> daten)
    {
        var span = daten.Span;
        if (span.Length == 0)
        {
            return Fehler(MeldungLeer, null);
        }

        var format = BildFormatErkennung.Erkennen(span);
        if (format is null)
        {
            return Fehler(IstSvg(span) ? MeldungSvg : MeldungKeinBild, null);
        }

        var kopf = format switch
        {
            BildFormat.Png => PngKopf(span),
            BildFormat.Jpeg => JpegKopf(span),
            BildFormat.Webp => WebpKopf(span),
            _ => null,
        };

        if (kopf is not { } k || k.Breite <= 0 || k.Hoehe <= 0)
        {
            return Fehler(MeldungBeschaedigt, format);
        }

        if (k.Animiert)
        {
            return new LogoPruefErgebnis(MeldungAnimiert, format, k.Breite, k.Hoehe);
        }

        if (k.Breite > MaxPixel || k.Hoehe > MaxPixel)
        {
            return new LogoPruefErgebnis(MeldungZuGross(k.Breite, k.Hoehe), format, k.Breite, k.Hoehe);
        }

        return new LogoPruefErgebnis(null, format, k.Breite, k.Hoehe);
    }

    private static LogoPruefErgebnis Fehler(string meldung, BildFormat? format) => new(meldung, format, 0, 0);

    private readonly record struct Kopf(int Breite, int Hoehe, bool Animiert);

    /// <summary>Nach optionalem UTF-8-BOM und Leerraum beginnt der Text mit <c>&lt;</c> und enthält früh <c>&lt;svg</c>.</summary>
    private static bool IstSvg(ReadOnlySpan<byte> daten)
    {
        var bereich = daten[..Math.Min(daten.Length, SvgSuchbereich)];
        var pos = bereich.StartsWith((ReadOnlySpan<byte>)[0xEF, 0xBB, 0xBF]) ? 3 : 0;
        while (pos < bereich.Length && bereich[pos] is (byte)' ' or (byte)'\t' or (byte)'\r' or (byte)'\n')
        {
            pos++;
        }

        if (pos >= bereich.Length || bereich[pos] != (byte)'<')
        {
            return false;
        }

        for (var i = pos; i + 4 <= bereich.Length; i++)
        {
            if (bereich[i] == (byte)'<'
                && (bereich[i + 1] | 0x20) == 's'
                && (bereich[i + 2] | 0x20) == 'v'
                && (bereich[i + 3] | 0x20) == 'g')
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>PNG: <c>IHDR</c> muss der erste Chunk sein; <c>acTL</c> vor dem ersten <c>IDAT</c> bedeutet APNG.</summary>
    private static Kopf? PngKopf(ReadOnlySpan<byte> daten)
    {
        const int signatur = 8;
        if (daten.Length < signatur + 8 + 13 + 4)
        {
            return null;
        }

        var laenge = BinaryPrimitives.ReadUInt32BigEndian(daten[signatur..]);
        if (laenge != 13 || !daten.Slice(signatur + 4, 4).SequenceEqual("IHDR"u8))
        {
            return null;
        }

        var breite = BinaryPrimitives.ReadInt32BigEndian(daten[(signatur + 8)..]);
        var hoehe = BinaryPrimitives.ReadInt32BigEndian(daten[(signatur + 12)..]);
        if (breite < 0 || hoehe < 0)
        {
            return null;
        }

        var animiert = false;
        long pos = signatur + 8 + 13 + 4;
        while (pos + 8 <= daten.Length)
        {
            var chunkLaenge = BinaryPrimitives.ReadUInt32BigEndian(daten[(int)pos..]);
            var typ = daten.Slice((int)pos + 4, 4);
            if (typ.SequenceEqual("acTL"u8))
            {
                animiert = true;
                break;
            }

            if (typ.SequenceEqual("IDAT"u8) || typ.SequenceEqual("IEND"u8))
            {
                break;
            }

            pos += 12L + chunkLaenge;
        }

        return new Kopf(breite, hoehe, animiert);
    }

    /// <summary>JPEG: Segmente bis zum ersten <c>SOFn</c> durchlaufen; <c>SOS</c> oder Dateiende vorher = beschädigt.</summary>
    private static Kopf? JpegKopf(ReadOnlySpan<byte> daten)
    {
        var pos = 2;
        while (true)
        {
            if (pos >= daten.Length || daten[pos] != 0xFF)
            {
                return null;
            }

            // Füllbytes 0xFF vor dem Marker überspringen.
            while (pos < daten.Length && daten[pos] == 0xFF)
            {
                pos++;
            }

            if (pos >= daten.Length)
            {
                return null;
            }

            var marker = daten[pos];
            pos++;

            // Marker ohne Länge: TEM und RSTn.
            if (marker is 0x01 or (>= 0xD0 and <= 0xD7))
            {
                continue;
            }

            // SOI erneut, EOI, SOS oder ein unzulässiger Marker vor SOF: Kopf unvollständig.
            if (marker is 0xD8 or 0xD9 or 0xDA or 0x00)
            {
                return null;
            }

            if (pos + 2 > daten.Length)
            {
                return null;
            }

            var laenge = BinaryPrimitives.ReadUInt16BigEndian(daten[pos..]);
            if (laenge < 2 || pos + laenge > daten.Length)
            {
                return null;
            }

            if (marker is >= 0xC0 and <= 0xCF and not 0xC4 and not 0xC8 and not 0xCC)
            {
                if (laenge < 8)
                {
                    return null;
                }

                var hoehe = BinaryPrimitives.ReadUInt16BigEndian(daten[(pos + 3)..]);
                var breite = BinaryPrimitives.ReadUInt16BigEndian(daten[(pos + 5)..]);
                return new Kopf(breite, hoehe, false);
            }

            pos += laenge;
        }
    }

    /// <summary>WebP: der erste Chunk nach dem RIFF-Kopf bestimmt Maße und Animation.</summary>
    private static Kopf? WebpKopf(ReadOnlySpan<byte> daten)
    {
        const int chunkStart = 12;
        const int datenStart = chunkStart + 8;
        if (daten.Length < datenStart)
        {
            return null;
        }

        var kennung = daten.Slice(chunkStart, 4);
        var groesse = BinaryPrimitives.ReadUInt32LittleEndian(daten[(chunkStart + 4)..]);
        var inhalt = daten[datenStart..];

        if (kennung.SequenceEqual("VP8 "u8))
        {
            if (groesse < 10 || inhalt.Length < 10 || (inhalt[0] & 0x01) != 0
                || inhalt[3] != 0x9D || inhalt[4] != 0x01 || inhalt[5] != 0x2A)
            {
                return null;
            }

            var breite = BinaryPrimitives.ReadUInt16LittleEndian(inhalt[6..]) & 0x3FFF;
            var hoehe = BinaryPrimitives.ReadUInt16LittleEndian(inhalt[8..]) & 0x3FFF;
            return new Kopf(breite, hoehe, false);
        }

        if (kennung.SequenceEqual("VP8L"u8))
        {
            if (groesse < 5 || inhalt.Length < 5 || inhalt[0] != 0x2F)
            {
                return null;
            }

            var bits = BinaryPrimitives.ReadUInt32LittleEndian(inhalt[1..]);
            return new Kopf((int)(bits & 0x3FFF) + 1, (int)((bits >> 14) & 0x3FFF) + 1, false);
        }

        if (kennung.SequenceEqual("VP8X"u8))
        {
            if (groesse < 10 || inhalt.Length < 10)
            {
                return null;
            }

            var animiert = (inhalt[0] & 0x02) != 0;
            var breite = (inhalt[4] | (inhalt[5] << 8) | (inhalt[6] << 16)) + 1;
            var hoehe = (inhalt[7] | (inhalt[8] << 8) | (inhalt[9] << 16)) + 1;
            return new Kopf(breite, hoehe, animiert);
        }

        return null;
    }
}
