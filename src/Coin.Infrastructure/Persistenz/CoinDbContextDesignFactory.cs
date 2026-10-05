using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Coin.Infrastructure.Persistenz;

/// <summary>
/// Nur für <c>dotnet ef migrations add</c>: erzeugt den Kontext ohne Datenbankverbindung.
/// Enthält bewusst keine Zugangsdaten; zum Anwenden von Migrationen wird die echte Konfiguration genutzt.
/// </summary>
internal sealed class CoinDbContextDesignFactory : IDesignTimeDbContextFactory<CoinDbContext>
{
    public CoinDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<CoinDbContext>();
        InfrastrukturRegistrierung.Konfigurieren(options, "Host=localhost;Database=coin");
        return new CoinDbContext(options.Options);
    }
}
