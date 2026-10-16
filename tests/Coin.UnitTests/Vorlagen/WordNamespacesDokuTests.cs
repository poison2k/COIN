using Coin.Domain.Vorlagen;

namespace Coin.UnitTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 7, AK-10 (Namespace-Positivliste, Punkt 7), ADR-0026 Punkt 6: Die Tabelle in
/// <c>docs/word-namespaces.md</c> zwischen <c>&lt;!-- word-namespaces:start --&gt;</c> und
/// <c>&lt;!-- word-namespaces:ende --&gt;</c> stimmt mit <see cref="WordNamespaces"/> überein (Präfix und URI, gleiche
/// Reihenfolge; Muster <c>PlatzhalterDokuTests</c>). Tabellenform: Spalten Präfix, Namespace-URI (beide in Backticks),
/// Zweck, Begründung. Die Tabelle der nicht erlaubten Namespaces in derselben Datei wird nicht abgeglichen.
/// </summary>
public class WordNamespacesDokuTests
{
    private const string DokuPfad = "docs/word-namespaces.md";
    private const string StartMarker = "<!-- word-namespaces:start -->";
    private const string EndeMarker = "<!-- word-namespaces:ende -->";

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
        Assert.True(File.Exists(pfad), $"{DokuPfad} fehlt (AK-10).");
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

    [Fact]
    public void Doku_hat_die_Spalten_Praefix_Namespace_URI_Zweck_Begruendung()
    {
        Assert.Equal(["Präfix", "Namespace-URI", "Zweck", "Begründung"], Tabelle()[0]);
    }

    [Fact]
    public void Doku_nennt_Praefix_und_URI_jeweils_in_Backticks()
    {
        Assert.All(Zeilen(), z =>
        {
            Assert.Matches("^`[^`]+`$", z[0]);
            Assert.Matches("^`[^`]+`$", z[1]);
        });
    }

    [Fact]
    public void Doku_listet_die_URIs_des_Codes_in_derselben_Reihenfolge()
    {
        var lautDoku = Zeilen().Select(z => z[1].Trim('`'));

        Assert.Equal(WordNamespaces.Alle.Select(n => n.Uri), lautDoku);
    }

    [Fact]
    public void Doku_stimmt_beim_Praefix_mit_dem_Code_ueberein()
    {
        var lautDoku = Zeilen().Select(z => $"{z[1].Trim('`')}={z[0].Trim('`')}");

        Assert.Equal(WordNamespaces.Alle.Select(n => $"{n.Uri}={n.Praefix}"), lautDoku);
    }
}
