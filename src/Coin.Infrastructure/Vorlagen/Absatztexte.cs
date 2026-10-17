using System.Xml.Linq;

namespace Coin.Infrastructure.Vorlagen;

/// <summary>
/// Ein Textstück eines Absatzes in der Sicht der Platzhalterprüfung: der Knoten (<c>w:t</c>, <c>w:tab</c>, <c>w:br</c>
/// oder <c>w:cr</c>) und sein Text (<c>w:tab</c> als Leerzeichen, <c>w:br</c>/<c>w:cr</c> als Zeilenumbruch).
/// <see cref="IstText"/> nur bei <c>w:t</c>; nur diese Segmente verändert die Zertifikatserzeugung (ADR-0028 Punkt 1).
/// </summary>
internal sealed record Absatzsegment(XElement Element, string Text)
{
    public bool IstText => Element.Name == W.T;
}

/// <summary>
/// Absatztexte eines Teils für die Platzhalterprüfung (zertifikatsvorlagen AK-15, ADR-0022 Punkt 4): je Absatz der Text
/// aller <c>w:t</c>, deren nächster Absatz-Vorfahr dieser Absatz ist, in Dokumentreihenfolge des Absatzbeginns.
/// Lesezeichen, Rechtschreibmarken, Formatwechsel und Feldgrenzen werden übergangen; <c>w:delText</c> und
/// <c>w:instrText</c> zählen nicht. <c>w:tab</c> zählt als Leerzeichen, <c>w:br</c> und <c>w:cr</c> trennen den Absatz.
/// Der Durchlauf ist iterativ mit explizitem Stapel (AK-12, Rev. 4). Prüfung und Zertifikatserzeugung nutzen denselben
/// Durchlauf (<see cref="Segmente"/>, zertifikat-erzeugen ADR-0028 Punkt 1).
/// </summary>
internal static class Absatztexte
{
    public static IEnumerable<string> Lesen(XDocument teil) =>
        Segmente(teil).SelectMany(a => string.Concat(a.Select(s => s.Text)).Split('\n'));

    /// <summary>Je Absatz die Segmente mit Verweis auf ihren Knoten, in Dokumentreihenfolge.</summary>
    public static List<List<Absatzsegment>> Segmente(XDocument teil)
    {
        var absaetze = new List<List<Absatzsegment>>();
        if (teil.Root is { } wurzel)
        {
            Sammeln(wurzel, absaetze);
        }

        return absaetze;
    }

    /// <summary>Vorordnung über den Elementbaum; jedes Element trägt den Absatz, zu dem sein Text gehört.</summary>
    private static void Sammeln(XElement wurzel, List<List<Absatzsegment>> absaetze)
    {
        var offen = new Stack<(XElement Element, List<Absatzsegment>? Absatz)>();
        offen.Push((wurzel, null));
        while (offen.Count > 0)
        {
            var (element, absatz) = offen.Pop();
            if (element.Name == W.P)
            {
                absatz = [];
                absaetze.Add(absatz);
            }
            else if (element.Name == W.T)
            {
                absatz?.Add(new Absatzsegment(element, element.Value));
                continue;
            }
            else if (element.Name == W.Tab && element.Parent?.Name == W.R)
            {
                absatz?.Add(new Absatzsegment(element, " "));
                continue;
            }
            else if (element.Name == W.Br || element.Name == W.Cr)
            {
                absatz?.Add(new Absatzsegment(element, "\n"));
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
