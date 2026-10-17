using System.Text;
using Coin.Domain.Vorlagen;

namespace Coin.Domain.Zertifikate;

/// <summary>Ein Stück neuer Inhalt eines Segments (ADR-0028 Punkt 2): Text, Zeilenumbruch (<c>w:br</c>) oder Tabulator (<c>w:tab</c>).</summary>
public abstract record Baustein
{
    private Baustein()
    {
    }

    /// <summary>Text, bereits frei von in XML 1.0 unzulässigen Zeichen.</summary>
    public sealed record Text(string Wert) : Baustein
    {
        /// <summary>Ohne Wert, damit keine Personendaten in Logs gelangen (AK-21).</summary>
        public override string ToString() => nameof(Text);
    }

    public sealed record Umbruch : Baustein;

    public sealed record Tabulator : Baustein;
}

/// <summary>
/// Platzhalterersetzung als reine Textlogik (zertifikat-erzeugen AK-10 bis AK-12, AK-14; ADR-0028 Punkt 2 bis 5, 8).
/// Eingabe sind die Segmenttexte eines Absatzes (je <c>w:t</c> ein Segment) und die Werte je Platzhalter; Ergebnis ist
/// je Segment der neue Inhalt als Folge von <see cref="Baustein">Bausteinen</see>. Die Zerlegung folgt
/// <see cref="PlatzhalterPruefung"/> (von links <c>{{</c> bis zum nächsten <c>}}</c>, je Zeile), ersetzt werden nur
/// bekannte Platzhalter des <see cref="Platzhalterkatalog"/>. Alle Fundstellen werden auf dem Originaltext ermittelt;
/// eingesetzte Werte werden nie erneut durchsucht. Der Wert steht im Segment des ersten <c>{</c>, die übrigen Zeichen des
/// Platzhalters verschwinden aus den folgenden Segmenten.
/// </summary>
public static class PlatzhalterErsetzung
{
    /// <summary>Höchstzahl der Platzhaltervorkommen je Vorlage, alle Story-Teile zusammen (F11).</summary>
    public const int MaxVorkommen = 200;

    private static readonly HashSet<string> Bekannt =
        Platzhalterkatalog.Alle.Select(p => p.Text).ToHashSet(StringComparer.Ordinal);

    private static readonly int LaengsterBekannter = Platzhalterkatalog.Alle.Max(p => p.Text.Length);

    /// <summary>
    /// Neuer Inhalt je Segment (gleiche Anzahl und Reihenfolge wie <paramref name="segmente"/>). Werte werden unter dem
    /// Namen (<c>Coin.Name</c>) oder der Schreibweise mit Klammern (<c>{{Coin.Name}}</c>) gesucht; ein bekannter Platzhalter
    /// ohne Wert bleibt stehen. Segmente ohne Fundstelle ergeben genau ihren Originaltext.
    /// </summary>
    public static IReadOnlyList<IReadOnlyList<Baustein>> Ersetzen(
        IReadOnlyList<string> segmente, IReadOnlyDictionary<string, string> werte)
    {
        ArgumentNullException.ThrowIfNull(segmente);
        ArgumentNullException.ThrowIfNull(werte);

        var text = string.Concat(segmente.Select(s => s ?? string.Empty));
        var fundstellen = Fundstellen(text)
            .Select(f => (f.Start, f.Ende, Wert: WertZu(text.AsSpan(f.Start, f.Ende - f.Start), werte)))
            .Where(f => f.Wert is not null)
            .ToList();

        var ergebnis = new List<IReadOnlyList<Baustein>>(segmente.Count);
        var start = 0;
        var naechste = 0;
        foreach (var roh in segmente)
        {
            var segment = roh ?? string.Empty;
            var ende = start + segment.Length;
            var bausteine = new Bausteinliste();
            var position = start;
            while (position < ende)
            {
                // Fundstellen, die vor dieser Position enden, sind erledigt.
                while (naechste < fundstellen.Count && fundstellen[naechste].Ende <= position)
                {
                    naechste++;
                }

                if (naechste < fundstellen.Count && fundstellen[naechste].Start <= position)
                {
                    var fund = fundstellen[naechste];
                    if (fund.Start == position)
                    {
                        bausteine.Wert(fund.Wert!);
                    }

                    position = Math.Min(fund.Ende, ende);
                    continue;
                }

                var bis = naechste < fundstellen.Count ? Math.Min(fundstellen[naechste].Start, ende) : ende;
                bausteine.Woertlich(text.AsSpan(position, bis - position));
                position = bis;
            }

            ergebnis.Add(bausteine.Liste());
            start = ende;
        }

        return ergebnis;
    }

    /// <summary>Anzahl der bekannten Platzhalter in den Absatztexten (AK-14), Zerlegung wie die Prüfung.</summary>
    public static int Zaehlen(IEnumerable<string> absatztexte)
    {
        ArgumentNullException.ThrowIfNull(absatztexte);
        return absatztexte.Sum(t => Fundstellen(t ?? string.Empty).Count);
    }

    /// <summary>
    /// Wert als Bausteine (ADR-0028 Punkt 5): <c>\r\n</c>, <c>\r</c>, <c>\n</c>, U+0085, U+2028, U+2029 → Umbruch;
    /// <c>\t</c> → Tabulator; in XML 1.0 unzulässige Zeichen entfallen; einzelne Surrogate werden U+FFFD. Keine Kürzung.
    /// </summary>
    public static IReadOnlyList<Baustein> WertBausteine(string wert)
    {
        ArgumentNullException.ThrowIfNull(wert);
        var bausteine = new Bausteinliste();
        bausteine.Wert(wert);
        return bausteine.Liste();
    }

    /// <summary>Bekannte Platzhalter als halboffene Bereiche [Start, Ende), aufsteigend; je Zeile wie die Prüfung.</summary>
    private static List<(int Start, int Ende)> Fundstellen(string text)
    {
        var fundstellen = new List<(int, int)>();
        var zeilenAnfang = 0;
        while (zeilenAnfang <= text.Length)
        {
            var umbruch = text.IndexOf('\n', zeilenAnfang);
            var zeilenEnde = umbruch < 0 ? text.Length : umbruch;
            ZeileZerlegen(text, zeilenAnfang, zeilenEnde, fundstellen);
            if (umbruch < 0)
            {
                break;
            }

            zeilenAnfang = umbruch + 1;
        }

        return fundstellen;
    }

    /// <summary>Gleiche Zerlegung wie <see cref="PlatzhalterPruefung"/> innerhalb einer Zeile.</summary>
    private static void ZeileZerlegen(string text, int anfang, int ende, List<(int, int)> fundstellen)
    {
        var i = anfang;
        while (i + 1 < ende)
        {
            if (text[i] == '}' && text[i + 1] == '}')
            {
                i += 2;
                continue;
            }

            if (text[i] != '{' || text[i + 1] != '{')
            {
                i++;
                continue;
            }

            var schluss = -1;
            for (var j = i + 2; j + 1 < ende; j++)
            {
                if (text[j] == '}' && text[j + 1] == '}')
                {
                    schluss = j;
                    break;
                }
            }

            if (schluss < 0)
            {
                return;
            }

            var laenge = schluss + 2 - i;
            if (laenge <= LaengsterBekannter && Bekannt.Contains(text.Substring(i, laenge)))
            {
                fundstellen.Add((i, schluss + 2));
            }

            i = schluss + 2;
        }
    }

    private static string? WertZu(ReadOnlySpan<char> platzhalter, IReadOnlyDictionary<string, string> werte)
    {
        var text = platzhalter.ToString();
        return werte.TryGetValue(text[2..^2], out var wert) || werte.TryGetValue(text, out wert) ? wert ?? string.Empty : null;
    }

    /// <summary>Sammelt Bausteine und fasst aufeinanderfolgenden Text zusammen.</summary>
    private sealed class Bausteinliste
    {
        private const char Zeilenumbruch = (char)0x000A;
        private const char NaechsteZeile = (char)0x0085;
        private const char Zeilentrenner = (char)0x2028;
        private const char Absatztrenner = (char)0x2029;
        private const char Leerzeichen = (char)0x0020;
        private const char Ersatzzeichen = (char)0xFFFD;
        private const char KeinZeichenFffe = (char)0xFFFE;
        private const char KeinZeichenFfff = (char)0xFFFF;

        private readonly List<Baustein> _bausteine = [];
        private readonly StringBuilder _text = new();

        /// <summary>Text aus der Vorlage, unverändert.</summary>
        public void Woertlich(ReadOnlySpan<char> text) => _text.Append(text);

        /// <summary>Eingesetzter Wert mit Umwandlung von Umbrüchen, Tabulatoren und unzulässigen Zeichen.</summary>
        public void Wert(string wert)
        {
            for (var i = 0; i < wert.Length; i++)
            {
                var zeichen = wert[i];
                switch (zeichen)
                {
                    case '\r':
                        if (i + 1 < wert.Length && wert[i + 1] == '\n')
                        {
                            i++;
                        }

                        Hinzufuegen(new Baustein.Umbruch());
                        continue;
                    case Zeilenumbruch or NaechsteZeile or Zeilentrenner or Absatztrenner:
                        Hinzufuegen(new Baustein.Umbruch());
                        continue;
                    case '\t':
                        Hinzufuegen(new Baustein.Tabulator());
                        continue;
                }

                if (char.IsHighSurrogate(zeichen))
                {
                    if (i + 1 < wert.Length && char.IsLowSurrogate(wert[i + 1]))
                    {
                        _text.Append(zeichen).Append(wert[i + 1]);
                        i++;
                    }
                    else
                    {
                        _text.Append(Ersatzzeichen);
                    }

                    continue;
                }

                if (char.IsLowSurrogate(zeichen))
                {
                    _text.Append(Ersatzzeichen);
                    continue;
                }

                if (zeichen < Leerzeichen || zeichen is KeinZeichenFffe or KeinZeichenFfff)
                {
                    continue;
                }

                _text.Append(zeichen);
            }
        }

        public IReadOnlyList<Baustein> Liste()
        {
            TextAbschliessen();
            return _bausteine;
        }

        private void Hinzufuegen(Baustein baustein)
        {
            TextAbschliessen();
            _bausteine.Add(baustein);
        }

        private void TextAbschliessen()
        {
            if (_text.Length > 0)
            {
                _bausteine.Add(new Baustein.Text(_text.ToString()));
                _text.Clear();
            }
        }
    }
}
