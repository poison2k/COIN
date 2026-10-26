using System.Diagnostics;
using Coin.Testdaten;

namespace Coin.UnitTests.Startseite;

/// <summary>
/// Feature startseite, AK-11 und Abschnitt 5.5 (ADR-0031 Punkt 2): Logoprüfung am Inhalt ohne Dekodieren – Format über
/// Magic Bytes, Maße aus dem Kopf (PNG <c>IHDR</c>, JPEG <c>SOFn</c> vor <c>SOS</c>, WebP <c>VP8 </c>/<c>VP8L</c>/<c>VP8X</c>),
/// Animation und Pixelgrenze 2048 × 2048. Je Datei genau eine Meldung, in der Prüfreihenfolge aus 5.5.
/// </summary>
public class LogoPruefungTests
{
    private const string Leer = "Die Datei ist leer.";
    private const string SvgVerboten = "SVG-Dateien sind nicht erlaubt. Bitte das Logo als PNG, JPEG oder WebP hochladen.";
    private const string KeinBild = "Die Datei ist kein Bild im Format PNG, JPEG oder WebP.";
    private const string Beschaedigt = "Die Bilddatei ist beschädigt oder unvollständig.";
    private const string Animiert = "Animierte Bilder sind nicht erlaubt.";

    private static string ZuGross(int breite, int hoehe) =>
        $"Das Logo ist {breite} × {hoehe} Pixel groß; erlaubt sind höchstens 2048 × 2048 Pixel.";

    // ---------- gültige Bilder: Format und Maße ----------

    [Fact]
    public void Png_ist_gueltig_mit_Format_Png()
    {
        var ergebnis = StartseiteDomain.LogoPruefen(LogoBilder.Png(400, 480));

        Assert.Null(ergebnis.Meldung);
        Assert.Equal("Png", ergebnis.Format);
    }

    [Fact]
    public void Png_liefert_Breite_und_Hoehe_aus_IHDR()
    {
        var ergebnis = StartseiteDomain.LogoPruefen(LogoBilder.Png(400, 480));

        Assert.Equal((400, 480), (ergebnis.Breite, ergebnis.Hoehe));
    }

    [Fact]
    public void Baseline_Jpeg_liefert_Format_und_Maße_aus_SOF0()
    {
        var ergebnis = StartseiteDomain.LogoPruefen(LogoBilder.Jpeg(640, 320));

        Assert.Equal((null, "Jpeg", 640, 320), (ergebnis.Meldung, ergebnis.Format, ergebnis.Breite, ergebnis.Hoehe));
    }

    [Fact]
    public void Progressives_Jpeg_liefert_Maße_aus_SOF2()
    {
        var ergebnis = StartseiteDomain.LogoPruefen(LogoBilder.JpegProgressiv(321, 123));

        Assert.Equal((null, 321, 123), (ergebnis.Meldung, ergebnis.Breite, ergebnis.Hoehe));
    }

    [Fact]
    public void Jpeg_mit_mehreren_APP_Segmenten_vor_SOF_ist_gueltig()
    {
        var ergebnis = StartseiteDomain.LogoPruefen(LogoBilder.JpegMitAppSegmenten(200, 100, anzahl: 5));

        Assert.Equal((null, 200, 100), (ergebnis.Meldung, ergebnis.Breite, ergebnis.Hoehe));
    }

    [Fact]
    public void WebP_VP8_liefert_Format_und_Maße()
    {
        var ergebnis = StartseiteDomain.LogoPruefen(LogoBilder.WebpVp8(300, 150));

        Assert.Equal((null, "Webp", 300, 150), (ergebnis.Meldung, ergebnis.Format, ergebnis.Breite, ergebnis.Hoehe));
    }

    [Fact]
    public void WebP_VP8L_liefert_Maße()
    {
        var ergebnis = StartseiteDomain.LogoPruefen(LogoBilder.WebpVp8L(257, 33));

        Assert.Equal((null, 257, 33), (ergebnis.Meldung, ergebnis.Breite, ergebnis.Hoehe));
    }

    [Fact]
    public void WebP_VP8X_ohne_Animation_liefert_die_Leinwandgröße()
    {
        var ergebnis = StartseiteDomain.LogoPruefen(LogoBilder.WebpVp8X(1000, 500));

        Assert.Equal((null, 1000, 500), (ergebnis.Meldung, ergebnis.Breite, ergebnis.Hoehe));
    }

    [Fact]
    public void Png_mit_Metadaten_ist_gueltig()
    {
        // S5: Metadaten bleiben erhalten und sind kein Ablehnungsgrund.
        Assert.Null(StartseiteDomain.LogoPruefen(LogoBilder.PngMitMetadaten(10, 10, "Kamera Test")).Meldung);
    }

    [Fact]
    public void Png_mit_angehaengtem_HTML_ist_gueltig_weil_nur_der_Kopf_geprueft_wird()
    {
        // ADR-0031 Punkt 3/4: kein Dekodieren; der Rest ist durch nosniff und CSP unschädlich.
        Assert.Null(StartseiteDomain.LogoPruefen(LogoBilder.PngMitHtmlAnhang(10, 10)).Meldung);
    }

    // ---------- Pixelgrenze ----------

    [Theory]
    [InlineData(2048, 2048)]
    [InlineData(1, 1)]
    [InlineData(2048, 1)]
    public void Png_bis_2048_mal_2048_ist_gueltig(int breite, int hoehe)
    {
        Assert.Null(StartseiteDomain.LogoPruefen(LogoBilder.Png(breite, hoehe)).Meldung);
    }

    [Theory]
    [InlineData(2049, 10)]
    [InlineData(10, 2049)]
    [InlineData(4000, 3000)]
    public void Png_ueber_2048_Pixel_nennt_die_Maße(int breite, int hoehe)
    {
        Assert.Equal(ZuGross(breite, hoehe), StartseiteDomain.LogoPruefen(LogoBilder.Png(breite, hoehe)).Meldung);
    }

    [Fact]
    public void Jpeg_ueber_2048_Pixel_nennt_die_Maße()
    {
        Assert.Equal(ZuGross(2049, 2049), StartseiteDomain.LogoPruefen(LogoBilder.Jpeg(2049, 2049)).Meldung);
    }

    [Fact]
    public void WebP_VP8L_ueber_2048_Pixel_nennt_die_Maße()
    {
        Assert.Equal(ZuGross(2049, 10), StartseiteDomain.LogoPruefen(LogoBilder.WebpVp8L(2049, 10)).Meldung);
    }

    [Fact]
    public void WebP_VP8X_ueber_2048_Pixel_nennt_die_Maße()
    {
        Assert.Equal(ZuGross(5000, 20), StartseiteDomain.LogoPruefen(LogoBilder.WebpVp8X(5000, 20)).Meldung);
    }

    [Theory]
    [InlineData(0, 10)]
    [InlineData(10, 0)]
    public void Png_mit_Breite_oder_Hoehe_0_gilt_als_beschaedigt(int breite, int hoehe)
    {
        // AK-11 „Breite oder Höhe … 0“; ein Kopf mit 0 Pixeln ist widersprüchlich (Prüfschritt 3 „Kopf und Maße“).
        Assert.Equal(Beschaedigt, StartseiteDomain.LogoPruefen(LogoBilder.Png(breite, hoehe)).Meldung);
    }

    [Fact]
    public void Jpeg_mit_Hoehe_0_gilt_als_beschaedigt()
    {
        Assert.Equal(Beschaedigt, StartseiteDomain.LogoPruefen(LogoBilder.Jpeg(10, 0)).Meldung);
    }

    // ---------- Animation ----------

    [Fact]
    public void Apng_mit_acTL_vor_IDAT_wird_als_animiert_abgelehnt()
    {
        Assert.Equal(Animiert, StartseiteDomain.LogoPruefen(LogoBilder.Apng(10, 10)).Meldung);
    }

    [Fact]
    public void Animiertes_WebP_wird_als_animiert_abgelehnt()
    {
        Assert.Equal(Animiert, StartseiteDomain.LogoPruefen(LogoBilder.WebpVp8X(10, 10, animiert: true)).Meldung);
    }

    // ---------- beschädigte Köpfe ----------

    [Fact]
    public void Png_ohne_IHDR_als_ersten_Chunk_ist_beschaedigt()
    {
        Assert.Equal(Beschaedigt, StartseiteDomain.LogoPruefen(LogoBilder.PngOhneIhdrZuerst()).Meldung);
    }

    [Fact]
    public void Abgeschnittenes_PNG_ist_beschaedigt()
    {
        Assert.Equal(Beschaedigt, StartseiteDomain.LogoPruefen(LogoBilder.PngAbgeschnitten()).Meldung);
    }

    [Fact]
    public void Nur_die_PNG_Signatur_ist_beschaedigt()
    {
        Assert.Equal(Beschaedigt, StartseiteDomain.LogoPruefen(LogoBilder.NurPngSignatur()).Meldung);
    }

    [Fact]
    public void Jpeg_mit_SOS_vor_SOF_ist_beschaedigt()
    {
        Assert.Equal(Beschaedigt, StartseiteDomain.LogoPruefen(LogoBilder.JpegSosVorSof()).Meldung);
    }

    [Fact]
    public void Jpeg_ohne_SOF_ist_beschaedigt()
    {
        Assert.Equal(Beschaedigt, StartseiteDomain.LogoPruefen(LogoBilder.JpegOhneSof()).Meldung);
    }

    [Fact]
    public void Jpeg_mit_Segmentlaenge_ueber_das_Dateiende_ist_beschaedigt()
    {
        Assert.Equal(Beschaedigt, StartseiteDomain.LogoPruefen(LogoBilder.JpegSegmentlaengeUeberDateiende()).Meldung);
    }

    [Fact]
    public void Jpeg_das_im_SOF_endet_ist_beschaedigt()
    {
        Assert.Equal(Beschaedigt, StartseiteDomain.LogoPruefen(LogoBilder.JpegAbgeschnittenImSof()).Meldung);
    }

    [Fact]
    public void Nur_die_JPEG_Signatur_ist_beschaedigt()
    {
        Assert.Equal(Beschaedigt, StartseiteDomain.LogoPruefen(LogoBilder.NurJpegSignatur()).Meldung);
    }

    [Fact]
    public void Abgeschnittenes_WebP_ist_beschaedigt()
    {
        Assert.Equal(Beschaedigt, StartseiteDomain.LogoPruefen(LogoBilder.WebpAbgeschnitten()).Meldung);
    }

    // ---------- leer, SVG, keine Bilder ----------

    [Fact]
    public void Leere_Datei_wird_als_leer_abgelehnt()
    {
        Assert.Equal(Leer, StartseiteDomain.LogoPruefen([]).Meldung);
    }

    public static TheoryData<string> SvgVarianten => new() { "einfach", "BOM", "XML-Deklaration", "Grossschreibung", "Leerraum" };

    [Theory]
    [MemberData(nameof(SvgVarianten))]
    public void Svg_wird_mit_eigener_Meldung_abgelehnt(string variante)
    {
        var daten = variante switch
        {
            "BOM" => LogoBilder.SvgMitBom(),
            "XML-Deklaration" => LogoBilder.SvgMitXmlDeklaration(),
            "Grossschreibung" => LogoBilder.SvgGrossgeschrieben(),
            "Leerraum" => LogoBilder.SvgMitLeerraum(),
            _ => LogoBilder.Svg(),
        };

        Assert.Equal(SvgVerboten, StartseiteDomain.LogoPruefen(daten).Meldung);
    }

    [Fact]
    public void Xml_mit_svg_erst_nach_4_KiB_gilt_als_kein_Bild()
    {
        // Regel 5.5: Gesucht wird nur in den ersten 4 KiB.
        Assert.Equal(KeinBild, StartseiteDomain.LogoPruefen(LogoBilder.SvgErstNach4KiB()).Meldung);
    }

    public static TheoryData<string> KeineBilder => new() { "Text", "PDF", "HTML", "ZIP", "GIF", "BMP", "ICO", "SVGZ" };

    [Theory]
    [MemberData(nameof(KeineBilder))]
    public void Nicht_Bilddatei_wird_als_kein_Bild_abgelehnt(string art)
    {
        var daten = art switch
        {
            "PDF" => LogoBilder.Pdf(),
            "HTML" => LogoBilder.Html(),
            "ZIP" => LogoBilder.Zip(),
            "GIF" => LogoBilder.Gif(),
            "BMP" => LogoBilder.Bmp(),
            "ICO" => LogoBilder.Ico(),
            "SVGZ" => LogoBilder.Svgz(),
            _ => LogoBilder.Text(),
        };

        Assert.Equal(KeinBild, StartseiteDomain.LogoPruefen(daten).Meldung);
    }

    // ---------- Prüfreihenfolge (5.5) ----------

    [Fact]
    public void Animation_wird_vor_der_Pixelgrenze_gemeldet()
    {
        Assert.Equal(Animiert, StartseiteDomain.LogoPruefen(LogoBilder.Apng(4000, 4000)).Meldung);
    }

    [Fact]
    public void Animiertes_WebP_ueber_der_Pixelgrenze_meldet_die_Animation()
    {
        Assert.Equal(Animiert, StartseiteDomain.LogoPruefen(LogoBilder.WebpVp8X(3000, 3000, animiert: true)).Meldung);
    }

    // ---------- Laufzeit ----------

    [Fact]
    public void Jpeg_von_2_MiB_aus_vielen_Segmenten_wird_in_linearer_Zeit_geprueft()
    {
        var daten = LogoBilder.JpegMitVielenSegmenten(100, 50, 2 * 1024 * 1024);
        StartseiteDomain.LogoPruefen(LogoBilder.Jpeg(10, 10)); // Aufwärmen (Reflexion, JIT)

        var uhr = Stopwatch.StartNew();
        var ergebnis = StartseiteDomain.LogoPruefen(daten);
        uhr.Stop();

        Assert.Equal((null, 100, 50), (ergebnis.Meldung, ergebnis.Breite, ergebnis.Hoehe));
        Assert.True(uhr.Elapsed < TimeSpan.FromSeconds(1), $"Dauer {uhr.Elapsed.TotalMilliseconds:F0} ms");
    }
}
