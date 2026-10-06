using System.Text.RegularExpressions;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Coin.IntegrationTests.Berechtigungen;

/// <summary>
/// Feature rollen-benutzerverwaltung, AK-2 bis AK-4 und AK-21: Endpunkttabelle in <c>docs/berechtigungen.md</c>
/// (zwischen <c>&lt;!-- endpunkte:start --&gt;</c> und <c>&lt;!-- endpunkte:ende --&gt;</c>) gegen
/// <see cref="EndpointDataSource"/>, Policies je Berechtigung, Default- und Fallback-Policy.
/// Tabellenform laut Entwurf 5.2: Spalte 1 Endpunkte in Backticks (kommagetrennt), Spalte 2 „öffentlich“,
/// „angemeldet“ oder genau eine Berechtigung in Backticks.
/// </summary>
public partial class EndpunktTabelleTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const string DokuPfad = "docs/berechtigungen.md";
    private const string StartMarker = "<!-- endpunkte:start -->";
    private const string EndeMarker = "<!-- endpunkte:ende -->";
    private const string Oeffentlich = "öffentlich";
    private const string Angemeldet = "angemeldet";

    /// <summary>Die Berechtigungen laut AK-1 (bewusst als Literale, unabhängig vom Produktivcode).</summary>
    private static readonly string[] AlleBerechtigungen = ["audit.read", "coins.read", "coins.write", "users.manage"];

    /// <summary>Name des Requirements laut Entwurf 5.5 (per Reflexion geprüft, um nicht vom Typ abzuhängen).</summary>
    private const string AnforderungTyp = "BerechtigungAnforderung";

    [GeneratedRegex(@"\{(\w+)(:[^}]*)?\}")]
    private static partial Regex RoutenParameter();

    [GeneratedRegex("`([^`]+)`")]
    private static partial Regex InBackticks();

    private static string RepoWurzel()
    {
        var verzeichnis = new DirectoryInfo(AppContext.BaseDirectory);
        while (verzeichnis is not null && !File.Exists(Path.Combine(verzeichnis.FullName, "CLAUDE.md")))
        {
            verzeichnis = verzeichnis.Parent;
        }

        return verzeichnis?.FullName ?? throw new InvalidOperationException("Repository-Wurzel nicht gefunden.");
    }

    private IReadOnlyList<(string Name, RouteEndpoint Endpunkt)> Endpunkte() =>
        Fixture.Factory.Services.GetServices<EndpointDataSource>()
            .SelectMany(q => q.Endpoints)
            .OfType<RouteEndpoint>()
            .SelectMany(e =>
            {
                var methoden = e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["*"];
                var muster = "/" + RoutenParameter().Replace(e.RoutePattern.RawText ?? string.Empty, "{$1}").TrimStart('/');
                return methoden.Select(m => ($"{m} {muster}", e));
            })
            .ToList();

    /// <summary>Zugriff laut Metadaten: öffentlich, genau eine Berechtigungs-Policy oder angemeldet.</summary>
    private static string ZugriffLautCode(RouteEndpoint endpunkt)
    {
        if (endpunkt.Metadata.GetMetadata<IAllowAnonymous>() is not null)
        {
            return Oeffentlich;
        }

        var policies = endpunkt.Metadata.GetOrderedMetadata<IAuthorizeData>()
            .Select(a => a.Policy)
            .OfType<string>()
            .Distinct(StringComparer.Ordinal)
            .ToList();
        return policies.Count switch
        {
            0 => Angemeldet,
            1 => policies[0],
            _ => $"mehrere: {string.Join(", ", policies.Order(StringComparer.Ordinal))}",
        };
    }

    /// <summary>Endpunkt → Zugriff laut Doku; jede Nennung einzeln (für die Prüfung „genau einmal“).</summary>
    private static List<(string Endpunkt, string Zugriff)> TabelleLautDoku()
    {
        var pfad = Path.Combine(RepoWurzel(), DokuPfad);
        Assert.True(File.Exists(pfad), $"{DokuPfad} fehlt (AK-2).");
        var text = File.ReadAllText(pfad);
        var start = text.IndexOf(StartMarker, StringComparison.Ordinal);
        var ende = text.IndexOf(EndeMarker, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Marker {StartMarker} fehlt.");
        Assert.True(ende > start, $"Marker {EndeMarker} fehlt oder steht vor dem Start-Marker.");

        var zeilen = text[(start + StartMarker.Length)..ende]
            .Split('\n')
            .Select(z => z.Trim())
            .Where(z => z.StartsWith('|'))
            .Select(z => z.Trim('|').Split('|').Select(c => c.Trim()).ToArray())
            .Where(zellen => !zellen.All(c => c.Length > 0 && c.All(ch => ch is '-' or ':' or ' ')))
            .Skip(1) // Kopfzeile
            .ToList();

        var ergebnis = new List<(string, string)>();
        foreach (var zellen in zeilen)
        {
            Assert.Equal(2, zellen.Length);
            var zugriffe = InBackticks().Matches(zellen[1]).Select(m => m.Groups[1].Value).ToList();
            var zugriff = zugriffe.Count switch
            {
                0 => zellen[1],
                1 => zugriffe[0],
                _ => $"mehrere: {string.Join(", ", zugriffe.Order(StringComparer.Ordinal))}",
            };
            foreach (Match treffer in InBackticks().Matches(zellen[0]))
            {
                ergebnis.Add((treffer.Groups[1].Value, zugriff));
            }
        }

        return ergebnis;
    }

    // ---------- AK-2: Doku ↔ EndpointDataSource ----------

    [Fact]
    public void Jeder_Endpunkt_steht_genau_einmal_in_der_Endpunkttabelle()
    {
        var doku = TabelleLautDoku().Select(e => e.Endpunkt).ToList();
        var code = Endpunkte().Select(e => e.Name).Distinct().Order(StringComparer.Ordinal).ToList();

        Assert.Equal(code, doku.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void Die_Endpunkttabelle_nennt_keinen_Endpunkt_doppelt()
    {
        var doku = TabelleLautDoku().Select(e => e.Endpunkt).ToList();

        Assert.Equal(doku.Count, doku.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void Der_Zugriff_laut_Endpunkttabelle_stimmt_mit_dem_Code_ueberein()
    {
        var doku = TabelleLautDoku()
            .Select(e => $"{e.Endpunkt} -> {e.Zugriff}")
            .Order(StringComparer.Ordinal);
        var code = Endpunkte()
            .Select(e => $"{e.Name} -> {ZugriffLautCode(e.Endpunkt)}")
            .Distinct()
            .Order(StringComparer.Ordinal);

        Assert.Equal(code, doku);
    }

    [Fact]
    public void Die_Endpunkttabelle_verwendet_nur_oeffentlich_angemeldet_oder_genau_eine_Berechtigung()
    {
        var erlaubt = AlleBerechtigungen.Append(Oeffentlich).Append(Angemeldet).ToHashSet(StringComparer.Ordinal);

        Assert.All(TabelleLautDoku(), e => Assert.Contains(e.Zugriff, erlaubt));
    }

    [Fact]
    public void Jeder_Endpunkt_ist_im_Code_oeffentlich_angemeldet_oder_verlangt_genau_eine_Berechtigung()
    {
        var erlaubt = AlleBerechtigungen.Append(Oeffentlich).Append(Angemeldet).ToHashSet(StringComparer.Ordinal);

        Assert.All(Endpunkte(), e => Assert.Contains(ZugriffLautCode(e.Endpunkt), erlaubt));
    }

    // ---------- AK-3: Policies je Berechtigung ----------

    private static AuthorizationOptions Optionen(CoinApiFactory factory) =>
        factory.Services.GetRequiredService<IOptions<AuthorizationOptions>>().Value;

    /// <summary>Wert der Eigenschaft <c>Berechtigung</c> aller <c>BerechtigungAnforderung</c>-Requirements.</summary>
    private static List<string?> BerechtigungenIn(AuthorizationPolicy policy) =>
        policy.Requirements
            .Where(r => r.GetType().Name == AnforderungTyp)
            .Select(r => (string?)r.GetType().GetProperty("Berechtigung")?.GetValue(r))
            .ToList();

    [Theory]
    [InlineData("coins.read")]
    [InlineData("coins.write")]
    [InlineData("users.manage")]
    [InlineData("audit.read")]
    public void Fuer_jede_Berechtigung_gibt_es_eine_Policy_gleichen_Namens(string berechtigung)
    {
        Assert.NotNull(Optionen(Fixture.Factory).GetPolicy(berechtigung));
    }

    [Theory]
    [InlineData("coins.read")]
    [InlineData("coins.write")]
    [InlineData("users.manage")]
    [InlineData("audit.read")]
    public void Die_Policy_verlangt_Anmeldung_und_genau_ihre_Berechtigung(string berechtigung)
    {
        var policy = Optionen(Fixture.Factory).GetPolicy(berechtigung);

        Assert.NotNull(policy);
        Assert.Contains(policy!.Requirements, r => r is DenyAnonymousAuthorizationRequirement);
        Assert.Equal([berechtigung], BerechtigungenIn(policy));
    }

    [Fact]
    public void Die_Policy_KatalogSchreiben_gibt_es_nicht_mehr()
    {
        Assert.Null(Optionen(Fixture.Factory).GetPolicy("KatalogSchreiben"));
    }

    [Theory]
    [InlineData("POST /api/coins")]
    [InlineData("PUT /api/coins/{id}/bild")]
    public void Schreibende_Katalog_Endpunkte_verlangen_coins_write(string name)
    {
        var endpunkt = Assert.Single(Endpunkte(), e => e.Name == name).Endpunkt;

        Assert.Equal("coins.write", ZugriffLautCode(endpunkt));
    }

    [Theory]
    [InlineData("GET /api/benutzer", "users.manage")]
    [InlineData("PUT /api/benutzer/{id}/rolle", "users.manage")]
    [InlineData("PUT /api/benutzer/{id}/status", "users.manage")]
    [InlineData("GET /api/audit", "audit.read")]
    [InlineData("GET /api/me", Angemeldet)]
    public void Neue_Endpunkte_verlangen_die_Berechtigung_laut_Entwurf(string name, string zugriff)
    {
        var endpunkt = Assert.Single(Endpunkte(), e => e.Name == name).Endpunkt;

        Assert.Equal(zugriff, ZugriffLautCode(endpunkt));
    }

    [Fact]
    public void Kein_Endpunkt_verwendet_Roles()
    {
        var mitRollen = Endpunkte()
            .Where(e => e.Endpunkt.Metadata.GetOrderedMetadata<IAuthorizeData>().Any(a => !string.IsNullOrEmpty(a.Roles)))
            .Select(e => e.Name)
            .ToList();

        Assert.Empty(mitRollen);
    }

    [Theory]
    [InlineData("KatalogSchreiben")]
    [InlineData("DuerfenKatalogSchreiben")]
    [InlineData("Roles =")]
    [InlineData("Roles=")]
    [InlineData("RequireRole(")]
    public void Im_Backend_Code_kommt_die_alte_Rollenpruefung_nicht_mehr_vor(string text)
    {
        var treffer = Directory.EnumerateFiles(Path.Combine(RepoWurzel(), "src"), "*.cs", SearchOption.AllDirectories)
            .Where(d => !d.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}")
                && !d.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}")
                && !d.Contains($"{Path.DirectorySeparatorChar}Migrationen{Path.DirectorySeparatorChar}"))
            .Where(d => File.ReadAllText(d).Contains(text, StringComparison.Ordinal))
            .Select(d => Path.GetRelativePath(RepoWurzel(), d))
            .ToList();

        Assert.Empty(treffer);
    }

    // ---------- AK-4: Default- und Fallback-Policy ----------

    [Fact]
    public void Die_FallbackPolicy_verlangt_angemeldet_und_aktiv()
    {
        var fallback = Optionen(Fixture.Factory).FallbackPolicy;

        Assert.NotNull(fallback);
        Assert.Contains(fallback!.Requirements, r => r is DenyAnonymousAuthorizationRequirement);
        Assert.Equal([null], BerechtigungenIn(fallback));
    }

    [Fact]
    public void Die_DefaultPolicy_verlangt_angemeldet_und_aktiv()
    {
        var standard = Optionen(Fixture.Factory).DefaultPolicy;

        Assert.Contains(standard.Requirements, r => r is DenyAnonymousAuthorizationRequirement);
        Assert.Equal([null], BerechtigungenIn(standard));
    }

    // ---------- AK-21: keine schreibenden Audit-Pfade ----------

    [Fact]
    public void Es_gibt_keinen_schreibenden_Endpunkt_auf_Audit_Daten()
    {
        var schreibend = Endpunkte()
            .Where(e => e.Name.Contains("audit", StringComparison.OrdinalIgnoreCase))
            .Where(e => !e.Name.StartsWith("GET ", StringComparison.Ordinal))
            .Select(e => e.Name)
            .ToList();

        Assert.Empty(schreibend);
    }

    [Fact]
    public void Es_gibt_genau_einen_Audit_Endpunkt_GET_api_audit()
    {
        var audit = Endpunkte()
            .Where(e => e.Name.Contains("audit", StringComparison.OrdinalIgnoreCase))
            .Select(e => e.Name)
            .Distinct()
            .ToList();

        Assert.Equal(["GET /api/audit"], audit);
    }
}
