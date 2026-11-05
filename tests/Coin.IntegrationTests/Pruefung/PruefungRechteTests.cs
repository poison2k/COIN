using System.Net;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Pruefung;

/// <summary>
/// Feature hologrammnummer, AK-17 (ADR-0034 Punkt 1 und 7, H6): Rechte je Rolle für beide Prüf-Endpunkte als Theory.
/// <c>POST /api/pruefung</c> (<c>coins.read</c>) liefert für jede Rolle keine Felder für Empfängerdaten und keinen der
/// Testwerte; <c>POST /api/pruefung/mit-empfaenger</c> (<c>issues.read</c>) liefert Empfänger, Gelegenheit, Begründung
/// und ausgebende Stelle, aber nie den Storno-Grund. „deaktiviert“ = Rolle Administrator mit aktiv=false.
/// </summary>
public class PruefungRechteTests(PostgresFixture fixture) : PruefungTestBasis(fixture)
{
    private const string DetailCoinsRead = "Ihr Benutzerkonto ist nicht berechtigt, die Exemplare einzusehen.";
    private const string DetailIssuesRead = "Ihr Benutzerkonto ist nicht berechtigt, Ausgaben einzusehen.";

    private async Task<HttpClient> ClientAsync(string rolle) => rolle switch
    {
        "anonym" => Anonym,
        "keine" => await ClientMitRolleAsync(null),
        "deaktiviert" => await ClientMitRolleAsync("Administrator", aktiv: false),
        _ => (await PrueferAsync(rolle)).Client,
    };

    public static TheoryData<bool, string, int> Matrix => new()
    {
        { false, "anonym", 401 },
        { false, "keine", 403 },
        { false, "deaktiviert", 403 },
        { false, "Betrachter", 200 },
        { false, "Sachbearbeiter", 200 },
        { false, "Administrator", 200 },
        { true, "anonym", 401 },
        { true, "keine", 403 },
        { true, "deaktiviert", 403 },
        { true, "Betrachter", 403 },
        { true, "Sachbearbeiter", 200 },
        { true, "Administrator", 200 },
    };

    [Theory]
    [MemberData(nameof(Matrix))]
    public async Task Status_je_Rolle_und_Endpunkt(bool mitEmpfaenger, string rolle, int erwartet)
    {
        await SzenarioAsync();
        var client = await ClientAsync(rolle);

        using var antwort = await PostPruefungAsync(client, "AB1234", mitEmpfaenger: mitEmpfaenger);

        Assert.Equal($"{rolle} -> {erwartet}", $"{rolle} -> {(int)antwort.StatusCode}");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Deaktivierte_erhalten_403_benutzer_deaktiviert(bool mitEmpfaenger)
    {
        var client = await ClientAsync("deaktiviert");

        using var antwort = await PostPruefungAsync(client, "AB1234", mitEmpfaenger: mitEmpfaenger);

        await AssertKeinZugriffAsync(antwort, "benutzer_deaktiviert");
    }

    [Fact]
    public async Task Ohne_Rolle_erhaelt_auf_api_pruefung_den_Text_fuer_coins_read()
    {
        var client = await ClientAsync("keine");

        using var antwort = await PostPruefungAsync(client, "AB1234");

        var json = await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
        Assert.Equal(DetailCoinsRead, json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Betrachter_erhaelt_auf_mit_empfaenger_den_Text_fuer_issues_read()
    {
        var client = await ClientAsync("Betrachter");

        using var antwort = await PostPruefungAsync(client, "AB1234", mitEmpfaenger: true);

        var json = await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
        Assert.Equal(DetailIssuesRead, json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Betrachter_erhaelt_auch_bei_ungueltiger_Nummer_auf_mit_empfaenger_403()
    {
        var client = await ClientAsync("Betrachter");

        using var antwort = await PostPruefungAsync(client, "AB/1", mitEmpfaenger: true);

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    // ---------- Keine Empfängerdaten auf /api/pruefung, für jede Rolle ----------

    public static TheoryData<string, string> RolleUndNummer => new()
    {
        { "Betrachter", "AB1234" },
        { "Betrachter", "CD5678" },
        { "Sachbearbeiter", "AB1234" },
        { "Sachbearbeiter", "CD5678" },
        { "Administrator", "AB1234" },
        { "Administrator", "CD5678" },
    };

    [Theory]
    [MemberData(nameof(RolleUndNummer))]
    public async Task Antwort_ohne_Empfaenger_enthaelt_keine_verbotenen_Schluessel(string rolle, string nummer)
    {
        await SzenarioAsync();
        var client = await ClientAsync(rolle);

        var json = await PruefeAsync(client, nummer);

        Assert.Empty(AlleSchluessel(json).Intersect(VerboteneSchluesselOhneEmpfaenger, StringComparer.OrdinalIgnoreCase));
    }

    [Theory]
    [MemberData(nameof(RolleUndNummer))]
    public async Task Antwort_ohne_Empfaenger_enthaelt_keinen_Testwert(string rolle, string nummer)
    {
        await SzenarioAsync();
        var client = await ClientAsync(rolle);

        using var antwort = await PostPruefungAsync(client, nummer);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.All(Testwerte, w => Assert.DoesNotContain(w, text, StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [MemberData(nameof(RolleUndNummer))]
    public async Task Antwort_ohne_Empfaenger_enthaelt_keine_Ausgabe_Id(string rolle, string nummer)
    {
        var s = await SzenarioAsync();
        var client = await ClientAsync(rolle);

        using var antwort = await PostPruefungAsync(client, nummer);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.DoesNotContain(s.AktivId.ToString(), text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(s.StorniertId.ToString(), text, StringComparison.OrdinalIgnoreCase);
    }

    // ---------- Empfängerdaten auf …/mit-empfaenger ----------

    [Theory]
    [InlineData("Sachbearbeiter")]
    [InlineData("Administrator")]
    public async Task Antwort_mit_Empfaenger_enthaelt_Empfaenger_Gelegenheit_Begruendung_und_Stelle(string rolle)
    {
        await SzenarioAsync();
        var client = await ClientAsync(rolle);

        using var antwort = await PostPruefungAsync(client, "AB1234", mitEmpfaenger: true);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.All([Name, Dienstgrad, Dienststelle, Gelegenheit, Begruendung, Stelle], w => Assert.Contains(w, text, StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("Sachbearbeiter")]
    [InlineData("Administrator")]
    public async Task Antwort_mit_Empfaenger_enthaelt_bei_Storno_keinen_Storno_Grund(string rolle)
    {
        await SzenarioAsync();
        var client = await ClientAsync(rolle);

        using var antwort = await PostPruefungAsync(client, "CD5678", mitEmpfaenger: true);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.DoesNotContain(StornoGrund, text, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("AB1234")]
    [InlineData("CD5678")]
    public async Task Antwort_mit_Empfaenger_enthaelt_keine_verbotenen_Schluessel(string nummer)
    {
        await SzenarioAsync();
        var client = await ClientAsync("Sachbearbeiter");

        var json = await PruefeAsync(client, nummer, mitEmpfaenger: true);

        Assert.Empty(AlleSchluessel(json).Intersect(VerboteneSchluesselMitEmpfaenger, StringComparer.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Antwort_mit_Empfaenger_nennt_den_Erfasser_nicht()
    {
        await SzenarioAsync();
        var admin = await AdminIdAsync();
        var client = await ClientAsync("Sachbearbeiter");

        using var antwort = await PostPruefungAsync(client, "AB1234", mitEmpfaenger: true);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.DoesNotContain(admin.ToString(), text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Testbenutzer.AdminName, text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Betrachter_erhaelt_bei_falscherCoin_dieselbe_Form_wie_bei_nichtGefunden()
    {
        var s = await SzenarioAsync();
        var client = await ClientAsync("Betrachter");

        var falsch = await PruefeAsync(client, "AB1234", s.CoinB);
        var unbekannt = await PruefeAsync(client, "ZZ9999", s.CoinB);

        Assert.Equal((JsonValueKind.Null, JsonValueKind.Null), (falsch.GetProperty("datensatz").ValueKind, unbekannt.GetProperty("datensatz").ValueKind));
        Assert.Equal(Feldnamen(unbekannt), Feldnamen(falsch));
    }
}
