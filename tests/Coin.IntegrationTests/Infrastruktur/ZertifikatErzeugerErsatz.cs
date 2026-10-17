using System.Reflection;
using Microsoft.Extensions.DependencyInjection;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>
/// Testhaken für den Port <c>Coin.Domain.Zertifikate.IZertifikatErzeuger</c> (zertifikat-erzeugen, Entwurf 5.5):
/// ersetzt die Registrierung durch einen Proxy, der wirft oder vor dem Aufruf des echten Erzeugers eine Aktion
/// ausführt. Der Typ wird per Name gesucht, damit das Testprojekt ohne ihn übersetzbar bleibt.
/// </summary>
public static class ZertifikatErzeugerErsatz
{
    public const string PortName = "Coin.Domain.Zertifikate.IZertifikatErzeuger";

    /// <summary>Der Port oder ein Testfehler mit Hinweis auf den Entwurf.</summary>
    public static Type Port() =>
        typeof(Coin.Domain.Ergebnis<>).Assembly.GetType(PortName)
        ?? throw new Xunit.Sdk.XunitException($"Port {PortName} fehlt (Entwurf zertifikat-erzeugen, Abschnitt 5.5).");

    /// <summary>Ersetzt den Erzeuger durch einen, der bei jedem Aufruf <paramref name="ausnahme"/> wirft.</summary>
    public static void Werfend(IServiceCollection dienste, Func<Exception> ausnahme)
    {
        var port = Port();
        dienste.RemoveAll(port);
        dienste.AddSingleton(port, _ => Proxy.Erzeugen(port, (_, _) => throw ausnahme()));
    }

    /// <summary>
    /// Umhüllt den registrierten Erzeuger: Vor jedem Aufruf läuft <paramref name="vorher"/>, danach der echte Erzeuger.
    /// </summary>
    public static void MitVorlauf(IServiceCollection dienste, Func<Task> vorher)
    {
        var port = Port();
        var original = dienste.LastOrDefault(d => d.ServiceType == port)
            ?? throw new Xunit.Sdk.XunitException($"{PortName} ist nicht registriert.");
        dienste.RemoveAll(port);
        dienste.Add(new ServiceDescriptor(port, sp =>
        {
            var echt = original.ImplementationInstance
                ?? original.ImplementationFactory?.Invoke(sp)
                ?? ActivatorUtilities.CreateInstance(sp, original.ImplementationType!);
            return Proxy.Erzeugen(port, (methode, args) =>
            {
                vorher().GetAwaiter().GetResult();
                try
                {
                    return methode.Invoke(echt, args);
                }
                catch (TargetInvocationException ex) when (ex.InnerException is not null)
                {
                    throw ex.InnerException;
                }
            });
        }, original.Lifetime));
    }

    private static void RemoveAll(this IServiceCollection dienste, Type typ)
    {
        foreach (var eintrag in dienste.Where(d => d.ServiceType == typ).ToList())
        {
            dienste.Remove(eintrag);
        }
    }

    /// <summary>Proxy für einen per Reflexion gefundenen Interface-Typ.</summary>
    public class Proxy : DispatchProxy
    {
        private Func<MethodInfo, object?[]?, object?> _aufruf = (_, _) => null;

        public static object Erzeugen(Type port, Func<MethodInfo, object?[]?, object?> aufruf)
        {
            var proxy = Create(port, typeof(Proxy));
            ((Proxy)proxy)._aufruf = aufruf;
            return proxy;
        }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => _aufruf(targetMethod!, args);
    }
}
