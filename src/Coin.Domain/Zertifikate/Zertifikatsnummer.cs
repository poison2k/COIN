using System.Globalization;
using Coin.Domain.Katalog;

namespace Coin.Domain.Zertifikate;

/// <summary>
/// Zertifikatsnummer einer Ausgabe (zertifikat-erzeugen AK-3, ADR-0027 Punkt 4 und 5): <c>&lt;Kennung&gt;-&lt;Exemplar&gt;</c>,
/// das Exemplar mit mindestens 4 Ziffern und führenden Nullen (<c>C0042-0012</c>), ab 10.000 ungekürzt (F3). Dasselbe
/// Exemplar ergibt dieselbe Nummer, auch bei einer Neuausgabe nach Storno (F2).
/// </summary>
public static class Zertifikatsnummer
{
    /// <summary>Höchstlänge in der Datenbank (<c>varchar(32)</c>).</summary>
    public const int MaxLaenge = 32;

    public static string Bilden(string kennung, int exemplar)
    {
        if (!CoinKennung.IstGueltig(kennung))
        {
            throw new ArgumentException("Die Coin-Kennung hat kein gültiges Format.", nameof(kennung));
        }

        ArgumentOutOfRangeException.ThrowIfLessThan(exemplar, 1);
        return $"{kennung}-{exemplar.ToString("D4", CultureInfo.InvariantCulture)}";
    }
}
