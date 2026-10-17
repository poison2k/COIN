namespace Coin.UnitTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-1 (ADR-0027 Punkt 1 und 2): <c>CoinKennung</c> formatiert eine laufende Nummer als
/// <c>C</c> und mindestens 4 Ziffern mit führenden Nullen, ab 10.000 ungekürzt; das Muster ist <c>^C[0-9]{4,}$</c>.
/// </summary>
public class CoinKennungTests
{
    [Theory]
    [InlineData(1, "C0001")]
    [InlineData(42, "C0042")]
    [InlineData(999, "C0999")]
    [InlineData(9999, "C9999")]
    [InlineData(10000, "C10000")]
    [InlineData(123456, "C123456")]
    public void Formatierung_der_laufenden_Nummer(long nummer, string erwartet)
    {
        Assert.Equal(erwartet, ZertifikatDomain.KennungFormatieren(nummer));
    }

    [Theory]
    [InlineData("C0001")]
    [InlineData("C0042")]
    [InlineData("C9999")]
    [InlineData("C10000")]
    public void Muster_akzeptiert_gueltige_Kennungen(string kennung)
    {
        Assert.True(ZertifikatDomain.KennungGueltig(kennung));
    }

    [Theory]
    [InlineData("C001")]
    [InlineData("c0001")]
    [InlineData("X0001")]
    [InlineData("C0001 ")]
    [InlineData(" C0001")]
    [InlineData("C00A1")]
    [InlineData("C")]
    [InlineData("")]
    [InlineData("C0001\n")]
    [InlineData("C٠٠٠١")]
    public void Muster_lehnt_ungueltige_Kennungen_ab(string kennung)
    {
        Assert.False(ZertifikatDomain.KennungGueltig(kennung));
    }

    [Fact]
    public void Muster_lehnt_null_ab()
    {
        Assert.False(ZertifikatDomain.KennungGueltig(null));
    }

    [Fact]
    public void Formatierte_Kennungen_erfuellen_das_Muster()
    {
        Assert.All(new long[] { 1, 9999, 10000, 1_000_000 }, n => Assert.True(ZertifikatDomain.KennungGueltig(ZertifikatDomain.KennungFormatieren(n))));
    }
}
