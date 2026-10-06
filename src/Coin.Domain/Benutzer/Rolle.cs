namespace Coin.Domain.Benutzer;

/// <summary>
/// Feste Rollen in C.O.I.N. (ADR-0013, ADR-0016). Gespeichert in der eigenen Datenbank, nie aus dem Token gelesen.
/// „Keine Rolle“ ist <c>null</c>. Die Rechte einer Rolle stehen in <see cref="Rechtematrix"/>.
/// </summary>
public enum Rolle
{
    Administrator,
    Sachbearbeiter,
    Betrachter,
}

/// <summary>Textdarstellung der Rolle in API und Audit-Log: Enum-Name oder „keine“ (exakt, Groß-/Kleinschreibung zählt).</summary>
public static class RolleText
{
    public const string Keine = "keine";

    public static string Von(Rolle? rolle) => rolle?.ToString() ?? Keine;

    /// <summary>Liest genau „Administrator“, „Sachbearbeiter“, „Betrachter“ oder „keine“; alles andere ist ungültig.</summary>
    public static bool TryParse(string? text, out Rolle? rolle)
    {
        rolle = null;
        switch (text)
        {
            case Keine:
                return true;
            case nameof(Rolle.Administrator):
                rolle = Rolle.Administrator;
                return true;
            case nameof(Rolle.Sachbearbeiter):
                rolle = Rolle.Sachbearbeiter;
                return true;
            case nameof(Rolle.Betrachter):
                rolle = Rolle.Betrachter;
                return true;
            default:
                return false;
        }
    }
}
