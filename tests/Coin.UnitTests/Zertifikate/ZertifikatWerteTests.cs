using Coin.Domain.Vorlagen;
using static Coin.UnitTests.Zertifikate.ZertifikatDomain;

namespace Coin.UnitTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-12 und Abschnitt 4 (F6, F8, F10): <c>ZertifikatWerte.Aus(coin, ausgabe)</c> bildet
/// für jeden Eintrag des <see cref="Platzhalterkatalog"/> einen Wert: Datum <c>TT.MM.JJJJ</c>, Zahlen ohne
/// Tausenderpunkt und ohne führende Nullen, <c>null</c> → leer, Coin-Daten aus dem übergebenen (aktuellen) Stand.
/// <c>ToString()</c> enthält keine Werte (AK-21).
/// </summary>
public class ZertifikatWerteTests
{
    private static readonly CoinDaten Coin = new("Coin Werte Alpha", "Herausgeber Werte Beta", 1500, "Beschreibung Werte Gamma");

    private static readonly AusgabeDaten Ausgabe = new(
        12, "C0042-0012", "Max Werte Beispiel", "Hauptmann Werte", "Dienststelle Werte", new DateOnly(2026, 10, 1),
        "Gelegenheit Werte", "Begründung Werte", "Stelle Werte");

    private static Dictionary<string, string> Werte(CoinDaten? coin = null, AusgabeDaten? ausgabe = null) =>
        WerteAus(coin ?? Coin, ausgabe ?? Ausgabe).Werte;

    [Fact]
    public void Fuer_jeden_Katalogeintrag_gibt_es_einen_Wert()
    {
        var werte = Werte();

        Assert.All(Platzhalterkatalog.Alle, p => Assert.True(werte.ContainsKey(p.Name), $"Kein Wert für {p.Name}."));
    }

    [Fact]
    public void Es_gibt_keine_Werte_ausserhalb_des_Katalogs()
    {
        var namen = Platzhalterkatalog.Alle.Select(p => p.Name).ToHashSet(StringComparer.Ordinal);

        Assert.All(Werte().Keys, k => Assert.Contains(k, namen));
    }

    [Theory]
    [InlineData("Coin.Name", "Coin Werte Alpha")]
    [InlineData("Coin.Herausgeber", "Herausgeber Werte Beta")]
    [InlineData("Coin.Beschreibung", "Beschreibung Werte Gamma")]
    [InlineData("Zertifikat.Nummer", "C0042-0012")]
    [InlineData("Empfaenger.Name", "Max Werte Beispiel")]
    [InlineData("Empfaenger.Dienstgrad", "Hauptmann Werte")]
    [InlineData("Empfaenger.Dienststelle", "Dienststelle Werte")]
    [InlineData("Ausgabe.Gelegenheit", "Gelegenheit Werte")]
    [InlineData("Ausgabe.Begruendung", "Begründung Werte")]
    [InlineData("Ausgabe.AusgebendeStelle", "Stelle Werte")]
    public void Textwerte_stammen_aus_Coin_und_Ausgabe(string name, string erwartet)
    {
        Assert.Equal(erwartet, Werte()[name]);
    }

    [Fact]
    public void Datum_hat_das_Format_TT_MM_JJJJ()
    {
        Assert.Equal("01.10.2026", Werte()["Ausgabe.Datum"]);
    }

    [Fact]
    public void Datum_mit_zweistelligem_Tag_und_Monat()
    {
        Assert.Equal("24.12.2025", Werte(ausgabe: Ausgabe with { Datum = new DateOnly(2025, 12, 24) })["Ausgabe.Datum"]);
    }

    [Fact]
    public void Exemplar_Nummer_hat_keine_fuehrenden_Nullen()
    {
        Assert.Equal("12", Werte()["Exemplar.Nummer"]);
    }

    [Fact]
    public void Exemplar_Nummer_hat_keinen_Tausenderpunkt()
    {
        Assert.Equal("123456", Werte(ausgabe: Ausgabe with { ExemplarNummer = 123456, Zertifikatsnummer = "C0042-123456" })["Exemplar.Nummer"]);
    }

    [Fact]
    public void Auflage_hat_keinen_Tausenderpunkt()
    {
        Assert.Equal("1500", Werte()["Coin.Auflage"]);
    }

    [Fact]
    public void Auflage_von_einer_Million_hat_keinen_Tausenderpunkt()
    {
        Assert.Equal("1000000", Werte(coin: Coin with { Auflage = 1_000_000 })["Coin.Auflage"]);
    }

    [Fact]
    public void Zertifikat_Nummer_ist_die_gespeicherte_Nummer()
    {
        // Die Nummer wird nicht neu gebildet: Auch eine abweichende gespeicherte Nummer erscheint unverändert.
        Assert.Equal("C0007-0012", Werte(ausgabe: Ausgabe with { Zertifikatsnummer = "C0007-0012" })["Zertifikat.Nummer"]);
    }

    [Theory]
    [InlineData("Empfaenger.Dienstgrad")]
    [InlineData("Empfaenger.Dienststelle")]
    public void Fehlende_optionale_Empfaengerangabe_ergibt_leeren_Text(string name)
    {
        var werte = Werte(ausgabe: Ausgabe with { Dienstgrad = null, Dienststelle = null });

        Assert.Equal(string.Empty, werte[name]);
    }

    [Fact]
    public void Fehlende_Beschreibung_ergibt_leeren_Text()
    {
        Assert.Equal(string.Empty, Werte(coin: Coin with { Beschreibung = null })["Coin.Beschreibung"]);
    }

    [Fact]
    public void Fehlende_Auflage_ergibt_leeren_Text()
    {
        Assert.Equal(string.Empty, Werte(coin: Coin with { Auflage = null })["Coin.Auflage"]);
    }

    [Fact]
    public void Coin_Werte_kommen_aus_dem_uebergebenen_aktuellen_Stand()
    {
        var werte = Werte(coin: Coin with { Name = "Coin Werte Umbenannt", Herausgeber = "Herausgeber Werte Neu" });

        Assert.Equal(("Coin Werte Umbenannt", "Herausgeber Werte Neu"), (werte["Coin.Name"], werte["Coin.Herausgeber"]));
    }

    [Fact]
    public void Zeilenumbrueche_bleiben_im_Wert_erhalten()
    {
        // Die Umwandlung in w:br übernimmt die Ersetzung (ADR-0028 Punkt 5); der Wert selbst bleibt unverändert.
        Assert.Equal("Zeile 1\nZeile 2", Werte(ausgabe: Ausgabe with { Begruendung = "Zeile 1\nZeile 2" })["Ausgabe.Begruendung"]);
    }

    [Fact]
    public void ToString_enthaelt_keine_Werte()
    {
        var (_, objekt) = WerteAus(Coin, Ausgabe);

        var text = objekt.ToString() ?? string.Empty;

        Assert.DoesNotContain("Werte", text.Replace("ZertifikatWerte", string.Empty, StringComparison.Ordinal), StringComparison.Ordinal);
        Assert.DoesNotContain("C0042", text, StringComparison.Ordinal);
    }
}
