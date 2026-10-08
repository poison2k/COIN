using Coin.Domain.Gemeinsam;

namespace Coin.Domain.Katalog;

public interface ICoinKatalogRepository
{
    /// <summary>Prüft ohne Beachtung von Groß-/Kleinschreibung, ob Name und Herausgeber schon vergeben sind.</summary>
    Task<bool> ExistiertAsync(string name, string herausgeber, CancellationToken ct);

    /// <summary>Speichert einen neuen Coin. <c>false</c>, wenn der eindeutige Index verletzt wurde (Duplikat).</summary>
    Task<bool> HinzufuegenAsync(CoinTyp coin, CancellationToken ct);

    /// <summary>
    /// Eine Seite Coins ohne Bildbytes, deren Name oder Herausgeber <paramref name="suche"/> enthält (Teilstring,
    /// wörtlich, ohne Groß-/Kleinschreibung; <c>null</c> = alle). Sortiert nach Name ohne Beachtung der
    /// Schreibweise, dann nach Id. <paramref name="suche"/> kommt bereits getrimmt.
    /// </summary>
    Task<Seite<CoinEintrag>> SuchenAsync(string? suche, int seite, int groesse, CancellationToken ct);

    /// <summary>Ein Coin ohne Bildbytes oder <c>null</c>.</summary>
    Task<CoinEintrag?> FindenAsync(Guid id, CancellationToken ct);

    /// <summary>Setzt oder ersetzt das Bild eines Coins.</summary>
    Task BildSpeichernAsync(Guid id, CoinBild bild, CancellationToken ct);

    /// <summary>Das Bild eines Coins oder <c>null</c> (unbekannter Coin oder kein Bild).</summary>
    Task<CoinBild?> BildLadenAsync(Guid id, CancellationToken ct);
}
