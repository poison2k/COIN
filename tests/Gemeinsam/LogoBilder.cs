using System.Buffers.Binary;
using System.Text;

namespace Coin.Testdaten;

/// <summary>
/// Synthetische Logo-Dateien für die Startseite (Feature startseite, Abschnitt 9.1/9.2, ADR-0031). Die Köpfe sind so
/// aufgebaut, wie die Formate es verlangen (PNG mit CRC, JPEG-Segmente, RIFF/WebP-Chunks); der Bildinhalt ist Füllmaterial,
/// weil der Server nicht dekodiert. Von Unit- und Integrationstests gemeinsam genutzt (als verlinkte Datei).
/// </summary>
internal static class LogoBilder
{
    public static readonly byte[] PngSignatur = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    // ---------- PNG ----------

    /// <summary>Gültiges PNG mit <c>IHDR</c> als erstem Chunk, einem <c>IDAT</c> und <c>IEND</c>.</summary>
    public static byte[] Png(int breite, int hoehe, int fuellBytes = 64) =>
        PngAus(Chunk("IHDR", Ihdr(breite, hoehe)), Chunk("IDAT", Fuell(fuellBytes)), Chunk("IEND", []));

    /// <summary>PNG mit Metadaten-Chunk (<c>tEXt</c>) hinter <c>IHDR</c>; Metadaten bleiben erhalten (S5).</summary>
    public static byte[] PngMitMetadaten(int breite, int hoehe, string text) =>
        PngAus(
            Chunk("IHDR", Ihdr(breite, hoehe)),
            Chunk("tEXt", Encoding.Latin1.GetBytes($"Comment\0{text}")),
            Chunk("IDAT", Fuell(32)),
            Chunk("IEND", []));

    /// <summary>APNG: <c>acTL</c> vor dem ersten <c>IDAT</c> (animiert, ADR-0031 Punkt 2).</summary>
    public static byte[] Apng(int breite, int hoehe) =>
        PngAus(
            Chunk("IHDR", Ihdr(breite, hoehe)),
            Chunk("acTL", [0, 0, 0, 2, 0, 0, 0, 0]),
            Chunk("IDAT", Fuell(32)),
            Chunk("IEND", []));

    /// <summary>PNG, dessen erster Chunk nicht <c>IHDR</c> ist (Kopf widersprüchlich).</summary>
    public static byte[] PngOhneIhdrZuerst(int breite = 10, int hoehe = 10) =>
        PngAus(
            Chunk("tEXt", Encoding.Latin1.GetBytes("Comment\0vorn")),
            Chunk("IHDR", Ihdr(breite, hoehe)),
            Chunk("IDAT", Fuell(32)),
            Chunk("IEND", []));

    /// <summary>PNG-Signatur und nur die ersten Bytes von <c>IHDR</c> (abgeschnitten).</summary>
    public static byte[] PngAbgeschnitten() => [.. Png(10, 10).AsSpan(0, PngSignatur.Length + 12)];

    /// <summary>Nur die PNG-Signatur.</summary>
    public static byte[] NurPngSignatur() => [.. PngSignatur];

    // ---------- JPEG ----------

    /// <summary>Baseline-JPEG (<c>SOF0</c>) mit <c>APP0</c>, <c>DQT</c>, <c>SOS</c> und <c>EOI</c>.</summary>
    public static byte[] Jpeg(int breite, int hoehe) => JpegAus(0xC0, breite, hoehe, appSegmente: 1);

    /// <summary>Progressives JPEG (<c>SOF2</c>).</summary>
    public static byte[] JpegProgressiv(int breite, int hoehe) => JpegAus(0xC2, breite, hoehe, appSegmente: 1);

    /// <summary>JPEG mit mehreren <c>APP</c>-Segmenten (EXIF, XMP) vor <c>SOF</c>.</summary>
    public static byte[] JpegMitAppSegmenten(int breite, int hoehe, int anzahl) => JpegAus(0xC0, breite, hoehe, appSegmente: anzahl);

    /// <summary>
    /// JPEG mit sehr vielen minimalen <c>APP1</c>-Segmenten (je 4 Bytes) vor <c>SOF</c>, insgesamt etwa
    /// <paramref name="zielBytes"/> (lineare Laufzeit, Abschnitt 9.1).
    /// </summary>
    public static byte[] JpegMitVielenSegmenten(int breite, int hoehe, int zielBytes)
    {
        var puffer = new List<byte>(zielBytes + 64) { 0xFF, 0xD8 };
        while (puffer.Count < zielBytes - 64)
        {
            puffer.AddRange([0xFF, 0xE1, 0x00, 0x02]);
        }

        puffer.AddRange(Sof(0xC0, breite, hoehe));
        puffer.AddRange(Sos());
        puffer.AddRange([0xFF, 0xD9]);
        return [.. puffer];
    }

    /// <summary>JPEG, bei dem <c>SOS</c> vor jedem <c>SOF</c> steht (Kopf unvollständig).</summary>
    public static byte[] JpegSosVorSof(int breite = 10, int hoehe = 10) =>
        [0xFF, 0xD8, .. App0(), .. Sos(), .. Sof(0xC0, breite, hoehe), 0xFF, 0xD9];

    /// <summary>JPEG ohne <c>SOF</c>.</summary>
    public static byte[] JpegOhneSof() => [0xFF, 0xD8, .. App0(), .. Dqt(), .. Sos(), 0xFF, 0xD9];

    /// <summary>JPEG, dessen <c>APP1</c>-Segment eine Länge über das Dateiende hinaus angibt.</summary>
    public static byte[] JpegSegmentlaengeUeberDateiende() => [0xFF, 0xD8, 0xFF, 0xE1, 0xFF, 0xF0, .. Fuell(32)];

    /// <summary>JPEG, das mitten im <c>SOF</c>-Segment endet.</summary>
    public static byte[] JpegAbgeschnittenImSof()
    {
        byte[] voll = [0xFF, 0xD8, .. App0(), .. Sof(0xC0, 10, 10)];
        return voll[..^6];
    }

    /// <summary>Nur die drei Signaturbytes eines JPEG.</summary>
    public static byte[] NurJpegSignatur() => [0xFF, 0xD8, 0xFF];

    // ---------- WebP ----------

    /// <summary>Verlustbehaftetes WebP (<c>VP8 </c>) mit Keyframe-Kopf.</summary>
    public static byte[] WebpVp8(int breite, int hoehe)
    {
        var daten = new byte[10 + 32];
        daten[0] = 0x10; // Frame-Tag: Keyframe (Bit 0 = 0), Version 0, sichtbar
        daten[1] = 0x02;
        daten[2] = 0x00;
        daten[3] = 0x9D;
        daten[4] = 0x01;
        daten[5] = 0x2A;
        BinaryPrimitives.WriteUInt16LittleEndian(daten.AsSpan(6), (ushort)(breite & 0x3FFF));
        BinaryPrimitives.WriteUInt16LittleEndian(daten.AsSpan(8), (ushort)(hoehe & 0x3FFF));
        Fuell(32).CopyTo(daten, 10);
        return Riff(RiffChunk("VP8 ", daten));
    }

    /// <summary>Verlustfreies WebP (<c>VP8L</c>); Breite und Höhe je 1–16384.</summary>
    public static byte[] WebpVp8L(int breite, int hoehe)
    {
        var daten = new byte[5 + 32];
        daten[0] = 0x2F;
        var bits = (uint)((breite - 1) & 0x3FFF) | ((uint)((hoehe - 1) & 0x3FFF) << 14);
        BinaryPrimitives.WriteUInt32LittleEndian(daten.AsSpan(1), bits);
        Fuell(32).CopyTo(daten, 5);
        return Riff(RiffChunk("VP8L", daten));
    }

    /// <summary>Erweitertes WebP (<c>VP8X</c>) mit Leinwandgröße; ohne Animation folgt ein <c>VP8L</c>-Bild.</summary>
    public static byte[] WebpVp8X(int breite, int hoehe, bool animiert = false)
    {
        var vp8x = new byte[10];
        vp8x[0] = animiert ? (byte)0x02 : (byte)0x00;
        SchreibeUInt24(vp8x.AsSpan(4), breite - 1);
        SchreibeUInt24(vp8x.AsSpan(7), hoehe - 1);
        if (!animiert)
        {
            var bild = WebpVp8L(Math.Min(breite, 16384), Math.Min(hoehe, 16384))[12..];
            return Riff([.. RiffChunk("VP8X", vp8x), .. bild]);
        }

        byte[] anim = [0, 0, 0, 0, 0, 0];
        var anmf = new byte[16 + 8];
        SchreibeUInt24(anmf.AsSpan(6), breite - 1);
        SchreibeUInt24(anmf.AsSpan(9), hoehe - 1);
        return Riff([.. RiffChunk("VP8X", vp8x), .. RiffChunk("ANIM", anim), .. RiffChunk("ANMF", anmf), .. RiffChunk("ANMF", anmf)]);
    }

    /// <summary>WebP, das nach der Chunk-Kennung <c>VP8 </c> endet (abgeschnitten).</summary>
    public static byte[] WebpAbgeschnitten() => [.. WebpVp8(10, 10).AsSpan(0, 20)];

    // ---------- Keine Bilder ----------

    public static byte[] Svg() =>
        Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"><script>alert(1)</script></svg>");

    public static byte[] SvgMitBom() => [0xEF, 0xBB, 0xBF, .. Svg()];

    public static byte[] SvgMitXmlDeklaration() =>
        Encoding.UTF8.GetBytes("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!-- Logo -->\n<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");

    public static byte[] SvgGrossgeschrieben() => Encoding.UTF8.GetBytes("<SVG XMLNS=\"http://www.w3.org/2000/svg\"></SVG>");

    public static byte[] SvgMitLeerraum() => Encoding.UTF8.GetBytes("  \r\n\t <svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");

    /// <summary>XML, das erst nach 4 KiB ein <c>&lt;svg</c> enthält (nach Regel 5.5 „kein Bild“).</summary>
    public static byte[] SvgErstNach4KiB() =>
        Encoding.UTF8.GetBytes($"<?xml version=\"1.0\"?><!--{new string('x', 4200)}--><svg></svg>");

    public static byte[] Html() =>
        Encoding.UTF8.GetBytes("<!DOCTYPE html><html><head><title>Kein Logo</title></head><body><p>Hallo</p></body></html>");

    public static byte[] Text() => Encoding.UTF8.GetBytes("Dies ist kein Bild, sondern nur Text.");

    public static byte[] Pdf() => Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n");

    public static byte[] Zip() => [0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, .. Fuell(40)];

    public static byte[] Gif() => [.. "GIF89a"u8, 0x0A, 0x00, 0x0A, 0x00, 0x00, 0x00, 0x00, .. Fuell(20)];

    public static byte[] Bmp() => [.. "BM"u8, .. Fuell(60)];

    public static byte[] Ico() => [0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10, .. Fuell(40)];

    /// <summary>Gzip-komprimiertes SVG (Magic Bytes <c>1F 8B</c>).</summary>
    public static byte[] Svgz() => [0x1F, 0x8B, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, .. Fuell(40)];

    /// <summary>Gültiges PNG mit angehängtem HTML (Polyglot, ADR-0031 Punkt 4).</summary>
    public static byte[] PngMitHtmlAnhang(int breite, int hoehe) =>
        [.. Png(breite, hoehe), .. Encoding.UTF8.GetBytes("<html><script>alert(1)</script></html>")];

    /// <summary>Gültiges PNG, auf genau <paramref name="groesse"/> Bytes aufgefüllt (Füllung im <c>IDAT</c>).</summary>
    public static byte[] PngMitGroesse(int breite, int hoehe, int groesse)
    {
        var ohneFuellung = Png(breite, hoehe, 0).Length;
        return Png(breite, hoehe, groesse - ohneFuellung);
    }

    // ---------- Bausteine ----------

    private static byte[] PngAus(params byte[][] chunks) => [.. PngSignatur, .. chunks.SelectMany(c => c)];

    private static byte[] Ihdr(int breite, int hoehe)
    {
        var daten = new byte[13];
        BinaryPrimitives.WriteInt32BigEndian(daten.AsSpan(0), breite);
        BinaryPrimitives.WriteInt32BigEndian(daten.AsSpan(4), hoehe);
        daten[8] = 8; // Bittiefe
        daten[9] = 6; // RGBA
        return daten;
    }

    private static byte[] Chunk(string typ, byte[] daten)
    {
        var typBytes = Encoding.ASCII.GetBytes(typ);
        var ergebnis = new byte[12 + daten.Length];
        BinaryPrimitives.WriteInt32BigEndian(ergebnis.AsSpan(0), daten.Length);
        typBytes.CopyTo(ergebnis, 4);
        daten.CopyTo(ergebnis, 8);
        BinaryPrimitives.WriteUInt32BigEndian(ergebnis.AsSpan(8 + daten.Length), Crc32([.. typBytes, .. daten]));
        return ergebnis;
    }

    private static byte[] JpegAus(byte sof, int breite, int hoehe, int appSegmente)
    {
        var puffer = new List<byte> { 0xFF, 0xD8 };
        puffer.AddRange(App0());
        for (var i = 1; i < appSegmente; i++)
        {
            // APP1 (z. B. EXIF/XMP) mit etwas Inhalt.
            byte[] inhalt = [.. "Exif\0\0"u8, .. Fuell(16)];
            puffer.AddRange([0xFF, 0xE1, (byte)((inhalt.Length + 2) >> 8), (byte)(inhalt.Length + 2)]);
            puffer.AddRange(inhalt);
        }

        puffer.AddRange(Dqt());
        puffer.AddRange(Sof(sof, breite, hoehe));
        puffer.AddRange(Sos());
        puffer.AddRange(Fuell(32));
        puffer.AddRange([0xFF, 0xD9]);
        return [.. puffer];
    }

    private static byte[] App0() => [0xFF, 0xE0, 0x00, 0x10, .. "JFIF\0"u8, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];

    private static byte[] Dqt() => [0xFF, 0xDB, 0x00, 0x43, 0x00, .. Enumerable.Repeat((byte)1, 64)];

    private static byte[] Sof(byte marker, int breite, int hoehe) =>
    [
        0xFF, marker, 0x00, 0x11, 0x08,
        (byte)(hoehe >> 8), (byte)hoehe, (byte)(breite >> 8), (byte)breite,
        0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ];

    private static byte[] Sos() => [0xFF, 0xDA, 0x00, 0x0C, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00];

    private static byte[] Riff(byte[] chunks)
    {
        var ergebnis = new byte[12 + chunks.Length];
        "RIFF"u8.CopyTo(ergebnis);
        BinaryPrimitives.WriteUInt32LittleEndian(ergebnis.AsSpan(4), (uint)(4 + chunks.Length));
        "WEBP"u8.CopyTo(ergebnis.AsSpan(8));
        chunks.CopyTo(ergebnis, 12);
        return ergebnis;
    }

    private static byte[] RiffChunk(string kennung, byte[] daten)
    {
        var aufgefuellt = daten.Length % 2 == 1 ? [.. daten, 0] : daten;
        var ergebnis = new byte[8 + aufgefuellt.Length];
        Encoding.ASCII.GetBytes(kennung).CopyTo(ergebnis, 0);
        BinaryPrimitives.WriteUInt32LittleEndian(ergebnis.AsSpan(4), (uint)daten.Length);
        aufgefuellt.CopyTo(ergebnis, 8);
        return ergebnis;
    }

    private static void SchreibeUInt24(Span<byte> ziel, int wert)
    {
        ziel[0] = (byte)wert;
        ziel[1] = (byte)(wert >> 8);
        ziel[2] = (byte)(wert >> 16);
    }

    private static byte[] Fuell(int laenge)
    {
        var daten = new byte[Math.Max(0, laenge)];
        for (var i = 0; i < daten.Length; i++)
        {
            daten[i] = (byte)(i % 251);
        }

        return daten;
    }

    private static readonly uint[] CrcTabelle = Enumerable.Range(0, 256).Select(n =>
    {
        var c = (uint)n;
        for (var k = 0; k < 8; k++)
        {
            c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
        }

        return c;
    }).ToArray();

    private static uint Crc32(byte[] daten)
    {
        var crc = 0xFFFFFFFFu;
        foreach (var b in daten)
        {
            crc = CrcTabelle[(crc ^ b) & 0xFF] ^ (crc >> 8);
        }

        return crc ^ 0xFFFFFFFFu;
    }
}
