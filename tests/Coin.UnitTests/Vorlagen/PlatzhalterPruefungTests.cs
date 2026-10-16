using Coin.Domain.Vorlagen;

namespace Coin.UnitTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen, AK-15 (ADR-0022 Punkt 4, ADR-0024 Punkt 1.8): <see cref="PlatzhalterPruefung"/> prüft
/// nur Absatztexte (je Absatz ein String, Runs bereits verkettet). Ergebnis: Meldungen in der Reihenfolge fehlend →
/// unbekannt → unvollständig; leer = bestanden.
/// </summary>
public class PlatzhalterPruefungTests
{
    private const string Pflicht = "{{Coin.Name}} {{Exemplar.Nummer}} {{Zertifikat.Nummer}} {{Empfaenger.Name}}";

    private const string Hinweis = " Erlaubt sind nur die Platzhalter aus der Standardvorlage.";

    private static IReadOnlyList<string> Pruefen(params string[] absaetze) => PlatzhalterPruefung.Pruefen(absaetze);

    // ---------- bestanden ----------

    [Fact]
    public void Alle_Pflichtplatzhalter_in_einem_Absatz_bestehen()
    {
        Assert.Empty(Pruefen(Pflicht));
    }

    [Fact]
    public void Pflichtplatzhalter_auf_mehrere_Absaetze_verteilt_bestehen()
    {
        Assert.Empty(Pruefen("{{Coin.Name}}", "Nr. {{Exemplar.Nummer}}", "Zertifikat {{Zertifikat.Nummer}}", "an {{Empfaenger.Name}}"));
    }

    [Fact]
    public void Alle_13_Platzhalter_des_Katalogs_bestehen()
    {
        var alle = string.Join(" ", Platzhalterkatalog.Alle.Select(p => $"{{{{{p.Name}}}}}"));

        Assert.Empty(Pruefen(alle));
    }

    [Fact]
    public void Optionale_Platzhalter_duerfen_fehlen()
    {
        Assert.Empty(Pruefen(Pflicht, "Ohne optionale Platzhalter."));
    }

    [Fact]
    public void Mehrfaches_Vorkommen_ist_erlaubt()
    {
        Assert.Empty(Pruefen(Pflicht, "{{Coin.Name}} und noch einmal {{Coin.Name}}", "{{Zertifikat.Nummer}}"));
    }

    [Fact]
    public void Platzhalter_direkt_aneinander_ohne_Leerzeichen_bestehen()
    {
        Assert.Empty(Pruefen("{{Coin.Name}}{{Exemplar.Nummer}}{{Zertifikat.Nummer}}{{Empfaenger.Name}}"));
    }

    [Fact]
    public void Einfache_geschweifte_Klammern_sind_kein_Platzhalter()
    {
        Assert.Empty(Pruefen(Pflicht, "Menge {a, b} und {Coin.Name}"));
    }

    [Fact]
    public void Leere_Absaetze_stoeren_nicht()
    {
        Assert.Empty(Pruefen(string.Empty, Pflicht, string.Empty));
    }

    // ---------- fehlende Pflichtplatzhalter ----------

    [Fact]
    public void Ohne_Absaetze_fehlen_alle_vier_Pflichtplatzhalter()
    {
        Assert.Equal(
            ["Es fehlen Pflichtplatzhalter: {{Coin.Name}}, {{Exemplar.Nummer}}, {{Zertifikat.Nummer}}, {{Empfaenger.Name}}."],
            Pruefen());
    }

    [Fact]
    public void Fehlender_Pflichtplatzhalter_wird_gemeldet()
    {
        Assert.Equal(
            ["Es fehlen Pflichtplatzhalter: {{Zertifikat.Nummer}}."],
            Pruefen("{{Coin.Name}} {{Exemplar.Nummer}} {{Empfaenger.Name}}"));
    }

    [Fact]
    public void Fehlende_Pflichtplatzhalter_stehen_in_Katalogreihenfolge()
    {
        Assert.Equal(
            ["Es fehlen Pflichtplatzhalter: {{Coin.Name}}, {{Empfaenger.Name}}."],
            Pruefen("{{Zertifikat.Nummer}}", "{{Exemplar.Nummer}}"));
    }

    [Fact]
    public void Ein_Pflichtplatzhalter_ohne_Klammern_zaehlt_nicht()
    {
        Assert.Equal(
            ["Es fehlen Pflichtplatzhalter: {{Coin.Name}}."],
            Pruefen("Coin.Name {{Exemplar.Nummer}} {{Zertifikat.Nummer}} {{Empfaenger.Name}}"));
    }

    // ---------- unbekannte Platzhalter (F9) ----------

    [Fact]
    public void Unbekannter_Platzhalter_wird_gemeldet()
    {
        Assert.Equal(
            ["Unbekannte Platzhalter: {{Empfaenger.Nam}}." + Hinweis],
            Pruefen(Pflicht, "{{Empfaenger.Nam}}"));
    }

    [Fact]
    public void Leerzeichen_innerhalb_der_Klammern_machen_den_Platzhalter_unbekannt()
    {
        var meldungen = Pruefen(Pflicht, "{{ Coin.Name }}");

        Assert.Equal(["Unbekannte Platzhalter: {{ Coin.Name }}." + Hinweis], meldungen);
    }

    [Fact]
    public void Abweichende_Gross_und_Kleinschreibung_macht_den_Platzhalter_unbekannt()
    {
        var meldungen = Pruefen(Pflicht, "{{coin.name}}");

        Assert.Equal(["Unbekannte Platzhalter: {{coin.name}}." + Hinweis], meldungen);
    }

    [Fact]
    public void Falsch_geschriebener_Pflichtplatzhalter_fehlt_und_ist_unbekannt()
    {
        var meldungen = Pruefen("{{coin.name}} {{Exemplar.Nummer}} {{Zertifikat.Nummer}} {{Empfaenger.Name}}");

        Assert.Equal(
            ["Es fehlen Pflichtplatzhalter: {{Coin.Name}}.", "Unbekannte Platzhalter: {{coin.name}}." + Hinweis],
            meldungen);
    }

    [Fact]
    public void Unbekannte_Platzhalter_stehen_in_der_Reihenfolge_des_ersten_Vorkommens()
    {
        var meldungen = Pruefen(Pflicht, "{{Empfaenger.Nam}} {{ Coin.Name }}", "{{Zzz.Erst}}");

        Assert.Equal(["Unbekannte Platzhalter: {{Empfaenger.Nam}}, {{ Coin.Name }}, {{Zzz.Erst}}." + Hinweis], meldungen);
    }

    [Fact]
    public void Jeder_unbekannte_Wert_wird_nur_einmal_genannt()
    {
        var meldungen = Pruefen(Pflicht, "{{Foo.Bar}} {{Foo.Bar}}", "{{Foo.Bar}}");

        Assert.Equal(["Unbekannte Platzhalter: {{Foo.Bar}}." + Hinweis], meldungen);
    }

    [Fact]
    public void Leere_Klammern_sind_ein_unbekannter_Platzhalter()
    {
        Assert.Equal(["Unbekannte Platzhalter: {{}}." + Hinweis], Pruefen(Pflicht, "Text {{}} Text"));
    }

    // ---------- unvollständige Platzhalter ----------

    [Fact]
    public void Oeffnende_Klammern_ohne_schliessende_im_selben_Absatz_sind_unvollstaendig()
    {
        Assert.Equal(["Unvollständige Platzhalter: „{{Coin.Name“."], Pruefen(Pflicht, "{{Coin.Name"));
    }

    [Fact]
    public void Ausschnitt_der_oeffnenden_Klammern_reicht_bis_zum_Absatzende()
    {
        Assert.Equal(["Unvollständige Platzhalter: „{{Coin.Name und Rest“."], Pruefen(Pflicht, "Name: {{Coin.Name und Rest"));
    }

    [Fact]
    public void Schliessende_Klammern_ohne_oeffnende_sind_unvollstaendig()
    {
        Assert.Equal(["Unvollständige Platzhalter: „Exemplar.Nummer}}“."], Pruefen(Pflicht, "Exemplar.Nummer}}"));
    }

    [Fact]
    public void Platzhalter_ueber_zwei_Absaetze_ist_unvollstaendig_und_fehlt()
    {
        var meldungen = Pruefen("{{Coin.", "Name}}", "{{Exemplar.Nummer}} {{Zertifikat.Nummer}} {{Empfaenger.Name}}");

        Assert.Equal(
            ["Es fehlen Pflichtplatzhalter: {{Coin.Name}}.", "Unvollständige Platzhalter: „{{Coin.“, „Name}}“."],
            meldungen);
    }

    [Fact]
    public void Meldungen_erscheinen_gemeinsam_in_der_Reihenfolge_fehlend_unbekannt_unvollstaendig()
    {
        var meldungen = Pruefen("{{Exemplar.Nummer}} {{Zertifikat.Nummer}}", "{{Empfaenger.Nam}}", "{{Coin.Name");

        Assert.Equal(
            [
                "Es fehlen Pflichtplatzhalter: {{Coin.Name}}, {{Empfaenger.Name}}.",
                "Unbekannte Platzhalter: {{Empfaenger.Nam}}." + Hinweis,
                "Unvollständige Platzhalter: „{{Coin.Name“.",
            ],
            meldungen);
    }

    // ---------- Kürzung, Obergrenze, Steuerzeichen ----------

    [Fact]
    public void Werte_ueber_60_Zeichen_werden_auf_60_Zeichen_gekuerzt_und_mit_Auslassungszeichen_markiert()
    {
        var wert = "{{" + new string('A', 100) + "}}";

        var meldungen = Pruefen(Pflicht, wert);

        Assert.Equal(["Unbekannte Platzhalter: " + wert[..60] + "…." + Hinweis], meldungen);
    }

    [Fact]
    public void Werte_mit_genau_60_Zeichen_werden_nicht_gekuerzt()
    {
        var wert = "{{" + new string('B', 56) + "}}";

        var meldungen = Pruefen(Pflicht, wert);

        Assert.Equal(["Unbekannte Platzhalter: " + wert + "." + Hinweis], meldungen);
    }

    [Fact]
    public void Unvollstaendige_Ausschnitte_werden_ebenfalls_gekuerzt()
    {
        var ausschnitt = "{{" + new string('C', 80);

        var meldungen = Pruefen(Pflicht, ausschnitt);

        Assert.Equal(["Unvollständige Platzhalter: „" + ausschnitt[..60] + "…“."], meldungen);
    }

    [Fact]
    public void Je_Meldung_hoechstens_20_Werte_danach_und_n_weitere()
    {
        var unbekannt = Enumerable.Range(1, 25).Select(i => $"{{{{Unbekannt.Nr{i:00}}}}}").ToList();

        var meldungen = Pruefen(Pflicht, string.Join(" ", unbekannt));

        Assert.Equal(
            ["Unbekannte Platzhalter: " + string.Join(", ", unbekannt.Take(20)) + " und 5 weitere." + Hinweis],
            meldungen);
    }

    [Fact]
    public void Genau_20_Werte_werden_ohne_Zusatz_genannt()
    {
        var unbekannt = Enumerable.Range(1, 20).Select(i => $"{{{{Unbekannt.Nr{i:00}}}}}").ToList();

        var meldungen = Pruefen(Pflicht, string.Join(" ", unbekannt));

        Assert.Equal(["Unbekannte Platzhalter: " + string.Join(", ", unbekannt) + "." + Hinweis], meldungen);
    }

    [Fact]
    public void Steuerzeichen_werden_aus_den_Werten_entfernt()
    {
        var meldungen = Pruefen(Pflicht, "{{Ab\u0001c\u001F.D\u007Fe}}");

        Assert.Equal(["Unbekannte Platzhalter: {{Abc.De}}." + Hinweis], meldungen);
    }

    [Fact]
    public void Meldungen_enthalten_keine_Steuerzeichen()
    {
        var meldungen = Pruefen("{{X\u0000Y}}", "\u0007{{Coin.Name");

        Assert.All(meldungen, m => Assert.DoesNotContain(m, char.IsControl));
    }
}
