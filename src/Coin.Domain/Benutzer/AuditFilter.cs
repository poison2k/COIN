using System.Globalization;
using System.Text.RegularExpressions;
using Coin.Domain.Gemeinsam;

namespace Coin.Domain.Benutzer;

/// <summary>
/// Geprüfter Filter des Audit-Logs (nacharbeiten-audit-filter 4.1, ADR-0045). <see cref="AbUtc"/> inklusive,
/// <see cref="VorUtc"/> exklusiv (Beginn des Folgetags), beide UTC. Leeres <see cref="Arten"/> = kein Filter.
/// </summary>
public sealed record AuditFilter(DateTimeOffset? AbUtc, DateTimeOffset? VorUtc, IReadOnlySet<AuditArt> Arten, Guid? BenutzerId);

/// <summary>Deutsche Anzeigetexte der Aktionstypen (<c>GET /api/audit/aktionen</c>).</summary>
public static class AuditArtText
{
    public static string Bezeichnung(AuditArt art) => art switch
    {
        AuditArt.Rolle => "Rolle",
        AuditArt.Status => "Status",
        _ => throw new ArgumentOutOfRangeException(nameof(art)),
    };
}

/// <summary>
/// Prüfung der Rohwerte <c>von</c>, <c>bis</c> und <c>aktion</c> (ADR-0045 Punkt 2). Meldungen wiederholen nie
/// Eingabewerte. Fehlerschlüssel: <c>von</c>, <c>bis</c>, <c>aktion</c>.
/// </summary>
public static partial class AuditFilterPruefung
{
    public const string DatumMeldung = "Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.";
    public const string ReihenfolgeMeldung = "Das Datum „bis“ darf nicht vor dem Datum „von“ liegen.";
    public const string ZeitraumMeldung = "Der Zeitraum darf höchstens 366 Tage umfassen.";
    public const int HoechstTage = 366;

    private static readonly DateOnly Kleinstes = new(2000, 1, 1);
    private static readonly DateOnly Groesstes = new(2999, 12, 31);

    public static string AktionMeldung { get; } =
        $"Unbekannte Aktion. Erlaubt sind: {string.Join(", ", Enum.GetNames<AuditArt>())}.";

    /// <summary>Prüft die Rohwerte und ergänzt Fehler in <paramref name="fehler"/>; liefert den Filter oder <c>null</c>.</summary>
    public static AuditFilter? Pruefen(
        IReadOnlyList<string?>? von, IReadOnlyList<string?>? bis, IReadOnlyList<string?>? aktion, Guid? benutzerId,
        Dictionary<string, string[]> fehler)
    {
        var vonOk = Datum(von, out var vonTag);
        var bisOk = Datum(bis, out var bisTag);
        if (!vonOk)
        {
            fehler["von"] = [DatumMeldung];
        }

        if (!bisOk)
        {
            fehler["bis"] = [DatumMeldung];
        }

        if (vonOk && bisOk && vonTag is { } v && bisTag is { } b)
        {
            if (v > b)
            {
                fehler["bis"] = [ReihenfolgeMeldung];
            }
            else if (b.DayNumber - v.DayNumber + 1 > HoechstTage)
            {
                fehler["bis"] = [ZeitraumMeldung];
            }
        }

        var arten = new HashSet<AuditArt>();
        foreach (var wert in aktion ?? [])
        {
            if (string.IsNullOrEmpty(wert))
            {
                continue;
            }

            if (Art(wert) is { } art)
            {
                arten.Add(art);
            }
            else
            {
                fehler["aktion"] = [AktionMeldung];
            }
        }

        if (fehler.Count > 0)
        {
            return null;
        }

        return new AuditFilter(
            vonTag is { } ab ? Berlin.TagesbeginnUtc(ab) : null,
            bisTag is { } bisWert ? Berlin.TagesbeginnUtc(bisWert.AddDays(1)) : null,
            arten,
            benutzerId);
    }

    /// <summary>Ein Wert genau im Format JJJJ-MM-TT (ASCII-Ziffern), leer = nicht angegeben, mehrfach = ungültig.</summary>
    private static bool Datum(IReadOnlyList<string?>? werte, out DateOnly? tag)
    {
        tag = null;
        var angegeben = (werte ?? []).Where(w => !string.IsNullOrEmpty(w)).ToList();
        if (angegeben.Count == 0)
        {
            return true;
        }

        if (angegeben.Count > 1 || !DatumFormat().IsMatch(angegeben[0]!)
            || !DateOnly.TryParseExact(angegeben[0], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var wert)
            || wert < Kleinstes || wert > Groesstes)
        {
            return false;
        }

        tag = wert;
        return true;
    }

    /// <summary>Enum-Name, Groß-/Kleinschreibung zählt, keine Zahlen.</summary>
    private static AuditArt? Art(string wert) =>
        Enum.GetValues<AuditArt>().Cast<AuditArt?>().FirstOrDefault(a => string.Equals(a.ToString(), wert, StringComparison.Ordinal));

    [GeneratedRegex("^[0-9]{4}-[0-9]{2}-[0-9]{2}$", RegexOptions.CultureInvariant)]
    private static partial Regex DatumFormat();
}
