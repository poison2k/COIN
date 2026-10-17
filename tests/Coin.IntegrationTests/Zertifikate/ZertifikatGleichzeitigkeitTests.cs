using System.Net;
using System.Reflection;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.Extensions.DependencyInjection;

namespace Coin.IntegrationTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-16 (ADR-0028 Punkt 8): Der Erzeuger ist ein Singleton und lässt höchstens zwei
/// Erzeugungen gleichzeitig zu (<c>SemaphoreSlim(2)</c>); eine dritte wartet, ein Abbruch des Requests beendet das Warten.
/// Der Test belegt beide Plätze der Sperre per Reflexion und beobachtet einen Download von außen.
/// </summary>
public class ZertifikatGleichzeitigkeitTests(PostgresFixture fixture) : ZertifikatTestBasis(fixture)
{
    private static readonly TimeSpan Warten = TimeSpan.FromMilliseconds(700);

    private static object Erzeuger(CoinApiFactory factory) =>
        factory.Services.GetRequiredService(ZertifikatErzeugerErsatz.Port());

    private static SemaphoreSlim Sperre(object erzeuger)
    {
        var felder = erzeuger.GetType()
            .GetFields(BindingFlags.Instance | BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public)
            .Where(f => f.FieldType == typeof(SemaphoreSlim))
            .ToList();
        var feld = Assert.Single(felder);
        return (SemaphoreSlim)feld.GetValue(feld.IsStatic ? null : erzeuger)!;
    }

    [Fact]
    public void Erzeuger_ist_ein_Singleton()
    {
        using var erster = Fixture.Factory.Services.CreateScope();
        using var zweiter = Fixture.Factory.Services.CreateScope();

        Assert.Same(
            erster.ServiceProvider.GetRequiredService(ZertifikatErzeugerErsatz.Port()),
            zweiter.ServiceProvider.GetRequiredService(ZertifikatErzeugerErsatz.Port()));
    }

    [Fact]
    public void Erzeuger_erlaubt_zwei_gleichzeitige_Erzeugungen()
    {
        Assert.Equal(2, Sperre(Erzeuger(Fixture.Factory)).CurrentCount);
    }

    [Fact]
    public async Task Dritte_Erzeugung_wartet_bis_ein_Platz_frei_wird()
    {
        var k = await AusgabeAsync();
        var sperre = Sperre(Erzeuger(Fixture.Factory));
        Assert.True(await sperre.WaitAsync(0) && await sperre.WaitAsync(0), "Plätze der Sperre nicht frei.");
        Task<HttpResponseMessage> download;
        try
        {
            download = GetZertifikatAsync(k);
            var fertig = await Task.WhenAny(download, Task.Delay(Warten));

            Assert.NotSame(download, fertig);
        }
        finally
        {
            sperre.Release(2);
        }

        using var antwort = await download.WaitAsync(TimeSpan.FromSeconds(30));
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Abbruch_des_Requests_beendet_das_Warten_ohne_Audit()
    {
        var k = await AusgabeAsync();
        var sperre = Sperre(Erzeuger(Fixture.Factory));
        Assert.True(await sperre.WaitAsync(0) && await sperre.WaitAsync(0), "Plätze der Sperre nicht frei.");
        try
        {
            using var abbruch = new CancellationTokenSource(Warten);
            var fehler = await Record.ExceptionAsync(() => Client.GetAsync(ZertifikatUrl(k.CoinId, k.AusgabeId), abbruch.Token));

            Assert.IsAssignableFrom<OperationCanceledException>(fehler);
        }
        finally
        {
            sperre.Release(2);
        }

        // Das Warten auf der Sperre muss mit dem Abbruch enden: Danach sind beide Plätze wieder frei und kein Audit steht.
        await Task.Delay(300);
        Assert.Equal(2, sperre.CurrentCount);
        Assert.Equal(0L, await ZertifikatDb.AnzahlAsync());
    }
}
