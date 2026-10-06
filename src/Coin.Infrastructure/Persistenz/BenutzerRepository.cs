using Coin.Domain.Benutzer;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace Coin.Infrastructure.Persistenz;

/// <summary>
/// Benutzerabgleich als eine einzige SQL-Anweisung (ADR-0013): <c>INSERT … ON CONFLICT (issuer, subject) DO UPDATE …
/// WHERE geändert</c>. Atomar und ohne Duplikate bei parallelen Erstaufrufen; ohne Änderung wird nicht geschrieben.
/// Rolle und Status sind nie Teil des Updates. Vergibt der Bootstrap bei der Neuanlage eine Rolle, schreibt dieselbe
/// Anweisung den Audit-Eintrag mit Akteur „System“ (ADR-0017 Punkt 3). Alle Werte werden als Parameter übergeben.
/// </summary>
internal sealed class BenutzerRepository(CoinDbContext db) : IBenutzerRepository
{
    private const string Spalten = "id, issuer, subject, email, anzeigename, rolle, aktiv, erstellt_am, aktualisiert_am";

    private const string AbgleichSql =
        $"""
        WITH ergebnis AS (
            INSERT INTO benutzer (id, issuer, subject, email, anzeigename, rolle, aktiv, erstellt_am, aktualisiert_am)
            VALUES (@id, @iss, @sub, @email, @name, @rolle, true, @jetzt, @jetzt)
            ON CONFLICT (issuer, subject) DO UPDATE
                SET email = EXCLUDED.email, anzeigename = EXCLUDED.anzeigename, aktualisiert_am = EXCLUDED.aktualisiert_am
                WHERE benutzer.email IS DISTINCT FROM EXCLUDED.email
                   OR benutzer.anzeigename IS DISTINCT FROM EXCLUDED.anzeigename
            RETURNING {Spalten}, (xmax = 0) AS ist_neu
        ), audit AS (
            INSERT INTO benutzer_audit (id, zeitpunkt, akteur_id, benutzer_id, art, alt, neu)
            SELECT @audit_id, @jetzt, NULL, ergebnis.id, @audit_art, @audit_alt, ergebnis.rolle
            FROM ergebnis
            WHERE ergebnis.ist_neu AND ergebnis.rolle IS NOT NULL
        )
        SELECT {Spalten} FROM ergebnis
        """;

    private const string LesenSql = $"SELECT {Spalten} FROM benutzer WHERE issuer = @iss AND subject = @sub";

    public async Task<Benutzer> AbgleichenAsync(
        BenutzerIdentitaet identitaet, Rolle? rolleBeiNeuanlage, DateTimeOffset jetzt, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(identitaet);

        var datensatz = await AusfuehrenAsync(AbgleichSql, ct,
            Parameter("id", NpgsqlDbType.Uuid, Guid.CreateVersion7(jetzt)),
            Parameter("iss", NpgsqlDbType.Varchar, identitaet.Issuer),
            Parameter("sub", NpgsqlDbType.Varchar, identitaet.Subject),
            Parameter("email", NpgsqlDbType.Varchar, identitaet.Email),
            Parameter("name", NpgsqlDbType.Varchar, identitaet.Anzeigename),
            Parameter("rolle", NpgsqlDbType.Varchar, rolleBeiNeuanlage?.ToString()),
            Parameter("jetzt", NpgsqlDbType.TimestampTz, jetzt.ToUniversalTime()),
            Parameter("audit_id", NpgsqlDbType.Uuid, Guid.CreateVersion7(jetzt)),
            Parameter("audit_art", NpgsqlDbType.Varchar, nameof(AuditArt.Rolle)),
            Parameter("audit_alt", NpgsqlDbType.Varchar, AuditEintrag.RolleWert(null)));

        // Keine Zeile: Benutzer vorhanden und unverändert (das UPDATE wurde durch WHERE übersprungen).
        datensatz ??= await AusfuehrenAsync(LesenSql, ct,
            Parameter("iss", NpgsqlDbType.Varchar, identitaet.Issuer),
            Parameter("sub", NpgsqlDbType.Varchar, identitaet.Subject));

        return datensatz is null
            ? throw new InvalidOperationException("Benutzer konnte nach dem Abgleich nicht gelesen werden.")
            : BenutzerAbbildung.ZuDomain(datensatz);
    }

    private async Task<BenutzerDatensatz?> AusfuehrenAsync(string sql, CancellationToken ct, params NpgsqlParameter[] parameter)
    {
        // Nicht zusammensetzbares SQL (INSERT … RETURNING): ohne weitere LINQ-Operatoren ausführen.
        BenutzerDatensatz? ergebnis = null;
        await foreach (var zeile in db.Benutzer.FromSqlRaw(sql, parameter.Cast<object>().ToArray()).AsNoTracking().AsAsyncEnumerable().WithCancellation(ct))
        {
            ergebnis = ergebnis is null ? zeile : throw new InvalidOperationException("Abgleich lieferte mehr als einen Benutzer.");
        }

        return ergebnis;
    }

    private static NpgsqlParameter Parameter(string name, NpgsqlDbType typ, object? wert) =>
        new(name, typ) { Value = wert ?? DBNull.Value };
}

/// <summary>Abbildung zwischen Persistenzmodell und Domain für Benutzer.</summary>
internal static class BenutzerAbbildung
{
    public static Benutzer ZuDomain(BenutzerDatensatz d)
    {
        Rolle? rolle = null;
        if (d.Rolle is not null)
        {
            // Unbekannte Rolle bedeutet inkonsistente Daten: sichtbar machen (500 + Log), nie still als Rolle werten.
            if (!Enum.TryParse<Rolle>(d.Rolle, ignoreCase: false, out var wert) || !Enum.IsDefined(wert))
            {
                throw new InvalidOperationException($"Unbekannte Rolle in benutzer für Id {d.Id}.");
            }

            rolle = wert;
        }

        return new Benutzer(d.Id, d.Issuer, d.Subject, d.Email, d.Anzeigename, rolle, d.ErstelltAm, d.AktualisiertAm, d.Aktiv);
    }
}
