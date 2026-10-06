namespace Coin.Domain.Benutzer;

/// <summary>
/// Benutzer in der eigenen Datenbank. <see cref="Rolle"/> <c>null</c> = keine Rolle. <see cref="Aktiv"/> <c>false</c> =
/// deaktiviert: keine Berechtigungen, unabhängig von der Rolle (ADR-0016).
/// </summary>
public sealed record Benutzer(
    Guid Id,
    string Issuer,
    string Subject,
    string? Email,
    string Anzeigename,
    Rolle? Rolle,
    DateTimeOffset ErstelltAm,
    DateTimeOffset AktualisiertAm,
    bool Aktiv = true)
{
    /// <summary>Aktiver Administrator (zählt für die Schutzregel „letzter Administrator“, ADR-0018).</summary>
    public bool IstAktiverAdministrator => Aktiv && Rolle == global::Coin.Domain.Benutzer.Rolle.Administrator;
}
