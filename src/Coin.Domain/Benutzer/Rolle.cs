namespace Coin.Domain.Benutzer;

/// <summary>
/// Rollen in C.O.I.N. (ADR-0013). Gespeichert in der eigenen Datenbank, nie aus dem Token gelesen.
/// Vergeben wird vorerst nur <see cref="Administrator"/> per Bootstrap; „keine Rolle“ ist <c>null</c>.
/// </summary>
public enum Rolle
{
    Administrator,
    Sachbearbeiter,
    Betrachter,
}

/// <summary>Rollengruppen für die Autorisierung.</summary>
public static class Rollen
{
    /// <summary>Rollen, die den Coin-Katalog ändern dürfen (Policy KatalogSchreiben, ADR-0014).</summary>
    public static IReadOnlyList<Rolle> DuerfenKatalogSchreiben { get; } = [Rolle.Administrator, Rolle.Sachbearbeiter];
}
