using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>
/// Testhost der API gegen die Testcontainer-Datenbank.
/// Umgebung "Testing" (nicht Development), damit Fehlerseiten wie im Betrieb ohne Details antworten.
/// </summary>
public sealed class CoinApiFactory(string connectionString) : WebApplicationFactory<Program>
{
    public const string Umgebung = "Testing";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Umgebung);
        builder.UseSetting("ConnectionStrings:CoinDb", connectionString);
    }
}
