using System.Net.Http.Headers;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>Abweichungen eines Testhosts von der Standardkonfiguration.</summary>
public sealed record FactoryOptionen
{
    public string Umgebung { get; init; } = CoinApiFactory.Umgebung;

    /// <summary>Überschreibt Standardeinstellungen. Wert <c>null</c> = Schlüssel wird nicht gesetzt.</summary>
    public IReadOnlyDictionary<string, string?> Einstellungen { get; init; } = new Dictionary<string, string?>();

    /// <summary>Zusätzlicher Log-Empfänger (AK-21), erhält alle Logs ab Trace.</summary>
    public SammelLoggerProvider? Logger { get; init; }

    /// <summary>Zählt, wie viele Bytes die Anwendung vom Request-Body gelesen hat (AK-19).</summary>
    public KoerperLeseZaehler? KoerperZaehler { get; init; }

    public Action<IServiceCollection>? Dienste { get; init; }
}

/// <summary>
/// Testhost der API gegen die Testcontainer-Datenbank.
/// Umgebung "Testing" (nicht Development), damit Fehlerseiten wie im Betrieb ohne Details antworten.
/// Anmeldung: Oidc:* zeigt auf den <see cref="TestIdentitaetsanbieter"/>; der Standard-Client sendet das Token
/// des Bootstrap-Administrators (Entwurf anmeldung-keycloak, Abschnitt 6.1).
/// </summary>
public sealed class CoinApiFactory(string connectionString, FactoryOptionen? optionen = null) : WebApplicationFactory<Program>
{
    public const string Umgebung = "Testing";
    public const string FrontendUrsprung = "http://localhost:5173";

    private readonly FactoryOptionen _optionen = optionen ?? new FactoryOptionen();

    public static TestIdentitaetsanbieter Idp => TestIdentitaetsanbieter.Standard;

    public IReadOnlyDictionary<string, string?> Einstellungen
    {
        get
        {
            var werte = new Dictionary<string, string?>
            {
                ["ConnectionStrings:CoinDb"] = connectionString,
                ["Oidc:Authority"] = Idp.Authority,
                ["Oidc:Audience"] = TestIdentitaetsanbieter.Audience,
                ["Oidc:ClientId"] = TestIdentitaetsanbieter.ClientId,
                ["Bootstrap:AdminEmails:0"] = Testbenutzer.AdminEmail,
                ["Frontend:Ursprung"] = FrontendUrsprung,
            };
            foreach (var (schluessel, wert) in _optionen.Einstellungen)
            {
                werte[schluessel] = wert;
            }

            return werte;
        }
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_optionen.Umgebung);
        var gesetzt = Einstellungen.Where(e => e.Value is not null).ToDictionary(e => e.Key, e => e.Value);

        // UseSetting: früh sichtbar (Startprüfung vor Build). In-Memory zuletzt: höchster Vorrang vor
        // appsettings.{Umgebung}.json und User-Secrets (die Entwicklungs-DB darf nie erreicht werden).
        foreach (var (schluessel, wert) in gesetzt)
        {
            builder.UseSetting(schluessel, wert);
        }

        builder.ConfigureAppConfiguration((_, konfiguration) => konfiguration.AddInMemoryCollection(gesetzt));

        if (_optionen.Logger is { } logger)
        {
            builder.ConfigureLogging(logging =>
            {
                logging.AddProvider(logger);
                logging.SetMinimumLevel(LogLevel.Trace);
                logging.AddFilter<SammelLoggerProvider>(null, LogLevel.Trace);
            });
        }

        builder.ConfigureTestServices(services =>
        {
            // Nur der Transport zum Identitätsanbieter wird ersetzt (Entwurf §6.1): Discovery und JWKS kommen aus dem
            // Speicher (Test-IdP und Fremd-IdP). Configure läuft vor allen PostConfigure; ConfigurationManager, Adresse
            // und Prüfparameter baut ausschließlich der Produktionscode – er muss dafür BackchannelHttpHandler übernehmen.
            services.Configure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, o => o.BackchannelHttpHandler = TestIdentitaetsanbieter.Netz);

            if (_optionen.KoerperZaehler is { } zaehler)
            {
                services.AddSingleton<IStartupFilter>(new KoerperLeseZaehler.Filter(zaehler));
            }

            _optionen.Dienste?.Invoke(services);
        });
    }

    /// <summary>Standard-Client: sendet das Token des Bootstrap-Administrators.</summary>
    protected override void ConfigureClient(HttpClient client)
    {
        base.ConfigureClient(client);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Idp.ErzeugeToken(Testbenutzer.Admin));
    }

    /// <summary>Client ohne Authorization-Header (anonym).</summary>
    public HttpClient ClientOhneToken()
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = null;
        return client;
    }

    /// <summary>Client mit beliebigem Bearer-Token (auch ungültig).</summary>
    public HttpClient ClientMitToken(string token)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}
