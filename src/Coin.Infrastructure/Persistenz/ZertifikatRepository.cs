using Coin.Domain.Katalog;
using Coin.Domain.Zertifikate;
using Microsoft.EntityFrameworkCore;

namespace Coin.Infrastructure.Persistenz;

/// <summary>
/// Zertifikate (zertifikat-erzeugen, ADR-0028, ADR-0029): Ausgabe, aktueller Coin und aktive Vorlage in einer Abfrage;
/// Audit-Eintrag atomar mit der Storno-Prüfung per <c>INSERT … SELECT … WHERE storniert_am IS NULL</c>.
/// </summary>
internal sealed class ZertifikatRepository(CoinDbContext db) : IZertifikatRepository
{
    public async Task<ZertifikatQuelle?> LadenAsync(Guid coinId, Guid ausgabeId, CancellationToken ct)
    {
        var zeile = await (
                from a in db.Ausgaben.AsNoTracking()
                join c in db.Coins.AsNoTracking() on a.CoinId equals c.Id
                where a.Id == ausgabeId && a.CoinId == coinId
                select new
                {
                    Ausgabe = a,
                    ErfasserName = a.Erfasser.Anzeigename,
                    StorniererName = a.Stornierer != null ? a.Stornierer.Anzeigename : null,
                    c.Name,
                    c.Herausgeber,
                    c.Auflage,
                    c.Beschreibung,
                    c.ErstelltAm,
                    c.AktiveVorlageVersion,
                    // Zeiger und Inhalt aus demselben Snapshot (AK-8).
                    Inhalt = db.Vorlagen
                        .Where(v => v.CoinId == c.Id && v.Version == c.AktiveVorlageVersion)
                        .Select(v => v.Inhalt)
                        .FirstOrDefault(),
                })
            .FirstOrDefaultAsync(ct);
        if (zeile is null)
        {
            return null;
        }

        var coin = new CoinEintrag(
            coinId, zeile.Name, zeile.Herausgeber, zeile.Auflage, zeile.Beschreibung, zeile.ErstelltAm.ToUniversalTime(), null);
        var ausgabe = AusgabeRepository.Eintrag(zeile.Ausgabe, zeile.ErfasserName, zeile.StorniererName);
        return zeile.AktiveVorlageVersion is { } version && zeile.Inhalt is { } inhalt
            ? new ZertifikatQuelle(coin, ausgabe, version, inhalt)
            : new ZertifikatQuelle(coin, ausgabe, null, null);
    }

    public async Task<bool> AuditSchreibenAsync(ZertifikatAuditEintrag eintrag, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(eintrag);

        // Ein Befehl: Ist die Ausgabe inzwischen storniert, wird keine Zeile eingefügt (ADR-0029 Punkt 4).
        var eingefuegt = await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO zertifikat_audit (id, zeitpunkt, akteur_id, ausgabe_id, coin_id, zertifikatsnummer, vorlage_version, art)
            SELECT {Guid.CreateVersion7()}, {eintrag.Zeitpunkt}, {eintrag.AkteurId}, a.id, a.coin_id, a.zertifikatsnummer,
                   CAST({eintrag.VorlageVersion} AS integer), {ZertifikatAuditEintrag.ArtHeruntergeladen}
              FROM ausgabe a
             WHERE a.id = {eintrag.AusgabeId} AND a.coin_id = {eintrag.CoinId} AND a.storniert_am IS NULL
            """,
            ct);
        return eingefuegt == 1;
    }
}
