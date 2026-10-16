using Coin.Domain.Vorlagen;

namespace Coin.UnitTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen, AK-1: Die Tabelle in <c>docs/platzhalter.md</c> (zwischen
/// <c>&lt;!-- platzhalter:start --&gt;</c> und <c>&lt;!-- platzhalter:ende --&gt;</c>) stimmt mit
/// <see cref="Platzhalterkatalog"/> überein (Muster <c>BerechtigungsDokuTests</c>). Tabellenform: Spalten
/// Platzhalter (in Backticks), Pflicht (<c>ja</c>/<c>nein</c>), Bedeutung, Beispiel.
/// </summary>
public class PlatzhalterDokuTests
{
    private const string DokuPfad = "docs/platzhalter.md";
    private const string StartMarker = "<!-- platzhalter:start -->";
    private const string EndeMarker = "<!-- platzhalter:ende -->";

    private static string RepoWurzel()
    {
        var verzeichnis = new DirectoryInfo(AppContext.BaseDirectory);
        while (verzeichnis is not null && !File.Exists(Path.Combine(verzeichnis.FullName, "CLAUDE.md")))
        {
            verzeichnis = verzeichnis.Parent;
        }

        return verzeichnis?.FullName ?? throw new InvalidOperationException("Repository-Wurzel nicht gefunden.");
    }

    /// <summary>Tabellenzeilen zwischen den Markern als Zellen (ohne Trennzeile).</summary>
    private static List<string[]> Tabelle()
    {
        var pfad = Path.Combine(RepoWurzel(), DokuPfad);
        Assert.True(File.Exists(pfad), $"{DokuPfad} fehlt (AK-1).");
        var text = File.ReadAllText(pfad);
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

    private static List<string[]> Zeilen() => Tabelle().Skip(1).ToList();

    private static bool Pflicht(string zelle) => zelle switch
    {
        "ja" => true,
        "nein" => false,
        _ => throw new InvalidOperationException($"Unerwarteter Wert „{zelle}“ in der Spalte Pflicht (erlaubt: ja oder nein)."),
    };

    [Fact]
    public void Doku_hat_die_Spalten_Platzhalter_Pflicht_Bedeutung_Beispiel()
    {
        Assert.Equal(["Platzhalter", "Pflicht", "Bedeutung", "Beispiel"], Tabelle()[0]);
    }

    [Fact]
    public void Doku_nennt_jeden_Platzhalter_in_Backticks()
    {
        Assert.All(Zeilen(), z => Assert.Matches("^`[^`]+`$", z[0]));
    }

    [Fact]
    public void Doku_listet_die_Platzhalter_des_Katalogs_in_derselben_Reihenfolge()
    {
        var lautDoku = Zeilen().Select(z => z[0].Trim('`'));

        Assert.Equal(Platzhalterkatalog.Alle.Select(p => p.Name), lautDoku);
    }

    [Fact]
    public void Doku_stimmt_bei_Pflicht_mit_dem_Katalog_ueberein()
    {
        var lautDoku = Zeilen().Select(z => $"{z[0].Trim('`')}={Pflicht(z[1])}");

        Assert.Equal(Platzhalterkatalog.Alle.Select(p => $"{p.Name}={p.Pflicht}"), lautDoku);
    }

    [Fact]
    public void Doku_stimmt_bei_Bedeutung_mit_dem_Katalog_ueberein()
    {
        var lautDoku = Zeilen().Select(z => $"{z[0].Trim('`')}={z[2]}");

        Assert.Equal(Platzhalterkatalog.Alle.Select(p => $"{p.Name}={p.Bedeutung}"), lautDoku);
    }

    [Fact]
    public void Doku_stimmt_beim_Beispiel_mit_dem_Katalog_ueberein()
    {
        var lautDoku = Zeilen().Select(z => $"{z[0].Trim('`')}={z[3]}");

        Assert.Equal(Platzhalterkatalog.Alle.Select(p => $"{p.Name}={p.Beispiel}"), lautDoku);
    }
}
