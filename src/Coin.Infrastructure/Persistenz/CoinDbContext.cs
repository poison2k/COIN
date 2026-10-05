using Microsoft.EntityFrameworkCore;

namespace Coin.Infrastructure.Persistenz;

public sealed class CoinDbContext(DbContextOptions<CoinDbContext> options) : DbContext(options)
{
    public DbSet<CoinTypDatensatz> Coins => Set<CoinTypDatensatz>();

    public DbSet<CoinBildDatensatz> Bilder => Set<CoinBildDatensatz>();

    public DbSet<BenutzerDatensatz> Benutzer => Set<BenutzerDatensatz>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CoinDbContext).Assembly);
    }
}
