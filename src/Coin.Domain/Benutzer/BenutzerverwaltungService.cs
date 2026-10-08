using Coin.Domain.Gemeinsam;

namespace Coin.Domain.Benutzer;

/// <summary>Ergebnis einer Rollen- oder Statusänderung (ADR-0018).</summary>
public abstract record AenderungErgebnis
{
    private AenderungErgebnis()
    {
    }

    public sealed record Geaendert(Benutzer Benutzer) : AenderungErgebnis;

    public sealed record Unveraendert(Benutzer Benutzer) : AenderungErgebnis;

    public sealed record NichtGefunden : AenderungErgebnis;

    public sealed record AkteurNichtBerechtigt : AenderungErgebnis;

    public sealed record EigenesKonto : AenderungErgebnis;

    public sealed record LetzterAdministrator : AenderungErgebnis;
}

/// <summary>
/// Benutzerverwaltung: Rolle zuweisen, Status setzen, Benutzer auflisten, Audit lesen (AK-11 bis AK-19).
/// Änderungen laufen unter der Sperre; Akteur, Ziel und Zahl der aktiven Administratoren werden erst darin gelesen.
/// </summary>
public sealed class BenutzerverwaltungService(IBenutzerverwaltungRepository repository, TimeProvider zeit)
{
    public Task<AenderungErgebnis> RolleZuweisenAsync(Guid akteurId, Guid zielId, Rolle? rolle, CancellationToken ct) =>
        AendernAsync(akteurId, zielId, new Aenderung.RolleSetzen(rolle), ct);

    public Task<AenderungErgebnis> StatusSetzenAsync(Guid akteurId, Guid zielId, bool aktiv, CancellationToken ct) =>
        AendernAsync(akteurId, zielId, new Aenderung.StatusSetzen(aktiv), ct);

    /// <summary>Benutzerliste (AK-11). Fehler je Feld: <c>suche</c>, <c>seite</c>, <c>groesse</c>.</summary>
    public async Task<Ergebnis<Seite<Benutzer>>> AuflistenAsync(string? suche, int? seite, int? groesse, CancellationToken ct)
    {
        var fehler = Seitenabfrage.Fehler(suche, seite, groesse);
        if (fehler.Count > 0)
        {
            return Ergebnis<Seite<Benutzer>>.Fehlschlag(fehler);
        }

        var liste = await repository.SuchenAsync(
            Seitenabfrage.Suchbegriff(suche), seite ?? 1, groesse ?? Seitenabfrage.StandardGroesse, ct);
        return Ergebnis<Seite<Benutzer>>.Erfolg(liste);
    }

    /// <summary>Audit-Log (AK-14). Fehler je Feld: <c>seite</c>, <c>groesse</c>.</summary>
    public async Task<Ergebnis<Seite<AuditEintragAnsicht>>> AuditLesenAsync(Guid? benutzerId, int? seite, int? groesse, CancellationToken ct)
    {
        var fehler = Seitenabfrage.SeiteFehler(seite, groesse);
        if (fehler.Count > 0)
        {
            return Ergebnis<Seite<AuditEintragAnsicht>>.Fehlschlag(fehler);
        }

        var liste = await repository.AuditSeiteAsync(benutzerId, seite ?? 1, groesse ?? Seitenabfrage.StandardGroesse, ct);
        return Ergebnis<Seite<AuditEintragAnsicht>>.Erfolg(liste);
    }

    private Task<AenderungErgebnis> AendernAsync(Guid akteurId, Guid zielId, Aenderung aenderung, CancellationToken ct) =>
        repository.InSperreAsync<AenderungErgebnis>(async sitzung =>
        {
            var akteur = await sitzung.LadenAsync(akteurId, ct);
            var ziel = akteurId == zielId ? akteur : await sitzung.LadenAsync(zielId, ct);
            var anzahl = await sitzung.AnzahlAktiverAdministratorenAsync(ct);

            switch (Schutzregeln.Pruefen(akteur, ziel, aenderung, anzahl))
            {
                case Schutzpruefung.NichtGefunden:
                    return new AenderungErgebnis.NichtGefunden();
                case Schutzpruefung.Unveraendert:
                    return new AenderungErgebnis.Unveraendert(ziel!);
                case Schutzpruefung.AkteurNichtBerechtigt:
                    return new AenderungErgebnis.AkteurNichtBerechtigt();
                case Schutzpruefung.EigenesKonto:
                    return new AenderungErgebnis.EigenesKonto();
                case Schutzpruefung.LetzterAdministrator:
                    return new AenderungErgebnis.LetzterAdministrator();
                case Schutzpruefung.Erlaubt:
                    break;
                default:
                    throw new InvalidOperationException("Unbekanntes Ergebnis der Schutzregeln.");
            }

            var jetzt = Jetzt();
            var neu = Schutzregeln.Anwenden(ziel!, aenderung, jetzt);
            await sitzung.SpeichernAsync(neu, AuditFuer(akteur!.Id, ziel!, neu, aenderung, jetzt), ct);
            return new AenderungErgebnis.Geaendert(neu);
        }, ct);

    private static AuditEintrag AuditFuer(Guid akteurId, Benutzer alt, Benutzer neu, Aenderung aenderung, DateTimeOffset jetzt) =>
        aenderung switch
        {
            Aenderung.RolleSetzen => new AuditEintrag(
                Guid.CreateVersion7(jetzt), jetzt, akteurId, alt.Id, AuditArt.Rolle,
                AuditEintrag.RolleWert(alt.Rolle), AuditEintrag.RolleWert(neu.Rolle)),
            Aenderung.StatusSetzen => new AuditEintrag(
                Guid.CreateVersion7(jetzt), jetzt, akteurId, alt.Id, AuditArt.Status,
                AuditEintrag.StatusWert(alt.Aktiv), AuditEintrag.StatusWert(neu.Aktiv)),
            _ => throw new ArgumentOutOfRangeException(nameof(aenderung)),
        };

    /// <summary>UTC, auf Mikrosekunden gekürzt (Auflösung von PostgreSQL <c>timestamptz</c>).</summary>
    private DateTimeOffset Jetzt()
    {
        var jetzt = zeit.GetUtcNow().ToUniversalTime();
        return jetzt.AddTicks(-(jetzt.Ticks % TimeSpan.TicksPerMicrosecond));
    }
}
