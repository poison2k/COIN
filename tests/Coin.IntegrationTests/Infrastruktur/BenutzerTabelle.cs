using Npgsql;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>Eine Zeile der Tabelle <c>benutzer</c> (Entwurf anmeldung-keycloak, Abschnitt 5.3), plus <c>xmin</c>.</summary>
public sealed record BenutzerZeile(
    Guid Id,
    string Issuer,
    string Subject,
    string? Email,
    string Anzeigename,
    string? Rolle,
    DateTimeOffset ErstelltAm,
    DateTimeOffset AktualisiertAm,
    string Xmin);

/// <summary>
/// Direkter Zugriff auf die Tabelle <c>benutzer</c> der Test-Datenbank, unabhängig von den Typen der Infrastruktur.
/// Rollen für Sachbearbeiter/Betrachter werden nur hier gesetzt (AK-19: „nur Testdaten“).
/// </summary>
public sealed class BenutzerTabelle(string connectionString)
{
    public async Task<IReadOnlyList<BenutzerZeile>> AlleAsync()
    {
        await using var verbindung = new NpgsqlConnection(connectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(
            "SELECT id, issuer, subject, email, anzeigename, rolle, erstellt_am, aktualisiert_am, xmin::text FROM benutzer ORDER BY erstellt_am, id",
            verbindung);
        await using var leser = await befehl.ExecuteReaderAsync();
        var zeilen = new List<BenutzerZeile>();
        while (await leser.ReadAsync())
        {
            zeilen.Add(new BenutzerZeile(
                leser.GetGuid(0),
                leser.GetString(1),
                leser.GetString(2),
                leser.IsDBNull(3) ? null : leser.GetString(3),
                leser.GetString(4),
                leser.IsDBNull(5) ? null : leser.GetString(5),
                leser.GetFieldValue<DateTimeOffset>(6),
                leser.GetFieldValue<DateTimeOffset>(7),
                leser.GetString(8)));
        }

        return zeilen;
    }

    public async Task<BenutzerZeile> EinzigerAsync(string subject)
    {
        var zeilen = (await AlleAsync()).Where(z => z.Subject == subject).ToList();
        return Assert.Single(zeilen);
    }

    public async Task<int> AnzahlAsync() => (await AlleAsync()).Count;

    public async Task RolleSetzenAsync(string subject, string? rolle)
    {
        await using var verbindung = new NpgsqlConnection(connectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand("UPDATE benutzer SET rolle = @rolle WHERE subject = @sub", verbindung);
        befehl.Parameters.AddWithValue("rolle", (object?)rolle ?? DBNull.Value);
        befehl.Parameters.AddWithValue("sub", subject);
        var geaendert = await befehl.ExecuteNonQueryAsync();
        Assert.Equal(1, geaendert);
    }
}
