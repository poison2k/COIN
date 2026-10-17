using Coin.Domain.Gemeinsam;
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

    private int _naechsteKennung = 1;

    /// <summary>Anzahl der Aufrufe von <see cref="KennungVergebenAsync"/>.</summary>
    public int AnzahlKennungVergebenAufrufe { get; private set; }

    /// <summary>
    /// zertifikat-erzeugen (AK-1): vergibt aufsteigende Kennungen <c>C0001</c>, <c>C0002</c>, … wie die Sequenz
    /// <c>coin_kennung_seq</c>; jeder Aufruf verbraucht eine Nummer (auch wenn der Coin danach abgelehnt wird).
    /// </summary>
    public Task<string?> KennungVergebenAsync(CancellationToken ct)
    {
        AnzahlKennungVergebenAufrufe++;
        return Task.FromResult<string?>($"C{_naechsteKennung++:D4}");
    }

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

    /// <summary>Parameter des letzten Aufrufs von <see cref="SuchenAsync"/> (katalog-seiten, AK-1 bis AK-4).</summary>
    public (string? Suche, int Seite, int Groesse)? LetzteSuche { get; private set; }

    public int AnzahlSuchenAufrufe { get; private set; }

    /// <summary>
    /// Teilstring in Name oder Herausgeber ohne Beachtung der Groß-/Kleinschreibung, sortiert nach Name, dann Id.
    /// Trimmt nicht selbst (Aufgabe der Domain).
    /// </summary>
    public Task<Seite<CoinEintrag>> SuchenAsync(string? suche, int seite, int groesse, CancellationToken ct)
    {
        AnzahlSuchenAufrufe++;
        LetzteSuche = (suche, seite, groesse);
        var treffer = _coins
            .Where(c => suche is null
                || c.Name.Contains(suche, StringComparison.OrdinalIgnoreCase)
                || c.Herausgeber.Contains(suche, StringComparison.OrdinalIgnoreCase))
            .OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(c => c.Id)
            .Select(ZuEintrag)
            .ToList();
        var eintraege = treffer.Skip((seite - 1) * groesse).Take(groesse).ToList();
        return Task.FromResult(new Seite<CoinEintrag>(eintraege, treffer.Count, seite, groesse));
    }

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
