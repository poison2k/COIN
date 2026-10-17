using Coin.Domain.Ausgaben;
using Coin.Domain.Benutzer;
using Coin.Domain.Katalog;
using Coin.Domain.Vorlagen;
using Coin.Domain.Zertifikate;
using Coin.Infrastructure.Persistenz;
using Coin.Infrastructure.Vorlagen;
using Coin.Infrastructure.Zertifikate;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Coin.Infrastructure;

public static class InfrastrukturRegistrierung
{
    public const string ConnectionStringName = "CoinDb";

    /// <summary>
    /// Registriert Datenbank und Repositories. Der Connection-String <c>ConnectionStrings:CoinDb</c>
    /// kommt aus User-Secrets oder der Umgebungsvariable <c>ConnectionStrings__CoinDb</c> (ADR-0003).
    /// </summary>
    public static IServiceCollection AddInfrastruktur(this IServiceCollection services, IConfiguration configuration)
    {
        // Connection-String erst beim Erzeugen des Kontexts lesen (endgültige Konfiguration, z. B. im Testhost).
        services.AddDbContext<CoinDbContext>((sp, options) =>
            Konfigurieren(options, ConnectionString(sp.GetRequiredService<IConfiguration>())));

        services.AddScoped<ICoinKatalogRepository, CoinKatalogRepository>();
        services.AddScoped<IAusgabeRepository, AusgabeRepository>();
        services.AddScoped<IBenutzerRepository, BenutzerRepository>();
        services.AddScoped<IBenutzerverwaltungRepository, BenutzerverwaltungRepository>();
        services.AddScoped<IZertifikatsvorlageRepository, ZertifikatsvorlageRepository>();
        services.AddScoped<IZertifikatRepository, ZertifikatRepository>();

        // Word-Vorlagen (ADR-0022, ADR-0024): zustandslos; die Standardvorlage wird je Prozess einmal erzeugt.
        services.AddSingleton<IDocxAnalyse, DocxAnalyse>();
        services.AddSingleton<IDocxBereinigung, DocxBereinigung>();
        services.AddSingleton<StandardvorlageErzeuger>();
        services.AddSingleton<IStandardvorlage>(sp => sp.GetRequiredService<StandardvorlageErzeuger>());
        services.AddSingleton<IStandardzertifikat>(sp => sp.GetRequiredService<StandardvorlageErzeuger>());

        // Zertifikate (ADR-0028): prozessweit ein Erzeuger, damit die Grenze gleichzeitiger Erzeugungen greift (AK-16).
        services.AddSingleton<IZertifikatErzeuger, ZertifikatErzeuger>();
        return services;
    }

    internal static DbContextOptionsBuilder Konfigurieren(DbContextOptionsBuilder options, string connectionString) =>
        options
            .UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history"))
            .UseSnakeCaseNamingConvention();

    /// <summary>Liefert den Connection-String oder bricht mit klarer Meldung ab (ohne den Wert preiszugeben).</summary>
    public static string ConnectionString(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString(ConnectionStringName);
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                $"Connection-String 'ConnectionStrings:{ConnectionStringName}' fehlt. " +
                $"Bitte per User-Secrets (dotnet user-secrets set \"ConnectionStrings:{ConnectionStringName}\" \"...\" --project src/Coin.Api) " +
                $"oder Umgebungsvariable 'ConnectionStrings__{ConnectionStringName}' setzen.");
        }

        return connectionString;
    }
}
