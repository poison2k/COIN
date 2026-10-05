using System.Text;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>
/// Synthetische Testbilder: gültige Signatur (Magic Bytes) plus Füllbytes.
/// Der Server decodiert Bilder nicht, daher genügt die Signatur.
/// </summary>
internal static class Testbilder
{
    public static readonly byte[] JpegSignatur = [0xFF, 0xD8, 0xFF];
    public static readonly byte[] PngSignatur = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    public static byte[] Jpeg(int laenge = 64) => MitSignatur([0xFF, 0xD8, 0xFF, 0xE0], laenge);

    public static byte[] Png(int laenge = 64) => MitSignatur(PngSignatur, laenge);

    public static byte[] Webp(int laenge = 64)
    {
        byte[] kopf = [.. "RIFF"u8, 0x00, 0x00, 0x00, 0x00, .. "WEBP"u8, .. "VP8 "u8];
        return MitSignatur(kopf, laenge);
    }

    public static byte[] Gif(int laenge = 64) => MitSignatur("GIF89a"u8.ToArray(), laenge);

    public static byte[] Bmp(int laenge = 64) => MitSignatur("BM"u8.ToArray(), laenge);

    public static byte[] Heic(int laenge = 64) =>
        MitSignatur([0x00, 0x00, 0x00, 0x18, .. "ftypheic"u8], laenge);

    public static byte[] Svg() =>
        Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");

    public static byte[] Text() => Encoding.UTF8.GetBytes("Dies ist kein Bild, sondern nur Text.");

    public static byte[] RiffOhneWebp(int laenge = 64)
    {
        byte[] kopf = [.. "RIFF"u8, 0x00, 0x00, 0x00, 0x00, .. "WAVE"u8];
        return MitSignatur(kopf, laenge);
    }

    private static byte[] MitSignatur(byte[] signatur, int laenge)
    {
        var daten = new byte[Math.Max(laenge, signatur.Length)];
        signatur.CopyTo(daten, 0);
        for (var i = signatur.Length; i < daten.Length; i++)
        {
            daten[i] = (byte)(i % 251);
        }

        return daten;
    }
}
