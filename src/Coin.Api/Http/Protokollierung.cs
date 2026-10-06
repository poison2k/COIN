using Microsoft.Extensions.Options;

namespace Coin.Api.Http;

/// <summary>
/// Datenschutz in Logs (AK-22): Die Hosting-Diagnose protokolliert jede Request-URL samt Query-String (z. B.
/// <c>?suche=</c> mit E-Mail oder Name). Diese Kategorie wird für alle Log-Empfänger erst ab Warning geschrieben,
/// unabhängig von der Konfiguration. Die Regel wird nach jeder anderen Filterregel ergänzt und gilt je Empfänger mit
/// eigener Regel, damit sie Vorrang hat.
/// </summary>
public static class Protokollierung
{
    public const string HostingDiagnose = "Microsoft.AspNetCore.Hosting.Diagnostics";

    public static IServiceCollection AddUrlsNichtProtokollieren(this IServiceCollection services)
    {
        services.AddSingleton<IPostConfigureOptions<LoggerFilterOptions>, UrlFilter>();
        return services;
    }

    private sealed class UrlFilter : IPostConfigureOptions<LoggerFilterOptions>
    {
        public void PostConfigure(string? name, LoggerFilterOptions options)
        {
            var empfaenger = options.Rules.Select(r => r.ProviderName).Append(null).Distinct(StringComparer.Ordinal).ToList();
            foreach (var anbieter in empfaenger)
            {
                options.Rules.Add(new LoggerFilterRule(anbieter, HostingDiagnose, LogLevel.Warning, filter: null));
            }
        }
    }
}
