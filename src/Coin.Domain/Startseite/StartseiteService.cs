using System.Security.Cryptography;

namespace Coin.Domain.Startseite;

/// <summary>
/// Use Cases der Startseite (Feature startseite, ADR-0030 bis ADR-0032): Anzeige, öffentlicher Kopfbereich, Logos,
/// Konfiguration lesen und als Ganzes speichern (Validierung, Versionsprüfung, Audit in einer Transaktion).
/// Kein Cache (ADR-0030 Punkt 8); keine Protokollierung von Inhalten.
/// </summary>
public sealed class StartseiteService(IStartseiteRepository repository, TimeProvider zeit)
{
    /// <summary>Höchstanzahl der Vorschaudaten (AK-7).</summary>
    public const int VorschauNeueste = StartseiteKonfiguration.NeuesteMax;

    public const int VorschauMeistausgegebene = StartseiteKonfiguration.MeistausgegebeneMax;

    private const string UngueltigerWert = "Ungültiger Wert für dieses Feld.";

    /// <summary>Aktive Blöcke mit ihren Daten (AK-2); Daten inaktiver Blöcke werden nicht abgefragt.</summary>
    public async Task<StartseiteDaten> StartseiteAsync(CancellationToken ct)
    {
        var konfiguration = (await repository.StandAsync(ct)).Konfiguration;
        var kennzahlen = konfiguration.KennzahlenAktiv ? await repository.KennzahlenAsync(ct) : null;
        var neueste = konfiguration.NeuesteAktiv ? await repository.NeuesteAsync(konfiguration.NeuesteAnzahl, ct) : null;
        var meist = konfiguration.MeistausgegebeneAktiv
            ? await repository.MeistausgegebeneAsync(konfiguration.MeistausgegebeneAnzahl, ct)
            : null;
        return new StartseiteDaten(konfiguration, kennzahlen, neueste, meist);
    }

    /// <summary>Öffentlicher Kopfbereich (AK-37) aus genau einer Abfrage.</summary>
    public async Task<KopfAnsicht> KopfAsync(CancellationToken ct) => (await repository.StandAsync(ct)).Konfiguration.KopfAnsicht();

    /// <summary>Konfiguration mit Vorschaudaten (AK-7).</summary>
    public async Task<StartseiteKonfigurationsDaten> KonfigurationAsync(CancellationToken ct)
    {
        var stand = await repository.StandAsync(ct);
        var kennzahlen = await repository.KennzahlenAsync(ct);
        var neueste = await repository.NeuesteAsync(VorschauNeueste, ct);
        var meist = await repository.MeistausgegebeneAsync(VorschauMeistausgegebene, ct);
        return new StartseiteKonfigurationsDaten(stand, kennzahlen, neueste, meist);
    }

    /// <summary>Logo eines Platzes; <c>null</c> bei unbekanntem Platz oder ohne Logo (AK-12).</summary>
    public Task<LogoDatei?> LogoAsync(string? platz, CancellationToken ct) =>
        StartseiteNamen.PlatzAus(platz) is { } p ? repository.LogoAsync(p, ct) : Task.FromResult<LogoDatei?>(null);

    /// <summary>
    /// Speichert die Konfiguration als Ganzes (AK-8 bis AK-13). Reihenfolge: Befunde gesammelt (400) → Version (409) →
    /// keine Änderung (200 ohne neue Version) → Schreiben mit Audit in einer Transaktion.
    /// </summary>
    public async Task<StartseiteSpeichernErgebnis> SpeichernAsync(StartseiteSpeichernAnfrage anfrage, Guid akteurId, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(anfrage);

        var fehler = new Dictionary<string, string[]>(anfrage.Eingabefehler, StringComparer.Ordinal);
        if (anfrage.Version < 0)
        {
            fehler.TryAdd("version", [UngueltigerWert]);
        }

        var pruefungen = new Dictionary<LogoPlatz, LogoPruefErgebnis>();
        foreach (var platz in StartseiteNamen.AllePlaetze)
        {
            if (anfrage.Datei(platz) is not { } datei)
            {
                continue;
            }

            var pruefung = LogoPruefung.Pruefen(datei);
            pruefungen[platz] = pruefung;
            if (pruefung.Meldung is { } meldung)
            {
                fehler.TryAdd(platz.Feld(), [meldung]);
            }

            if (anfrage.Konfiguration.Logo(platz) is null)
            {
                // 5.5: null mit Dateiteil meldet den fehlenden Alternativtext.
                fehler.TryAdd($"kopf.{platz.Feld()}.alternativtext", [$"Bitte einen Alternativtext für das Logo {platz.Genitiv()} eingeben."]);
            }
        }

        var geprueft = StartseiteKonfiguration.Pruefen(anfrage.Konfiguration);
        foreach (var (feld, meldungen) in geprueft.Fehler)
        {
            fehler.TryAdd(feld, meldungen);
        }

        await using var sperre = await repository.SperrenAsync(ct);
        var stand = sperre.Stand;

        foreach (var platz in StartseiteNamen.AllePlaetze)
        {
            if (anfrage.Konfiguration.Logo(platz) is not null && anfrage.Datei(platz) is null && stand.Konfiguration.Logo(platz) is null)
            {
                fehler.TryAdd(platz.Feld(), [$"Bitte eine Bilddatei für das Logo {platz.Genitiv()} auswählen."]);
            }
        }

        if (fehler.Count > 0 || geprueft.Wert is not { } bereinigt)
        {
            return new StartseiteSpeichernErgebnis.Ungueltig(fehler);
        }

        if (anfrage.Version != stand.Version)
        {
            return new StartseiteSpeichernErgebnis.Konflikt();
        }

        var logos = new List<LogoSchreiben>();
        var neu = bereinigt;
        foreach (var platz in StartseiteNamen.AllePlaetze)
        {
            var alt = stand.Konfiguration.Logo(platz);
            var angabe = bereinigt.Logo(platz);
            StartseiteLogo? ergebnis;
            if (angabe is null)
            {
                ergebnis = null;
                if (alt is not null)
                {
                    logos.Add(new LogoSchreiben.Entfernen(platz));
                }
            }
            else if (anfrage.Datei(platz) is { } datei)
            {
                var pruefung = pruefungen[platz];
                ergebnis = new StartseiteLogo(
                    Convert.ToHexStringLower(SHA256.HashData(datei)),
                    angabe.Alternativtext,
                    pruefung.Format!.Value,
                    pruefung.Breite,
                    pruefung.Hoehe,
                    datei.Length);
                if (alt is null || !string.Equals(alt.Sha256, ergebnis.Sha256, StringComparison.Ordinal))
                {
                    logos.Add(new LogoSchreiben.Setzen(platz, datei, ergebnis));
                }
                else
                {
                    // Gleiche Bytes gelten als unverändert (4.3); die gespeicherten Metadaten bleiben.
                    ergebnis = alt with { Alternativtext = angabe.Alternativtext };
                    if (!string.Equals(alt.Alternativtext, angabe.Alternativtext, StringComparison.Ordinal))
                    {
                        logos.Add(new LogoSchreiben.Alternativtext(platz, angabe.Alternativtext));
                    }
                }
            }
            else
            {
                ergebnis = alt! with { Alternativtext = angabe.Alternativtext };
                if (!string.Equals(alt.Alternativtext, angabe.Alternativtext, StringComparison.Ordinal))
                {
                    logos.Add(new LogoSchreiben.Alternativtext(platz, angabe.Alternativtext));
                }
            }

            neu = platz == LogoPlatz.Bereitsteller ? neu with { LogoBereitsteller = ergebnis } : neu with { LogoSoftware = ergebnis };
        }

        var aenderungen = StartseiteKonfiguration.Aenderungen(stand.Konfiguration, neu);
        if (aenderungen.Count == 0)
        {
            return new StartseiteSpeichernErgebnis.Gespeichert();
        }

        var vorgang = new StartseiteSchreibvorgang(stand.Version, stand.Version + 1, neu, logos, aenderungen, Jetzt(), akteurId);
        return await sperre.SchreibenAsync(vorgang, ct)
            ? new StartseiteSpeichernErgebnis.Gespeichert()
            : new StartseiteSpeichernErgebnis.Konflikt();
    }

    /// <summary>Aktuelle Zeit in UTC, auf Mikrosekunden gekürzt (Genauigkeit von PostgreSQL <c>timestamptz</c>).</summary>
    private DateTimeOffset Jetzt()
    {
        var jetzt = zeit.GetUtcNow();
        return jetzt.AddTicks(-(jetzt.Ticks % TimeSpan.TicksPerMicrosecond));
    }
}
