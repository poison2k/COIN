using System.Reflection;

namespace Coin.IntegrationTests.Pruefung;

/// <summary>
/// Feature hologrammnummer, AK-22 (ADR-0033 Punkt 8): Request-DTOs geben in <c>ToString</c> keine Werte aus. Geprüft
/// per Reflexion über alle öffentlichen <c>…Request</c>-Typen der API, damit die neuen DTOs (Ergänzen/Korrigieren,
/// Prüfung) unabhängig von ihrem Namen erfasst werden. Erwartet werden ein DTO mit <c>Hologrammnummer</c>,
/// <c>Grund</c> und <c>Bisherige</c> (Abschnitt 5.2, <c>PUT …/hologrammnummer</c>), eines mit <c>Hologrammnummer</c>
/// und <c>CoinId</c> (Prüfung) und <c>Hologrammnummer</c> im Erfassen-DTO.
/// </summary>
public class RequestDtoTests
{
    private const string Testwert = "Testwert Dto Rq81";

    private static readonly Guid TestGuid = Guid.Parse("01920000-0000-7000-8000-00000000f781");

    private static IEnumerable<Type> RequestTypen() =>
        typeof(Program).Assembly.GetTypes()
            .Where(t => t.IsPublic && t.IsClass && !t.IsAbstract && t.Name.EndsWith("Request", StringComparison.Ordinal));

    private static bool Hat(Type typ, params string[] eigenschaften) =>
        eigenschaften.All(e => typ.GetProperty(e, BindingFlags.Public | BindingFlags.Instance) is not null);

    private static object? Beispielwert(Type typ)
    {
        var ziel = Nullable.GetUnderlyingType(typ) ?? typ;
        return ziel == typeof(string) ? Testwert
            : ziel == typeof(Guid) ? TestGuid
            : ziel == typeof(int) ? 781
            : ziel == typeof(bool) ? true
            : ziel == typeof(DateOnly) ? new DateOnly(2026, 10, 1)
            : ziel.IsValueType ? Activator.CreateInstance(ziel)
            : null;
    }

    /// <summary>Instanz mit Testwerten in allen Konstruktorparametern bzw. setzbaren Eigenschaften.</summary>
    private static object Erzeugen(Type typ)
    {
        var konstruktor = typ.GetConstructors().OrderByDescending(k => k.GetParameters().Length).First();
        var objekt = konstruktor.Invoke([.. konstruktor.GetParameters().Select(p => Beispielwert(p.ParameterType))]);
        foreach (var eigenschaft in typ.GetProperties(BindingFlags.Public | BindingFlags.Instance).Where(p => p.CanWrite))
        {
            eigenschaft.SetValue(objekt, Beispielwert(eigenschaft.PropertyType));
        }

        return objekt;
    }

    [Fact]
    public void Es_gibt_ein_Request_DTO_mit_Hologrammnummer_Grund_und_Bisherige()
    {
        Assert.Contains(RequestTypen(), t => Hat(t, "Hologrammnummer", "Grund", "Bisherige"));
    }

    [Fact]
    public void Es_gibt_ein_Request_DTO_mit_Hologrammnummer_und_CoinId()
    {
        Assert.Contains(RequestTypen(), t => Hat(t, "Hologrammnummer", "CoinId"));
    }

    [Fact]
    public void Das_Erfassen_DTO_hat_eine_Hologrammnummer()
    {
        Assert.Contains(RequestTypen(), t => Hat(t, "EmpfaengerName", "Hologrammnummer"));
    }

    public static TheoryData<string> Typen => [.. RequestTypen().Select(t => t.FullName!)];

    [Theory]
    [MemberData(nameof(Typen))]
    public void ToString_enthaelt_keine_Werte(string typName)
    {
        var typ = typeof(Program).Assembly.GetType(typName)!;

        var text = Erzeugen(typ).ToString() ?? string.Empty;

        Assert.DoesNotContain("Rq81", text, StringComparison.Ordinal);
        Assert.DoesNotContain(TestGuid.ToString(), text, StringComparison.OrdinalIgnoreCase);
    }
}
