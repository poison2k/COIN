using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>Ein gesammelter Log-Eintrag mit strukturierten Werten (rollen-benutzerverwaltung, AK-46/AK-47).</summary>
public sealed record LogEintrag(
    LogLevel Level,
    string Kategorie,
    EventId EventId,
    string Nachricht,
    IReadOnlyDictionary<string, object?> Werte,
    string Text);

/// <summary>Sammelt alle Log-Einträge (inkl. Ausnahmen und Scopes) im Speicher (AK-21).</summary>
public sealed class SammelLoggerProvider : ILoggerProvider, ISupportExternalScope
{
    private readonly ConcurrentQueue<string> _eintraege = new();
    private readonly ConcurrentQueue<LogEintrag> _strukturiert = new();
    private IExternalScopeProvider _scopes = new LoggerExternalScopeProvider();

    public IReadOnlyCollection<string> Eintraege => _eintraege.ToArray();

    /// <summary>Alle Einträge mit Level, Kategorie, EventId und strukturierten Werten.</summary>
    public IReadOnlyList<LogEintrag> Strukturiert => _strukturiert.ToArray();

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
            var paare = state is IEnumerable<KeyValuePair<string, object?>> werte
                ? werte.ToList()
                : [];
            var strukturiert = string.Join(";", paare.Select(w => $"{w.Key}={w.Value}"));
            var nachricht = formatter(state, exception);
            var text = $"{logLevel} {kategorie} [{string.Join(" | ", scopes)}] {nachricht} {{{strukturiert}}} {exception}";
            provider._eintraege.Enqueue(text);
            var woerterbuch = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var (schluessel, wert) in paare)
            {
                woerterbuch[schluessel] = wert;
            }

            provider._strukturiert.Enqueue(new LogEintrag(logLevel, kategorie, eventId, nachricht, woerterbuch, text));
        }
    }
}
