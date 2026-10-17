using System.Globalization;
using System.Text;
using Coin.Domain.Zertifikate;

namespace Coin.Domain.Vorlagen;

/// <summary>
/// Platzhalterprüfung einer Vorlage (zertifikatsvorlagen AK-15, ADR-0024 Punkt 1.8) als reine Textlogik: Eingabe ist
/// je Absatz der verkettete Text, Ergebnis sind die Meldungen in der Reihenfolge fehlend → unbekannt → unvollständig.
/// Eine leere Liste bedeutet „bestanden“. Platzhalter gelten streng nach Schreibweise (F9).
/// Die Prüfung läuft linear zur Textlänge (ein Durchlauf je Absatz, keine regulären Ausdrücke) und speichert je
/// Meldung höchstens <see cref="MaxWerteJeMeldung"/> Werte; weitere Vorkommen werden nur gezählt (Rev. 3, W3).
/// Neue Uploads dürfen höchstens <see cref="PlatzhalterErsetzung.MaxVorkommen"/> bekannte Platzhalter enthalten
/// (zertifikat-erzeugen AK-14, F11); die Meldung dazu steht nach den übrigen.
/// </summary>
public static class PlatzhalterPruefung
{
    /// <summary>Höchstlänge eines genannten Werts; längere Werte werden mit „…“ gekürzt.</summary>
    public const int MaxWertLaenge = 60;

    /// <summary>Höchstzahl der Werte je Meldung; weitere werden als „und {n} weitere“ zusammengefasst.</summary>
    public const int MaxWerteJeMeldung = 20;

    /// <summary>Meldung bei mehr als <see cref="PlatzhalterErsetzung.MaxVorkommen"/> Platzhaltern (AK-14).</summary>
    public static readonly string ZuVieleMeldung =
        $"Die Vorlage enthält mehr als {PlatzhalterErsetzung.MaxVorkommen} Platzhalter. Bitte die Anzahl verringern.";

    private static readonly CultureInfo Deutsch = CultureInfo.GetCultureInfo("de-DE");

    private static readonly int LaengsterBekannter = Platzhalterkatalog.Alle.Max(p => p.Text.Length);

    public static IReadOnlyList<string> Pruefen(IEnumerable<string> absatztexte)
    {
        ArgumentNullException.ThrowIfNull(absatztexte);

        var bekannt = Platzhalterkatalog.Alle.Select(p => p.Text).ToHashSet(StringComparer.Ordinal);
        var gefunden = new HashSet<string>(StringComparer.Ordinal);
        var unbekannt = new Werteliste();
        var unvollstaendig = new Werteliste();
        long vorkommen = 0;

        foreach (var absatz in absatztexte)
        {
            vorkommen += Zerlegen(absatz ?? string.Empty, bekannt, gefunden, unbekannt, unvollstaendig);
        }

        var meldungen = new List<string>();
        var fehlend = Platzhalterkatalog.Alle.Where(p => p.Pflicht && !gefunden.Contains(p.Text)).Select(p => p.Text).ToList();
        if (fehlend.Count > 0)
        {
            meldungen.Add($"Es fehlen Pflichtplatzhalter: {string.Join(", ", fehlend)}.");
        }

        if (!unbekannt.IstLeer)
        {
            meldungen.Add($"Unbekannte Platzhalter: {unbekannt.Text(w => w)}. Erlaubt sind nur die Platzhalter aus der Standardvorlage.");
        }

        if (!unvollstaendig.IstLeer)
        {
            meldungen.Add($"Unvollständige Platzhalter: {unvollstaendig.Text(w => $"„{w}“")}.");
        }

        if (vorkommen > PlatzhalterErsetzung.MaxVorkommen)
        {
            meldungen.Add(ZuVieleMeldung);
        }

        return meldungen;
    }

    /// <summary>
    /// Sucht in einem Absatz vollständige, unbekannte und unvollständige Platzhalter in einem Durchlauf: Jede Stelle
    /// des Texts wird höchstens einmal betrachtet. Liefert die Zahl der bekannten Platzhalter.
    /// </summary>
    private static int Zerlegen(
        string text, HashSet<string> bekannt, HashSet<string> gefunden, Werteliste unbekannt, Werteliste unvollstaendig)
    {
        var position = 0;
        var i = 0;
        var anzahl = 0;
        while (i + 1 < text.Length)
        {
            if (text[i] == '}' && text[i + 1] == '}')
            {
                // „}}“ ohne vorheriges „{{“: Ausschnitt ab dem Absatzanfang bzw. dem Ende des letzten Fundes.
                unvollstaendig.Merken(text.AsSpan(position, i + 2 - position));
                i += 2;
                position = i;
                continue;
            }

            if (text[i] != '{' || text[i + 1] != '{')
            {
                i++;
                continue;
            }

            var auf = i;
            var ende = -1;
            for (var j = auf + 2; j + 1 < text.Length; j++)
            {
                if (text[j] == '}' && text[j + 1] == '}')
                {
                    ende = j;
                    break;
                }
            }

            if (ende < 0)
            {
                // „{{“ ohne folgendes „}}“: Ausschnitt bis zum Absatzende.
                unvollstaendig.Merken(text.AsSpan(auf));
                return anzahl;
            }

            var platzhalter = text.AsSpan(auf, ende + 2 - auf);
            if (platzhalter.Length <= LaengsterBekannter && bekannt.Contains(platzhalter.ToString()))
            {
                gefunden.Add(platzhalter.ToString());
                anzahl++;
            }
            else
            {
                unbekannt.Merken(platzhalter);
            }

            i = ende + 2;
            position = i;
        }

        return anzahl;
    }

    /// <summary>
    /// Bereinigt einen Wert (Steuerzeichen entfernen, auf <see cref="MaxWertLaenge"/> Zeichen kürzen), ohne mehr als
    /// nötig zu kopieren.
    /// </summary>
    private static string Anzeige(ReadOnlySpan<char> wert)
    {
        var ergebnis = new StringBuilder(Math.Min(wert.Length, MaxWertLaenge + 1));
        foreach (var zeichen in wert)
        {
            if (char.IsControl(zeichen))
            {
                continue;
            }

            if (ergebnis.Length == MaxWertLaenge)
            {
                return ergebnis.Append('…').ToString();
            }

            ergebnis.Append(zeichen);
        }

        return ergebnis.ToString();
    }

    /// <summary>Die ersten 20 verschiedenen Werte einer Meldung und die Zahl weiterer Vorkommen.</summary>
    private sealed class Werteliste
    {
        private readonly List<string> _werte = [];
        private readonly HashSet<string> _bekannt = new(StringComparer.Ordinal);
        private long _weitere;

        public bool IstLeer => _werte.Count == 0;

        public void Merken(ReadOnlySpan<char> wert)
        {
            var anzeige = Anzeige(wert);
            if (_bekannt.Contains(anzeige))
            {
                return;
            }

            if (_werte.Count < MaxWerteJeMeldung)
            {
                _werte.Add(anzeige);
                _bekannt.Add(anzeige);
            }
            else
            {
                _weitere++;
            }
        }

        public string Text(Func<string, string> format)
        {
            var genannt = string.Join(", ", _werte.Select(format));
            return _weitere > 0 ? $"{genannt} und {_weitere.ToString("N0", Deutsch)} weitere" : genannt;
        }
    }
}
