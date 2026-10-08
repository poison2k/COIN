using System.Reflection;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>
/// Implementierung eines beliebigen Interfaces, deren Methoden alle eine <see cref="InvalidOperationException"/> mit der
/// angegebenen Meldung werfen (z. B. ein defektes Repository für 500-Tests). Hängt nicht von den einzelnen Signaturen
/// ab, damit Umbauten am Interface (katalog-seiten: <c>AlleAsync</c> → <c>SuchenAsync</c>) die Tests nicht brechen.
/// </summary>
public class WerfenderProxy<T> : DispatchProxy
    where T : class
{
    private string _meldung = "Testfehler";

    /// <summary>Erzeugt die werfende Implementierung von <typeparamref name="T"/>.</summary>
    public static T Erzeugen(string meldung)
    {
        var proxy = Create<T, WerfenderProxy<T>>();
        ((WerfenderProxy<T>)(object)proxy)._meldung = meldung;
        return proxy;
    }

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) =>
        throw new InvalidOperationException(_meldung);
}
