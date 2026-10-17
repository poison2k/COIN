using Coin.Domain.Gemeinsam;

namespace Coin.Domain.Ausgaben;

/// <summary>Datenzugriff für Exemplare und Ausgaben (coin-ausgaben, ADR-0020).</summary>
public interface IAusgabeRepository
{
    /// <summary>
    /// Beginnt eine Transaktion und sperrt die Coin-Zeile (<c>FOR UPDATE</c>, ADR-0020 Punkt 6). <c>null</c>, wenn der
    /// Coin unbekannt ist. Ohne <see cref="ICoinSperre.AbschliessenAsync"/> wird beim Entsorgen zurückgerollt.
    /// </summary>
    Task<ICoinSperre?> SperrenAsync(Guid coinId, CancellationToken ct);

    /// <summary>Kennzahlen und eine Seite Exemplare nach Nummer; <c>null</c> bei unbekanntem Coin.</summary>
    Task<ExemplarUebersicht?> ExemplareAsync(Guid coinId, ExemplarStatus? status, int seite, int groesse, CancellationToken ct);

    /// <summary>
    /// Eine Seite Ausgaben des Coins, neueste zuerst; <paramref name="storniert"/> <c>null</c> = alle.
    /// <c>null</c> bei unbekanntem Coin.
    /// </summary>
    Task<Seite<AusgabeEintrag>?> HistorieAsync(Guid coinId, bool? storniert, int seite, int groesse, CancellationToken ct);

    /// <summary>Eine Ausgabe in der Lesesicht oder <c>null</c>.</summary>
    Task<AusgabeEintrag?> FindenAsync(Guid ausgabeId, CancellationToken ct);

    /// <summary>Eine Ausgabe des Coins in der Lesesicht oder <c>null</c> (unbekannter Coin, unbekannte oder fremde Ausgabe).</summary>
    Task<AusgabeEintrag?> FindenAsync(Guid coinId, Guid ausgabeId, CancellationToken ct);
}

/// <summary>Gesperrte Coin-Zeile in einer laufenden Transaktion. Alle Änderungen werden erst mit Abschließen gültig.</summary>
public interface ICoinSperre : IAsyncDisposable
{
    /// <summary>Auflage des Coins zum Zeitpunkt der Sperre.</summary>
    int? Auflage { get; }

    /// <summary>Unveränderliche Kennung des Coins (zertifikat-erzeugen AK-1, ADR-0027).</summary>
    string Kennung { get; }

    /// <summary>Kleinste Nummer ohne aktive Ausgabe oder <c>null</c>, wenn alle ausgegeben sind.</summary>
    Task<int?> NaechsteFreieNummerAsync(CancellationToken ct);

    /// <summary>Ist das Exemplar aktiv (nicht storniert) ausgegeben?</summary>
    Task<bool> IstAusgegebenAsync(int nummer, CancellationToken ct);

    /// <summary>Höchste Nummer, die je ausgegeben war (aktiv oder storniert), oder <c>null</c>.</summary>
    Task<int?> HoechsteJeAusgegebeneNummerAsync(CancellationToken ct);

    /// <summary>
    /// Speichert eine neue Ausgabe samt Audit-Eintrag „Erfasst“. <c>false</c>, wenn einer der partiellen Indizes
    /// <c>ux_ausgabe_exemplar_aktiv</c> oder <c>ux_ausgabe_zertifikatsnummer_aktiv</c> verletzt wurde (die Transaktion ist
    /// dann nicht mehr verwendbar).
    /// </summary>
    Task<bool> AusgabeHinzufuegenAsync(Ausgabe ausgabe, CancellationToken ct);

    /// <summary>Eine Ausgabe dieses Coins oder <c>null</c>.</summary>
    Task<Ausgabe?> AusgabeLadenAsync(Guid ausgabeId, CancellationToken ct);

    /// <summary>Speichert das Storno einer Ausgabe samt Audit-Eintrag „Storniert“.</summary>
    Task StornoSpeichernAsync(Ausgabe ausgabe, CancellationToken ct);

    /// <summary>Setzt die Auflage und erzeugt die Exemplare <paramref name="von"/> bis <paramref name="bis"/>.</summary>
    Task AuflageErhoehenAsync(int auflage, int von, int bis, CancellationToken ct);

    /// <summary>Setzt die Auflage und löscht die Exemplare <paramref name="von"/> bis <paramref name="bis"/>.</summary>
    Task AuflageSenkenAsync(int auflage, int von, int bis, CancellationToken ct);

    /// <summary>Ist Name und Herausgeber (ohne Groß-/Kleinschreibung) bei einem anderen Coin vergeben?</summary>
    Task<bool> NameVergebenAsync(string name, string herausgeber, CancellationToken ct);

    /// <summary>
    /// Setzt Name, Herausgeber und Beschreibung. <c>false</c>, wenn der eindeutige Index für Name und Herausgeber
    /// verletzt wurde (die Transaktion ist dann nicht mehr verwendbar).
    /// </summary>
    Task<bool> StammdatenSetzenAsync(string name, string herausgeber, string? beschreibung, CancellationToken ct);

    /// <summary>Schreibt die Transaktion fest.</summary>
    Task AbschliessenAsync(CancellationToken ct);
}
