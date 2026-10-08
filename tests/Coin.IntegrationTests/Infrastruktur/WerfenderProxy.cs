using System.Reflection;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>
/// Implementierung eines beliebigen Interfaces, deren Methoden alle eine Ausnahme werfen (z. B. ein defektes Repository
/// für 500-Tests). Standard ist eine <see cref="InvalidOperationException"/> mit der angegebenen Meldung. Hängt nicht von
/// den einzelnen Signaturen ab, damit Umbauten am Interface (katalog-seiten: <c>AlleAsync</c> → <c>SuchenAsync</c>) die
/// Tests nicht brechen.
/// </summary>
public class WerfenderProxy<T> : DispatchProxy
    where T : class
{
    private Func<Exception> _ausnahme = () => new InvalidOperationException("Testfehler");

    /// <summary>Erzeugt die werfende Implementierung von <typeparamref name="T"/> (<see cref="InvalidOperationException"/>).</summary>
    public static T Erzeugen(string meldung) => Erzeugen(() => new InvalidOperationException(meldung));

    /// <summary>Erzeugt die werfende Implementierung von <typeparamref name="T"/> mit beliebiger Ausnahme.</summary>
    public static T Erzeugen(Func<Exception> ausnahme)
    {
        var proxy = Create<T, WerfenderProxy<T>>();
        ((WerfenderProxy<T>)(object)proxy)._ausnahme = ausnahme;
        return proxy;
    }

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => throw _ausnahme();
}
