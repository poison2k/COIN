namespace Coin.Domain.Katalog;

/// <summary>
/// Geprüfte Stammdaten eines Coins (Name, Herausgeber, Auflage, Beschreibung), getrimmt. Gemeinsame Feldprüfung für
/// Anlegen (<see cref="CoinTyp.Erstellen"/>) und Bearbeiten (zertifikatsvorlagen AK-22, ADR-0025).
/// </summary>
public sealed record CoinStammdaten(string Name, string Herausgeber, int? Auflage, string? Beschreibung)
{
    /// <summary>
    /// Prüft und trimmt die Werte. <paramref name="bisherigeAuflage"/> ist die Auflage vor der Änderung: Eine gesetzte
    /// Auflage darf nicht wieder <c>null</c> werden („Auflage ist erforderlich.“). Die Untergrenze beim Senken prüft
    /// <see cref="AuflageAenderung"/> unter der Coin-Sperre.
    /// </summary>
    public static Ergebnis<CoinStammdaten> Pruefen(
        string? name, string? herausgeber, int? auflage, string? beschreibung, int? bisherigeAuflage)
    {
        var fehler = new Dictionary<string, string[]>();

        var nameGetrimmt = name?.Trim() ?? string.Empty;
        if (nameGetrimmt.Length == 0)
        {
            fehler["name"] = ["Name ist erforderlich."];
        }
        else if (nameGetrimmt.Length > CoinTyp.NameMaxLaenge)
        {
            fehler["name"] = [$"Name darf höchstens {CoinTyp.NameMaxLaenge} Zeichen lang sein."];
        }

        var herausgeberGetrimmt = herausgeber?.Trim() ?? string.Empty;
        if (herausgeberGetrimmt.Length == 0)
        {
            fehler["herausgeber"] = ["Herausgeber ist erforderlich."];
        }
        else if (herausgeberGetrimmt.Length > CoinTyp.HerausgeberMaxLaenge)
        {
            fehler["herausgeber"] = [$"Herausgeber darf höchstens {CoinTyp.HerausgeberMaxLaenge} Zeichen lang sein."];
        }

        if (auflage is < CoinTyp.AuflageMin or > CoinTyp.AuflageMax)
        {
            fehler["auflage"] = [$"Auflage muss zwischen {CoinTyp.AuflageMin} und {CoinTyp.AuflageMax} liegen."];
        }
        else if (auflage is null && bisherigeAuflage is not null)
        {
            fehler["auflage"] = ["Auflage ist erforderlich."];
        }

        var beschreibungGetrimmt = string.IsNullOrWhiteSpace(beschreibung) ? null : beschreibung.Trim();
        if (beschreibungGetrimmt is { Length: > CoinTyp.BeschreibungMaxLaenge })
        {
            fehler["beschreibung"] = [$"Beschreibung darf höchstens {CoinTyp.BeschreibungMaxLaenge} Zeichen lang sein."];
        }

        return fehler.Count > 0
            ? Ergebnis<CoinStammdaten>.Fehlschlag(fehler)
            : Ergebnis<CoinStammdaten>.Erfolg(new CoinStammdaten(nameGetrimmt, herausgeberGetrimmt, auflage, beschreibungGetrimmt));
    }
}
