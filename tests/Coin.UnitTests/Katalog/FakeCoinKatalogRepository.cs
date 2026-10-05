using Coin.Domain.Katalog;

namespace Coin.UnitTests.Katalog;

/// <summary>
/// In-Memory-Repository für Service-Tests. Vergleicht Name/Herausgeber wie die Datenbank
/// ohne Beachtung von Groß-/Kleinschreibung, trimmt aber selbst NICHT (das ist Aufgabe der Domain).
/// </summary>
internal sealed class FakeCoinKatalogRepository : ICoinKatalogRepository
{
    private readonly List<CoinTyp> _coins = [];
    private readonly Dictionary<Guid, CoinBild> _bilder = [];

    /// <summary>Simuliert eine Verletzung des eindeutigen Index (PostgreSQL 23505) bei gleichzeitigen Anfragen.</summary>
    public bool HinzufuegenMeldetDuplikat { get; set; }

    public IReadOnlyList<CoinTyp> Coins => _coins;

    public IReadOnlyDictionary<Guid, CoinBild> Bilder => _bilder;

    public int AnzahlHinzufuegenAufrufe { get; private set; }

    public int AnzahlBildSpeichernAufrufe { get; private set; }

    public Task<bool> ExistiertAsync(string name, string herausgeber, CancellationToken ct) =>
        Task.FromResult(_coins.Any(c =>
            string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(c.Herausgeber, herausgeber, StringComparison.OrdinalIgnoreCase)));

    public Task<bool> HinzufuegenAsync(CoinTyp coin, CancellationToken ct)
    {
        AnzahlHinzufuegenAufrufe++;
        if (HinzufuegenMeldetDuplikat)
        {
            return Task.FromResult(false);
        }

        _coins.Add(coin);
        return Task.FromResult(true);
    }

    public Task<IReadOnlyList<CoinEintrag>> AlleAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<CoinEintrag>>(_coins.Select(ZuEintrag).ToList());

    public Task<CoinEintrag?> FindenAsync(Guid id, CancellationToken ct) =>
        Task.FromResult(_coins.Where(c => c.Id == id).Select(ZuEintrag).FirstOrDefault());

    public Task BildSpeichernAsync(Guid id, CoinBild bild, CancellationToken ct)
    {
        AnzahlBildSpeichernAufrufe++;
        _bilder[id] = bild;
        return Task.CompletedTask;
    }

    public Task<CoinBild?> BildLadenAsync(Guid id, CancellationToken ct) =>
        Task.FromResult(_bilder.GetValueOrDefault(id));

    private CoinEintrag ZuEintrag(CoinTyp c) =>
        new(c.Id, c.Name, c.Herausgeber, c.Auflage, c.Beschreibung, c.ErstelltAm,
            _bilder.TryGetValue(c.Id, out var bild) ? bild.Sha256 : null);
}
