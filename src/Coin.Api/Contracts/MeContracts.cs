using Coin.Domain.Benutzer;

namespace Coin.Api.Contracts;

/// <summary>
/// Antwort von <c>GET /api/me</c> (AK-20). <see cref="Id"/> ist die interne GUID, nie <c>sub</c> oder Issuer.
/// <see cref="Rolle"/> ist „Administrator“, „Sachbearbeiter“, „Betrachter“ oder „keine“.
/// </summary>
public sealed record MeResponse(Guid Id, string Name, string? Email, string Rolle)
{
    public const string KeineRolle = "keine";

    public static MeResponse Aus(Benutzer benutzer) => new(
        benutzer.Id,
        benutzer.Anzeigename,
        benutzer.Email,
        benutzer.Rolle?.ToString() ?? KeineRolle);
}
