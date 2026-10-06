using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Coin.Api.Http;

/// <summary>
/// Datenschutz in Logs (AK-22, AK-47): Einige Framework-Kategorien protokollieren Request-Daten (URL samt Query-String,
/// roher Pfad, Action-Argumente, fehlerhafte Requests). Für sie gilt eine feste Mindeststufe, die die Logger-Fabrik
/// selbst durchsetzt: Ihre Logger melden unterhalb der Stufe <c>IsEnabled == false</c> und schreiben nichts – unabhängig
/// von Konfigurationsregeln (auch Wildcards und empfängerspezifischen Regeln) und vom Empfänger. Zusätzlich ergänzt ein
/// Post-Configure die Filterregeln als zweite Linie.
/// Die Hosting-Diagnose öffnet außerdem keinen Log-Scope (ADR-0019): Ihr Scope trägt den rohen Request-Pfad in jeden
/// Eintrag aller Kategorien des Requests. Zur Korrelation dienen stattdessen TraceId und SpanId (ActivityTrackingOptions).
/// Fest im Code, nicht per Konfiguration abschaltbar.
/// </summary>
public static class Protokollierung
{
    public const string HostingDiagnose = "Microsoft.AspNetCore.Hosting.Diagnostics";

    /// <summary>Der Routen-Abgleich protokolliert auf Debug den rohen Request-Pfad (Ids, vertippte Pfade mit E-Mail).</summary>
    public const string RoutenAbgleich = "Microsoft.AspNetCore.Routing.Matching.DfaMatcher";

    /// <summary>MVC protokolliert auf Trace die Argumente jeder Action (Ziel-Ids, Request-Bodys).</summary>
    public const string ActionAufruf = "Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker";

    /// <summary>Kestrel protokolliert fehlerhafte Requests auf Debug/Information samt Request-Zeile bzw. Pfad.</summary>
    public const string KestrelFehlanfragen = "Microsoft.AspNetCore.Server.Kestrel.BadRequests";

    /// <summary>Kategorien, die Request-Daten protokollieren, mit fester Mindeststufe.</summary>
    private static readonly (string Kategorie, LogLevel Mindestens)[] MitRequestDaten =
    [
        (HostingDiagnose, LogLevel.Warning),
        (RoutenAbgleich, LogLevel.Warning),
        (ActionAufruf, LogLevel.Debug),
        (KestrelFehlanfragen, LogLevel.Warning),
    ];

    public static IServiceCollection AddUrlsNichtProtokollieren(this IServiceCollection services)
    {
        services.AddSingleton<IPostConfigureOptions<LoggerFilterOptions>, UrlFilter>();
        services.Configure<LoggerFactoryOptions>(o =>
            o.ActivityTrackingOptions = ActivityTrackingOptions.TraceId | ActivityTrackingOptions.SpanId);
        services.Replace(ServiceDescriptor.Singleton<ILoggerFactory>(sp => new MitFestenStufen(new LoggerFactory(
            sp.GetServices<ILoggerProvider>(),
            sp.GetRequiredService<IOptionsMonitor<LoggerFilterOptions>>(),
            sp.GetService<IOptions<LoggerFactoryOptions>>(),
            sp.GetService<IExternalScopeProvider>()))));
        return services;
    }

    private static LogLevel? FesteStufe(string kategorie)
    {
        foreach (var (fest, mindestens) in MitRequestDaten)
        {
            if (string.Equals(kategorie, fest, StringComparison.Ordinal))
            {
                return mindestens;
            }
        }

        return null;
    }

    /// <summary>Logger-Fabrik, die für die festen Kategorien die Mindeststufe erzwingt (Hosting zusätzlich ohne Scope).</summary>
    private sealed class MitFestenStufen(ILoggerFactory innen) : ILoggerFactory
    {
        public ILogger CreateLogger(string categoryName)
        {
            var logger = innen.CreateLogger(categoryName);
            return FesteStufe(categoryName) is { } mindestens
                ? new BegrenzterLogger(logger, mindestens, ohneScope: string.Equals(categoryName, HostingDiagnose, StringComparison.Ordinal))
                : logger;
        }

        public void AddProvider(ILoggerProvider provider) => innen.AddProvider(provider);

        public void Dispose() => innen.Dispose();
    }

    private sealed class BegrenzterLogger(ILogger innen, LogLevel mindestens, bool ohneScope) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => ohneScope ? null : innen.BeginScope(state);

        public bool IsEnabled(LogLevel logLevel) =>
            logLevel != LogLevel.None && logLevel >= mindestens && innen.IsEnabled(logLevel);

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (logLevel == LogLevel.None || logLevel < mindestens)
            {
                return;
            }

            innen.Log(logLevel, eventId, state, exception, formatter);
        }
    }

    private sealed class UrlFilter : IPostConfigureOptions<LoggerFilterOptions>
    {
        public void PostConfigure(string? name, LoggerFilterOptions options)
        {
            var empfaenger = options.Rules.Select(r => r.ProviderName).Append(null).Distinct(StringComparer.Ordinal).ToList();
            foreach (var anbieter in empfaenger)
            {
                foreach (var (kategorie, mindestens) in MitRequestDaten)
                {
                    options.Rules.Add(new LoggerFilterRule(anbieter, kategorie, mindestens, filter: null));
                }
            }
        }
    }
}
