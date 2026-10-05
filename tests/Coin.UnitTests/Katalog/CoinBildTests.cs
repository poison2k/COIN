using System.Security.Cryptography;
using Coin.Domain.Katalog;

namespace Coin.UnitTests.Katalog;

/// <summary>AK-9 bis AK-11: Fabrikmethode <see cref="CoinBild.Erstellen"/> und <see cref="CoinTyp.BildSetzen"/>.</summary>
public class CoinBildTests
{
    private static readonly DateTimeOffset Jetzt = new(2026, 10, 5, 10, 0, 0, TimeSpan.Zero);

    private static CoinBild ErstelleGueltig(byte[] inhalt)
    {
        var ergebnis = CoinBild.Erstellen(inhalt, Jetzt);
        Assert.True(ergebnis.IstErfolgreich, $"Erwartet: gültiges Bild. Fehler: {ergebnis.Fehler}");
        Assert.NotNull(ergebnis.Bild);
        return ergebnis.Bild!;
    }

    // ---------- AK-10: Formate ----------

    [Fact]
    public void Erstellen_mit_JPEG_ist_erfolgreich_und_erkennt_Jpeg()
    {
        var bild = ErstelleGueltig(Testbilder.Jpeg());

        Assert.Equal(BildFormat.Jpeg, bild.Format);
    }

    [Fact]
    public void Erstellen_mit_PNG_ist_erfolgreich_und_erkennt_Png()
    {
        var bild = ErstelleGueltig(Testbilder.Png());

        Assert.Equal(BildFormat.Png, bild.Format);
    }

    [Fact]
    public void Erstellen_mit_WebP_ist_erfolgreich_und_erkennt_Webp()
    {
        var bild = ErstelleGueltig(Testbilder.Webp());

        Assert.Equal(BildFormat.Webp, bild.Format);
    }

    public static TheoryData<string, byte[]> UnzulaessigeFormate => new()
    {
        { "GIF", Testbilder.Gif() },
        { "SVG", Testbilder.Svg() },
        { "BMP", Testbilder.Bmp() },
        { "HEIC", Testbilder.Heic() },
        { "Text", Testbilder.Text() },
        { "RIFF ohne WEBP", Testbilder.RiffOhneWebp() },
    };

    [Theory]
    [MemberData(nameof(UnzulaessigeFormate))]
    public void Erstellen_mit_unzulaessigem_Format_meldet_FormatNichtUnterstuetzt(string art, byte[] inhalt)
    {
        _ = art;
        var ergebnis = CoinBild.Erstellen(inhalt, Jetzt);

        Assert.False(ergebnis.IstErfolgreich);
        Assert.Null(ergebnis.Bild);
        Assert.Equal(CoinBildFehler.FormatNichtUnterstuetzt, ergebnis.Fehler);
    }

    // ---------- AK-11: Größe ----------

    [Fact]
    public void Erstellen_mit_leerem_Inhalt_meldet_Leer()
    {
        var ergebnis = CoinBild.Erstellen([], Jetzt);

        Assert.False(ergebnis.IstErfolgreich);
        Assert.Null(ergebnis.Bild);
        Assert.Equal(CoinBildFehler.Leer, ergebnis.Fehler);
    }

    [Fact]
    public void Erstellen_mit_genau_5_MiB_ist_erfolgreich()
    {
        var bild = ErstelleGueltig(Testbilder.Jpeg(5_242_880));

        Assert.Equal(5_242_880, bild.Inhalt.Length);
    }

    [Fact]
    public void Erstellen_mit_5_MiB_plus_ein_Byte_meldet_ZuGross()
    {
        var ergebnis = CoinBild.Erstellen(Testbilder.Jpeg(5_242_881), Jetzt);

        Assert.False(ergebnis.IstErfolgreich);
        Assert.Null(ergebnis.Bild);
        Assert.Equal(CoinBildFehler.ZuGross, ergebnis.Fehler);
    }

    [Fact]
    public void Erfolgreiches_Ergebnis_hat_keinen_Fehler()
    {
        var ergebnis = CoinBild.Erstellen(Testbilder.Png(), Jetzt);

        Assert.Null(ergebnis.Fehler);
    }

    [Fact]
    public void Maximale_Groesse_ist_als_Konstante_veroeffentlicht()
    {
        Assert.Equal(5_242_880, CoinBild.MaxGroesseBytes);
    }

    // ---------- Inhalt, Hash, Zeitpunkt ----------

    [Fact]
    public void Erstellen_uebernimmt_den_Inhalt_unveraendert()
    {
        var inhalt = Testbilder.Png(300);

        var bild = ErstelleGueltig(inhalt);

        Assert.Equal(inhalt, bild.Inhalt);
    }

    [Fact]
    public void Erstellen_berechnet_SHA256_als_64_Zeichen_Hex_in_Kleinbuchstaben()
    {
        var inhalt = Testbilder.Webp(1000);
        var erwartet = Convert.ToHexStringLower(SHA256.HashData(inhalt));

        var bild = ErstelleGueltig(inhalt);

        Assert.Equal(erwartet, bild.Sha256);
        Assert.Equal(64, bild.Sha256.Length);
    }

    [Fact]
    public void Erstellen_setzt_HochgeladenAm_auf_den_uebergebenen_Zeitpunkt_in_UTC()
    {
        var lokal = new DateTimeOffset(2026, 10, 5, 12, 0, 0, TimeSpan.FromHours(2));

        var bild = CoinBild.Erstellen(Testbilder.Jpeg(), lokal).Bild!;

        Assert.Equal(TimeSpan.Zero, bild.HochgeladenAm.Offset);
        Assert.Equal(lokal.UtcDateTime, bild.HochgeladenAm.UtcDateTime);
    }

    // ---------- AK-9: höchstens ein Bild, Ersetzen ----------

    [Fact]
    public void BildSetzen_setzt_das_Bild_eines_Coins_ohne_Bild()
    {
        var coin = CoinTyp.Erstellen("Coin Alpha", "Herausgeber Beta", null, null, Jetzt).Wert!;
        var bild = ErstelleGueltig(Testbilder.Png());

        coin.BildSetzen(bild);

        Assert.Same(bild, coin.Bild);
    }

    [Fact]
    public void BildSetzen_ersetzt_ein_vorhandenes_Bild()
    {
        var coin = CoinTyp.Erstellen("Coin Alpha", "Herausgeber Beta", null, null, Jetzt).Wert!;
        coin.BildSetzen(ErstelleGueltig(Testbilder.Png()));
        var neuesBild = ErstelleGueltig(Testbilder.Jpeg());

        coin.BildSetzen(neuesBild);

        Assert.Same(neuesBild, coin.Bild);
    }
}
