using Coin.Domain.Ausgaben;
using Coin.Domain.Vorlagen;
using Microsoft.EntityFrameworkCore;

namespace Coin.Infrastructure.Persistenz;

/// <summary>
/// Zertifikatsvorlagen (ADR-0023). Schreiben per SQL in einer Transaktion mit gesperrter Coin-Zeile (<c>FOR UPDATE</c>):
/// Version = <c>max + 1</c>, Zeiger und Audit gemeinsam. Status- und Listenabfragen lesen nie <c>inhalt</c>.
/// </summary>
internal sealed class ZertifikatsvorlageRepository(CoinDbContext db) : IZertifikatsvorlageRepository
{
    public Task<bool> CoinExistiertAsync(Guid coinId, CancellationToken ct) =>
        db.Coins.AsNoTracking().AnyAsync(c => c.Id == coinId, ct);

    public async Task<VorlagenStatus?> StatusAsync(Guid coinId, CancellationToken ct)
    {
        var coin = await db.Coins.AsNoTracking()
            .Where(c => c.Id == coinId)
            .Select(c => new { c.AktiveVorlageVersion })
            .FirstOrDefaultAsync(ct);
        if (coin is null)
        {
            return null;
        }

        var versionen = await db.Vorlagen.AsNoTracking()
            .Where(v => v.CoinId == coinId)
            .OrderByDescending(v => v.Version)
            .Select(v => new { v.Version, v.GroesseBytes, v.HochgeladenAm, v.HochgeladenVon, v.Hochladender.Anzeigename })
            .ToListAsync(ct);

        return new VorlagenStatus(
            coin.AktiveVorlageVersion,
            [.. versionen.Select(v => new VorlagenVersion(
                v.Version, v.GroesseBytes, v.HochgeladenAm.ToUniversalTime(), new Akteur(v.HochgeladenVon, v.Anzeigename)))]);
    }

    public async Task<(int? Version, byte[]? Inhalt)?> AktiveAsync(Guid coinId, CancellationToken ct)
    {
        var coin = await db.Coins.AsNoTracking()
            .Where(c => c.Id == coinId)
            .Select(c => new { c.AktiveVorlageVersion })
            .FirstOrDefaultAsync(ct);
        if (coin is null)
        {
            return null;
        }

        if (coin.AktiveVorlageVersion is not { } version)
        {
            return (null, null);
        }

        return (version, await VersionInhaltAsync(coinId, version, ct));
    }

    public async Task<byte[]?> VersionInhaltAsync(Guid coinId, int version, CancellationToken ct) =>
        await db.Vorlagen.AsNoTracking()
            .Where(v => v.CoinId == coinId && v.Version == version)
            .Select(v => v.Inhalt)
            .FirstOrDefaultAsync(ct);

    public async Task<bool> VersionHinzufuegenAsync(NeueVorlage vorlage, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(vorlage);

        await using var transaktion = await db.Database.BeginTransactionAsync(ct);
        if (await SperrenAsync(vorlage.CoinId, ct) is not { } gesperrt)
        {
            return false;
        }

        var neueVersion = (await db.Vorlagen.Where(v => v.CoinId == vorlage.CoinId).MaxAsync(v => (int?)v.Version, ct) ?? 0) + 1;
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO zertifikat_vorlage (id, coin_id, version, inhalt, groesse_bytes, sha256, hochgeladen_am, hochgeladen_von)
            VALUES ({Guid.CreateVersion7()}, {vorlage.CoinId}, {neueVersion}, {vorlage.Inhalt}, {vorlage.Inhalt.Length},
                    {vorlage.Sha256}, {vorlage.HochgeladenAm}, {vorlage.HochgeladenVon})
            """,
            ct);
        await ZeigerSetzenAsync(vorlage.CoinId, neueVersion, ct);
        await AuditAsync(
            vorlage.CoinId, VorlageAuditArt.FuerUpload(gesperrt.AktiveVersion), neueVersion, gesperrt.AktiveVersion,
            vorlage.HochgeladenVon, vorlage.HochgeladenAm, ct);

        await transaktion.CommitAsync(ct);
        return true;
    }

    public async Task<bool> ZuruecksetzenAsync(Guid coinId, Guid akteurId, DateTimeOffset zeitpunkt, CancellationToken ct)
    {
        await using var transaktion = await db.Database.BeginTransactionAsync(ct);
        if (await SperrenAsync(coinId, ct) is not { } gesperrt)
        {
            return false;
        }

        // Ist die Standardvorlage schon aktiv, ändert sich nichts und es entsteht kein Audit (AK-20).
        if (gesperrt.AktiveVersion is { } bisher)
        {
            await ZeigerSetzenAsync(coinId, null, ct);
            await AuditAsync(coinId, VorlageAuditArt.Zurueckgesetzt, null, bisher, akteurId, zeitpunkt, ct);
            await transaktion.CommitAsync(ct);
        }

        return true;
    }

    private sealed record GesperrterCoin(int? AktiveVersion);

    /// <summary>Sperrt die Coin-Zeile in der laufenden Transaktion (ADR-0020 Punkt 6); <c>null</c> bei unbekanntem Coin.</summary>
    private async Task<GesperrterCoin?> SperrenAsync(Guid coinId, CancellationToken ct)
    {
        var zeilen = await db.Database
            .SqlQuery<int?>($"SELECT aktive_vorlage_version AS \"Value\" FROM coin_typ WHERE id = {coinId} FOR UPDATE")
            .ToListAsync(ct);
        return zeilen.Count == 0 ? null : new GesperrterCoin(zeilen[0]);
    }

    private Task ZeigerSetzenAsync(Guid coinId, int? version, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync($"UPDATE coin_typ SET aktive_vorlage_version = {version} WHERE id = {coinId}", ct);

    private Task AuditAsync(
        Guid coinId, string art, int? version, int? vorherigeVersion, Guid akteurId, DateTimeOffset zeitpunkt, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO vorlage_audit (id, zeitpunkt, akteur_id, coin_id, art, version, vorherige_version)
            VALUES ({Guid.CreateVersion7()}, {zeitpunkt}, {akteurId}, {coinId}, {art}, {version}, {vorherigeVersion})
            """,
            ct);
}
