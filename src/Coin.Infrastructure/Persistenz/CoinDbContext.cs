using Microsoft.EntityFrameworkCore;

namespace Coin.Infrastructure.Persistenz;

public sealed class CoinDbContext(DbContextOptions<CoinDbContext> options) : DbContext(options)
{
    public DbSet<CoinTypDatensatz> Coins => Set<CoinTypDatensatz>();

    public DbSet<CoinBildDatensatz> Bilder => Set<CoinBildDatensatz>();

    public DbSet<BenutzerDatensatz> Benutzer => Set<BenutzerDatensatz>();

    public DbSet<BenutzerAuditDatensatz> BenutzerAudit => Set<BenutzerAuditDatensatz>();

    public DbSet<ExemplarDatensatz> Exemplare => Set<ExemplarDatensatz>();

    public DbSet<AusgabeDatensatz> Ausgaben => Set<AusgabeDatensatz>();

    public DbSet<AusgabeAuditDatensatz> AusgabeAudit => Set<AusgabeAuditDatensatz>();

    public DbSet<ZertifikatVorlageDatensatz> Vorlagen => Set<ZertifikatVorlageDatensatz>();

    public DbSet<VorlageAuditDatensatz> VorlageAudit => Set<VorlageAuditDatensatz>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CoinDbContext).Assembly);
    }
}
