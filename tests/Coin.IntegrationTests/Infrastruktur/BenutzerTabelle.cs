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

    /// <summary>Setzt <c>aktiv</c> direkt (Testdaten, rollen-benutzerverwaltung Abschnitt 6.2).</summary>
    public async Task StatusSetzenAsync(string subject, bool aktiv)
    {
        await using var verbindung = new NpgsqlConnection(connectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand("UPDATE benutzer SET aktiv = @aktiv WHERE subject = @sub", verbindung);
        befehl.Parameters.AddWithValue("aktiv", aktiv);
        befehl.Parameters.AddWithValue("sub", subject);
        var geaendert = await befehl.ExecuteNonQueryAsync();
        Assert.Equal(1, geaendert);
    }

    /// <summary>Rolle (<c>null</c> = keine) und Status eines Benutzers per Id.</summary>
    public async Task<(string? Rolle, bool Aktiv, string Xmin)> RolleUndStatusAsync(Guid id)
    {
        await using var verbindung = new NpgsqlConnection(connectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand("SELECT rolle, aktiv, xmin::text FROM benutzer WHERE id = @id", verbindung);
        befehl.Parameters.AddWithValue("id", id);
        await using var leser = await befehl.ExecuteReaderAsync();
        Assert.True(await leser.ReadAsync(), $"Benutzer {id} nicht gefunden.");
        return (leser.IsDBNull(0) ? null : leser.GetString(0), leser.GetBoolean(1), leser.GetString(2));
    }

    /// <summary>Anzahl der Benutzer mit Rolle Administrator und <c>aktiv = true</c>.</summary>
    public async Task<long> AnzahlAktiverAdministratorenAsync()
    {
        await using var verbindung = new NpgsqlConnection(connectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(
            "SELECT count(*) FROM benutzer WHERE rolle = 'Administrator' AND aktiv", verbindung);
        return (long)(await befehl.ExecuteScalarAsync())!;
    }
}
