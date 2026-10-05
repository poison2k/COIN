using Coin.Domain.Benutzer;
using Microsoft.AspNetCore.Authorization;

namespace Coin.Api.Authentifizierung;

/// <summary>Namen der Autorisierungs-Policies (ADR-0013, ADR-0014).</summary>
public static class Policies
{
    /// <summary>Angemeldet und Rolle Administrator oder Sachbearbeiter (<see cref="Rollen.DuerfenKatalogSchreiben"/>).</summary>
    public const string KatalogSchreiben = "KatalogSchreiben";
}

/// <summary>Verlangt eine der Rollen aus der eigenen Datenbank. Rollen aus dem Token werden nie ausgewertet (AK-11).</summary>
public sealed class RolleAnforderung(IReadOnlyList<Rolle> rollen) : IAuthorizationRequirement
{
    public IReadOnlyList<Rolle> Rollen { get; } = rollen;

    public override string ToString() => $"{nameof(RolleAnforderung)}: {string.Join(", ", Rollen)}";
}

internal sealed class RolleAnforderungHandler(IAktuellerBenutzer aktuellerBenutzer) : AuthorizationHandler<RolleAnforderung>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, RolleAnforderung requirement)
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            return;
        }

        var ct = (context.Resource as HttpContext)?.RequestAborted ?? CancellationToken.None;
        var benutzer = await aktuellerBenutzer.LadenAsync(ct);
        if (benutzer.Rolle is { } rolle && requirement.Rollen.Contains(rolle))
        {
            context.Succeed(requirement);
        }
    }
}
