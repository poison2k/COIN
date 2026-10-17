using System.Text.RegularExpressions;

namespace Coin.UnitTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-15 (ADR-0028 Punkt 6 und 7, Muster <c>KonfigurationsdateienTests</c>): Der Code in
/// <c>src/Coin.Domain/Zertifikate</c> und <c>src/Coin.Infrastructure/Zertifikate</c> verarbeitet nur im Speicher und
/// verwendet weder <c>System.IO.File</c>, <c>FileStream</c>, <c>Path.GetTempPath</c>/<c>GetTempFileName</c> noch
/// <c>System.IO.Packaging</c>. Liest die Quelldateien des Repositorys.
/// </summary>
public partial class ZertifikatCodeTests
{
    public static TheoryData<string> Verzeichnisse => ["src/Coin.Domain/Zertifikate", "src/Coin.Infrastructure/Zertifikate"];

    public static TheoryData<string, string> Verbote => new()
    {
        { "src/Coin.Domain/Zertifikate", "File." },
        { "src/Coin.Domain/Zertifikate", "FileStream" },
        { "src/Coin.Domain/Zertifikate", "GetTempPath" },
        { "src/Coin.Domain/Zertifikate", "GetTempFileName" },
        { "src/Coin.Domain/Zertifikate", "System.IO.Packaging" },
        { "src/Coin.Domain/Zertifikate", "ZipFile" },
        { "src/Coin.Infrastructure/Zertifikate", "File." },
        { "src/Coin.Infrastructure/Zertifikate", "FileStream" },
        { "src/Coin.Infrastructure/Zertifikate", "GetTempPath" },
        { "src/Coin.Infrastructure/Zertifikate", "GetTempFileName" },
        { "src/Coin.Infrastructure/Zertifikate", "System.IO.Packaging" },
        { "src/Coin.Infrastructure/Zertifikate", "ZipFile" },
    };

    private static string RepoWurzel()
    {
        var verzeichnis = new DirectoryInfo(AppContext.BaseDirectory);
        while (verzeichnis is not null && !File.Exists(Path.Combine(verzeichnis.FullName, "CLAUDE.md")))
        {
            verzeichnis = verzeichnis.Parent;
        }

        return verzeichnis?.FullName ?? throw new InvalidOperationException("Repository-Wurzel nicht gefunden.");
    }

    [GeneratedRegex(@"//.*?$|/\*.*?\*/", RegexOptions.Singleline | RegexOptions.Multiline)]
    private static partial Regex Kommentar();

    private static List<string> Quellen(string relativ)
    {
        var pfad = Path.Combine(RepoWurzel(), relativ);
        Assert.True(Directory.Exists(pfad), $"{relativ} fehlt (Entwurf zertifikat-erzeugen, Abschnitt 5.5).");
        return Directory.EnumerateFiles(pfad, "*.cs", SearchOption.AllDirectories)
            .Where(d => !d.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                && !d.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
            .ToList();
    }

    [Theory]
    [MemberData(nameof(Verzeichnisse))]
    public void Verzeichnis_enthaelt_Quellcode(string relativ)
    {
        Assert.NotEmpty(Quellen(relativ));
    }

    [Theory]
    [MemberData(nameof(Verbote))]
    public void Zertifikats_Code_verwendet_kein_Dateisystem_und_kein_System_IO_Packaging(string relativ, string verboten)
    {
        var muster = Muster(verboten);

        var treffer = Quellen(relativ)
            .Where(d => muster.IsMatch(Kommentar().Replace(File.ReadAllText(d), string.Empty)))
            .Select(d => Path.GetRelativePath(RepoWurzel(), d))
            .ToList();

        Assert.Empty(treffer);
    }

    /// <summary>Token als ganzes Wort (Punkte mit beliebigem Leerraum), z. B. <c>File.</c> auch in <c>System.IO.File.Open</c>.</summary>
    private static Regex Muster(string verboten) =>
        new(@"(?<!\w)" + Regex.Escape(verboten).Replace(@"\.", @"\s*\.\s*", StringComparison.Ordinal) + (verboten.EndsWith('.') ? string.Empty : @"\b"));

    [Theory]
    [InlineData("File.", "var x = File.ReadAllBytes(p);")]
    [InlineData("File.", "System.IO.File.Open(p)")]
    [InlineData("FileStream", "using var s = new System.IO.FileStream(p, FileMode.Open);")]
    [InlineData("GetTempPath", "Path.GetTempPath()")]
    [InlineData("System.IO.Packaging", "using System.IO.Packaging;")]
    [InlineData("ZipFile", "ZipFile.OpenRead(p)")]
    public void Pruefmuster_erkennt_einen_Verstoss(string verboten, string code)
    {
        Assert.Matches(Muster(verboten), code);
    }

    [Theory]
    [InlineData("File.", "var p = Profile.Name; IFormFile.Laenge;")]
    [InlineData("FileStream", "var m = new MemoryStream();")]
    public void Pruefmuster_meldet_keinen_Fehlalarm(string verboten, string code)
    {
        Assert.DoesNotMatch(Muster(verboten), code);
    }
}
