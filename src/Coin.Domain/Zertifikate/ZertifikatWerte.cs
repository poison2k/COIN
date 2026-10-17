using System.Collections;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using Coin.Domain.Ausgaben;
using Coin.Domain.Katalog;
using Coin.Domain.Vorlagen;

namespace Coin.Domain.Zertifikate;

/// <summary>
/// Werte der Platzhalter für ein Zertifikat (zertifikat-erzeugen Abschnitt 4, AK-12; F6, F8, F10): Schlüssel ist der Name
/// ohne Klammern (<c>Coin.Name</c>). Coin-Daten aus dem übergebenen, aktuellen Stand; Datum <c>TT.MM.JJJJ</c>; Zahlen ohne
/// Tausenderpunkt und ohne führende Nullen; fehlende optionale Angaben ergeben leeren Text. Werte bleiben unverändert
/// (Zeilenumbrüche wandelt erst <see cref="PlatzhalterErsetzung"/>). <see cref="ToString"/> enthält keine Werte (AK-21).
/// </summary>
public sealed class ZertifikatWerte : IReadOnlyDictionary<string, string>
{
    private readonly Dictionary<string, string> _werte;

    private ZertifikatWerte(Dictionary<string, string> werte) => _werte = werte;

    public static ZertifikatWerte Aus(CoinEintrag coin, AusgabeEintrag ausgabe)
    {
        ArgumentNullException.ThrowIfNull(coin);
        ArgumentNullException.ThrowIfNull(ausgabe);
        var g = ausgabe.Angaben;
        var werte = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["Coin.Name"] = coin.Name,
            ["Exemplar.Nummer"] = ausgabe.ExemplarNummer.ToString(CultureInfo.InvariantCulture),
            ["Zertifikat.Nummer"] = ausgabe.Zertifikatsnummer,
            ["Empfaenger.Name"] = g.EmpfaengerName,
            ["Coin.Herausgeber"] = coin.Herausgeber,
            ["Coin.Beschreibung"] = coin.Beschreibung ?? string.Empty,
            ["Coin.Auflage"] = coin.Auflage?.ToString(CultureInfo.InvariantCulture) ?? string.Empty,
            ["Empfaenger.Dienstgrad"] = g.EmpfaengerDienstgrad ?? string.Empty,
            ["Empfaenger.Dienststelle"] = g.EmpfaengerDienststelle ?? string.Empty,
            ["Ausgabe.Datum"] = g.Datum.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture),
            ["Ausgabe.Gelegenheit"] = g.Gelegenheit,
            ["Ausgabe.Begruendung"] = g.Begruendung,
            ["Ausgabe.AusgebendeStelle"] = g.AusgebendeStelle,
        };

        // Jeder Katalogeintrag hat genau einen Wert (AK-12); eine Lücke ist ein Programmierfehler.
        if (werte.Count != Platzhalterkatalog.Alle.Count || Platzhalterkatalog.Alle.Any(p => !werte.ContainsKey(p.Name)))
        {
            throw new InvalidOperationException("Die Zertifikatswerte passen nicht zum Platzhalterkatalog.");
        }

        return new ZertifikatWerte(werte);
    }

    public string this[string key] => _werte[key];

    public IEnumerable<string> Keys => _werte.Keys;

    public IEnumerable<string> Values => _werte.Values;

    public int Count => _werte.Count;

    public bool ContainsKey(string key) => _werte.ContainsKey(key);

    public bool TryGetValue(string key, [MaybeNullWhen(false)] out string value) => _werte.TryGetValue(key, out value);

    public IEnumerator<KeyValuePair<string, string>> GetEnumerator() => _werte.GetEnumerator();

    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

    /// <summary>Ohne Werte (Personendaten, AK-21).</summary>
    public override string ToString() => nameof(ZertifikatWerte);
}
