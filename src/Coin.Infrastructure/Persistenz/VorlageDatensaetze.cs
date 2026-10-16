namespace Coin.Infrastructure.Persistenz;

/// <summary>
/// Persistenzmodell der Tabelle <c>zertifikat_vorlage</c> (zertifikatsvorlagen Abschnitt 6, ADR-0023): unveränderliche
/// Versionen der bereinigten Vorlage je Coin. Kein Dateiname, kein Content-Type.
/// </summary>
public sealed class ZertifikatVorlageDatensatz
{
    public Guid Id { get; set; }

    public Guid CoinId { get; set; }

    public int Version { get; set; }

    public byte[] Inhalt { get; set; } = [];

    public int GroesseBytes { get; set; }

    public string Sha256 { get; set; } = string.Empty;

    public DateTimeOffset HochgeladenAm { get; set; }

    public Guid HochgeladenVon { get; set; }

    public BenutzerDatensatz Hochladender { get; set; } = null!;
}

/// <summary>Persistenzmodell der Tabelle <c>vorlage_audit</c> (AK-21, ADR-0023 Punkt 7). Unveränderlich per Trigger.</summary>
public sealed class VorlageAuditDatensatz
{
    public Guid Id { get; set; }

    public DateTimeOffset Zeitpunkt { get; set; }

    public Guid AkteurId { get; set; }

    public Guid CoinId { get; set; }

    public string Art { get; set; } = string.Empty;

    public int? Version { get; set; }

    public int? VorherigeVersion { get; set; }
}
