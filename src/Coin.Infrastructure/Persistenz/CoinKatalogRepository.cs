using Coin.Domain.Katalog;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Coin.Infrastructure.Persistenz;

/// <summary>EF-Core-Repository für den Katalog. Liste und Einzelabruf lesen nie die Bildbytes (ADR-0005).</summary>
internal sealed class CoinKatalogRepository(CoinDbContext db) : ICoinKatalogRepository
{
    // Beide Seiten werden in PostgreSQL mit lower() verglichen – dieselbe Semantik wie der eindeutige Index
    // ux_coin_typ_name_herausgeber, unabhängig von der Kultur des API-Prozesses. (Ein LINQ-Ausdruck wie
    // name.ToLower() würde EF Core clientseitig in .NET auswerten.) Werte werden als Parameter übergeben.
    public Task<bool> ExistiertAsync(string name, string herausgeber, CancellationToken ct) =>
        db.Coins
            .FromSql($"SELECT * FROM coin_typ WHERE lower(name) = lower({name}) AND lower(herausgeber) = lower({herausgeber})")
            .AnyAsync(ct);

    public async Task<bool> HinzufuegenAsync(CoinTyp coin, CancellationToken ct)
    {
        var datensatz = new CoinTypDatensatz
        {
            Id = coin.Id,
            Name = coin.Name,
            Herausgeber = coin.Herausgeber,
            Auflage = coin.Auflage,
            Beschreibung = coin.Beschreibung,
            ErstelltAm = coin.ErstelltAm,
        };
        // Im API-Ablauf wird ein Coin ohne Bild angelegt (Bild per eigenem Endpunkt, ADR-0006). Trägt der
        // Domain-Coin dennoch ein Bild, wird es mitgespeichert statt stillschweigend verworfen.
        if (coin.Bild is { } bild)
        {
            datensatz.Bild = ZuDatensatz(coin.Id, bild);
        }

        db.Coins.Add(datensatz);
        try
        {
            await db.SaveChangesAsync(ct);
            return true;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            db.ChangeTracker.Clear();
            return false;
        }
    }

    public async Task<IReadOnlyList<CoinEintrag>> AlleAsync(CancellationToken ct) =>
        await db.Coins
            .AsNoTracking()
            .OrderBy(c => c.Name.ToLower())
            .ThenBy(c => c.Id)
            .Select(c => new CoinEintrag(
                c.Id, c.Name, c.Herausgeber, c.Auflage, c.Beschreibung, c.ErstelltAm,
                c.Bild != null ? c.Bild.Sha256 : null))
            .ToListAsync(ct);

    public Task<CoinEintrag?> FindenAsync(Guid id, CancellationToken ct) =>
        db.Coins
            .AsNoTracking()
            .Where(c => c.Id == id)
            .Select(c => new CoinEintrag(
                c.Id, c.Name, c.Herausgeber, c.Auflage, c.Beschreibung, c.ErstelltAm,
                c.Bild != null ? c.Bild.Sha256 : null))
            .FirstOrDefaultAsync(ct);

    public async Task BildSpeichernAsync(Guid id, CoinBild bild, CancellationToken ct)
    {
        var d = ZuDatensatz(id, bild);

        // Upsert in einer Anweisung (atomar): vorhandenes Bild wird ersetzt.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO coin_bild (coin_id, inhalt, format, sha256, groesse_bytes, hochgeladen_am)
            VALUES ({d.CoinId}, {d.Inhalt}, {d.Format}, {d.Sha256}, {d.GroesseBytes}, {d.HochgeladenAm})
            ON CONFLICT (coin_id) DO UPDATE SET
                inhalt = EXCLUDED.inhalt,
                format = EXCLUDED.format,
                sha256 = EXCLUDED.sha256,
                groesse_bytes = EXCLUDED.groesse_bytes,
                hochgeladen_am = EXCLUDED.hochgeladen_am
            """,
            ct);
    }

    public async Task<CoinBild?> BildLadenAsync(Guid id, CancellationToken ct)
    {
        var d = await db.Bilder.AsNoTracking().FirstOrDefaultAsync(b => b.CoinId == id, ct);
        if (d is null)
        {
            return null;
        }

        // Unbekanntes Format bedeutet inkonsistente Daten: sichtbar machen (500 + Log) statt als 404 zu verschleiern.
        if (!Enum.TryParse<BildFormat>(d.Format, ignoreCase: false, out var format) || !Enum.IsDefined(format))
        {
            throw new InvalidOperationException($"Unbekanntes Bildformat in coin_bild für Coin {id}.");
        }

        return CoinBild.Wiederherstellen(d.Inhalt, format, d.Sha256, d.HochgeladenAm);
    }

    private static CoinBildDatensatz ZuDatensatz(Guid coinId, CoinBild bild) => new()
    {
        CoinId = coinId,
        Inhalt = bild.Inhalt,
        Format = bild.Format.ToString(),
        Sha256 = bild.Sha256,
        GroesseBytes = bild.Inhalt.Length,
        HochgeladenAm = bild.HochgeladenAm,
    };
}
