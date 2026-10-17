using System.Globalization;

namespace Coin.Domain.Katalog;

/// <summary>
/// Kurze, unveränderliche Kennung eines Coins (zertifikat-erzeugen AK-1, ADR-0027 Punkt 1 und 2): <c>C</c> und eine
/// laufende Nummer mit mindestens 4 Ziffern und führenden Nullen (<c>C0042</c>), ab 10.000 ungekürzt (<c>C10000</c>).
/// Vergeben wird sie von der Datenbank per Sequenz; hier liegen nur Format und Muster.
/// </summary>
public static class CoinKennung
{
    /// <summary>Höchstlänge in der Datenbank (<c>coin_typ.kennung varchar(12)</c>).</summary>
    public const int MaxLaenge = 12;

    /// <summary>Kennung zur laufenden Nummer, z. B. 42 → <c>C0042</c>, 10000 → <c>C10000</c>.</summary>
    public static string Formatieren(long nummer)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(nummer, 1);
        return "C" + nummer.ToString("D4", CultureInfo.InvariantCulture);
    }

    /// <summary>Entspricht <paramref name="kennung"/> dem Muster <c>^C[0-9]{4,}$</c> (nur ASCII-Ziffern)?</summary>
    public static bool IstGueltig(string? kennung)
    {
        if (kennung is null || kennung.Length < 5 || kennung.Length > MaxLaenge || kennung[0] != 'C')
        {
            return false;
        }

        foreach (var zeichen in kennung.AsSpan(1))
        {
            if (!char.IsAsciiDigit(zeichen))
            {
                return false;
            }
        }

        return true;
    }
}
