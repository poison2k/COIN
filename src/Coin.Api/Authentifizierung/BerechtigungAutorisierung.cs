using Coin.Domain.Benutzer;
using Microsoft.AspNetCore.Authorization;

namespace Coin.Api.Authentifizierung;

/// <summary>
/// Verlangt einen aktiven Benutzer und, falls angegeben, eine Berechtigung aus der <see cref="Rechtematrix"/>
/// (ADR-0016 Punkt 6). <see cref="Berechtigung"/> <c>null</c> = nur „angemeldet und aktiv“ (Default- und Fallback-Policy).
/// Rollen und Berechtigungen aus dem Token werden nie ausgewertet.
/// </summary>
public sealed class BerechtigungAnforderung(string? berechtigung) : IAuthorizationRequirement
{
    public string? Berechtigung { get; } = berechtigung;

    public override string ToString() => $"{nameof(BerechtigungAnforderung)}: {Berechtigung ?? "angemeldet und aktiv"}";
}

/// <summary>
/// Fehlergrund mit der fehlenden Berechtigung. <see cref="AuthorizationHandlerContext.Fail(AuthorizationFailureReason)"/>
/// liefert keine fehlgeschlagenen Requirements, deshalb trägt der Grund die Berechtigung selbst.
/// <see cref="AuthorizationFailureReason.Message"/> ist der <c>code</c> (keine Personendaten, wird ggf. geloggt).
/// </summary>
public sealed class BerechtigungFehlschlag(IAuthorizationHandler handler, string code, string? berechtigung)
    : AuthorizationFailureReason(handler, code)
{
    public string? Berechtigung { get; } = berechtigung;
}

/// <summary>Fehlergründe der Autorisierung, als <c>code</c> in 403-Antworten (AK-6).</summary>
public static class KeinZugriffCodes
{
    public const string BenutzerDeaktiviert = "benutzer_deaktiviert";
    public const string KeineBerechtigung = "keine_berechtigung";
}

/// <summary>
/// Prüft <see cref="BerechtigungAnforderung"/> gegen den Benutzer aus der eigenen Datenbank. Deaktiviert geht der
/// Berechtigung vor. Ohne Endpunkt (unbekannter Pfad) entscheidet er nicht und gleicht keinen Benutzer ab (AK-8).
/// </summary>
internal sealed class BerechtigungAnforderungHandler(IAktuellerBenutzer aktuellerBenutzer) : AuthorizationHandler<BerechtigungAnforderung>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, BerechtigungAnforderung requirement)
    {
        if (context.User.Identity?.IsAuthenticated != true
            || context.Resource is not HttpContext httpContext
            || httpContext.GetEndpoint() is null)
        {
            return;
        }

        var benutzer = await aktuellerBenutzer.LadenAsync(httpContext.RequestAborted);
        if (!benutzer.Aktiv)
        {
            context.Fail(new BerechtigungFehlschlag(this, KeinZugriffCodes.BenutzerDeaktiviert, requirement.Berechtigung));
        }
        else if (requirement.Berechtigung is null || Rechtematrix.Hat(benutzer, requirement.Berechtigung))
        {
            context.Succeed(requirement);
        }
        else
        {
            context.Fail(new BerechtigungFehlschlag(this, KeinZugriffCodes.KeineBerechtigung, requirement.Berechtigung));
        }
    }
}
