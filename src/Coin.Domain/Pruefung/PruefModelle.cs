using Coin.Domain.Ausgaben;

namespace Coin.Domain.Pruefung;

/// <summary>Ergebnisart einer Prüfung (hologrammnummer AK-16, ADR-0034 Punkt 2).</summary>
public enum PruefErgebnisArt
{
    Gueltig,
    Storniert,
    FalscherCoin,
    NichtGefunden,
}

/// <summary>
/// Datensatz zu einer aktuellen Hologrammnummer ohne Personendaten (ADR-0034 Punkt 1): Coin, Exemplar, Zertifikatsnummer,
/// Hologrammnummer (Anzeigeform), Ausgabedatum und Storno-Zeitpunkt (<c>null</c> = aktiv), nie ein Storno-Grund.
/// </summary>
public record PruefTreffer(
    Guid AusgabeId,
    Guid CoinId,
    string CoinName,
    int ExemplarNummer,
    string Zertifikatsnummer,
    string Hologrammnummer,
    DateOnly Datum,
    DateTimeOffset? StorniertAm)
{
    /// <summary>Ohne Werte (keine Nummern in Logs).</summary>
    public sealed override string ToString() => GetType().Name;
}

/// <summary>Treffer mit den Angaben der Ausgabe (nur für <c>issues.read</c>); ohne Storno-Grund und ohne Erfasser.</summary>
public sealed record PruefTrefferMitEmpfaenger(
    Guid AusgabeId,
    Guid CoinId,
    string CoinName,
    int ExemplarNummer,
    string Zertifikatsnummer,
    string Hologrammnummer,
    DateOnly Datum,
    DateTimeOffset? StorniertAm,
    AusgabeAngaben Angaben)
    : PruefTreffer(AusgabeId, CoinId, CoinName, ExemplarNummer, Zertifikatsnummer, Hologrammnummer, Datum, StorniertAm);

/// <summary>Ein Eintrag in <c>pruefung_audit</c> (ADR-0034 Punkt 5), ohne Empfängerdaten.</summary>
public sealed record PruefAuditEintrag(
    Guid AkteurId,
    DateTimeOffset Zeitpunkt,
    string Nummer,
    Guid? CoinIdGewaehlt,
    PruefErgebnisArt Ergebnis,
    Guid? AusgabeId,
    bool MitEmpfaenger)
{
    public override string ToString() => nameof(PruefAuditEintrag);
}

/// <summary>Ergebnis von <see cref="PruefService.PruefenAsync"/>.</summary>
public abstract record PruefenErgebnis
{
    private PruefenErgebnis()
    {
    }

    public sealed record Ungueltig(IReadOnlyDictionary<string, string[]> Fehler) : PruefenErgebnis;

    /// <summary><paramref name="Treffer"/> nur bei <see cref="PruefErgebnisArt.Gueltig"/> und <see cref="PruefErgebnisArt.Storniert"/>.</summary>
    public sealed record Geprueft(PruefErgebnisArt Art, PruefTreffer? Treffer) : PruefenErgebnis
    {
        public override string ToString() => nameof(Geprueft);
    }
}

/// <summary>Datenzugriff der Prüfung (ADR-0034).</summary>
public interface IPruefRepository
{
    /// <summary>
    /// Aktuelle (nicht abgelöste) Zuordnung zur Normalform in genau einer Abfrage; mit <paramref name="mitEmpfaenger"/>
    /// ein <see cref="PruefTrefferMitEmpfaenger"/>, sonst ohne Empfängerspalten. <c>null</c>, wenn keine Zuordnung besteht.
    /// </summary>
    Task<PruefTreffer?> TrefferAsync(string normalform, bool mitEmpfaenger, CancellationToken ct);

    /// <summary>Schreibt den Eintrag in <c>pruefung_audit</c>.</summary>
    Task AuditSchreibenAsync(PruefAuditEintrag eintrag, CancellationToken ct);
}
