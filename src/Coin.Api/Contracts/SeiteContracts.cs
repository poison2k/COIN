using Coin.Domain.Gemeinsam;

namespace Coin.Api.Contracts;

/// <summary>Eine Seite einer Liste: <c>{ eintraege, gesamt, seite, groesse }</c> (Benutzer, Audit, Coin-Katalog).</summary>
public sealed record SeiteResponse<T>(IReadOnlyList<T> Eintraege, int Gesamt, int Seite, int Groesse)
{
    public static SeiteResponse<T> Aus<TQuelle>(Seite<TQuelle> seite, Func<TQuelle, T> abbilden)
    {
        ArgumentNullException.ThrowIfNull(seite);
        return new SeiteResponse<T>([.. seite.Eintraege.Select(abbilden)], seite.Gesamt, seite.Nummer, seite.Groesse);
    }
}
