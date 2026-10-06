using Coin.Domain.Benutzer;

namespace Coin.UnitTests.Benutzer;

/// <summary>
/// Feature rollen-benutzerverwaltung, AK-2: Die Rollenmatrix in <c>docs/berechtigungen.md</c> (zwischen
/// <c>&lt;!-- rechtematrix:start --&gt;</c> und <c>&lt;!-- rechtematrix:ende --&gt;</c>) stimmt mit
/// <see cref="Rechtematrix"/> überein. Tabellenform laut Entwurf 5.1: Spalten Berechtigung, Bedeutung,
/// Administrator, Sachbearbeiter, Betrachter, keine Rolle; Zellen „✓“ bzw. „–“; Berechtigung in Backticks.
/// </summary>
public class BerechtigungsDokuTests
{
    private const string DokuPfad = "docs/berechtigungen.md";
    private const string StartMarker = "<!-- rechtematrix:start -->";
    private const string EndeMarker = "<!-- rechtematrix:ende -->";

    private static readonly string[] Rollenspalten = ["Administrator", "Sachbearbeiter", "Betrachter", "keine Rolle"];

    private static string RepoWurzel()
    {
        var verzeichnis = new DirectoryInfo(AppContext.BaseDirectory);
        while (verzeichnis is not null && !File.Exists(Path.Combine(verzeichnis.FullName, "CLAUDE.md")))
        {
            verzeichnis = verzeichnis.Parent;
        }

        return verzeichnis?.FullName ?? throw new InvalidOperationException("Repository-Wurzel nicht gefunden.");
    }

    private static string DokuText()
    {
        var pfad = Path.Combine(RepoWurzel(), DokuPfad);
        Assert.True(File.Exists(pfad), $"{DokuPfad} fehlt (AK-2).");
        return File.ReadAllText(pfad);
    }

    /// <summary>Tabellenzeilen zwischen den Markern als Zellen (ohne Trennzeile).</summary>
    private static List<string[]> Tabelle()
    {
        var text = DokuText();
        var start = text.IndexOf(StartMarker, StringComparison.Ordinal);
        var ende = text.IndexOf(EndeMarker, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Marker {StartMarker} fehlt.");
        Assert.True(ende > start, $"Marker {EndeMarker} fehlt oder steht vor dem Start-Marker.");

        return text[(start + StartMarker.Length)..ende]
            .Split('\n')
            .Select(z => z.Trim())
            .Where(z => z.StartsWith('|'))
            .Select(z => z.Trim('|').Split('|').Select(c => c.Trim()).ToArray())
            .Where(zellen => !zellen.All(c => c.Length > 0 && c.All(ch => ch is '-' or ':' or ' ')))
            .ToList();
    }

    private static (string[] Kopf, Dictionary<string, string[]> Zeilen) Matrix()
    {
        var tabelle = Tabelle();
        Assert.NotEmpty(tabelle);
        var kopf = tabelle[0];
        var zeilen = tabelle.Skip(1).ToDictionary(z => z[0].Trim('`'), z => z, StringComparer.Ordinal);
        return (kopf, zeilen);
    }

    private static bool Haken(string zelle) => zelle switch
    {
        "✓" => true,
        "–" or "-" => false,
        _ => throw new InvalidOperationException($"Unerwarteter Zellwert „{zelle}“ (erlaubt: ✓ oder –)."),
    };

    [Fact]
    public void Doku_hat_die_Spalten_Berechtigung_Bedeutung_und_die_vier_Rollenspalten()
    {
        var (kopf, _) = Matrix();

        Assert.Equal(["Berechtigung", "Bedeutung", .. Rollenspalten], kopf);
    }

    [Fact]
    public void Doku_listet_genau_die_Berechtigungen_aus_dem_Code()
    {
        var (_, zeilen) = Matrix();

        Assert.Equal(
            Berechtigungen.Alle.Order(StringComparer.Ordinal),
            zeilen.Keys.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void Doku_listet_jede_Berechtigung_genau_einmal()
    {
        var tabelle = Tabelle().Skip(1).Select(z => z[0].Trim('`')).ToList();

        Assert.Equal(tabelle.Count, tabelle.Distinct(StringComparer.Ordinal).Count());
    }

    [Theory]
    [InlineData("Administrator")]
    [InlineData("Sachbearbeiter")]
    [InlineData("Betrachter")]
    [InlineData("keine Rolle")]
    public void Doku_stimmt_fuer_die_Rolle_mit_der_Rechtematrix_ueberein(string spalte)
    {
        var (kopf, zeilen) = Matrix();
        var index = Array.IndexOf(kopf, spalte);
        Assert.True(index >= 0, $"Spalte „{spalte}“ fehlt.");
        Rolle? rolle = spalte == "keine Rolle" ? null : Enum.Parse<Rolle>(spalte);

        var lautDoku = zeilen.Where(z => Haken(z.Value[index])).Select(z => z.Key).Order(StringComparer.Ordinal);

        Assert.Equal(Rechtematrix.Von(rolle).Order(StringComparer.Ordinal), lautDoku);
    }
}
