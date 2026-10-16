using System.Text.RegularExpressions;
using Coin.Domain.Vorlagen;

namespace Coin.UnitTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen, AK-1 und Abschnitt 4.1: <see cref="Platzhalterkatalog"/> ist die einzige Liste der
/// Platzhalter (13 Einträge, verbindliche Reihenfolge, genau vier Pflichtplatzhalter).
/// </summary>
public partial class PlatzhalterkatalogTests
{
    /// <summary>Reihenfolge laut Abschnitt 4.1 (bewusst als Literale, unabhängig vom Produktivcode).</summary>
    private static readonly string[] NamenLautEntwurf =
    [
        "Coin.Name",
        "Exemplar.Nummer",
        "Zertifikat.Nummer",
        "Empfaenger.Name",
        "Coin.Herausgeber",
        "Coin.Beschreibung",
        "Coin.Auflage",
        "Empfaenger.Dienstgrad",
        "Empfaenger.Dienststelle",
        "Ausgabe.Datum",
        "Ausgabe.Gelegenheit",
        "Ausgabe.Begruendung",
        "Ausgabe.AusgebendeStelle",
    ];

    [GeneratedRegex(@"^[A-Z][A-Za-z]*\.[A-Z][A-Za-z]*$")]
    private static partial Regex GruppeFeld();

    [Fact]
    public void Katalog_hat_13_Eintraege()
    {
        Assert.Equal(13, Platzhalterkatalog.Alle.Count);
    }

    [Fact]
    public void Katalog_hat_die_Reihenfolge_aus_dem_Entwurf()
    {
        Assert.Equal(NamenLautEntwurf, Platzhalterkatalog.Alle.Select(p => p.Name));
    }

    [Fact]
    public void Pflicht_sind_genau_Coin_Name_Exemplar_Nummer_Zertifikat_Nummer_und_Empfaenger_Name()
    {
        var pflicht = Platzhalterkatalog.Alle.Where(p => p.Pflicht).Select(p => p.Name);

        Assert.Equal(["Coin.Name", "Exemplar.Nummer", "Zertifikat.Nummer", "Empfaenger.Name"], pflicht);
    }

    [Fact]
    public void Namen_sind_eindeutig()
    {
        var namen = Platzhalterkatalog.Alle.Select(p => p.Name).ToList();

        Assert.Equal(namen.Count, namen.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void Namen_sind_auch_ohne_Gross_und_Kleinschreibung_eindeutig()
    {
        var namen = Platzhalterkatalog.Alle.Select(p => p.Name).ToList();

        Assert.Equal(namen.Count, namen.Distinct(StringComparer.OrdinalIgnoreCase).Count());
    }

    [Fact]
    public void Namen_haben_das_Format_Gruppe_Punkt_Feld_ohne_Klammern_und_Leerzeichen()
    {
        Assert.All(Platzhalterkatalog.Alle, p => Assert.Matches(GruppeFeld(), p.Name));
    }

    [Fact]
    public void Jeder_Eintrag_hat_Bedeutung_und_Beispiel()
    {
        Assert.All(Platzhalterkatalog.Alle, p =>
        {
            Assert.False(string.IsNullOrWhiteSpace(p.Bedeutung), $"{p.Name}: Bedeutung fehlt.");
            Assert.False(string.IsNullOrWhiteSpace(p.Beispiel), $"{p.Name}: Beispiel fehlt.");
        });
    }

    [Theory]
    [InlineData("Coin.Name", "Name des Coins", "Einsatzkontingent Beispiel 2025")]
    [InlineData("Zertifikat.Nummer", "Eindeutige Nummer des Zertifikats", "wird beim Ausstellen vergeben")]
    [InlineData("Ausgabe.AusgebendeStelle", "Ausgebende Stelle oder Person", "Kommandeur Beispielbataillon 1")]
    public void Bedeutung_und_Beispiel_stehen_wie_im_Entwurf(string name, string bedeutung, string beispiel)
    {
        var eintrag = Assert.Single(Platzhalterkatalog.Alle, p => p.Name == name);

        Assert.Equal((bedeutung, beispiel), (eintrag.Bedeutung, eintrag.Beispiel));
    }
}
