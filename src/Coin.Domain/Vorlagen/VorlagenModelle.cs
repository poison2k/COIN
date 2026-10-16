using Coin.Domain.Ausgaben;

namespace Coin.Domain.Vorlagen;

/// <summary>Eine gespeicherte Version der Zertifikatsvorlage eines Coins (ohne Inhalt, ADR-0023 Punkt 8).</summary>
public sealed record VorlagenVersion(int Version, int GroesseBytes, DateTimeOffset HochgeladenAm, Akteur HochgeladenVon);

/// <summary>
/// Vorlagenstatus eines Coins (AK-17): aktive Version (<c>null</c> = Standardvorlage) und alle Versionen, neueste zuerst.
/// </summary>
public sealed record VorlagenStatus(int? AktiveVersion, IReadOnlyList<VorlagenVersion> Versionen)
{
    public bool IstStandard => AktiveVersion is null;
}

/// <summary>Neue, geprüfte und bereinigte Version zum Speichern.</summary>
public sealed record NeueVorlage(Guid CoinId, byte[] Inhalt, string Sha256, DateTimeOffset HochgeladenAm, Guid HochgeladenVon);

/// <summary>Arten der Einträge in <c>vorlage_audit</c> (AK-21, ADR-0023 Punkt 7).</summary>
public static class VorlageAuditArt
{
    /// <summary>Upload, während die Standardvorlage aktiv war.</summary>
    public const string Hochgeladen = "Hochgeladen";

    /// <summary>Upload, während bereits eine eigene Version aktiv war.</summary>
    public const string Ersetzt = "Ersetzt";

    /// <summary>Wirksames Zurücksetzen auf die Standardvorlage.</summary>
    public const string Zurueckgesetzt = "Zurueckgesetzt";

    /// <summary>Art eines Uploads abhängig von der bis dahin aktiven Version.</summary>
    public static string FuerUpload(int? vorherigeVersion) => vorherigeVersion is null ? Hochgeladen : Ersetzt;
}

/// <summary>Port: liefert die Standardvorlage (im Backend erzeugt, je Prozess im Speicher, ADR-0022).</summary>
public interface IStandardvorlage
{
    byte[] Inhalt { get; }
}

/// <summary>Ergebnis eines Downloads: Inhalt und Version (<c>null</c> = Standardvorlage).</summary>
public abstract record VorlageDateiErgebnis
{
    private VorlageDateiErgebnis()
    {
    }

    public sealed record Datei(byte[] Inhalt, int? Version) : VorlageDateiErgebnis;

    public sealed record CoinNichtGefunden : VorlageDateiErgebnis;

    public sealed record VorlageNichtGefunden : VorlageDateiErgebnis;
}

/// <summary>Ergebnis von <see cref="ZertifikatsvorlageService.HochladenAsync"/>.</summary>
public abstract record VorlageHochladenErgebnis
{
    private VorlageHochladenErgebnis()
    {
    }

    public sealed record Gespeichert(VorlagenStatus Status) : VorlageHochladenErgebnis;

    public sealed record CoinNichtGefunden : VorlageHochladenErgebnis;

    public sealed record Leer : VorlageHochladenErgebnis;

    public sealed record ZuGross : VorlageHochladenErgebnis;

    public sealed record Abgelehnt(IReadOnlyList<string> Meldungen) : VorlageHochladenErgebnis;
}

/// <summary>Datenzugriff für Zertifikatsvorlagen (ADR-0023).</summary>
public interface IZertifikatsvorlageRepository
{
    Task<bool> CoinExistiertAsync(Guid coinId, CancellationToken ct);

    /// <summary>Status ohne Dateiinhalte; <c>null</c> bei unbekanntem Coin.</summary>
    Task<VorlagenStatus?> StatusAsync(Guid coinId, CancellationToken ct);

    /// <summary>
    /// Aktive Version mit Inhalt: <c>null</c> bei unbekanntem Coin, sonst (Version, Inhalt) bzw. (<c>null</c>,
    /// <c>null</c>) für die Standardvorlage.
    /// </summary>
    Task<(int? Version, byte[]? Inhalt)?> AktiveAsync(Guid coinId, CancellationToken ct);

    /// <summary>Inhalt einer Version oder <c>null</c>.</summary>
    Task<byte[]?> VersionInhaltAsync(Guid coinId, int version, CancellationToken ct);

    /// <summary>
    /// Speichert unter der Coin-Sperre die nächste Version (<c>max + 1</c>), setzt den Zeiger und schreibt das Audit in
    /// einer Transaktion. <c>false</c>, wenn der Coin unbekannt ist.
    /// </summary>
    Task<bool> VersionHinzufuegenAsync(NeueVorlage vorlage, CancellationToken ct);

    /// <summary>
    /// Setzt unter der Coin-Sperre den Zeiger auf die Standardvorlage und schreibt das Audit, falls eine eigene Version
    /// aktiv war. <c>false</c>, wenn der Coin unbekannt ist.
    /// </summary>
    Task<bool> ZuruecksetzenAsync(Guid coinId, Guid akteurId, DateTimeOffset zeitpunkt, CancellationToken ct);
}
