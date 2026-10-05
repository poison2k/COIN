using Coin.Api.Http;
using Coin.Domain.Katalog;
using Coin.Infrastructure;
using Coin.Infrastructure.Persistenz;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddControllers()
    // Keine internen Details (Typnamen, Parserdetails) in 400-Antworten bei kaputtem JSON.
    .AddJsonOptions(options => options.AllowInputFormatterExceptionMessages = false)
    .ConfigureApiBehaviorOptions(options =>
        options.InvalidModelStateResponseFactory = UngueltigeAnfrageAntwort.Erstellen);
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<CoinKatalogService>();
builder.Services.AddInfrastruktur(builder.Configuration);

var app = builder.Build();

// Ohne Connection-String sofort mit klarer Meldung abbrechen (ADR-0003).
InfrastrukturRegistrierung.ConnectionString(app.Configuration);

// Unerwartete Fehler und Statuscodes ohne Body als ProblemDetails, ohne interne Details (AK-19).
app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
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
