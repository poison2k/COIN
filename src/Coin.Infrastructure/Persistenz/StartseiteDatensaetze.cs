namespace Coin.Infrastructure.Persistenz;

/// <summary>
/// Persistenzmodell der Tabelle <c>startseite_konfiguration</c> (Feature startseite Abschnitt 4.1, ADR-0030 Punkt 1):
/// höchstens eine Zeile (<c>id = 1</c>). Geschrieben und gelesen per SQL; das Modell dient der Migration.
/// </summary>
public sealed class StartseiteKonfigurationDatensatz
{
    public short Id { get; set; }

    public int Version { get; set; }

    public string[] Reihenfolge { get; set; } = [];

    public bool KopfAktiv { get; set; }

    public bool InfotextAktiv { get; set; }

    public bool KennzahlenAktiv { get; set; }

    public bool NeuesteAktiv { get; set; }

    public bool MeistausgegebenAktiv { get; set; }

    public string KopfTitel { get; set; } = string.Empty;

    public string KopfUntertitel { get; set; } = string.Empty;

    public string Infotext { get; set; } = string.Empty;

    public short NeuesteAnzahl { get; set; }

    public short MeistausgegebenAnzahl { get; set; }

    public DateTimeOffset GeaendertAm { get; set; }

    public Guid GeaendertVon { get; set; }
}

/// <summary>Persistenzmodell der Tabelle <c>startseite_logo</c> (Abschnitt 4.2): je Platz höchstens eine Zeile.</summary>
public sealed class StartseiteLogoDatensatz
{
    public string Platz { get; set; } = string.Empty;

    public byte[] Inhalt { get; set; } = [];

    public string Format { get; set; } = string.Empty;

    public int GroesseBytes { get; set; }

    public int Breite { get; set; }

    public int Hoehe { get; set; }

    public string Sha256 { get; set; } = string.Empty;

    public string Alternativtext { get; set; } = string.Empty;

    public DateTimeOffset HochgeladenAm { get; set; }

    public Guid HochgeladenVon { get; set; }
}

/// <summary>
/// Persistenzmodell der Tabelle <c>startseite_audit</c> (Abschnitt 4.3): nur per SQL-INSERT, unveränderlich per Trigger,
/// ohne Textinhalte.
/// </summary>
public sealed class StartseiteAuditDatensatz
{
    public Guid Id { get; set; }

    public DateTimeOffset Zeitpunkt { get; set; }

    public Guid AkteurId { get; set; }

    public int Version { get; set; }

    public string Art { get; set; } = string.Empty;

    public string? Ziel { get; set; }

    public string? Alt { get; set; }

    public string? Neu { get; set; }
}
