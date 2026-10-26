using Coin.Domain.Katalog;

namespace Coin.Domain.Startseite;

/// <summary>Die fünf festen Blöcke der Startseite (Feature startseite, Abschnitt 1, ADR-0030 Punkt 1).</summary>
public enum BlockArt
{
    Kopf,
    Infotext,
    Kennzahlen,
    Neueste,
    Meistausgegeben,
}

/// <summary>Die zwei Logo-Plätze des Kopfbereichs (Abschnitt 1, 4.2).</summary>
public enum LogoPlatz
{
    Bereitsteller,
    Software,
}

/// <summary>Namen der Blöcke und Plätze in API, Datenbank und Audit (klein geschrieben).</summary>
public static class StartseiteNamen
{
    /// <summary>Standardreihenfolge (AK-1); zugleich die Reihenfolge der Block-Einträge im Audit (Abschnitt 4.3).</summary>
    public static IReadOnlyList<BlockArt> AlleBloecke { get; } =
        [BlockArt.Kopf, BlockArt.Infotext, BlockArt.Kennzahlen, BlockArt.Neueste, BlockArt.Meistausgegeben];

    public static IReadOnlyList<LogoPlatz> AllePlaetze { get; } = [LogoPlatz.Bereitsteller, LogoPlatz.Software];

    public static string Name(this BlockArt art) => art switch
    {
        BlockArt.Kopf => "kopf",
        BlockArt.Infotext => "infotext",
        BlockArt.Kennzahlen => "kennzahlen",
        BlockArt.Neueste => "neueste",
        BlockArt.Meistausgegeben => "meistausgegeben",
        _ => throw new ArgumentOutOfRangeException(nameof(art), art, null),
    };

    public static string Name(this LogoPlatz platz) => platz switch
    {
        LogoPlatz.Bereitsteller => "bereitsteller",
        LogoPlatz.Software => "software",
        _ => throw new ArgumentOutOfRangeException(nameof(platz), platz, null),
    };

    /// <summary>Feldname im Formular und in Fehlern (<c>logoBereitsteller</c>, <c>logoSoftware</c>).</summary>
    public static string Feld(this LogoPlatz platz) => platz switch
    {
        LogoPlatz.Bereitsteller => "logoBereitsteller",
        LogoPlatz.Software => "logoSoftware",
        _ => throw new ArgumentOutOfRangeException(nameof(platz), platz, null),
    };

    /// <summary>Genitiv für Meldungen: „des Bereitstellers“ bzw. „der Software“.</summary>
    public static string Genitiv(this LogoPlatz platz) => platz switch
    {
        LogoPlatz.Bereitsteller => "des Bereitstellers",
        LogoPlatz.Software => "der Software",
        _ => throw new ArgumentOutOfRangeException(nameof(platz), platz, null),
    };

    /// <summary>Block zum Namen (genaue Schreibweise) oder <c>null</c>.</summary>
    public static BlockArt? BlockAus(string? name)
    {
        foreach (var art in AlleBloecke)
        {
            if (string.Equals(art.Name(), name, StringComparison.Ordinal))
            {
                return art;
            }
        }

        return null;
    }

    /// <summary>Platz zum Namen (genaue Schreibweise) oder <c>null</c>.</summary>
    public static LogoPlatz? PlatzAus(string? name)
    {
        foreach (var platz in AllePlaetze)
        {
            if (string.Equals(platz.Name(), name, StringComparison.Ordinal))
            {
                return platz;
            }
        }

        return null;
    }

    /// <summary>Format als kleingeschriebener Name (<c>png</c>, <c>jpeg</c>, <c>webp</c>) für DB und API.</summary>
    public static string Name(this BildFormat format) => format switch
    {
        BildFormat.Png => "png",
        BildFormat.Jpeg => "jpeg",
        BildFormat.Webp => "webp",
        _ => throw new ArgumentOutOfRangeException(nameof(format), format, null),
    };

    public static BildFormat? FormatAus(string? name) => name switch
    {
        "png" => BildFormat.Png,
        "jpeg" => BildFormat.Jpeg,
        "webp" => BildFormat.Webp,
        _ => null,
    };
}

/// <summary>
/// Ein Logo des Kopfbereichs: Hash und Alternativtext, dazu die Metadaten aus der Kopfanalyse (ADR-0031). Keine Bytes,
/// kein Hochladender (ADR-0032 Punkt 7).
/// </summary>
public sealed record StartseiteLogo(
    string Sha256,
    string Alternativtext,
    BildFormat Format = BildFormat.Png,
    int Breite = 0,
    int Hoehe = 0,
    int GroesseBytes = 0)
{
    /// <summary>Länge des Hash-Präfixes im Versionsparameter <c>v</c> der Logo-URL (ADR-0032 Punkt 3).</summary>
    public const int VersionsLaenge = 16;

    public string Version => Sha256.Length >= VersionsLaenge ? Sha256[..VersionsLaenge] : Sha256;

    /// <summary>Ohne Alternativtext, damit Inhalte nicht in Logs landen.</summary>
    public override string ToString() => nameof(StartseiteLogo);
}

/// <summary>Öffentliche Kopfansicht (AK-37): Texte und Logos nur bei aktivem Kopfbereich.</summary>
public sealed record KopfAnsicht(
    bool Aktiv,
    int Position,
    string? Titel,
    string? Untertitel,
    StartseiteLogo? LogoBereitsteller,
    StartseiteLogo? LogoSoftware)
{
    public override string ToString() => nameof(KopfAnsicht);
}
