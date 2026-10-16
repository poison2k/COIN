using System.Text;
using System.Xml.Linq;

namespace Coin.Infrastructure.Vorlagen;

/// <summary>
/// Absatztexte eines Teils für die Platzhalterprüfung (zertifikatsvorlagen AK-15, ADR-0022 Punkt 4): je Absatz der Text
/// aller <c>w:t</c>, deren nächster Absatz-Vorfahr dieser Absatz ist, in Dokumentreihenfolge des Absatzbeginns.
/// Lesezeichen, Rechtschreibmarken, Formatwechsel und Feldgrenzen werden übergangen; <c>w:delText</c> und
/// <c>w:instrText</c> zählen nicht. <c>w:tab</c> zählt als Leerzeichen, <c>w:br</c> und <c>w:cr</c> trennen den Absatz.
/// Der Durchlauf ist iterativ mit explizitem Stapel (AK-12, Rev. 4).
/// </summary>
internal static class Absatztexte
{
    public static IEnumerable<string> Lesen(XDocument teil)
    {
        var absaetze = new List<StringBuilder>();
        if (teil.Root is { } wurzel)
        {
            Sammeln(wurzel, absaetze);
        }

        return absaetze.SelectMany(a => a.ToString().Split('\n'));
    }

    /// <summary>Vorordnung über den Elementbaum; jedes Element trägt den Absatz, zu dem sein Text gehört.</summary>
    private static void Sammeln(XElement wurzel, List<StringBuilder> absaetze)
    {
        var offen = new Stack<(XElement Element, StringBuilder? Absatz)>();
        offen.Push((wurzel, null));
        while (offen.Count > 0)
        {
            var (element, absatz) = offen.Pop();
            if (element.Name == W.P)
            {
                absatz = new StringBuilder();
                absaetze.Add(absatz);
            }
            else if (element.Name == W.T)
            {
                absatz?.Append(element.Value);
                continue;
            }
            else if (element.Name == W.Tab && element.Parent?.Name == W.R)
            {
                absatz?.Append(' ');
                continue;
            }
            else if (element.Name == W.Br || element.Name == W.Cr)
            {
                absatz?.Append('\n');
                continue;
            }

            // Kinder in umgekehrter Reihenfolge ablegen, damit sie in Dokumentreihenfolge entnommen werden.
            for (var kind = element.LastNode; kind is not null; kind = kind.PreviousNode)
            {
                if (kind is XElement kindElement)
                {
                    offen.Push((kindElement, absatz));
                }
            }
        }
    }
}
