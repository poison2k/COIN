using Coin.Domain.Vorlagen;

namespace Coin.UnitTests.Vorlagen;

/// <summary>
/// Feature zertifikat-erzeugen, AK-14 (F11, ADR-0028 Punkt 8): Die Platzhalterprüfung neuer Uploads lässt höchstens
/// 200 Platzhaltervorkommen zu (alle Absätze zusammen); darüber kommt die Meldung „Die Vorlage enthält mehr als 200
/// Platzhalter. Bitte die Anzahl verringern.“ nach den bisherigen Platzhaltermeldungen.
/// </summary>
public class PlatzhalterGrenzeTests
{
    private const string Grenzmeldung = "Die Vorlage enthält mehr als 200 Platzhalter. Bitte die Anzahl verringern.";

    private static readonly string[] Pflicht = ["{{Coin.Name}}", "{{Exemplar.Nummer}}", "{{Zertifikat.Nummer}}", "{{Empfaenger.Name}}"];

    /// <summary>Genau <paramref name="anzahl"/> bekannte Platzhalter (darunter die vier Pflichtplatzhalter), verteilt auf Absätze.</summary>
    private static string[] Absaetze(int anzahl) =>
        [.. Pflicht, .. Enumerable.Range(0, anzahl - Pflicht.Length).Select(i => i % 2 == 0 ? "Name {{Coin.Name}}" : "Nr. {{Exemplar.Nummer}}")];

    [Fact]
    public void Zweihundert_Vorkommen_bestehen()
    {
        Assert.Empty(PlatzhalterPruefung.Pruefen(Absaetze(200)));
    }

    [Fact]
    public void Zweihundertundein_Vorkommen_ergeben_die_Grenzmeldung()
    {
        Assert.Equal([Grenzmeldung], PlatzhalterPruefung.Pruefen(Absaetze(201)));
    }

    [Fact]
    public void Zweihundertundein_Vorkommen_in_einem_Absatz_ergeben_die_Grenzmeldung()
    {
        var absatz = string.Join(" ", Absaetze(201));

        Assert.Equal([Grenzmeldung], PlatzhalterPruefung.Pruefen([absatz]));
    }

    [Fact]
    public void Grenzmeldung_steht_nach_den_bisherigen_Platzhaltermeldungen()
    {
        var absaetze = Enumerable.Repeat("{{Coin.Name}}", 201).Append("{{Unbekannt.Feld}}").Append("{{Coin.Name").ToArray();

        var meldungen = PlatzhalterPruefung.Pruefen(absaetze);

        Assert.Equal(4, meldungen.Count);
        Assert.StartsWith("Es fehlen Pflichtplatzhalter:", meldungen[0], StringComparison.Ordinal);
        Assert.StartsWith("Unbekannte Platzhalter:", meldungen[1], StringComparison.Ordinal);
        Assert.StartsWith("Unvollständige Platzhalter:", meldungen[2], StringComparison.Ordinal);
        Assert.Equal(Grenzmeldung, meldungen[3]);
    }

    [Fact]
    public void Standardvorlage_mit_allen_13_Platzhaltern_liegt_deutlich_unter_der_Grenze()
    {
        var alle = Platzhalterkatalog.Alle.Select(p => p.Text).ToArray();

        Assert.DoesNotContain(Grenzmeldung, PlatzhalterPruefung.Pruefen(alle));
    }
}
