using Coin.Api.Authentifizierung;
using Coin.Api.Http;
using Coin.Domain.Ausgaben;
using Coin.Domain.Benutzer;
using Coin.Domain.Katalog;
using Coin.Domain.Vorlagen;
using Coin.Domain.Zertifikate;
using Coin.Infrastructure;
using Coin.Infrastructure.Persistenz;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddControllers()
    // Keine internen Details (Typnamen, Parserdetails) in 400-Antworten bei kaputtem JSON.
    .AddJsonOptions(options => options.AllowInputFormatterExceptionMessages = false)
    .ConfigureApiBehaviorOptions(options =>
        options.InvalidModelStateResponseFactory = UngueltigeAnfrageAntwort.Erstellen);
builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = ProblemTitel.Setzen);
builder.Services.AddOpenApi();

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<CoinKatalogService>();
builder.Services.AddScoped<AusgabeService>();
builder.Services.AddScoped<BenutzerverwaltungService>();
// Prozessweit ein Exemplar: begrenzt die gleichzeitigen Aufbereitungen (AK-12) und protokolliert Fehlschläge (AK-16).
builder.Services.AddSingleton<IVorlagenProtokoll, VorlagenProtokoll>();
builder.Services.AddSingleton(sp => new VorlagenAufbereitung(
    sp.GetRequiredService<IDocxAnalyse>(), sp.GetRequiredService<IDocxBereinigung>(), sp.GetRequiredService<IVorlagenProtokoll>()));
builder.Services.AddScoped<ZertifikatsvorlageService>();
// Zertifikate (zertifikat-erzeugen AK-17): feste Warnung ohne Inhalte; der Erzeuger selbst ist ein Singleton (AK-16).
builder.Services.AddSingleton<IZertifikatProtokoll, ZertifikatProtokoll>();
builder.Services.AddScoped<ZertifikatService>();
builder.Services.AddUrlsNichtProtokollieren();
builder.Services.AddInfrastruktur(builder.Configuration);

// Anmeldung (ADR-0012) und Autorisierung (ADR-0013, ADR-0014): standardmäßig geschützt.
builder.Services.AddAnmeldung();

// CORS nur für Frontend:Ursprung, ohne Credentials (AK-12). Gelesen aus der endgültigen Konfiguration.
builder.Services.AddCors();
builder.Services.AddOptions<CorsOptions>().Configure<IConfiguration>((options, konfiguration) =>
{
    if (FrontendUrsprung.Lesen(konfiguration) is { } ursprung)
    {
        options.AddDefaultPolicy(policy => policy
            .WithOrigins(ursprung)
            .WithMethods(HttpMethods.Get, HttpMethods.Post, HttpMethods.Put)
            .WithHeaders("Authorization", "Content-Type")
            // Dateiname der DOCX-Downloads für das Frontend lesbar (zertifikatsvorlagen AK-6, AK-30).
            .WithExposedHeaders("Content-Disposition"));
    }
});

var app = builder.Build();

// Fehlende oder unsichere Konfiguration bricht den Start sofort mit klarer Meldung ab (ADR-0003, AK-6, AK-12).
_ = app.Services.GetRequiredService<OidcOptionen>();
var frontendUrsprung = FrontendUrsprung.Lesen(app.Configuration);
InfrastrukturRegistrierung.ConnectionString(app.Configuration);

// Request-Protokoll ohne Personendaten als erste Middleware, damit auch 401/403/404/500 erfasst werden (ADR-0019).
app.UseMiddleware<AnfrageProtokoll>();

// Unerwartete Fehler und Statuscodes ohne Body als ProblemDetails, ohne interne Details (AK-19).
app.UseExceptionHandler();
app.UseStatusCodePages();

if (frontendUrsprung is not null)
{
    app.UseCors();
}

app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
}

// Migrationen automatisch nur in der Entwicklung und im Testhost (ADR-0003).
if (app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing"))
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<CoinDbContext>().Database.MigrateAsync();
}

app.MapControllers();

await app.RunAsync();

/// <summary>Einstiegspunkt; öffentlich für <c>WebApplicationFactory</c> in den Integrationstests.</summary>
public partial class Program;
