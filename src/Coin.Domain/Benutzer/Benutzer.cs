namespace Coin.Domain.Benutzer;

/// <summary>Benutzer in der eigenen Datenbank. <see cref="Rolle"/> <c>null</c> = keine Rolle.</summary>
public sealed record Benutzer(
    Guid Id,
    string Issuer,
    string Subject,
    string? Email,
    string Anzeigename,
    Rolle? Rolle,
    DateTimeOffset ErstelltAm,
    DateTimeOffset AktualisiertAm);
