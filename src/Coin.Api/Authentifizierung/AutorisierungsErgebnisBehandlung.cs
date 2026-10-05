using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;

namespace Coin.Api.Authentifizierung;

/// <summary>
/// Wie der Standard, mit einer Ausnahme: Für Pfade ohne Endpunkt greift die FallbackPolicy nicht, sie liefern weiter
/// <c>404</c> statt <c>401</c> (Entwurf 5.4). Hinter der Autorisierung folgt nur das Endpunkt-Routing, das für solche
/// Anfragen nichts ausführt; geschützte Inhalte sind darüber nicht erreichbar.
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

        return _standard.HandleAsync(next, context, policy, authorizeResult);
    }
}
