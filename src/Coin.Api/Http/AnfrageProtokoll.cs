using System.Text;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Routing.Patterns;

namespace Coin.Api.Http;

/// <summary>
/// Request-Protokoll ohne Personendaten (ADR-0019, AK-46): genau ein Eintrag je Request mit Methode (feste Liste),
/// Routen-Template (nie der rohe Pfad, nie der Query-String), gesendetem Status und Dauer. Steht als erste Middleware
/// vor <c>UseExceptionHandler</c>, damit auch 401, 403, 404 und 500 erfasst werden. Öffnet keine Log-Scopes.
/// Abschalten nur über das Log-Level der Kategorie <c>Coin.Api.Http.AnfrageProtokoll</c>.
/// </summary>
public sealed partial class AnfrageProtokoll(RequestDelegate next, ILogger<AnfrageProtokoll> logger, TimeProvider zeit)
{
    public const string KeineRoute = "(keine Route)";
    public const string AndereMethode = "ANDERE";

    /// <summary>Client hat die Verbindung abgebrochen (Konvention u. a. von nginx, kein offizieller HTTP-Status).</summary>
    public const int ClientAbbruch = 499;

    public async Task InvokeAsync(HttpContext context)
    {
        if (!logger.IsEnabled(LogLevel.Information))
        {
            await next(context);
            return;
        }

        var start = zeit.GetTimestamp();
        Exception? ausnahme = null;
        try
        {
            await next(context);
        }
        catch (Exception e)
        {
            ausnahme = e;
            throw;
        }
        finally
        {
            var dauer = (long)Math.Round(zeit.GetElapsedTime(start).TotalMilliseconds, MidpointRounding.AwayFromZero);
            Protokollieren(logger, Methode(context.Request.Method), Route(context), Status(context, ausnahme), dauer);
        }
    }

    /// <summary>
    /// Der gesendete Status: ohne Ausnahme bzw. nach Antwortbeginn der tatsächliche Status, bei Abbruch durch den Client
    /// <see cref="ClientAbbruch"/>, sonst 500.
    /// </summary>
    private static int Status(HttpContext context, Exception? ausnahme) => ausnahme switch
    {
        null => context.Response.StatusCode,
        _ when context.Response.HasStarted => context.Response.StatusCode,
        OperationCanceledException when context.RequestAborted.IsCancellationRequested => ClientAbbruch,
        _ => StatusCodes.Status500InternalServerError,
    };

    /// <summary>Die Methode aus einer festen Liste, sonst <see cref="AndereMethode"/> (keine freien Werte).</summary>
    public static string Methode(string methode) => methode switch
    {
        _ when HttpMethods.IsGet(methode) => "GET",
        _ when HttpMethods.IsPost(methode) => "POST",
        _ when HttpMethods.IsPut(methode) => "PUT",
        _ when HttpMethods.IsPatch(methode) => "PATCH",
        _ when HttpMethods.IsDelete(methode) => "DELETE",
        _ when HttpMethods.IsHead(methode) => "HEAD",
        _ when HttpMethods.IsOptions(methode) => "OPTIONS",
        _ => AndereMethode,
    };

    private static string Route(HttpContext context)
    {
        // Der Exception-Handler setzt den Endpunkt vor dem erneuten Durchlauf zurück; das Original steht im Feature.
        var endpunkt = context.GetEndpoint() ?? context.Features.Get<IExceptionHandlerFeature>()?.Endpoint;
        return endpunkt is RouteEndpoint routenEndpunkt ? Template(routenEndpunkt.RoutePattern) : KeineRoute;
    }

    /// <summary>Routen-Template mit führendem <c>/</c>, Parameter nur als Platzhalter ohne Constraints und Defaults.</summary>
    public static string Template(RoutePattern muster)
    {
        ArgumentNullException.ThrowIfNull(muster);
        var text = new StringBuilder();
        foreach (var segment in muster.PathSegments)
        {
            text.Append('/');
            foreach (var teil in segment.Parts)
            {
                switch (teil)
                {
                    case RoutePatternLiteralPart literal:
                        text.Append(literal.Content);
                        break;
                    case RoutePatternSeparatorPart trenner:
                        text.Append(trenner.Content);
                        break;
                    case RoutePatternParameterPart parameter:
                        text.Append('{');
                        if (parameter.IsCatchAll)
                        {
                            text.Append('*');
                        }

                        text.Append(parameter.Name);
                        if (parameter.IsOptional)
                        {
                            text.Append('?');
                        }

                        text.Append('}');
                        break;
                }
            }
        }

        return text.Length == 0 ? "/" : text.ToString();
    }

    [LoggerMessage(EventId = 4601, EventName = "AnfrageBeendet", Level = LogLevel.Information,
        Message = "HTTP {Methode} {Route} antwortete {Status} in {DauerMs} ms")]
    private static partial void Protokollieren(ILogger logger, string methode, string route, int status, long dauerMs);
}
