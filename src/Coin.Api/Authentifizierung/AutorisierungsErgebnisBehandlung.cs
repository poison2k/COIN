using Coin.Domain.Benutzer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.AspNetCore.Mvc;

namespace Coin.Api.Authentifizierung;

/// <summary>
/// Wie der Standard, mit zwei Abweichungen:
/// <list type="bullet">
/// <item>Für Pfade ohne Endpunkt greift die FallbackPolicy nicht, sie liefern weiter <c>404</c> statt <c>401</c>. Hinter
/// der Autorisierung folgt nur das Endpunkt-Routing, das für solche Anfragen nichts ausführt.</item>
/// <item><c>403</c> wird hier als ProblemDetails mit <c>code</c> aus dem Fehlergrund geschrieben (ADR-0016 Punkt 7):
/// <c>benutzer_deaktiviert</c> geht <c>keine_berechtigung</c> vor; <c>detail</c> je Berechtigung aus
/// <see cref="KeinZugriff"/>.</item>
/// </list>
/// </summary>
internal sealed class AutorisierungsErgebnisBehandlung : IAuthorizationMiddlewareResultHandler
{
    private readonly AuthorizationMiddlewareResultHandler _standard = new();

    public Task HandleAsync(RequestDelegate next, HttpContext context, AuthorizationPolicy policy, PolicyAuthorizationResult authorizeResult)
    {
        if (context.GetEndpoint() is null && !authorizeResult.Succeeded)
        {
            return next(context);
        }

        if (authorizeResult.Forbidden)
        {
            return KeinZugriffSchreibenAsync(context, authorizeResult.AuthorizationFailure);
        }

        return _standard.HandleAsync(next, context, policy, authorizeResult);
    }

    private static async Task KeinZugriffSchreibenAsync(HttpContext context, AuthorizationFailure? fehler)
    {
        if (context.Response.HasStarted)
        {
            return;
        }

        var gruende = fehler?.FailureReasons.OfType<BerechtigungFehlschlag>().ToList() ?? [];
        var berechtigung = gruende.Select(g => g.Berechtigung).FirstOrDefault(b => b is not null);

        var problem = gruende.Any(g => g.Message == KeinZugriffCodes.BenutzerDeaktiviert)
            ? KeinZugriff.Deaktiviert()
            : KeinZugriff.OhneBerechtigung(berechtigung);

        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.RequestServices.GetRequiredService<IProblemDetailsService>().TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = problem,
        });
    }
}

/// <summary>Texte und Form der 403-Antworten (AK-6). Enthalten nie Rolle, Berechtigungsnamen oder Personendaten.</summary>
public static class KeinZugriff
{
    public const string Titel = "Kein Zugriff";
    public const string DetailDeaktiviert = "Ihr Benutzerkonto ist deaktiviert.";

    private const string DetailAllgemein = "Ihr Benutzerkonto ist für diese Aktion nicht berechtigt.";

    private static readonly Dictionary<string, string> DetailJeBerechtigung = new(StringComparer.Ordinal)
    {
        [Berechtigungen.CoinsRead] = "Ihr Benutzerkonto ist nicht berechtigt, den Coin-Katalog einzusehen.",
        [Berechtigungen.CoinsWrite] = "Ihr Benutzerkonto ist nicht berechtigt, den Coin-Katalog zu ändern.",
        [Berechtigungen.UsersManage] = "Ihr Benutzerkonto ist nicht berechtigt, Benutzer zu verwalten.",
        [Berechtigungen.AuditRead] = "Ihr Benutzerkonto ist nicht berechtigt, das Audit-Log einzusehen.",
    };

    public static ProblemDetails Deaktiviert() => Erstellen(DetailDeaktiviert, KeinZugriffCodes.BenutzerDeaktiviert);

    public static ProblemDetails OhneBerechtigung(string? berechtigung) => Erstellen(
        berechtigung is not null && DetailJeBerechtigung.TryGetValue(berechtigung, out var detail) ? detail : DetailAllgemein,
        KeinZugriffCodes.KeineBerechtigung);

    private static ProblemDetails Erstellen(string detail, string code)
    {
        var problem = new ProblemDetails { Status = StatusCodes.Status403Forbidden, Title = Titel, Detail = detail };
        problem.Extensions["code"] = code;
        return problem;
    }
}
