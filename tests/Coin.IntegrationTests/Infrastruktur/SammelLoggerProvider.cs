using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>Sammelt alle Log-Einträge (inkl. Ausnahmen und Scopes) im Speicher (AK-21).</summary>
public sealed class SammelLoggerProvider : ILoggerProvider, ISupportExternalScope
{
    private readonly ConcurrentQueue<string> _eintraege = new();
    private IExternalScopeProvider _scopes = new LoggerExternalScopeProvider();

    public IReadOnlyCollection<string> Eintraege => _eintraege.ToArray();

    /// <summary>Alle Einträge als ein Text (zum Durchsuchen).</summary>
    public string Gesamt => string.Join(Environment.NewLine, _eintraege);

    public ILogger CreateLogger(string categoryName) => new SammelLogger(this, categoryName);

    public void SetScopeProvider(IExternalScopeProvider scopeProvider) => _scopes = scopeProvider;

    public void Dispose()
    {
    }

    private sealed class SammelLogger(SammelLoggerProvider provider, string kategorie) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => provider._scopes.Push(state);

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var scopes = new List<string>();
            provider._scopes.ForEachScope((scope, liste) => liste.Add(scope?.ToString() ?? string.Empty), scopes);
            var strukturiert = state is IEnumerable<KeyValuePair<string, object?>> werte
                ? string.Join(";", werte.Select(w => $"{w.Key}={w.Value}"))
                : string.Empty;
            provider._eintraege.Enqueue(
                $"{logLevel} {kategorie} [{string.Join(" | ", scopes)}] {formatter(state, exception)} {{{strukturiert}}} {exception}");
        }
    }
}
