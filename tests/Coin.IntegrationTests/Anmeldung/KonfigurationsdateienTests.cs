using System.Text.Json;

namespace Coin.IntegrationTests.Anmeldung;

/// <summary>
/// Feature anmeldung-keycloak, AK-6 und AK-16: Werte der Konfigurationsdateien und keine festen Oidc-Werte im Code.
/// Liest die Dateien des Repositorys (kein Testhost nötig).
/// </summary>
public class KonfigurationsdateienTests
{
    private static readonly string Wurzel = RepoWurzel();

    private static string RepoWurzel()
    {
        var verzeichnis = new DirectoryInfo(AppContext.BaseDirectory);
        while (verzeichnis is not null && !File.Exists(Path.Combine(verzeichnis.FullName, "CLAUDE.md")))
        {
            verzeichnis = verzeichnis.Parent;
        }

        return verzeichnis?.FullName ?? throw new InvalidOperationException("Repository-Wurzel nicht gefunden.");
    }

    private static JsonElement LadeJson(string relativ)
    {
        using var dokument = JsonDocument.Parse(File.ReadAllText(Path.Combine(Wurzel, relativ)),
            new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
        return dokument.RootElement.Clone();
    }

    private static JsonElement? Pfad(JsonElement wurzel, params string[] teile)
    {
        var aktuell = wurzel;
        foreach (var teil in teile)
        {
            if (aktuell.ValueKind != JsonValueKind.Object || !aktuell.TryGetProperty(teil, out aktuell))
            {
                return null;
            }
        }

        return aktuell;
    }

    private static readonly JsonElement Basis = LadeJson("src/Coin.Api/appsettings.json");
    private static readonly JsonElement Development = LadeJson("src/Coin.Api/appsettings.Development.json");

    [Theory]
    [InlineData("Authority")]
    [InlineData("Audience")]
    [InlineData("ClientId")]
    public void Appsettings_json_enthaelt_keinen_Oidc_Wert(string schluessel)
    {
        var wert = Pfad(Basis, "Oidc", schluessel);

        Assert.True(wert is null || (wert.Value.ValueKind == JsonValueKind.String && wert.Value.GetString() == string.Empty),
            $"Oidc:{schluessel} = {wert}");
    }

    [Theory]
    [InlineData("Authority", "http://localhost:8180/realms/coin")]
    [InlineData("Audience", "coin-api")]
    [InlineData("ClientId", "coin-web")]
    public void Appsettings_Development_json_enthaelt_die_lokalen_Oidc_Werte(string schluessel, string erwartet)
    {
        Assert.Equal(erwartet, Pfad(Development, "Oidc", schluessel)?.GetString());
    }

    [Fact]
    public void Appsettings_json_hat_eine_leere_Bootstrap_Liste()
    {
        var liste = Pfad(Basis, "Bootstrap", "AdminEmails");

        Assert.NotNull(liste);
        Assert.Equal(JsonValueKind.Array, liste.Value.ValueKind);
        Assert.Equal(0, liste.Value.GetArrayLength());
    }

    [Fact]
    public void Appsettings_Development_json_hat_genau_admin_test_local_als_Bootstrap_Admin()
    {
        var liste = Pfad(Development, "Bootstrap", "AdminEmails");

        Assert.NotNull(liste);
        Assert.Equal(["admin@test.local"], liste.Value.EnumerateArray().Select(e => e.GetString()));
    }

    [Fact]
    public void Appsettings_Development_json_setzt_den_Frontend_Ursprung_auf_Port_5173()
    {
        Assert.Equal("http://localhost:5173", Pfad(Development, "Frontend", "Ursprung")?.GetString());
    }

    [Fact]
    public void Appsettings_json_setzt_keinen_Frontend_Ursprung()
    {
        var wert = Pfad(Basis, "Frontend", "Ursprung");

        Assert.True(wert is null || wert.Value.GetString() == string.Empty, $"Frontend:Ursprung = {wert}");
    }

    [Theory]
    [InlineData("localhost:8180")]
    [InlineData("realms/coin")]
    [InlineData("\"coin-web\"")]
    [InlineData("\"coin-api\"")]
    [InlineData("admin@test.local")]
    public void Im_Backend_Code_steht_kein_Oidc_Wert_fest(string wert)
    {
        var treffer = Directory.EnumerateFiles(Path.Combine(Wurzel, "src"), "*.cs", SearchOption.AllDirectories)
            .Where(d => !d.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}") && !d.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"))
            .Where(d => File.ReadAllText(d).Contains(wert, StringComparison.OrdinalIgnoreCase))
            .Select(d => Path.GetRelativePath(Wurzel, d))
            .ToList();

        Assert.Empty(treffer);
    }

    [Fact]
    public void Im_Backend_Code_werden_ShowPII_und_EnableSensitiveDataLogging_nicht_aktiviert()
    {
        var treffer = Directory.EnumerateFiles(Path.Combine(Wurzel, "src"), "*.cs", SearchOption.AllDirectories)
            .Where(d => !d.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}"))
            .Where(d =>
            {
                var text = File.ReadAllText(d);
                return text.Contains("ShowPII", StringComparison.Ordinal)
                    || text.Contains("EnableSensitiveDataLogging", StringComparison.Ordinal)
                    || text.Contains("LogCompleteSecurityArtifact", StringComparison.Ordinal);
            })
            .Select(d => Path.GetRelativePath(Wurzel, d))
            .ToList();

        Assert.Empty(treffer);
    }
}
