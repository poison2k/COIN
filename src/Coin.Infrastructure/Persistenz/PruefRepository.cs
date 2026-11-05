using Coin.Domain.Ausgaben;
using Coin.Domain.Pruefung;
using Microsoft.EntityFrameworkCore;

namespace Coin.Infrastructure.Persistenz;

/// <summary>
/// Prüfung einer Hologrammnummer (hologrammnummer AK-16, ADR-0034): genau eine Abfrage über die aktuelle Zuordnung per
/// Normalform; ohne <c>mitEmpfaenger</c> werden die Empfängerspalten nicht gelesen. Audit per SQL-INSERT.
/// </summary>
internal sealed class PruefRepository(CoinDbContext db) : IPruefRepository
{
    public async Task<PruefTreffer?> TrefferAsync(string normalform, bool mitEmpfaenger, CancellationToken ct)
    {
        var basis =
            from h in db.Hologramme.AsNoTracking()
            join a in db.Ausgaben.AsNoTracking() on h.AusgabeId equals a.Id
            join c in db.Coins.AsNoTracking() on a.CoinId equals c.Id
            where h.NummerNormalisiert == normalform && h.AbgeloestAm == null
            select new { h, a, c };

        if (!mitEmpfaenger)
        {
            var zeile = await basis
                .Select(x => new
                {
                    AusgabeId = x.a.Id,
                    CoinId = x.c.Id,
                    CoinName = x.c.Name,
                    x.a.ExemplarNummer,
                    x.a.Zertifikatsnummer,
                    x.h.Nummer,
                    x.a.Datum,
                    x.a.StorniertAm,
                })
                .FirstOrDefaultAsync(ct);
            return zeile is null
                ? null
                : new PruefTreffer(
                    zeile.AusgabeId, zeile.CoinId, zeile.CoinName, zeile.ExemplarNummer, zeile.Zertifikatsnummer, zeile.Nummer,
                    zeile.Datum, zeile.StorniertAm?.ToUniversalTime());
        }

        var voll = await basis
            .Select(x => new
            {
                AusgabeId = x.a.Id,
                CoinId = x.c.Id,
                CoinName = x.c.Name,
                x.a.ExemplarNummer,
                x.a.Zertifikatsnummer,
                x.h.Nummer,
                x.a.Datum,
                x.a.StorniertAm,
                x.a.EmpfaengerName,
                x.a.EmpfaengerDienstgrad,
                x.a.EmpfaengerDienststelle,
                x.a.Gelegenheit,
                x.a.Begruendung,
                x.a.AusgebendeStelle,
            })
            .FirstOrDefaultAsync(ct);
        return voll is null
            ? null
            : new PruefTrefferMitEmpfaenger(
                voll.AusgabeId, voll.CoinId, voll.CoinName, voll.ExemplarNummer, voll.Zertifikatsnummer, voll.Nummer, voll.Datum,
                voll.StorniertAm?.ToUniversalTime(),
                new AusgabeAngaben(
                    voll.EmpfaengerName, voll.EmpfaengerDienstgrad, voll.EmpfaengerDienststelle, voll.Datum, voll.Gelegenheit,
                    voll.Begruendung, voll.AusgebendeStelle));
    }

    public async Task AuditSchreibenAsync(PruefAuditEintrag eintrag, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(eintrag);
        var ergebnis = eintrag.Ergebnis.ToString();
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO pruefung_audit (id, zeitpunkt, akteur_id, nummer, coin_id_gewaehlt, ergebnis, ausgabe_id, mit_empfaenger)
            VALUES ({Guid.CreateVersion7()}, {eintrag.Zeitpunkt}, {eintrag.AkteurId}, {eintrag.Nummer},
                    CAST({eintrag.CoinIdGewaehlt} AS uuid), {ergebnis}, CAST({eintrag.AusgabeId} AS uuid), {eintrag.MitEmpfaenger})
            """,
            ct);
    }
}
