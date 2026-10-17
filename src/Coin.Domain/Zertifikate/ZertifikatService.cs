namespace Coin.Domain.Zertifikate;

/// <summary>
/// Zertifikat einer Ausgabe herunterladen (zertifikat-erzeugen AK-7 bis AK-21, ADR-0028, ADR-0029). Reihenfolge:
/// Ausgabe des Coins (404) → storniert (409) → Erzeugung aus der aktiven Vorlage bzw. der Zertifikatsfassung der
/// Standardvorlage (409 zu viele Platzhalter, 500) → Audit atomar mit der Storno-Prüfung (409). Nur ein erfolgreicher
/// Download schreibt einen Audit-Eintrag.
/// </summary>
public sealed class ZertifikatService(
    IZertifikatRepository repository,
    IZertifikatErzeuger erzeuger,
    IStandardzertifikat standardzertifikat,
    IZertifikatProtokoll protokoll,
    TimeProvider zeit)
{
    public async Task<ZertifikatHerunterladenErgebnis> HerunterladenAsync(
        Guid coinId, Guid ausgabeId, Guid akteurId, CancellationToken ct)
    {
        if (await repository.LadenAsync(coinId, ausgabeId, ct) is not { } quelle)
        {
            return new ZertifikatHerunterladenErgebnis.NichtGefunden();
        }

        var ausgabe = quelle.Ausgabe;
        if (ausgabe.Storno is not null)
        {
            return new ZertifikatHerunterladenErgebnis.Storniert();
        }

        var vorlage = quelle.VorlageInhalt ?? standardzertifikat.Inhalt;
        var version = quelle.VorlageInhalt is null ? null : quelle.VorlageVersion;

        ZertifikatErzeugenErgebnis ergebnis;
        try
        {
            ergebnis = await erzeuger.ErzeugenAsync(vorlage, ZertifikatWerte.Aus(quelle.Coin, ausgabe), ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            // Jede Ausnahme wird ohne Details zum festen Fehler; ihr Text kann Dokumentinhalt oder Werte enthalten
            // (ADR-0028 Punkt 9). Das Ausnahmeobjekt geht deshalb auch nicht ins Protokoll.
            ergebnis = new ZertifikatErzeugenErgebnis.Fehlgeschlagen();
        }

        switch (ergebnis)
        {
            case ZertifikatErzeugenErgebnis.Erzeugt erzeugt:
                var eintrag = new ZertifikatAuditEintrag(Jetzt(), akteurId, ausgabe.Id, coinId, ausgabe.Zertifikatsnummer, version);
                return await repository.AuditSchreibenAsync(eintrag, ct)
                    ? new ZertifikatHerunterladenErgebnis.Datei(erzeugt.Inhalt, ausgabe.Zertifikatsnummer)
                    : new ZertifikatHerunterladenErgebnis.Storniert();
            case ZertifikatErzeugenErgebnis.ZuVielePlatzhalter:
                return new ZertifikatHerunterladenErgebnis.ZuVielePlatzhalter();
            default:
                protokoll.ErzeugungFehlgeschlagen();
                return new ZertifikatHerunterladenErgebnis.Fehlgeschlagen();
        }
    }

    /// <summary>Aktuelle Zeit in UTC, auf Mikrosekunden gekürzt (Genauigkeit von PostgreSQL <c>timestamptz</c>).</summary>
    private DateTimeOffset Jetzt()
    {
        var jetzt = zeit.GetUtcNow().ToUniversalTime();
        return jetzt.AddTicks(-(jetzt.Ticks % TimeSpan.TicksPerMicrosecond));
    }
}
