using System.Security.Cryptography;

namespace Coin.Domain.Vorlagen;

/// <summary>
/// Use Cases der Zertifikatsvorlagen (zertifikatsvorlagen AK-2 bis AK-21, ADR-0023, ADR-0024): Standardvorlage, Status,
/// Downloads, Upload mit Prüfung und Bereinigung, Zurücksetzen.
/// </summary>
public sealed class ZertifikatsvorlageService(
    IZertifikatsvorlageRepository repository,
    VorlagenAufbereitung aufbereitung,
    IStandardvorlage standardvorlage,
    TimeProvider zeit)
{
    public byte[] Standardvorlage() => standardvorlage.Inhalt;

    public Task<VorlagenStatus?> StatusAsync(Guid coinId, CancellationToken ct) => repository.StatusAsync(coinId, ct);

    /// <summary>Aktive Vorlage; ohne eigene Vorlage die Standardvorlage (AK-18).</summary>
    public async Task<VorlageDateiErgebnis> AktiveDateiAsync(Guid coinId, CancellationToken ct)
    {
        if (await repository.AktiveAsync(coinId, ct) is not { } aktiv)
        {
            return new VorlageDateiErgebnis.CoinNichtGefunden();
        }

        return aktiv is { Version: { } version, Inhalt: { } inhalt }
            ? new VorlageDateiErgebnis.Datei(inhalt, version)
            : new VorlageDateiErgebnis.Datei(standardvorlage.Inhalt, null);
    }

    /// <summary>Eine bestimmte Version (AK-18, nur Herunterladen, F6).</summary>
    public async Task<VorlageDateiErgebnis> VersionDateiAsync(Guid coinId, int version, CancellationToken ct)
    {
        if (!await repository.CoinExistiertAsync(coinId, ct))
        {
            return new VorlageDateiErgebnis.CoinNichtGefunden();
        }

        var inhalt = version >= 1 ? await repository.VersionInhaltAsync(coinId, version, ct) : null;
        return inhalt is null
            ? new VorlageDateiErgebnis.VorlageNichtGefunden()
            : new VorlageDateiErgebnis.Datei(inhalt, version);
    }

    /// <summary>
    /// Upload (AK-7 bis AK-16, AK-19, AK-21). Reihenfolge: Größe → Coin (404) → Prüfung, Bereinigung und Nachprüfung
    /// (ohne Sperre) → Speichern unter der Coin-Sperre.
    /// </summary>
    public async Task<VorlageHochladenErgebnis> HochladenAsync(Guid coinId, byte[] inhalt, Guid akteurId, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(inhalt);

        if (inhalt.Length == 0)
        {
            return new VorlageHochladenErgebnis.Leer();
        }

        if (inhalt.Length > VorlagenAufbereitung.MaxGroesseBytes)
        {
            return new VorlageHochladenErgebnis.ZuGross();
        }

        if (!await repository.CoinExistiertAsync(coinId, ct))
        {
            return new VorlageHochladenErgebnis.CoinNichtGefunden();
        }

        // Höchstens zwei Aufbereitungen gleichzeitig (AK-12): Der Platz wird erst nach dem 404-Check belegt und vor dem
        // Speichern unter der Coin-Sperre wieder freigegeben, auch bei Fehlern.
        byte[] bereinigt;
        switch (await aufbereitung.AufbereitenAsync(inhalt, ct))
        {
            case VorlageAufbereitenErgebnis.Angenommen angenommen:
                bereinigt = angenommen.Inhalt;
                break;
            case VorlageAufbereitenErgebnis.Abgelehnt abgelehnt:
                return new VorlageHochladenErgebnis.Abgelehnt(abgelehnt.Meldungen);
            default:
                throw new InvalidOperationException("Unbekanntes Ergebnis der Aufbereitung.");
        }

        var neu = new NeueVorlage(coinId, bereinigt, Convert.ToHexStringLower(SHA256.HashData(bereinigt)), Jetzt(), akteurId);
        if (!await repository.VersionHinzufuegenAsync(neu, ct))
        {
            return new VorlageHochladenErgebnis.CoinNichtGefunden();
        }

        return new VorlageHochladenErgebnis.Gespeichert(await GespeichertAsync(coinId, ct));
    }

    /// <summary>Zurücksetzen auf die Standardvorlage (AK-20); <c>null</c> bei unbekanntem Coin.</summary>
    public async Task<VorlagenStatus?> ZuruecksetzenAsync(Guid coinId, Guid akteurId, CancellationToken ct)
    {
        if (!await repository.ZuruecksetzenAsync(coinId, akteurId, Jetzt(), ct))
        {
            return null;
        }

        return await GespeichertAsync(coinId, ct);
    }

    private async Task<VorlagenStatus> GespeichertAsync(Guid coinId, CancellationToken ct) =>
        await repository.StatusAsync(coinId, ct)
        ?? throw new InvalidOperationException("Vorlagenstatus nach dem Speichern nicht gefunden.");

    /// <summary>Aktuelle Zeit in UTC, auf Mikrosekunden gekürzt (Genauigkeit von PostgreSQL <c>timestamptz</c>).</summary>
    private DateTimeOffset Jetzt()
    {
        var jetzt = zeit.GetUtcNow();
        return jetzt.AddTicks(-(jetzt.Ticks % TimeSpan.TicksPerMicrosecond));
    }
}
