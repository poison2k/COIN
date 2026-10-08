namespace Coin.Domain.Katalog;

/// <summary>
/// Regel zum Ändern der Auflage (coin-ausgaben AK-17, F3/F4/F9, ADR-0020 Punkt 8). Wird unter der Coin-Sperre
/// ausgewertet. <see cref="Erhoehung"/> nennt die zu erzeugenden, <see cref="Senkung"/> die zu löschenden Nummern.
/// </summary>
public abstract record AuflageAenderung
{
    private AuflageAenderung()
    {
    }

    public sealed record Ungueltig(IReadOnlyDictionary<string, string[]> Fehler) : AuflageAenderung;

    public sealed record Unveraendert : AuflageAenderung;

    public sealed record Erhoehung(int Von, int Bis) : AuflageAenderung;

    public sealed record Senkung(int Von, int Bis) : AuflageAenderung;

    public sealed record ZuKlein(int HoechsteAusgegebeneNummer) : AuflageAenderung;

    /// <summary>Nur die Feldprüfung der neuen Auflage (vor der Sperre); <c>null</c>, wenn gültig.</summary>
    public static IReadOnlyDictionary<string, string[]>? Feldfehler(int? neueAuflage) => neueAuflage switch
    {
        null => new Dictionary<string, string[]> { ["auflage"] = ["Auflage ist erforderlich."] },
        < CoinTyp.AuflageMin or > CoinTyp.AuflageMax => new Dictionary<string, string[]>
        {
            ["auflage"] = [$"Auflage muss zwischen {CoinTyp.AuflageMin} und {CoinTyp.AuflageMax} liegen."],
        },
        _ => null,
    };

    public static AuflageAenderung Pruefen(int? alteAuflage, int? neueAuflage, int? hoechsteJeAusgegebeneNummer)
    {
        if (Feldfehler(neueAuflage) is { } fehler)
        {
            return new Ungueltig(fehler);
        }

        var neu = neueAuflage!.Value;
        if (alteAuflage == neu)
        {
            return new Unveraendert();
        }

        if (alteAuflage is not { } alt || neu > alt)
        {
            return new Erhoehung((alteAuflage ?? 0) + 1, neu);
        }

        if (hoechsteJeAusgegebeneNummer is { } hoechste && hoechste > neu)
        {
            return new ZuKlein(hoechste);
        }

        return new Senkung(neu + 1, alt);
    }
}
