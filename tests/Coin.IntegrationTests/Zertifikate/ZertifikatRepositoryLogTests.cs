using System.Net;
using System.Reflection;
using Coin.Domain.Zertifikate;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.Extensions.DependencyInjection;

namespace Coin.IntegrationTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-21 (Regressionswächter aus QA-Runde 1, Muster <c>ZertifikatLogTests</c>): Wirft der
/// Datenzugriff des Downloads (<see cref="IZertifikatRepository"/>) beim Laden oder beim Audit-INSERT, stehen weder Werte
/// der Ausgabe noch Coin-Daten oder die Zertifikatsnummer im Log, und es entsteht kein Audit-Eintrag.
/// </summary>
public class ZertifikatRepositoryLogTests(PostgresFixture fixture) : ZertifikatTestBasis(fixture)
{
    private const string CoinName = "Repolog Coin Qr71";
    private const string Name = "Repolog Empfaenger Qr72";
    private const string Dienstgrad = "Repolog Dienstgrad Qr73";
    private const string Dienststelle = "Repolog Dienststelle Qr74";
    private const string Gelegenheit = "Repolog Gelegenheit Qr75";
    private const string Begruendung = "Repolog Begruendung Qr76";
    private const string Stelle = "Repolog Stelle Qr77";

    public static TheoryData<string> Stellen => ["Laden", "Audit"];

    private sealed record Lauf(HttpStatusCode Status, SammelLoggerProvider Logs, string Nummer, long Audit);

    /// <summary>Ersetzt das Repository durch eine Hülle um das echte, die bei <paramref name="stelle"/> wirft.</summary>
    private static void Werfend(IServiceCollection dienste, string stelle)
    {
        var original = dienste.Last(d => d.ServiceType == typeof(IZertifikatRepository));
        dienste.Remove(original);
        dienste.Add(new ServiceDescriptor(typeof(IZertifikatRepository), sp =>
        {
            var echt = (IZertifikatRepository)(original.ImplementationInstance
                ?? original.ImplementationFactory?.Invoke(sp)
                ?? ActivatorUtilities.CreateInstance(sp, original.ImplementationType!));
            return Huelle.Erzeugen(echt, stelle == "Laden" ? nameof(IZertifikatRepository.LadenAsync) : nameof(IZertifikatRepository.AuditSchreibenAsync));
        }, original.Lifetime));
    }

    private async Task<Lauf> DownloadAsync(string stelle)
    {
        var coinId = await CoinMitAuflageAsync(5, CoinName);
        var k = await AusgabeZuAsync(coinId, 1, GueltigeAusgabe(1, Name, Dienstgrad, Dienststelle, Datum, Gelegenheit, Begruendung, Stelle));
        var logs = new SammelLoggerProvider();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Logger = logs,
            Einstellungen = new Dictionary<string, string?>
            {
                ["Logging:LogLevel:Default"] = "Trace",
                ["Logging:LogLevel:Microsoft"] = "Trace",
                ["Logging:LogLevel:Microsoft.AspNetCore"] = "Trace",
            },
            Dienste = dienste => Werfend(dienste, stelle),
        });
        using var client = factory.CreateClient();

        using var antwort = await client.GetAsync(ZertifikatUrl(k.CoinId, k.AusgabeId));

        return new Lauf(antwort.StatusCode, logs, k.Nummer, await ZertifikatDb.AnzahlAsync());
    }

    [Theory]
    [MemberData(nameof(Stellen))]
    public async Task Werfendes_Repository_liefert_500(string stelle)
    {
        var lauf = await DownloadAsync(stelle);

        Assert.Equal(HttpStatusCode.InternalServerError, lauf.Status);
    }

    [Theory]
    [MemberData(nameof(Stellen))]
    public async Task Werfendes_Repository_schreibt_kein_Audit(string stelle)
    {
        var lauf = await DownloadAsync(stelle);

        Assert.Equal(0L, lauf.Audit);
    }

    [Theory]
    [MemberData(nameof(Stellen))]
    public async Task Logs_werden_tatsaechlich_abgefangen(string stelle)
    {
        var lauf = await DownloadAsync(stelle);

        Assert.NotEmpty(lauf.Logs.Eintraege);
    }

    [Theory]
    [MemberData(nameof(Stellen))]
    public async Task Werfendes_Repository_bringt_keine_Testwerte_ins_Log(string stelle)
    {
        var lauf = await DownloadAsync(stelle);

        Assert.DoesNotContain("Qr7", lauf.Logs.Gesamt, StringComparison.Ordinal);
    }

    [Theory]
    [MemberData(nameof(Stellen))]
    public async Task Werfendes_Repository_bringt_die_Zertifikatsnummer_nicht_ins_Log(string stelle)
    {
        var lauf = await DownloadAsync(stelle);

        Assert.DoesNotContain(lauf.Nummer, lauf.Logs.Gesamt, StringComparison.Ordinal);
    }

    /// <summary>Hülle um das echte Repository; die genannte Methode wirft, alle anderen werden weitergereicht.</summary>
    public class Huelle : DispatchProxy
    {
        private IZertifikatRepository _echt = null!;
        private string _werfend = string.Empty;

        public static IZertifikatRepository Erzeugen(IZertifikatRepository echt, string werfend)
        {
            var proxy = Create<IZertifikatRepository, Huelle>();
            var huelle = (Huelle)(object)proxy;
            huelle._echt = echt;
            huelle._werfend = werfend;
            return proxy;
        }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            if (targetMethod!.Name == _werfend)
            {
                throw new InvalidOperationException("Testfehler im Datenzugriff");
            }

            try
            {
                return targetMethod.Invoke(_echt, args);
            }
            catch (TargetInvocationException ex) when (ex.InnerException is not null)
            {
                throw ex.InnerException;
            }
        }
    }
}
