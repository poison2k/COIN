using System.Text.RegularExpressions;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Anmeldung;

/// <summary>
/// Feature anmeldung-keycloak, AK-6: Fehlende oder unsichere Oidc-Konfiguration bricht den Start mit einer
/// deutschen Meldung ab, die den Schlüssel nennt.
/// </summary>
public class StartKonfigurationTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    /// <summary>Alle Meldungen der Ausnahmekette (inkl. AggregateException) als ein Text.</summary>
    public static string Meldungen(Exception fehler)
    {
        var meldungen = new List<string>();
        var offen = new Stack<Exception>([fehler]);
        while (offen.TryPop(out var aktuell))
        {
            meldungen.Add(aktuell.Message);
            if (aktuell is AggregateException aggregat)
            {
                foreach (var inner in aggregat.InnerExceptions)
                {
                    offen.Push(inner);
                }
            }
            else if (aktuell.InnerException is { } inner)
            {
                offen.Push(inner);
            }
        }

        return string.Join(Environment.NewLine, meldungen);
    }

    private static Exception? StartMit(PostgresFixture fixture, string schluessel, string? wert)
    {
        using var factory = fixture.NeueFactory(new FactoryOptionen
        {
            Einstellungen = new Dictionary<string, string?> { [schluessel] = wert },
        });
        return Record.Exception(() => factory.Services);
    }

    /// <summary>Die Meldung, die den Schlüssel nennt (nicht die Hüllen des Hosts).</summary>
    private static string MeldungMitSchluessel(Exception fehler, string schluessel)
    {
        var treffer = Meldungen(fehler).Split(Environment.NewLine).FirstOrDefault(m => m.Contains(schluessel, StringComparison.Ordinal));
        Assert.True(treffer is not null, $"Keine Meldung nennt '{schluessel}':{Environment.NewLine}{Meldungen(fehler)}");
        return treffer!;
    }

    [Theory]
    [InlineData("Oidc:Authority")]
    [InlineData("Oidc:Audience")]
    [InlineData("Oidc:ClientId")]
    public void Leerer_Oidc_Wert_bricht_den_Start_ab(string schluessel)
    {
        var fehler = StartMit(Fixture, schluessel, "");

        Assert.NotNull(fehler);
    }

    [Theory]
    [InlineData("Oidc:Authority")]
    [InlineData("Oidc:Audience")]
    [InlineData("Oidc:ClientId")]
    public void Fehlender_Oidc_Wert_bricht_den_Start_ab(string schluessel)
    {
        var fehler = StartMit(Fixture, schluessel, null);

        Assert.NotNull(fehler);
    }

    [Theory]
    [InlineData("Oidc:Authority")]
    [InlineData("Oidc:Audience")]
    [InlineData("Oidc:ClientId")]
    public void Meldung_bei_fehlendem_Wert_nennt_den_Schluessel(string schluessel)
    {
        var fehler = StartMit(Fixture, schluessel, "  ");

        Assert.NotNull(fehler);
        MeldungMitSchluessel(fehler!, schluessel);
    }

    [Theory]
    [InlineData("Oidc:Authority")]
    [InlineData("Oidc:Audience")]
    [InlineData("Oidc:ClientId")]
    public void Meldung_bei_fehlendem_Wert_ist_deutsch(string schluessel)
    {
        var fehler = StartMit(Fixture, schluessel, "");

        Assert.NotNull(fehler);
        Assert.DoesNotMatch(new Regex(@"\b(is|are|must|missing|required|invalid|not|value)\b", RegexOptions.IgnoreCase), MeldungMitSchluessel(fehler!, schluessel));
    }

    [Theory]
    [InlineData("realms/coin")]
    [InlineData("/realms/coin")]
    [InlineData("idp.coin-test.invalid/realms/coin")]
    public void Authority_ohne_absolute_URI_bricht_den_Start_ab(string wert)
    {
        var fehler = StartMit(Fixture, "Oidc:Authority", wert);

        Assert.NotNull(fehler);
        MeldungMitSchluessel(fehler!, "Oidc:Authority");
    }

    [Theory]
    [InlineData("http://idp.coin-test.invalid/realms/coin")]
    [InlineData("http://10.0.0.5:8180/realms/coin")]
    [InlineData("http://localhost.coin-test.invalid/realms/coin")]
    [InlineData("http://127.0.0.2:8180/realms/coin")]
    [InlineData("http://127.1.2.3/realms/coin")]
    [InlineData("http://[::2]:8180/realms/coin")]
    public void Http_Authority_ausserhalb_von_Loopback_bricht_den_Start_ab(string wert)
    {
        var fehler = StartMit(Fixture, "Oidc:Authority", wert);

        Assert.NotNull(fehler);
        MeldungMitSchluessel(fehler!, "Oidc:Authority");
    }

    [Theory]
    [InlineData("ftp://idp.coin-test.invalid/realms/coin")]
    [InlineData("file:///C:/realms/coin")]
    public void Authority_mit_anderem_Schema_als_http_oder_https_bricht_den_Start_ab(string wert)
    {
        var fehler = StartMit(Fixture, "Oidc:Authority", wert);

        Assert.NotNull(fehler);
    }

    [Theory]
    [InlineData("http://localhost:8180/realms/coin")]
    [InlineData("http://127.0.0.1:8180/realms/coin")]
    [InlineData("http://[::1]:8180/realms/coin")]
    [InlineData("https://idp.coin-test.invalid/realms/coin-test")]
    public void Zulaessige_Authority_startet(string wert)
    {
        var fehler = StartMit(Fixture, "Oidc:Authority", wert);

        Assert.Null(fehler);
    }

    [Fact]
    public void Http_Authority_auf_Loopback_verlangt_keine_HTTPS_Metadaten()
    {
        using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Einstellungen = new Dictionary<string, string?> { ["Oidc:Authority"] = "http://localhost:8180/realms/coin" },
        });

        var optionen = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions
            .GetRequiredService<Microsoft.Extensions.Options.IOptionsMonitor<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>>(factory.Services)
            .Get(Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme);

        Assert.False(optionen.RequireHttpsMetadata);
    }
}
