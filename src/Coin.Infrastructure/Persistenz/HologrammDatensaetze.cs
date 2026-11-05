namespace Coin.Infrastructure.Persistenz;

/// <summary>
/// Persistenzmodell der Tabelle <c>ausgabe_hologramm</c> (hologrammnummer Abschnitt 6, ADR-0033 Punkt 1): eine Zuordnung
/// „Nummer → Ausgabe“; eine Korrektur löst die Zeile ab (<see cref="AbgeloestAm"/>) und fügt eine neue ein. Nur per SQL
/// geschrieben, unveränderlich bis auf das einmalige Ablösen (Trigger). <see cref="NummerNormalisiert"/> berechnet die
/// Datenbank (generierte Spalte).
/// </summary>
public sealed class AusgabeHologrammDatensatz
{
    public Guid Id { get; set; }

    public Guid AusgabeId { get; set; }

    /// <summary>Anzeigeform (H3).</summary>
    public string Nummer { get; set; } = string.Empty;

    public string NummerNormalisiert { get; set; } = string.Empty;

    public DateTimeOffset GesetztAm { get; set; }

    public Guid GesetztVon { get; set; }

    public DateTimeOffset? AbgeloestAm { get; set; }
}

/// <summary>
/// Persistenzmodell der Tabelle <c>hologramm_audit</c> (ADR-0033 Punkt 6): ohne Empfängerdaten, nur per SQL-INSERT,
/// unveränderlich per Trigger. Nummern in Normalform.
/// </summary>
public sealed class HologrammAuditDatensatz
{
    public Guid Id { get; set; }

    public DateTimeOffset Zeitpunkt { get; set; }

    public Guid AkteurId { get; set; }

    public Guid AusgabeId { get; set; }

    public Guid CoinId { get; set; }

    public string Art { get; set; } = string.Empty;

    public string? NummerAlt { get; set; }

    public string NummerNeu { get; set; } = string.Empty;

    public string? Grund { get; set; }
}

/// <summary>
/// Persistenzmodell der Tabelle <c>pruefung_audit</c> (ADR-0034 Punkt 5): je Prüfung mit Ergebnis ein Eintrag, ohne
/// Empfängerdaten, nur per SQL-INSERT, unveränderlich per Trigger. <see cref="Nummer"/> in Normalform.
/// </summary>
public sealed class PruefungAuditDatensatz
{
    public Guid Id { get; set; }

    public DateTimeOffset Zeitpunkt { get; set; }

    public Guid AkteurId { get; set; }

    public string Nummer { get; set; } = string.Empty;

    public Guid? CoinIdGewaehlt { get; set; }

    public string Ergebnis { get; set; } = string.Empty;

    public Guid? AusgabeId { get; set; }

    public bool MitEmpfaenger { get; set; }
}
