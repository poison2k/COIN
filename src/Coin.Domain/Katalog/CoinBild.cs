using System.Security.Cryptography;

namespace Coin.Domain.Katalog;

public enum CoinBildFehler
{
    Leer,
    ZuGross,
    FormatNichtUnterstuetzt,
}

/// <summary>Ergebnis von <see cref="CoinBild.Erstellen"/>: entweder ein Bild oder ein Fehler.</summary>
public sealed record CoinBildErgebnis(CoinBild? Bild, CoinBildFehler? Fehler)
{
    public bool IstErfolgreich => Bild is not null;
}

/// <summary>Motivbild eines Coins (AK-9 bis AK-11). Der Inhalt wird nicht decodiert.</summary>
public sealed class CoinBild
{
    /// <summary>5 MiB, Grenze inklusive.</summary>
    public const int MaxGroesseBytes = 5 * 1024 * 1024;

    private CoinBild(byte[] inhalt, BildFormat format, string sha256, DateTimeOffset hochgeladenAm)
    {
        Inhalt = inhalt;
        Format = format;
        Sha256 = sha256;
        HochgeladenAm = hochgeladenAm;
    }

    public byte[] Inhalt { get; }

    public BildFormat Format { get; }

    /// <summary>SHA-256 des Inhalts, 64 Hex-Zeichen in Kleinbuchstaben.</summary>
    public string Sha256 { get; }

    public DateTimeOffset HochgeladenAm { get; }

    public static CoinBildErgebnis Erstellen(byte[] inhalt, DateTimeOffset jetzt)
    {
        ArgumentNullException.ThrowIfNull(inhalt);

        if (inhalt.Length == 0)
        {
            return new CoinBildErgebnis(null, CoinBildFehler.Leer);
        }

        if (inhalt.Length > MaxGroesseBytes)
        {
            return new CoinBildErgebnis(null, CoinBildFehler.ZuGross);
        }

        if (BildFormatErkennung.Erkennen(inhalt) is not { } format)
        {
            return new CoinBildErgebnis(null, CoinBildFehler.FormatNichtUnterstuetzt);
        }

        var sha256 = Convert.ToHexStringLower(SHA256.HashData(inhalt));
        return new CoinBildErgebnis(new CoinBild(inhalt, format, sha256, jetzt.ToUniversalTime()), null);
    }

    /// <summary>Stellt ein bereits geprüftes, gespeichertes Bild wieder her (nur für die Persistenz).</summary>
    public static CoinBild Wiederherstellen(byte[] inhalt, BildFormat format, string sha256, DateTimeOffset hochgeladenAm)
    {
        ArgumentNullException.ThrowIfNull(inhalt);
        ArgumentException.ThrowIfNullOrWhiteSpace(sha256);
        return new CoinBild(inhalt, format, sha256, hochgeladenAm.ToUniversalTime());
    }
}
