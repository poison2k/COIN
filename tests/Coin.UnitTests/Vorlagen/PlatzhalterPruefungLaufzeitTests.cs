using System.Diagnostics;
using Coin.Domain.Vorlagen;

namespace Coin.UnitTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 3, AK-15 „Speicher und Laufzeit“ (QA-Finding W3): Die Platzhalterprüfung läuft
/// linear zur Textlänge und speichert je Meldung nur die ersten 20 verschiedenen Werte; jedes weitere Vorkommen, das
/// keinem der 20 gleicht, wird nur gezählt (Wiederholungen darunter mehrfach). <c>{n}</c> steht mit Tausenderpunkt.
/// Die Prüfung läuft in einer eigenen Aufgabe, damit eine quadratische Laufzeit den Test nicht minutenlang blockiert.
/// </summary>
public class PlatzhalterPruefungLaufzeitTests
{
    private const int Anzahl = 200_000;

    private static readonly TimeSpan Zeitgrenze = TimeSpan.FromSeconds(2);

    private const string Pflicht = "{{Coin.Name}} {{Exemplar.Nummer}} {{Zertifikat.Nummer}} {{Empfaenger.Name}}";

    private const string Hinweis = " Erlaubt sind nur die Platzhalter aus der Standardvorlage.";

    private static List<string> Unbekannte(int anzahl = Anzahl) =>
        Enumerable.Range(1, anzahl).Select(i => $"{{{{Unbekannt.Nr{i:000000}}}}}").ToList();

    /// <summary>200.000 verschiedene unbekannte Platzhalter, verteilt auf 1.000 Absätze, dazu die Pflichtplatzhalter.</summary>
    private static string[] TausendAbsaetze(List<string> unbekannt) =>
        [Pflicht, .. unbekannt.Chunk(Anzahl / 1_000).Select(teil => string.Join(" ", teil))];

    private static async Task<IReadOnlyList<string>> PruefenMitZeitgrenzeAsync(params string[] absaetze)
    {
        var uhr = Stopwatch.StartNew();
        var meldungen = await Task.Run(() => PlatzhalterPruefung.Pruefen(absaetze)).WaitAsync(Zeitgrenze);
        uhr.Stop();
        Assert.True(uhr.Elapsed < Zeitgrenze, $"Prüfung dauerte {uhr.Elapsed.TotalMilliseconds:F0} ms.");
        return meldungen;
    }

    [Fact]
    public async Task Zweihunderttausend_unbekannte_Platzhalter_in_1000_Absaetzen_werden_unter_2_Sekunden_geprueft()
    {
        await PruefenMitZeitgrenzeAsync(TausendAbsaetze(Unbekannte()));
    }

    [Fact]
    public async Task Zweihunderttausend_unbekannte_Platzhalter_in_einem_Absatz_werden_unter_2_Sekunden_geprueft()
    {
        await PruefenMitZeitgrenzeAsync(Pflicht, string.Join(" ", Unbekannte()));
    }

    [Fact]
    public async Task Zweihunderttausend_unbekannte_Platzhalter_ergeben_20_Werte_und_199_980_weitere_mit_Tausenderpunkt()
    {
        var unbekannt = Unbekannte();

        var meldungen = await PruefenMitZeitgrenzeAsync(TausendAbsaetze(unbekannt));

        Assert.Equal(
            ["Unbekannte Platzhalter: " + string.Join(", ", unbekannt.Take(20)) + " und 199.980 weitere." + Hinweis],
            meldungen);
    }

    [Fact]
    public async Task Ein_Absatz_mit_500000_oeffnenden_Klammern_ohne_schliessende_wird_unter_2_Sekunden_geprueft()
    {
        await PruefenMitZeitgrenzeAsync(Pflicht, string.Concat(Enumerable.Repeat("{{", 500_000)));
    }

    [Fact]
    public async Task Ein_Absatz_mit_500000_schliessenden_Klammern_ohne_oeffnende_wird_unter_2_Sekunden_geprueft()
    {
        await PruefenMitZeitgrenzeAsync(Pflicht, string.Concat(Enumerable.Repeat("}}", 500_000)));
    }

    [Fact]
    public async Task Ein_Absatz_mit_500000_verschiedenen_unvollstaendigen_Ausschnitten_wird_unter_2_Sekunden_geprueft()
    {
        await PruefenMitZeitgrenzeAsync(Pflicht, string.Concat(Enumerable.Range(1, 500_000).Select(i => $"a{i}}}}}")));
    }

    [Fact]
    public void Wiederholung_eines_der_ersten_20_Werte_erhoeht_n_nicht()
    {
        var unbekannt = Unbekannte(25);

        var meldungen = PlatzhalterPruefung.Pruefen([Pflicht, string.Join(" ", unbekannt), unbekannt[0], unbekannt[19]]);

        Assert.Equal(
            ["Unbekannte Platzhalter: " + string.Join(", ", unbekannt.Take(20)) + " und 5 weitere." + Hinweis],
            meldungen);
    }

    [Fact]
    public void Wiederholung_eines_spaeteren_Werts_erhoeht_n()
    {
        var unbekannt = Unbekannte(25);

        var meldungen = PlatzhalterPruefung.Pruefen([Pflicht, string.Join(" ", unbekannt), unbekannt[21], unbekannt[24]]);

        Assert.Equal(
            ["Unbekannte Platzhalter: " + string.Join(", ", unbekannt.Take(20)) + " und 7 weitere." + Hinweis],
            meldungen);
    }

    [Fact]
    public void Viele_weitere_werden_mit_Tausenderpunkt_gezaehlt()
    {
        var unbekannt = Unbekannte(1_254);

        var meldungen = PlatzhalterPruefung.Pruefen([Pflicht, .. unbekannt]);

        Assert.EndsWith(" und 1.234 weitere." + Hinweis, Assert.Single(meldungen), StringComparison.Ordinal);
    }

    [Fact]
    public void Ein_Ausschnitt_mit_500000_Zeichen_wird_auf_60_Zeichen_gekuerzt()
    {
        var meldungen = PlatzhalterPruefung.Pruefen([Pflicht, "{{" + new string('x', 500_000)]);

        Assert.Equal(["Unvollständige Platzhalter: „{{" + new string('x', 58) + "…“."], meldungen);
    }
}
