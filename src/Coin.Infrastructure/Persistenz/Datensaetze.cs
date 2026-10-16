namespace Coin.Infrastructure.Persistenz;

/// <summary>Persistenzmodell der Tabelle <c>coin_typ</c>. Fachliche Regeln liegen in der Domain.</summary>
public sealed class CoinTypDatensatz
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Herausgeber { get; set; } = string.Empty;

    public int? Auflage { get; set; }

    public string? Beschreibung { get; set; }

    public DateTimeOffset ErstelltAm { get; set; }

    /// <summary>Aktive Version der Zertifikatsvorlage; <c>null</c> = Standardvorlage (ADR-0023 Punkt 3).</summary>
    public int? AktiveVorlageVersion { get; set; }

    public CoinBildDatensatz? Bild { get; set; }
}

/// <summary>Persistenzmodell der Tabelle <c>coin_bild</c> (1:0..1 zu <c>coin_typ</c>, ADR-0005).</summary>
public sealed class CoinBildDatensatz
{
    public Guid CoinId { get; set; }

    public byte[] Inhalt { get; set; } = [];

    public string Format { get; set; } = string.Empty;

    public string Sha256 { get; set; } = string.Empty;

    public int GroesseBytes { get; set; }

    public DateTimeOffset HochgeladenAm { get; set; }
}

/// <summary>Persistenzmodell der Tabelle <c>benutzer</c> (ADR-0013). <see cref="Rolle"/> <c>null</c> = keine Rolle.</summary>
public sealed class BenutzerDatensatz
{
    public Guid Id { get; set; }

    public string Issuer { get; set; } = string.Empty;

    public string Subject { get; set; } = string.Empty;

    public string? Email { get; set; }

    public string Anzeigename { get; set; } = string.Empty;

    public string? Rolle { get; set; }

    /// <summary><c>false</c> = deaktiviert (ADR-0016). Nur die Benutzerverwaltung ändert den Status.</summary>
    public bool Aktiv { get; set; } = true;

    public DateTimeOffset ErstelltAm { get; set; }

    public DateTimeOffset AktualisiertAm { get; set; }
}

/// <summary>
/// Persistenzmodell der Tabelle <c>benutzer_audit</c> (ADR-0017). Geschrieben wird nur per SQL-INSERT, gelesen ohne
/// Tracking; ein Trigger verhindert UPDATE und DELETE. <see cref="AkteurId"/> <c>null</c> = System (Bootstrap).
/// </summary>
public sealed class BenutzerAuditDatensatz
{
    public Guid Id { get; set; }

    public DateTimeOffset Zeitpunkt { get; set; }

    public Guid? AkteurId { get; set; }

    public BenutzerDatensatz? Akteur { get; set; }

    public Guid BenutzerId { get; set; }

    public BenutzerDatensatz Benutzer { get; set; } = null!;

    public string Art { get; set; } = string.Empty;

    public string Alt { get; set; } = string.Empty;

    public string Neu { get; set; } = string.Empty;
}

/// <summary>Persistenzmodell der Tabelle <c>exemplar</c> (ADR-0020 Punkt 1). Erzeugt und gelöscht nur per SQL.</summary>
public sealed class ExemplarDatensatz
{
    public Guid CoinId { get; set; }

    public int Nummer { get; set; }
}

/// <summary>
/// Persistenzmodell der Tabelle <c>ausgabe</c> (ADR-0020 Punkt 4). Geschrieben nur per SQL; ein Trigger verhindert
/// DELETE und erlaubt als UPDATE nur das einmalige Storno.
/// </summary>
public sealed class AusgabeDatensatz
{
    public Guid Id { get; set; }

    public Guid CoinId { get; set; }

    public int ExemplarNummer { get; set; }

    public string EmpfaengerName { get; set; } = string.Empty;

    public string? EmpfaengerDienstgrad { get; set; }

    public string? EmpfaengerDienststelle { get; set; }

    public DateOnly Datum { get; set; }

    public string Gelegenheit { get; set; } = string.Empty;

    public string Begruendung { get; set; } = string.Empty;

    public string AusgebendeStelle { get; set; } = string.Empty;

    public DateTimeOffset ErfasstAm { get; set; }

    public Guid ErfasstVon { get; set; }

    public BenutzerDatensatz Erfasser { get; set; } = null!;

    public DateTimeOffset? StorniertAm { get; set; }

    public Guid? StorniertVon { get; set; }

    public BenutzerDatensatz? Stornierer { get; set; }

    public string? StornoGrund { get; set; }
}

/// <summary>
/// Persistenzmodell der Tabelle <c>ausgabe_audit</c> (ADR-0020 Punkt 10): ohne Empfängerdaten, nur per SQL-INSERT,
/// unveränderlich per Trigger.
/// </summary>
public sealed class AusgabeAuditDatensatz
{
    public Guid Id { get; set; }

    public DateTimeOffset Zeitpunkt { get; set; }

    public Guid AkteurId { get; set; }

    public Guid AusgabeId { get; set; }

    public Guid CoinId { get; set; }

    public int ExemplarNummer { get; set; }

    public string Art { get; set; } = string.Empty;

    public string? Grund { get; set; }
}
