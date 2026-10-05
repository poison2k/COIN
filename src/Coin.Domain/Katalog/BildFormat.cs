namespace Coin.Domain.Katalog;

/// <summary>Zulässige Bildformate für Motivbilder (AK-10).</summary>
public enum BildFormat
{
    Jpeg,
    Png,
    Webp,
}

public static class BildFormatErweiterungen
{
    public static string ContentType(this BildFormat format) => format switch
    {
        BildFormat.Jpeg => "image/jpeg",
        BildFormat.Png => "image/png",
        BildFormat.Webp => "image/webp",
        _ => throw new ArgumentOutOfRangeException(nameof(format), format, null),
    };

    /// <summary>Dateiendung ohne Punkt.</summary>
    public static string Dateiendung(this BildFormat format) => format switch
    {
        BildFormat.Jpeg => "jpg",
        BildFormat.Png => "png",
        BildFormat.Webp => "webp",
        _ => throw new ArgumentOutOfRangeException(nameof(format), format, null),
    };
}
