using System.Globalization;
using System.Text;

namespace Coin.Domain.Ausgaben;

/// <summary>
/// Nummer des Hologramm-Stickers eines Zertifikats (hologrammnummer AK-1, ADR-0033 Punkt 4). <see cref="Anzeige"/> ist die
/// bereinigte Form in Großbuchstaben (gespeichert, angezeigt, ins Zertifikat gesetzt); <see cref="Normalform"/> ist der
/// Vergleichswert ohne Leerzeichen und Bindestriche. Erzeugung über <see cref="Pruefen"/>. <see cref="ToString"/> enthält
/// keine Werte (keine Nummern in Logs, ADR-0033 Punkt 8).
/// </summary>
public sealed record Hologrammnummer(string Anzeige, string Normalform)
{
    /// <summary>Höchstlänge der Anzeigeform.</summary>
    public const int MaxLaenge = 40;

    /// <summary>Höchstlänge der Roheingabe; längere Eingaben werden nicht weiter verarbeitet.</summary>
    public const int MaxRohLaenge = 200;

    public const string MeldungLeer = "Bitte eine Hologrammnummer eingeben.";

    public const string MeldungZeichen =
        "Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.";

    public const string MeldungLaenge = "Die Hologrammnummer darf höchstens 40 Zeichen lang sein.";

    public const string MeldungOhneZeichen =
        "Die Hologrammnummer muss mindestens einen Buchstaben oder eine Ziffer enthalten.";

    /// <summary>Normalisiert und prüft eine Eingabe nach ADR-0033 Punkt 4.</summary>
    public static HologrammnummerPruefung Pruefen(string? eingabe)
    {
        if (string.IsNullOrWhiteSpace(eingabe))
        {
            return new HologrammnummerPruefung.Keine();
        }

        if (eingabe.Length > MaxRohLaenge)
        {
            return new HologrammnummerPruefung.Ungueltig(MeldungLaenge);
        }

        var nfkc = eingabe.Normalize(NormalizationForm.FormKC);
        var zeichen = new StringBuilder(nfkc.Length);
        foreach (var c in nfkc)
        {
            if (char.IsWhiteSpace(c))
            {
                zeichen.Append(' ');
                continue;
            }

            var kategorie = CharUnicodeInfo.GetUnicodeCategory(c);
            if (kategorie == UnicodeCategory.DashPunctuation || c == '−')
            {
                zeichen.Append('-');
            }
            else if (kategorie != UnicodeCategory.Format)
            {
                zeichen.Append(c);
            }
        }

        var anzeige = new StringBuilder(zeichen.Length);
        foreach (var c in zeichen.ToString().Trim(' '))
        {
            if (c == ' ' && anzeige.Length > 0 && anzeige[^1] == ' ')
            {
                continue;
            }

            anzeige.Append(char.ToUpperInvariant(c));
        }

        var text = anzeige.ToString();
        if (text.Any(c => !IstErlaubt(c)))
        {
            return new HologrammnummerPruefung.Ungueltig(MeldungZeichen);
        }

        if (text.Length > MaxLaenge)
        {
            return new HologrammnummerPruefung.Ungueltig(MeldungLaenge);
        }

        var normalform = new string([.. text.Where(c => c is not (' ' or '-'))]);
        if (normalform.Length == 0)
        {
            return new HologrammnummerPruefung.Ungueltig(MeldungOhneZeichen);
        }

        return new HologrammnummerPruefung.Gueltig(new Hologrammnummer(text, normalform));
    }

    /// <summary>Normalform einer Eingabe oder <c>null</c> (keine Nummer oder ungültig).</summary>
    public static string? NormalformVon(string? eingabe) =>
        Pruefen(eingabe) is HologrammnummerPruefung.Gueltig gueltig ? gueltig.Nummer.Normalform : null;

    private static bool IstErlaubt(char c) => c is (>= 'A' and <= 'Z') or (>= '0' and <= '9') or ' ' or '-';

    /// <summary>Ohne Werte.</summary>
    public override string ToString() => nameof(Hologrammnummer);
}

/// <summary>Ergebnis von <see cref="Hologrammnummer.Pruefen"/>.</summary>
public abstract record HologrammnummerPruefung
{
    private HologrammnummerPruefung()
    {
    }

    /// <summary><c>null</c>, leer oder nur Leerraum.</summary>
    public sealed record Keine : HologrammnummerPruefung;

    public sealed record Gueltig(Hologrammnummer Nummer) : HologrammnummerPruefung
    {
        public override string ToString() => nameof(Gueltig);
    }

    public sealed record Ungueltig(string Meldung) : HologrammnummerPruefung;
}
