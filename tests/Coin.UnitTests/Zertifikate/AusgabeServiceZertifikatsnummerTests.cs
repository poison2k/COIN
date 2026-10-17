using System.Reflection;
using Coin.Domain.Ausgaben;
using Coin.Domain.Katalog;
using Microsoft.Extensions.Time.Testing;

namespace Coin.UnitTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-3 (ADR-0027 Punkt 4): <see cref="AusgabeService.ErfassenAsync"/> bildet unter der
/// Coin-Sperre die Zertifikatsnummer aus der Kennung der Sperre (<c>ICoinSperre.Kennung</c>) und der Exemplar-Nummer
/// und übergibt sie mit der neuen Ausgabe (<c>Ausgabe.Zertifikatsnummer</c>). Die Fakes sind Proxys, damit der Test
/// unabhängig von neuen Interface-Mitgliedern übersetzbar bleibt.
/// </summary>
public class AusgabeServiceZertifikatsnummerTests
{
    private static readonly Guid CoinId = Guid.Parse("01920000-0000-7000-8000-0000000000c2");
    private static readonly Guid Akteur = Guid.Parse("01920000-0000-7000-8000-0000000000a2");

    private static readonly AusgabeAngabenEingabe Eingabe = new(
        "Max Beispiel", "Hauptmann", "Beispielbataillon 1", new DateOnly(2026, 10, 1), "Truppenbesuch", "Herausragende Leistung",
        "Kommandeur Beispielbataillon 1");

    /// <summary>Erfasst mit Kennung <paramref name="kennung"/> und liefert die an das Repository übergebene Ausgabe.</summary>
    private static async Task<Ausgabe> ErfasseAsync(string kennung, int? gewuenscht, int naechsteFreie = 12, int auflage = 1_000_000)
    {
        Ausgabe? gespeichert = null;
        var sperre = FakeProxy.Erzeugen<ICoinSperre>((methode, args) => methode.Name switch
        {
            "get_Auflage" => (int?)auflage,
            "get_Kennung" => kennung,
            nameof(ICoinSperre.NaechsteFreieNummerAsync) => (int?)naechsteFreie,
            nameof(ICoinSperre.IstAusgegebenAsync) => false,
            nameof(ICoinSperre.AusgabeHinzufuegenAsync) => (gespeichert = (Ausgabe)args![0]!) is not null,
            _ => null,
        });
        var repository = FakeProxy.Erzeugen<IAusgabeRepository>((methode, args) => methode.Name switch
        {
            nameof(IAusgabeRepository.SperrenAsync) => sperre,
            nameof(IAusgabeRepository.FindenAsync) when gespeichert is not null => Eintrag(gespeichert),
            _ => null,
        });
        var katalog = FakeProxy.Erzeugen<ICoinKatalogRepository>((_, _) => null);
        var service = new AusgabeService(repository, katalog, new FakeTimeProvider(new DateTimeOffset(2026, 10, 8, 9, 0, 0, TimeSpan.Zero)));

        var ergebnis = await service.ErfassenAsync(CoinId, gewuenscht, Eingabe, Akteur, CancellationToken.None);

        Assert.IsType<AusgabeErfassenErgebnis.Erfasst>(ergebnis);
        return gespeichert ?? throw new Xunit.Sdk.XunitException("Keine Ausgabe gespeichert.");
    }

    /// <summary>Lesesicht zur gespeicherten Ausgabe (Konstruktor per Reflexion, weil er um die Nummer wächst).</summary>
    private static AusgabeEintrag Eintrag(Ausgabe ausgabe) => (AusgabeEintrag)ZertifikatDomain.Konstruieren(typeof(AusgabeEintrag), new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
    {
        ["id"] = ausgabe.Id, ["exemplarNummer"] = ausgabe.ExemplarNummer, ["angaben"] = ausgabe.Angaben, ["erfasstAm"] = ausgabe.ErfasstAm,
        ["erfasstVon"] = new Akteur(Akteur, "Test Erfasser"), ["storno"] = null, ["zertifikatsnummer"] = Nummer(ausgabe),
    });

    private static string? Nummer(Ausgabe ausgabe)
    {
        var eigenschaft = typeof(Ausgabe).GetProperty("Zertifikatsnummer")
            ?? throw new Xunit.Sdk.XunitException("Ausgabe.Zertifikatsnummer fehlt (Entwurf 5.5).");
        return (string?)eigenschaft.GetValue(ausgabe);
    }

    [Fact]
    public async Task Gewuenschtes_Exemplar_ergibt_Kennung_Bindestrich_vierstellige_Nummer()
    {
        var ausgabe = await ErfasseAsync("C0042", 12);

        Assert.Equal("C0042-0012", Nummer(ausgabe));
    }

    [Fact]
    public async Task Naechstes_freies_Exemplar_ergibt_die_Nummer_dieses_Exemplars()
    {
        var ausgabe = await ErfasseAsync("C0042", null, naechsteFreie: 7);

        Assert.Equal((7, "C0042-0007"), (ausgabe.ExemplarNummer, Nummer(ausgabe)));
    }

    [Fact]
    public async Task Exemplar_ueber_9999_wird_nicht_gekuerzt()
    {
        var ausgabe = await ErfasseAsync("C0042", 1_000_000);

        Assert.Equal("C0042-1000000", Nummer(ausgabe));
    }

    [Fact]
    public async Task Kennung_kommt_aus_der_Sperre()
    {
        var ausgabe = await ErfasseAsync("C10000", 1);

        Assert.Equal("C10000-0001", Nummer(ausgabe));
    }
}

/// <summary>Proxy für ein beliebiges Interface; <c>Task</c>-Ergebnisse werden passend verpackt.</summary>
public class FakeProxy : DispatchProxy
{
    private Func<MethodInfo, object?[]?, object?> _antwort = (_, _) => null;

    public static T Erzeugen<T>(Func<MethodInfo, object?[]?, object?> antwort)
        where T : class
    {
        var proxy = Create<T, FakeProxy>();
        ((FakeProxy)(object)proxy)._antwort = antwort;
        return proxy;
    }

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
    {
        ArgumentNullException.ThrowIfNull(targetMethod);
        var wert = _antwort(targetMethod, args);
        var typ = targetMethod.ReturnType;
        if (typ == typeof(Task))
        {
            return Task.CompletedTask;
        }

        if (typ == typeof(ValueTask))
        {
            return ValueTask.CompletedTask;
        }

        if (typ.IsGenericType && typ.GetGenericTypeDefinition() == typeof(Task<>))
        {
            var inhalt = typ.GetGenericArguments()[0];
            return typeof(Task).GetMethod(nameof(Task.FromResult))!.MakeGenericMethod(inhalt).Invoke(null, [wert ?? Standard(inhalt)]);
        }

        return wert ?? Standard(typ);
    }

    private static object? Standard(Type typ) => typ.IsValueType && typ != typeof(void) ? Activator.CreateInstance(typ) : null;
}
