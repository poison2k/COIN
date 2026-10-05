namespace Coin.Domain.Katalog;

/// <summary>Erkennt das Bildformat ausschließlich anhand der Magic Bytes (AK-10).</summary>
public static class BildFormatErkennung
{
    /// <summary>Anzahl Bytes, die für die Erkennung höchstens benötigt werden.</summary>
    public const int BenoetigteBytes = 12;

    private static ReadOnlySpan<byte> JpegSignatur => [0xFF, 0xD8, 0xFF];

    private static ReadOnlySpan<byte> PngSignatur => [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    private static ReadOnlySpan<byte> Riff => "RIFF"u8;

    private static ReadOnlySpan<byte> Webp => "WEBP"u8;

    public static BildFormat? Erkennen(ReadOnlySpan<byte> daten)
    {
        if (daten.StartsWith(JpegSignatur))
        {
            return BildFormat.Jpeg;
        }

        if (daten.StartsWith(PngSignatur))
        {
            return BildFormat.Png;
        }

        if (daten.Length >= BenoetigteBytes && daten.StartsWith(Riff) && daten.Slice(8, 4).SequenceEqual(Webp))
        {
            return BildFormat.Webp;
        }

        return null;
    }
}
