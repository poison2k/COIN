namespace Coin.UnitTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-3 und AK-5 (ADR-0027 Punkt 4 und 5, F2, F3): <c>Zertifikatsnummer.Bilden</c> setzt
/// Kennung und Exemplar mit mindestens 4 Ziffern zusammen; dasselbe Exemplar ergibt dieselbe Nummer.
/// </summary>
public class ZertifikatsnummerTests
{
    [Theory]
    [InlineData(1, "C0042-0001")]
    [InlineData(12, "C0042-0012")]
    [InlineData(9999, "C0042-9999")]
    [InlineData(10000, "C0042-10000")]
    [InlineData(12345, "C0042-12345")]
    [InlineData(1_000_000, "C0042-1000000")]
    public void Exemplar_hat_mindestens_vier_Ziffern_und_wird_ab_10000_nicht_gekuerzt(int exemplar, string erwartet)
    {
        Assert.Equal(erwartet, ZertifikatDomain.NummerBilden("C0042", exemplar));
    }

    [Fact]
    public void Kennung_ueber_9999_bleibt_ungekuerzt()
    {
        Assert.Equal("C10000-0007", ZertifikatDomain.NummerBilden("C10000", 7));
    }

    [Fact]
    public void Gleiches_Exemplar_ergibt_die_gleiche_Nummer()
    {
        Assert.Equal(ZertifikatDomain.NummerBilden("C0042", 12), ZertifikatDomain.NummerBilden("C0042", 12));
    }

    [Fact]
    public void Verschiedene_Exemplare_ergeben_verschiedene_Nummern()
    {
        Assert.NotEqual(ZertifikatDomain.NummerBilden("C0042", 12), ZertifikatDomain.NummerBilden("C0042", 13));
    }

    [Fact]
    public void Verschiedene_Coins_ergeben_fuer_dasselbe_Exemplar_verschiedene_Nummern()
    {
        Assert.NotEqual(ZertifikatDomain.NummerBilden("C0042", 12), ZertifikatDomain.NummerBilden("C0043", 12));
    }

    [Fact]
    public void Nummer_passt_in_varchar_32()
    {
        Assert.True(ZertifikatDomain.NummerBilden("C" + new string('9', 11), 1_000_000).Length <= 32);
    }
}
