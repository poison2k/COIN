using Coin.Domain.Katalog;

namespace Coin.Domain.Startseite;

/// <summary>Gesamtkennzahlen (AK-3, Entscheidung S2): <c>verfuegbar</c> = Exemplare − aktive Ausgaben.</summary>
public sealed record StartseiteKennzahlen(int Coins, long Exemplare, int Ausgegeben)
{
    public long Verfuegbar => Exemplare - Ausgegeben;
}

/// <summary>Eintrag „Neueste Coins“ (AK-4); <see cref="BildSha256"/> <c>null</c> ohne Motivbild.</summary>
public sealed record NeuerCoin(Guid Id, string Name, string Herausgeber, string? BildSha256);

/// <summary>Eintrag „Meistausgegebene Coins“ (AK-5): Anzahl aktiver Ausgaben, nie Empfängerdaten.</summary>
public sealed record AusgegebenerCoin(Guid Id, string Name, string Herausgeber, int Ausgegeben);

/// <summary>
/// Gespeicherter Stand: Konfiguration samt Logo-Metadaten, Version (0 = Standard) und letzte Änderung. Der Anzeigename
/// des Speichernden wird nur mit <c>startpage.manage</c> ausgegeben (S11).
/// </summary>
public sealed record StartseiteStand(
    StartseiteKonfiguration Konfiguration,
    int Version,
    DateTimeOffset? GeaendertAm,
    string? GeaendertVon)
{
    public bool IstStandard => Version == 0;

    public static StartseiteStand Standard { get; } = new(StartseiteKonfiguration.Standard, 0, null, null);

    public override string ToString() => nameof(StartseiteStand);
}

/// <summary>Daten für <c>GET /api/startseite</c> (AK-2): nur die aktiven Blöcke werden abgefragt.</summary>
public sealed record StartseiteDaten(
    StartseiteKonfiguration Konfiguration,
    StartseiteKennzahlen? Kennzahlen,
    IReadOnlyList<NeuerCoin>? Neueste,
    IReadOnlyList<AusgegebenerCoin>? Meistausgegebene);

/// <summary>Daten für <c>GET /api/startseite/konfiguration</c> (AK-7) mit Vorschaudaten in Höchstanzahl.</summary>
public sealed record StartseiteKonfigurationsDaten(
    StartseiteStand Stand,
    StartseiteKennzahlen Kennzahlen,
    IReadOnlyList<NeuerCoin> Neueste,
    IReadOnlyList<AusgegebenerCoin> Meistausgegebene);

/// <summary>Ein Logo mit Bytes für die Auslieferung (AK-12).</summary>
public sealed record LogoDatei(byte[] Inhalt, BildFormat Format, string Sha256);

/// <summary>
/// Anfrage zum Speichern (Abschnitt 5.4). <see cref="Konfiguration"/> trägt bei Logos nur den Alternativtext
/// (<c>null</c> = entfernen); die Dateien kommen getrennt. <see cref="Eingabefehler"/> sind Befunde beim Lesen des JSON
/// (falscher Typ, fehlendes Feld), die mit allen übrigen Befunden gemeinsam gemeldet werden (AK-9).
/// </summary>
public sealed record StartseiteSpeichernAnfrage(
    int Version,
    StartseiteKonfiguration Konfiguration,
    byte[]? DateiBereitsteller,
    byte[]? DateiSoftware,
    IReadOnlyDictionary<string, string[]> Eingabefehler)
{
    public byte[]? Datei(LogoPlatz platz) => platz == LogoPlatz.Bereitsteller ? DateiBereitsteller : DateiSoftware;

    public override string ToString() => nameof(StartseiteSpeichernAnfrage);
}

/// <summary>Was mit einem Logo-Platz beim Speichern geschieht.</summary>
public abstract record LogoSchreiben
{
    private LogoSchreiben()
    {
    }

    /// <summary>Neues oder ersetztes Logo mit Bytes.</summary>
    public sealed record Setzen(LogoPlatz Platz, byte[] Inhalt, StartseiteLogo Logo) : LogoSchreiben
    {
        public override string ToString() => nameof(Setzen);
    }

    /// <summary>Gleiche Bytes, neuer Alternativtext.</summary>
    public sealed record Alternativtext(LogoPlatz Platz, string Text) : LogoSchreiben
    {
        public override string ToString() => nameof(Alternativtext);
    }

    public sealed record Entfernen(LogoPlatz Platz) : LogoSchreiben;
}

/// <summary>Ein Speichervorgang: neue Konfiguration, Logo-Änderungen und Audit-Einträge in einer Transaktion.</summary>
public sealed record StartseiteSchreibvorgang(
    int AlteVersion,
    int NeueVersion,
    StartseiteKonfiguration Konfiguration,
    IReadOnlyList<LogoSchreiben> Logos,
    IReadOnlyList<StartseiteAenderung> Aenderungen,
    DateTimeOffset Zeitpunkt,
    Guid AkteurId)
{
    public override string ToString() => nameof(StartseiteSchreibvorgang);
}

/// <summary>Ergebnis von <see cref="StartseiteService.SpeichernAsync"/>.</summary>
public abstract record StartseiteSpeichernErgebnis
{
    private StartseiteSpeichernErgebnis()
    {
    }

    /// <summary>Gespeichert oder ohne inhaltliche Änderung (dann ohne neue Version und ohne Audit).</summary>
    public sealed record Gespeichert : StartseiteSpeichernErgebnis;

    public sealed record Ungueltig(IReadOnlyDictionary<string, string[]> Fehler) : StartseiteSpeichernErgebnis;

    /// <summary>Version veraltet oder gleichzeitig gespeichert (AK-13).</summary>
    public sealed record Konflikt : StartseiteSpeichernErgebnis;
}

/// <summary>Datenzugriff der Startseite. Lesen ohne Logo-Bytes außer <see cref="LogoAsync"/> (Abschnitt 4.2, 6).</summary>
public interface IStartseiteRepository
{
    /// <summary>Konfiguration und Logo-Metadaten in einem Befehl; ohne Zeile <see cref="StartseiteStand.Standard"/>.</summary>
    Task<StartseiteStand> StandAsync(CancellationToken ct);

    Task<StartseiteKennzahlen> KennzahlenAsync(CancellationToken ct);

    Task<IReadOnlyList<NeuerCoin>> NeuesteAsync(int anzahl, CancellationToken ct);

    Task<IReadOnlyList<AusgegebenerCoin>> MeistausgegebeneAsync(int anzahl, CancellationToken ct);

    Task<LogoDatei?> LogoAsync(LogoPlatz platz, CancellationToken ct);

    /// <summary>Beginnt eine Transaktion und sperrt die Konfigurationszeile (<c>FOR UPDATE</c>, ADR-0030 Punkt 5).</summary>
    Task<IStartseiteSperre> SperrenAsync(CancellationToken ct);
}

/// <summary>Gesperrter Stand in einer laufenden Transaktion; ohne <see cref="SchreibenAsync"/> wird zurückgerollt.</summary>
public interface IStartseiteSperre : IAsyncDisposable
{
    StartseiteStand Stand { get; }

    /// <summary>Schreibt Konfiguration, Logos und Audit und bestätigt; <c>false</c> bei gleichzeitigem Speichern.</summary>
    Task<bool> SchreibenAsync(StartseiteSchreibvorgang vorgang, CancellationToken ct);
}
