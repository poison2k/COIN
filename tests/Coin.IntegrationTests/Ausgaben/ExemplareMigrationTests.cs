using Coin.Infrastructure.Persistenz;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;

namespace Coin.IntegrationTests.Ausgaben;

/// <summary>
/// Feature coin-ausgaben, AK-2 (ADR-0020 Punkt 3): Die Migration <c>Exemplare</c> erzeugt für bestehende Coins mit
/// Auflage die Exemplare 1 bis Auflage, für Coins ohne Auflage keine; <c>Down</c> entfernt die neuen Tabellen.
/// Läuft in einer eigenen, frisch angelegten Datenbank im selben Container (die gemeinsame Test-DB bleibt unberührt).
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class ExemplareMigrationTests(PostgresFixture fixture) : IAsyncLifetime
{
    /// <summary>Letzte Migration vor diesem Feature.</summary>
    private const string VorDemFeature = "20261006053745_Benutzerverwaltung";

    private readonly string _datenbank = $"coin_migration_{Guid.NewGuid():N}";

    private string ConnectionString => new NpgsqlConnectionStringBuilder(fixture.ConnectionString) { Database = _datenbank }.ConnectionString;

    public async Task InitializeAsync() => await AdminAusfuehrenAsync($"CREATE DATABASE {_datenbank}");

    public async Task DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();
        await AdminAusfuehrenAsync($"DROP DATABASE IF EXISTS {_datenbank} WITH (FORCE)");
    }

    private async Task AdminAusfuehrenAsync(string sql)
    {
        await using var verbindung = new NpgsqlConnection(fixture.ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        await befehl.ExecuteNonQueryAsync();
    }

    /// <summary>Kontext wie in der Infrastruktur konfiguriert (Historientabelle, snake_case).</summary>
    private CoinDbContext Kontext() => new(new DbContextOptionsBuilder<CoinDbContext>()
        .UseNpgsql(ConnectionString, npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history"))
        .UseSnakeCaseNamingConvention()
        .Options);

    private async Task MigrierenAsync(string? ziel = null)
    {
        await using var db = Kontext();
        await db.GetService<IMigrator>().MigrateAsync(ziel);
    }

    private async Task AusfuehrenAsync(string sql)
    {
        await using var verbindung = new NpgsqlConnection(ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        await befehl.ExecuteNonQueryAsync();
    }

    private async Task<object?> WertAsync(string sql)
    {
        await using var verbindung = new NpgsqlConnection(ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        return await befehl.ExecuteScalarAsync();
    }

    private static readonly Guid MitAuflage = Guid.Parse("01920000-0000-7000-8000-000000000003");
    private static readonly Guid OhneAuflage = Guid.Parse("01920000-0000-7000-8000-000000000004");

    /// <summary>DB auf dem Stand vor dem Feature mit zwei Coins (Auflage 3 und NULL).</summary>
    private async Task AltbestandAnlegenAsync()
    {
        await MigrierenAsync(VorDemFeature);
        await AusfuehrenAsync(
            $"""
            INSERT INTO coin_typ (id, name, herausgeber, auflage, beschreibung, erstellt_am) VALUES
                ('{MitAuflage}', 'Test Coin Drei', 'Test Herausgeber', 3, NULL, now()),
                ('{OhneAuflage}', 'Test Coin Unbekannt', 'Test Herausgeber', NULL, NULL, now())
            """);
    }

    [Fact]
    public void Es_gibt_eine_Migration_Exemplare_nach_Benutzerverwaltung()
    {
        using var db = Kontext();
        var migrationen = db.Database.GetMigrations().ToList();

        var exemplare = Assert.Single(migrationen, m => m.EndsWith("_Exemplare", StringComparison.Ordinal));
        Assert.True(string.CompareOrdinal(exemplare, VorDemFeature) > 0, "Exemplare muss nach Benutzerverwaltung liegen.");
    }

    [Fact]
    public async Task Migration_erzeugt_fuer_einen_Coin_mit_Auflage_3_die_Exemplare_1_bis_3()
    {
        await AltbestandAnlegenAsync();

        await MigrierenAsync();

        Assert.Equal("1,2,3", await WertAsync($"SELECT string_agg(nummer::text, ',' ORDER BY nummer) FROM exemplar WHERE coin_id = '{MitAuflage}'"));
    }

    [Fact]
    public async Task Migration_erzeugt_fuer_einen_Coin_ohne_Auflage_keine_Exemplare()
    {
        await AltbestandAnlegenAsync();

        await MigrierenAsync();

        Assert.Equal(0L, await WertAsync($"SELECT count(*) FROM exemplar WHERE coin_id = '{OhneAuflage}'"));
    }

    [Fact]
    public async Task Migration_legt_keine_Ausgaben_und_kein_Audit_an()
    {
        await AltbestandAnlegenAsync();

        await MigrierenAsync();

        Assert.Equal(0L, await WertAsync("SELECT (SELECT count(*) FROM ausgabe) + (SELECT count(*) FROM ausgabe_audit)"));
    }

    [Fact]
    public async Task Down_entfernt_exemplar_ausgabe_und_ausgabe_audit()
    {
        await AltbestandAnlegenAsync();
        await MigrierenAsync();

        await MigrierenAsync(VorDemFeature);

        Assert.Equal(0L, await WertAsync(
            "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('exemplar', 'ausgabe', 'ausgabe_audit')"));
    }

    [Fact]
    public async Task Down_laesst_die_Coins_unveraendert()
    {
        await AltbestandAnlegenAsync();
        await MigrierenAsync();

        await MigrierenAsync(VorDemFeature);

        Assert.Equal(2L, await WertAsync("SELECT count(*) FROM coin_typ"));
    }
}
