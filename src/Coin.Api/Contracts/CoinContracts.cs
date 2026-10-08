using Coin.Domain.Katalog;

namespace Coin.Api.Contracts;

/// <summary>
/// Anfrage zum Anlegen eines Coins. Bewusst ohne Validierungsattribute: die Regeln liegen in der Domain (ADR-0002).
/// Vom Client mitgesendete Felder wie <c>id</c>, <c>erstelltAm</c> oder <c>bildUrl</c> werden ignoriert (AK-16).
/// </summary>
public sealed record CoinAnlegenRequest(string? Name, string? Herausgeber, int? Auflage, string? Beschreibung);

/// <summary>Coin in API-Antworten. Enthält nie Bilddaten, nur die versionierte <see cref="BildUrl"/>.</summary>
public sealed record CoinResponse(
    Guid Id,
    string Name,
    string Herausgeber,
    int? Auflage,
    string? Beschreibung,
    DateTimeOffset ErstelltAm,
    string? BildUrl)
{
    /// <summary>Länge des Hash-Präfixes im Versionsparameter <c>v</c> der Bild-URL.</summary>
    public const int VersionsLaenge = 16;

    public static CoinResponse Aus(CoinEintrag coin) => new(
        coin.Id,
        coin.Name,
        coin.Herausgeber,
        coin.Auflage,
        coin.Beschreibung,
        coin.ErstelltAm,
        coin.BildSha256 is { Length: >= VersionsLaenge } sha
            ? $"/api/coins/{coin.Id}/bild?v={sha[..VersionsLaenge]}"
            : null);
}

/// <summary>
/// Query von <c>GET /api/coins</c> (katalog-seiten, AK-1 bis AK-4). <see cref="ToString"/> gibt bewusst keine Werte
/// aus, damit der Suchbegriff nicht in Logs landet (AK-5; MVC protokolliert Argumente auf Trace).
/// </summary>
public sealed class CoinSucheAnfrage
{
    public string? Suche { get; init; }

    public int? Seite { get; init; }

    public int? Groesse { get; init; }

    public override string ToString() => nameof(CoinSucheAnfrage);
}
