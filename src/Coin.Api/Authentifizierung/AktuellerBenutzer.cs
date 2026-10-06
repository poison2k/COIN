using System.Security.Claims;
using Coin.Domain.Benutzer;

namespace Coin.Api.Authentifizierung;

/// <summary>
/// Der Benutzer des aktuellen Requests aus der eigenen Datenbank (ADR-0013, Option C). Der Abgleich läuft höchstens
/// einmal pro Request und nur auf Endpunkten, die eine Anmeldung verlangen (ADR-0016). <see cref="Benutzer.Id"/> ist
/// der Akteur für Änderungen in der Benutzerverwaltung.
/// </summary>
public interface IAktuellerBenutzer
{
    Task<Benutzer> LadenAsync(CancellationToken ct);
}

internal sealed class AktuellerBenutzer(IHttpContextAccessor httpContextAccessor, BenutzerAbgleichService abgleich) : IAktuellerBenutzer
{
    private Task<Benutzer>? _benutzer;

    public Task<Benutzer> LadenAsync(CancellationToken ct) => _benutzer ??= AbgleichenAsync(ct);

    private Task<Benutzer> AbgleichenAsync(CancellationToken ct)
    {
        var principal = httpContextAccessor.HttpContext?.User;
        if (principal?.Identity?.IsAuthenticated != true)
        {
            throw new InvalidOperationException("Der Benutzerabgleich setzt einen angemeldeten Benutzer voraus.");
        }

        return abgleich.AbgleichenAsync(BenutzerClaims.Identitaet(principal), ct);
    }
}

/// <summary>Liest die Identität aus den Claims eines geprüften Access-Tokens (ohne Umbenennung, MapInboundClaims=false).</summary>
public static class BenutzerClaims
{
    public const string Subject = "sub";
    public const string Issuer = "iss";
    public const string AuthorizedParty = "azp";
    public const string Email = "email";
    public const string EmailVerifiziert = "email_verified";
    public const string Name = "name";
    public const string PreferredUsername = "preferred_username";

    public static BenutzerIdentitaet Identitaet(ClaimsPrincipal principal)
    {
        ArgumentNullException.ThrowIfNull(principal);

        var subject = principal.FindFirst(Subject)?.Value;
        var issuer = principal.FindFirst(Issuer)?.Value;
        if (string.IsNullOrWhiteSpace(subject) || string.IsNullOrWhiteSpace(issuer))
        {
            throw new InvalidOperationException("Das Token enthält kein sub oder iss.");
        }

        return BenutzerIdentitaet.Erstellen(
            issuer,
            subject,
            principal.FindFirst(Email)?.Value,
            IstVerifiziert(principal.FindFirst(EmailVerifiziert)),
            principal.FindFirst(Name)?.Value,
            principal.FindFirst(PreferredUsername)?.Value);
    }

    /// <summary>Nur ein JSON-Boolean <c>true</c> zählt; eine Zeichenkette „true“ oder ein fehlender Claim nicht (AK-16).</summary>
    private static bool IstVerifiziert(Claim? claim) =>
        claim is { ValueType: ClaimValueTypes.Boolean }
        && bool.TryParse(claim.Value, out var verifiziert)
        && verifiziert;
}
