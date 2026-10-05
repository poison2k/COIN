namespace Coin.Domain.Katalog;

/// <summary>Lesemodell eines Coins ohne Bildbytes; vom Bild nur der Hash (ADR-0005).</summary>
public sealed record CoinEintrag(
    Guid Id,
    string Name,
    string Herausgeber,
    int? Auflage,
    string? Beschreibung,
    DateTimeOffset ErstelltAm,
    string? BildSha256);
