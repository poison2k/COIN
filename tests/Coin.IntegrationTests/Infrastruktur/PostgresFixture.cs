using Coin.Infrastructure.Persistenz;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>
/// Startet einmal pro Testlauf einen PostgreSQL-Container (Docker erforderlich)
/// und eine gemeinsame API-Instanz. Vor jedem Test wird die Datenbank geleert.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:17")
        .WithDatabase("coin_test")
        .WithUsername("coin_test")
        .WithPassword("nur-fuer-tests")
        .Build();

    private CoinApiFactory? _factory;

    public string ConnectionString => _container.GetConnectionString();

    public CoinApiFactory Factory => _factory ?? throw new InvalidOperationException("Fixture ist nicht initialisiert.");

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _factory = NeueFactory();
        await MigrierenAsync(_factory);
    }

    /// <summary>Erzeugt einen weiteren, unabhängigen Testhost auf derselben Datenbank (z. B. für Neustart-Tests).</summary>
    public CoinApiFactory NeueFactory(FactoryOptionen? optionen = null) => new(ConnectionString, optionen);

    public async Task DatenbankLeerenAsync()
    {
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CoinDbContext>();
        await db.Database.ExecuteSqlRawAsync("TRUNCATE coin_typ, benutzer CASCADE");
    }

    public async Task DisposeAsync()
    {
        if (_factory is not null)
        {
            await _factory.DisposeAsync();
        }

        await _container.DisposeAsync();
    }

    private static async Task MigrierenAsync(CoinApiFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CoinDbContext>();
        await db.Database.MigrateAsync();
    }
}

[CollectionDefinition(Name)]
public sealed class PostgresCollection : ICollectionFixture<PostgresFixture>
{
    public const string Name = "PostgreSQL";
}
