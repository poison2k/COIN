using System.Collections.Concurrent;
using System.Diagnostics;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>
/// Zählt die SQL-Befehle, die Npgsql ausführt (Feature startseite, AK-6, Abschnitt 9.2 „Befehlszähler“). Grundlage ist
/// die <see cref="ActivitySource"/> „Npgsql“, die jeden Befehl meldet – unabhängig davon, ob er über EF Core oder direkt
/// über eine <c>NpgsqlConnection</c> läuft. Die Tests der Collection laufen nacheinander; der Zähler erfasst deshalb nur
/// Befehle zwischen Start und <see cref="Dispose"/>. Verbindungsaufbau ohne Befehlstext zählt nicht.
/// </summary>
public sealed class SqlBefehlsZaehler : IDisposable
{
    private readonly ConcurrentQueue<string> _befehle = new();
    private readonly ActivityListener _zuhoerer;

    public SqlBefehlsZaehler()
    {
        _zuhoerer = new ActivityListener
        {
            ShouldListenTo = quelle => quelle.Name.StartsWith("Npgsql", StringComparison.Ordinal),
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = Aufnehmen,
        };
        ActivitySource.AddActivityListener(_zuhoerer);
    }

    /// <summary>Texte aller ausgeführten Befehle in Ausführungsreihenfolge.</summary>
    public IReadOnlyList<string> Befehle => [.. _befehle];

    /// <summary>
    /// Befehle ohne den Benutzerabgleich der Anmeldung (Befehle, die nur <c>benutzer</c> betreffen). AK-6 zählt die
    /// Abfragen der Startseite selbst (Abschnitt 6: Kennzahlen, Neueste, Meistausgegebene, Konfiguration).
    /// </summary>
    public IReadOnlyList<string> OhneBenutzerabgleich =>
        Befehle.Where(b => !(b.Contains("benutzer", StringComparison.OrdinalIgnoreCase)
            && !b.Contains("startseite", StringComparison.OrdinalIgnoreCase)
            && !b.Contains("coin_typ", StringComparison.OrdinalIgnoreCase)
            && !b.Contains("ausgabe", StringComparison.OrdinalIgnoreCase))).ToList();

    public void Zuruecksetzen() => _befehle.Clear();

    private void Aufnehmen(Activity aktivitaet)
    {
        var text = aktivitaet.GetTagItem("db.query.text") as string
            ?? aktivitaet.GetTagItem("db.statement") as string;
        if (!string.IsNullOrWhiteSpace(text))
        {
            _befehle.Enqueue(text);
        }
    }

    public void Dispose() => _zuhoerer.Dispose();
}
