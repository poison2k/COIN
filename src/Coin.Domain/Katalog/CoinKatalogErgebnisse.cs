namespace Coin.Domain.Katalog;

/// <summary>Ergebnis von <see cref="CoinKatalogService.AnlegenAsync"/>.</summary>
public abstract record CoinAnlegenErgebnis
{
    private CoinAnlegenErgebnis()
    {
    }

    public sealed record Angelegt(CoinEintrag Coin) : CoinAnlegenErgebnis;

    public sealed record Ungueltig(IReadOnlyDictionary<string, string[]> Fehler) : CoinAnlegenErgebnis;

    public sealed record Duplikat : CoinAnlegenErgebnis;
}

/// <summary>Ergebnis von <see cref="CoinKatalogService.BildHochladenAsync"/>.</summary>
public abstract record BildHochladenErgebnis
{
    private BildHochladenErgebnis()
    {
    }

    public sealed record Gespeichert(CoinEintrag Coin) : BildHochladenErgebnis;

    public sealed record CoinNichtGefunden : BildHochladenErgebnis;

    public sealed record Leer : BildHochladenErgebnis;

    public sealed record ZuGross : BildHochladenErgebnis;

    public sealed record FormatNichtUnterstuetzt : BildHochladenErgebnis;
}
