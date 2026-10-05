namespace Coin.Domain.Katalog;

/// <summary>Use Cases des Coin-Katalogs.</summary>
public sealed class CoinKatalogService(ICoinKatalogRepository repository, TimeProvider zeit)
{
    public async Task<CoinAnlegenErgebnis> AnlegenAsync(
        string? name,
        string? herausgeber,
        int? auflage,
        string? beschreibung,
        CancellationToken ct)
    {
        var ergebnis = CoinTyp.Erstellen(name, herausgeber, auflage, beschreibung, Jetzt());
        if (ergebnis.Wert is not { } coin)
        {
            return new CoinAnlegenErgebnis.Ungueltig(ergebnis.Fehler);
        }

        // Vorabprüfung für eine klare Antwort; gleichzeitige Anfragen fängt der eindeutige Index ab.
        if (await repository.ExistiertAsync(coin.Name, coin.Herausgeber, ct)
            || !await repository.HinzufuegenAsync(coin, ct))
        {
            return new CoinAnlegenErgebnis.Duplikat();
        }

        return new CoinAnlegenErgebnis.Angelegt(
            new CoinEintrag(coin.Id, coin.Name, coin.Herausgeber, coin.Auflage, coin.Beschreibung, coin.ErstelltAm, null));
    }

    public async Task<BildHochladenErgebnis> BildHochladenAsync(Guid coinId, byte[] inhalt, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(inhalt);

        var coin = await repository.FindenAsync(coinId, ct);
        if (coin is null)
        {
            return new BildHochladenErgebnis.CoinNichtGefunden();
        }

        var bildErgebnis = CoinBild.Erstellen(inhalt, Jetzt());
        if (bildErgebnis.Bild is not { } bild)
        {
            return bildErgebnis.Fehler switch
            {
                CoinBildFehler.Leer => new BildHochladenErgebnis.Leer(),
                CoinBildFehler.ZuGross => new BildHochladenErgebnis.ZuGross(),
                _ => new BildHochladenErgebnis.FormatNichtUnterstuetzt(),
            };
        }

        await repository.BildSpeichernAsync(coinId, bild, ct);
        return new BildHochladenErgebnis.Gespeichert(coin with { BildSha256 = bild.Sha256 });
    }

    public Task<IReadOnlyList<CoinEintrag>> AuflistenAsync(CancellationToken ct) => repository.AlleAsync(ct);

    public Task<CoinEintrag?> FindenAsync(Guid id, CancellationToken ct) => repository.FindenAsync(id, ct);

    public Task<CoinBild?> BildLadenAsync(Guid id, CancellationToken ct) => repository.BildLadenAsync(id, ct);

    /// <summary>
    /// Aktuelle Zeit in UTC, auf Mikrosekunden gekürzt. Grund: PostgreSQL <c>timestamptz</c> speichert nur
    /// Mikrosekunden, .NET rechnet in 100-ns-Ticks. Ohne Kürzung enthielte die Antwort auf POST einen genaueren
    /// Zeitstempel als ein späteres GET desselben Coins (gleicher Coin, unterschiedliches <c>erstelltAm</c>).
    /// </summary>
    private DateTimeOffset Jetzt()
    {
        var jetzt = zeit.GetUtcNow();
        return jetzt.AddTicks(-(jetzt.Ticks % TimeSpan.TicksPerMicrosecond));
    }
}
