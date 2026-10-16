using Coin.Domain;
using Coin.Domain.Katalog;

namespace Coin.UnitTests.Katalog;

/// <summary>
/// Feature zertifikatsvorlagen, AK-22 (ADR-0025): Feldprüfung beim Bearbeiten mit <see cref="CoinStammdaten.Pruefen"/>.
/// Regeln, Trimmen und Meldungen wie <see cref="CoinTyp.Erstellen"/>; zusätzlich darf eine gesetzte Auflage nicht
/// wieder <c>null</c> werden. Die Auflage-Änderung selbst (Untergrenze) prüft <see cref="AuflageAenderung"/>.
/// </summary>
public class CoinStammdatenTests
{
    private static readonly DateTimeOffset Jetzt = new(2026, 10, 9, 9, 0, 0, TimeSpan.Zero);

    private static Ergebnis<CoinStammdaten> Pruefen(
        string? name = "Coin Alpha",
        string? herausgeber = "Herausgeber Beta",
        int? auflage = null,
        string? beschreibung = null,
        int? bisherigeAuflage = null) =>
        CoinStammdaten.Pruefen(name, herausgeber, auflage, beschreibung, bisherigeAuflage);

    [Fact]
    public void Gueltige_Werte_sind_erfolgreich()
    {
        var ergebnis = Pruefen(auflage: 150, beschreibung: "Text", bisherigeAuflage: 100);

        Assert.True(ergebnis.IstErfolgreich);
        Assert.Equal(new CoinStammdaten("Coin Alpha", "Herausgeber Beta", 150, "Text"), ergebnis.Wert);
    }

    [Fact]
    public void Werte_werden_getrimmt()
    {
        var ergebnis = Pruefen("  Coin Alpha ", "\tHerausgeber Beta  ", 5, "  Text  ");

        Assert.Equal(new CoinStammdaten("Coin Alpha", "Herausgeber Beta", 5, "Text"), ergebnis.Wert);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Leere_Beschreibung_wird_null(string? beschreibung)
    {
        var ergebnis = Pruefen(beschreibung: beschreibung);

        Assert.Null(ergebnis.Wert!.Beschreibung);
    }

    public static TheoryData<string?, string?, int?, string?> UngueltigeEingaben => new()
    {
        { null, "Herausgeber Beta", null, null },
        { "   ", "Herausgeber Beta", null, null },
        { new string('n', 201), "Herausgeber Beta", null, null },
        { "Coin Alpha", "", null, null },
        { "Coin Alpha", new string('h', 201), null, null },
        { "Coin Alpha", "Herausgeber Beta", 0, null },
        { "Coin Alpha", "Herausgeber Beta", 1_000_001, null },
        { "Coin Alpha", "Herausgeber Beta", null, new string('b', 2001) },
        { "", "", -5, new string('b', 2001) },
    };

    [Theory]
    [MemberData(nameof(UngueltigeEingaben))]
    public void Meldungen_entsprechen_denen_beim_Anlegen(string? name, string? herausgeber, int? auflage, string? beschreibung)
    {
        var anlegen = CoinTyp.Erstellen(name, herausgeber, auflage, beschreibung, Jetzt);

        var bearbeiten = Pruefen(name, herausgeber, auflage, beschreibung);

        Assert.False(bearbeiten.IstErfolgreich);
        Assert.Equal(
            anlegen.Fehler.OrderBy(f => f.Key, StringComparer.Ordinal).Select(f => $"{f.Key}: {string.Join(" | ", f.Value)}"),
            bearbeiten.Fehler.OrderBy(f => f.Key, StringComparer.Ordinal).Select(f => $"{f.Key}: {string.Join(" | ", f.Value)}"));
    }

    [Fact]
    public void Auflage_null_ist_erlaubt_wenn_der_Coin_keine_Auflage_hat()
    {
        var ergebnis = Pruefen(auflage: null, bisherigeAuflage: null);

        Assert.True(ergebnis.IstErfolgreich);
        Assert.Null(ergebnis.Wert!.Auflage);
    }

    [Fact]
    public void Auflage_null_bei_gesetzter_Auflage_liefert_Auflage_ist_erforderlich()
    {
        var ergebnis = Pruefen(auflage: null, bisherigeAuflage: 10);

        Assert.Equal(["auflage"], ergebnis.Fehler.Keys);
        Assert.Equal(["Auflage ist erforderlich."], ergebnis.Fehler["auflage"]);
    }

    [Fact]
    public void Auflage_null_bei_gesetzter_Auflage_wird_zusammen_mit_anderen_Feldfehlern_gemeldet()
    {
        var ergebnis = Pruefen(name: "", auflage: null, bisherigeAuflage: 10);

        Assert.Equal(["auflage", "name"], ergebnis.Fehler.Keys.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void Erste_Auflage_fuer_einen_Coin_ohne_Auflage_ist_erlaubt()
    {
        var ergebnis = Pruefen(auflage: 25, bisherigeAuflage: null);

        Assert.Equal(25, ergebnis.Wert!.Auflage);
    }

    [Fact]
    public void Senken_der_Auflage_ist_in_der_Feldpruefung_erlaubt()
    {
        // Die Untergrenze (höchste je ausgegebene Nummer) prüft AuflageAenderung unter der Coin-Sperre.
        var ergebnis = Pruefen(auflage: 3, bisherigeAuflage: 10);

        Assert.True(ergebnis.IstErfolgreich);
    }

    [Fact]
    public void Auflage_ausserhalb_des_Bereichs_liefert_die_Bereichsmeldung_auch_bei_gesetzter_Auflage()
    {
        var ergebnis = Pruefen(auflage: 0, bisherigeAuflage: 10);

        Assert.Equal(["Auflage muss zwischen 1 und 1000000 liegen."], ergebnis.Fehler["auflage"]);
    }

    // ---------- Auflage-Regel beim Bearbeiten (F1): gleiche Regel wie PUT …/auflage ----------

    [Fact]
    public void Senkung_unter_die_hoechste_je_ausgegebene_Nummer_ist_zu_klein()
    {
        Assert.Equal(new AuflageAenderung.ZuKlein(7), AuflageAenderung.Pruefen(10, 6, 7));
    }

    [Fact]
    public void Senkung_bis_auf_die_hoechste_je_ausgegebene_Nummer_ist_erlaubt()
    {
        Assert.Equal(new AuflageAenderung.Senkung(8, 10), AuflageAenderung.Pruefen(10, 7, 7));
    }

    [Fact]
    public void Gleiche_Auflage_ist_unveraendert()
    {
        Assert.IsType<AuflageAenderung.Unveraendert>(AuflageAenderung.Pruefen(10, 10, 7));
    }
}
