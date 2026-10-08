using System.Data;
using Coin.Domain.Benutzer;
using Coin.Domain.Gemeinsam;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace Coin.Infrastructure.Persistenz;

/// <summary>
/// Benutzerverwaltung in PostgreSQL (ADR-0017, ADR-0018): Änderungen in einer Transaktion unter
/// <c>pg_advisory_xact_lock</c>, Audit nur per INSERT, Suche parametrisiert mit <c>ILIKE … ESCAPE '\'</c>.
/// </summary>
internal sealed class BenutzerverwaltungRepository(CoinDbContext db) : IBenutzerverwaltungRepository
{
    /// <summary>Fester Schlüssel der Advisory-Sperre „benutzerverwaltung“ (ADR-0018 Punkt 2).</summary>
    public const long SperrSchluessel = 0x434F_494E_4256_0001;

    public async Task<T> InSperreAsync<T>(Func<IBenutzerverwaltungSitzung, Task<T>> aktion, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(aktion);

        await using var transaktion = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        await db.Database.ExecuteSqlRawAsync(
            "SELECT pg_advisory_xact_lock(@schluessel)",
            [new NpgsqlParameter("schluessel", NpgsqlDbType.Bigint) { Value = SperrSchluessel }],
            ct);

        var ergebnis = await aktion(new Sitzung(db));
        await transaktion.CommitAsync(ct);
        return ergebnis;
    }

    public async Task<Seite<Benutzer>> SuchenAsync(string? suche, int seite, int groesse, CancellationToken ct)
    {
        var abfrage = db.Benutzer.AsNoTracking();
        if (!string.IsNullOrEmpty(suche))
        {
            var muster = Suchmuster.Teilstring(suche);
            abfrage = abfrage.Where(b =>
                EF.Functions.ILike(b.Anzeigename, muster, Suchmuster.Escape)
                || (b.Email != null && EF.Functions.ILike(b.Email, muster, Suchmuster.Escape)));
        }

        var gesamt = await abfrage.CountAsync(ct);
        if (Suchmuster.Versatz(seite, groesse) is not { } versatz)
        {
            return new Seite<Benutzer>([], gesamt, seite, groesse);
        }

        var zeilen = await abfrage
            .OrderBy(b => b.Anzeigename.ToLower())
            .ThenBy(b => b.Id)
            .Skip(versatz)
            .Take(groesse)
            .ToListAsync(ct);
        return new Seite<Benutzer>([.. zeilen.Select(BenutzerAbbildung.ZuDomain)], gesamt, seite, groesse);
    }

    public async Task<Seite<AuditEintragAnsicht>> AuditSeiteAsync(Guid? benutzerId, int seite, int groesse, CancellationToken ct)
    {
        var abfrage = db.BenutzerAudit.AsNoTracking();
        if (benutzerId is { } id)
        {
            abfrage = abfrage.Where(a => a.BenutzerId == id);
        }

        var gesamt = await abfrage.CountAsync(ct);
        if (Suchmuster.Versatz(seite, groesse) is not { } versatz)
        {
            return new Seite<AuditEintragAnsicht>([], gesamt, seite, groesse);
        }

        var zeilen = await abfrage
            .OrderByDescending(a => a.Zeitpunkt)
            .ThenByDescending(a => a.Id)
            .Skip(versatz)
            .Take(groesse)
            .Select(a => new
            {
                a.Id,
                a.Zeitpunkt,
                a.AkteurId,
                AkteurName = a.Akteur != null ? a.Akteur.Anzeigename : null,
                a.BenutzerId,
                BenutzerName = a.Benutzer.Anzeigename,
                a.Art,
                a.Alt,
                a.Neu,
            })
            .ToListAsync(ct);

        return new Seite<AuditEintragAnsicht>(
            [.. zeilen.Select(z => new AuditEintragAnsicht(
                z.Id, z.Zeitpunkt, z.AkteurId, z.AkteurName, z.BenutzerId, z.BenutzerName,
                Enum.Parse<AuditArt>(z.Art, ignoreCase: false), z.Alt, z.Neu))],
            gesamt,
            seite,
            groesse);
    }

    private sealed class Sitzung(CoinDbContext db) : IBenutzerverwaltungSitzung
    {
        public async Task<Benutzer?> LadenAsync(Guid id, CancellationToken ct)
        {
            var datensatz = await db.Benutzer.AsNoTracking().FirstOrDefaultAsync(b => b.Id == id, ct);
            return datensatz is null ? null : BenutzerAbbildung.ZuDomain(datensatz);
        }

        public Task<int> AnzahlAktiverAdministratorenAsync(CancellationToken ct)
        {
            const string administrator = nameof(Rolle.Administrator);
            return db.Benutzer.AsNoTracking().CountAsync(b => b.Rolle == administrator && b.Aktiv, ct);
        }

        public async Task SpeichernAsync(Benutzer benutzer, AuditEintrag eintrag, CancellationToken ct)
        {
            ArgumentNullException.ThrowIfNull(benutzer);
            ArgumentNullException.ThrowIfNull(eintrag);

            var geaendert = await db.Database.ExecuteSqlRawAsync(
                "UPDATE benutzer SET rolle = @rolle, aktiv = @aktiv, aktualisiert_am = @jetzt WHERE id = @id",
                [
                    Parameter("rolle", NpgsqlDbType.Varchar, benutzer.Rolle?.ToString()),
                    Parameter("aktiv", NpgsqlDbType.Boolean, benutzer.Aktiv),
                    Parameter("jetzt", NpgsqlDbType.TimestampTz, benutzer.AktualisiertAm.ToUniversalTime()),
                    Parameter("id", NpgsqlDbType.Uuid, benutzer.Id),
                ],
                ct);
            if (geaendert != 1)
            {
                throw new InvalidOperationException($"Benutzer {benutzer.Id} konnte nicht gespeichert werden.");
            }

            await db.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO benutzer_audit (id, zeitpunkt, akteur_id, benutzer_id, art, alt, neu)
                VALUES (@id, @zeitpunkt, @akteur, @benutzer, @art, @alt, @neu)
                """,
                [
                    Parameter("id", NpgsqlDbType.Uuid, eintrag.Id),
                    Parameter("zeitpunkt", NpgsqlDbType.TimestampTz, eintrag.Zeitpunkt.ToUniversalTime()),
                    Parameter("akteur", NpgsqlDbType.Uuid, eintrag.AkteurId),
                    Parameter("benutzer", NpgsqlDbType.Uuid, eintrag.BenutzerId),
                    Parameter("art", NpgsqlDbType.Varchar, eintrag.Art.ToString()),
                    Parameter("alt", NpgsqlDbType.Varchar, eintrag.Alt),
                    Parameter("neu", NpgsqlDbType.Varchar, eintrag.Neu),
                ],
                ct);
        }

        private static NpgsqlParameter Parameter(string name, NpgsqlDbType typ, object? wert) =>
            new(name, typ) { Value = wert ?? DBNull.Value };
    }
}
