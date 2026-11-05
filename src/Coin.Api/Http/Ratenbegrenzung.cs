using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Net.Http.Headers;

namespace Coin.Api.Http;

/// <summary>
/// Ratenbegrenzung der Hologrammprüfung (hologrammnummer AK-19, ADR-0034 Punkt 4): Policy <see cref="PolicyPruefung"/>,
/// Fixed Window mit <see cref="PruefungenJeFenster"/> Anfragen je <see cref="Fenster"/>, ohne Warteschlange, partitioniert
/// je Benutzer über den Claim <c>sub</c> des geprüften Tokens, im Speicher je API-Instanz. Die Werte stehen fest im Code
/// und sind nicht per Konfiguration lockerbar. <c>UseRateLimiter</c> steht nach <c>UseAuthorization</c>, damit
/// <c>401</c>/<c>403</c> vor <c>429</c> kommen und kein Kontingent verbrauchen. Abgelehnte Anfragen erhalten
/// ProblemDetails mit <c>code</c> <c>zu_viele_pruefungen</c> und <c>Retry-After</c>; kein Audit, kein eigenes Log.
/// </summary>
public static class Ratenbegrenzung
{
    /// <summary>Name der Policy an beiden Prüf-Endpunkten.</summary>
    public const string PolicyPruefung = "pruefung";

    /// <summary>Höchstzahl der Prüfungen je Benutzer und Fenster (H8).</summary>
    public const int PruefungenJeFenster = 20;

    /// <summary>Länge des Fensters (H8).</summary>
    public static readonly TimeSpan Fenster = TimeSpan.FromSeconds(60);

    public const string Titel = "Zu viele Prüfungen";

    public const string Code = "zu_viele_pruefungen";

    public const string Detail =
        "Sie haben in kurzer Zeit zu viele Prüfungen durchgeführt. Bitte warten Sie einen Moment und versuchen Sie es erneut.";

    /// <summary>Claim des Benutzers (1:1 zu <c>benutzer</c>), nie die IP-Adresse.</summary>
    private const string BenutzerClaim = "sub";

    public static IServiceCollection AddRatenbegrenzung(this IServiceCollection services) =>
        services.AddRateLimiter(optionen =>
        {
            optionen.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            optionen.AddPolicy(PolicyPruefung, kontext => RateLimitPartition.GetFixedWindowLimiter(
                kontext.User.FindFirst(BenutzerClaim)?.Value ?? string.Empty,
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = PruefungenJeFenster,
                    Window = Fenster,
                    QueueLimit = 0,
                    AutoReplenishment = true,
                }));
            optionen.OnRejected = AbgelehntAsync;
        });

    private static async ValueTask AbgelehntAsync(OnRejectedContext kontext, CancellationToken ct)
    {
        var http = kontext.HttpContext;
        var sekunden = (int)Fenster.TotalSeconds;
        if (kontext.Lease.TryGetMetadata(MetadataName.RetryAfter, out var warten))
        {
            sekunden = (int)Math.Ceiling(warten.TotalSeconds);
        }

        sekunden = Math.Clamp(sekunden, 1, (int)Fenster.TotalSeconds);
        http.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        http.Response.Headers[HeaderNames.RetryAfter] = sekunden.ToString(CultureInfo.InvariantCulture);
        http.Response.Headers[HeaderNames.CacheControl] = "no-store";

        var problem = new ProblemDetails { Status = StatusCodes.Status429TooManyRequests, Title = Titel, Detail = Detail };
        problem.Extensions["code"] = Code;
        await http.RequestServices.GetRequiredService<IProblemDetailsService>().TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = http,
            ProblemDetails = problem,
        });
    }
}
