using Coin.Domain.Katalog;

namespace Coin.UnitTests.Katalog;

/// <summary>AK-10: Formaterkennung ausschließlich über Magic Bytes.</summary>
public class BildFormatErkennungTests
{
    [Fact]
    public void Erkennen_liefert_Jpeg_fuer_JPEG_Signatur()
    {
        Assert.Equal(BildFormat.Jpeg, BildFormatErkennung.Erkennen(Testbilder.Jpeg()));
    }

    [Fact]
    public void Erkennen_liefert_Jpeg_fuer_genau_die_drei_Signaturbytes()
    {
        Assert.Equal(BildFormat.Jpeg, BildFormatErkennung.Erkennen(Testbilder.JpegSignatur));
    }

    [Fact]
    public void Erkennen_liefert_Png_fuer_PNG_Signatur()
    {
        Assert.Equal(BildFormat.Png, BildFormatErkennung.Erkennen(Testbilder.Png()));
    }

    [Fact]
    public void Erkennen_liefert_Webp_fuer_RIFF_mit_WEBP_Kennung()
    {
        Assert.Equal(BildFormat.Webp, BildFormatErkennung.Erkennen(Testbilder.Webp()));
    }

    [Fact]
    public void Erkennen_liefert_Webp_fuer_genau_12_Bytes()
    {
        byte[] daten = [.. "RIFF"u8, 0x10, 0x00, 0x00, 0x00, .. "WEBP"u8];

        Assert.Equal(BildFormat.Webp, BildFormatErkennung.Erkennen(daten));
    }

    [Fact]
    public void Erkennen_liefert_null_fuer_GIF()
    {
        Assert.Null(BildFormatErkennung.Erkennen(Testbilder.Gif()));
    }

    [Fact]
    public void Erkennen_liefert_null_fuer_SVG_Text()
    {
        Assert.Null(BildFormatErkennung.Erkennen(Testbilder.Svg()));
    }

    [Fact]
    public void Erkennen_liefert_null_fuer_BMP()
    {
        Assert.Null(BildFormatErkennung.Erkennen(Testbilder.Bmp()));
    }

    [Fact]
    public void Erkennen_liefert_null_fuer_HEIC()
    {
        Assert.Null(BildFormatErkennung.Erkennen(Testbilder.Heic()));
    }

    [Fact]
    public void Erkennen_liefert_null_fuer_reinen_Text()
    {
        Assert.Null(BildFormatErkennung.Erkennen(Testbilder.Text()));
    }

    [Fact]
    public void Erkennen_liefert_null_fuer_RIFF_ohne_WEBP_Kennung()
    {
        Assert.Null(BildFormatErkennung.Erkennen(Testbilder.RiffOhneWebp()));
    }

    [Fact]
    public void Erkennen_liefert_null_fuer_leere_Daten()
    {
        Assert.Null(BildFormatErkennung.Erkennen(ReadOnlySpan<byte>.Empty));
    }

    [Fact]
    public void Erkennen_liefert_null_fuer_unvollstaendige_JPEG_Signatur()
    {
        Assert.Null(BildFormatErkennung.Erkennen(new byte[] { 0xFF, 0xD8 }));
    }

    [Fact]
    public void Erkennen_liefert_null_fuer_unvollstaendige_PNG_Signatur()
    {
        Assert.Null(BildFormatErkennung.Erkennen(Testbilder.PngSignatur.AsSpan(0, 7)));
    }

    [Fact]
    public void Erkennen_liefert_null_fuer_WebP_Kopf_mit_weniger_als_12_Bytes()
    {
        byte[] daten = [.. "RIFF"u8, 0x10, 0x00, 0x00, 0x00, .. "WEB"u8];

        Assert.Null(BildFormatErkennung.Erkennen(daten));
    }

    [Fact]
    public void Erkennen_liefert_null_wenn_JPEG_Signatur_nicht_am_Anfang_steht()
    {
        byte[] daten = [0x00, 0xFF, 0xD8, 0xFF, 0xE0, 0x00];

        Assert.Null(BildFormatErkennung.Erkennen(daten));
    }

    [Theory]
    [InlineData(BildFormat.Jpeg, "image/jpeg")]
    [InlineData(BildFormat.Png, "image/png")]
    [InlineData(BildFormat.Webp, "image/webp")]
    public void Format_liefert_passenden_Content_Type(BildFormat format, string contentType)
    {
        Assert.Equal(contentType, format.ContentType());
    }

    [Theory]
    [InlineData(BildFormat.Jpeg, "jpg")]
    [InlineData(BildFormat.Png, "png")]
    [InlineData(BildFormat.Webp, "webp")]
    public void Format_liefert_passende_Dateiendung_ohne_Punkt(BildFormat format, string endung)
    {
        Assert.Equal(endung, format.Dateiendung());
    }
}
