namespace Coin.Infrastructure.Persistenz;

/// <summary>Persistenzmodell der Tabelle <c>coin_typ</c>. Fachliche Regeln liegen in der Domain.</summary>
public sealed class CoinTypDatensatz
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Herausgeber { get; set; } = string.Empty;

    public int? Auflage { get; set; }

    public string? Beschreibung { get; set; }

    public DateTimeOffset ErstelltAm { get; set; }

    public CoinBildDatensatz? Bild { get; set; }
}

/// <summary>Persistenzmodell der Tabelle <c>coin_bild</c> (1:0..1 zu <c>coin_typ</c>, ADR-0005).</summary>
public sealed class CoinBildDatensatz
{
    public Guid CoinId { get; set; }

    public byte[] Inhalt { get; set; } = [];

    public string Format { get; set; } = string.Empty;

    public string Sha256 { get; set; } = string.Empty;

    public int GroesseBytes { get; set; }

    public DateTimeOffset HochgeladenAm { get; set; }
}
