using Coin.Domain.Benutzer;

namespace Coin.Api.Contracts;

/// <summary>
/// Antwort von <c>GET /api/me</c> (AK-20, rollen-benutzerverwaltung AK-10). <see cref="Id"/> ist die interne GUID, nie
/// <c>sub</c> oder Issuer. <see cref="Rolle"/> ist „Administrator“, „Sachbearbeiter“, „Betrachter“ oder „keine“.
/// <see cref="Berechtigungen"/> stammt aus der <see cref="Rechtematrix"/>, ordinal sortiert.
/// </summary>
public sealed record MeResponse(Guid Id, string Name, string? Email, string Rolle, IReadOnlyList<string> Berechtigungen)
{
    public static MeResponse Aus(Benutzer benutzer) => new(
        benutzer.Id,
        benutzer.Anzeigename,
        benutzer.Email,
        RolleText.Von(benutzer.Rolle),
        Rechtematrix.Sortiert(benutzer));
}
