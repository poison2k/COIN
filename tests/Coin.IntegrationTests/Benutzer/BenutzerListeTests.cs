using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Benutzer;

/// <summary>
/// Feature rollen-benutzerverwaltung, AK-11: <c>GET /api/benutzer?suche=&amp;seite=1&amp;groesse=25</c> (nur users.manage).
/// Suche ohne Beachtung der Groß-/Kleinschreibung, <c>%</c>, <c>_</c> und <c>\</c> wörtlich; Sortierung Anzeigename
/// (case-insensitiv), dann id; Paging 1–100; no-store; keine issuer/subject.
/// </summary>
public class BenutzerListeTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private static readonly Regex Englisch = new(@"\b(The|is|must|field|value|valid|required|between|range|invalid)\b", RegexOptions.IgnoreCase);

    private async Task<JsonElement> ListeAsync(string query = "")
    {
        using var antwort = await Client.GetAsync($"{BenutzerUrl}{query}");
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        return await JsonAsync(antwort);
    }

    private static string[] Namen(JsonElement seite) =>
        seite.GetProperty("eintraege").EnumerateArray().Select(e => e.GetProperty("name").GetString()!).ToArray();

    private static string Url(string suche) => $"?suche={Uri.EscapeDataString(suche)}";

    // ---------- Antwortform ----------

    [Fact]
    public async Task Liste_liefert_200_als_JSON()
    {
        using var antwort = await Client.GetAsync(BenutzerUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("application/json", antwort.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Liste_sendet_Cache_Control_no_store()
    {
        using var antwort = await Client.GetAsync(BenutzerUrl);

        Assert.True(antwort.Headers.CacheControl?.NoStore, $"Cache-Control: {antwort.Headers.CacheControl}");
    }

    [Fact]
    public async Task Liste_hat_genau_die_Felder_eintraege_gesamt_seite_groesse()
    {
        var json = await ListeAsync();

        Assert.Equal(["eintraege", "gesamt", "groesse", "seite"], json.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Eintrag_hat_genau_die_Felder_id_name_email_rolle_aktiv_erstelltAm()
    {
        var json = await ListeAsync();

        var eintrag = json.GetProperty("eintraege")[0];
        Assert.Equal(
            ["aktiv", "email", "erstelltAm", "id", "name", "rolle"],
            eintrag.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Eintrag_enthaelt_die_Werte_des_Benutzers()
    {
        var konto = await KontoAsync("Betrachter", name: "Test Listenperson", email: "liste@coin-test.invalid");

        var eintrag = (await ListeAsync(Url("Listenperson"))).GetProperty("eintraege")[0];

        Assert.Equal(konto.Id, eintrag.GetProperty("id").GetGuid());
        Assert.Equal("Test Listenperson", eintrag.GetProperty("name").GetString());
        Assert.Equal("liste@coin-test.invalid", eintrag.GetProperty("email").GetString());
        Assert.Equal("Betrachter", eintrag.GetProperty("rolle").GetString());
        Assert.True(eintrag.GetProperty("aktiv").GetBoolean());
        Assert.Equal((await BenutzerDb.EinzigerAsync(konto.Subject)).ErstelltAm, eintrag.GetProperty("erstelltAm").GetDateTimeOffset());
    }

    [Fact]
    public async Task Benutzer_ohne_Rolle_hat_rolle_keine()
    {
        await KontoAsync(null, name: "Test Rollenlos");

        var eintrag = (await ListeAsync(Url("Rollenlos"))).GetProperty("eintraege")[0];

        Assert.Equal("keine", eintrag.GetProperty("rolle").GetString());
    }

    [Fact]
    public async Task Deaktivierter_Benutzer_hat_aktiv_false()
    {
        await KontoAsync("Sachbearbeiter", aktiv: false, name: "Test Deaktiviert Liste");

        var eintrag = (await ListeAsync(Url("Deaktiviert Liste"))).GetProperty("eintraege")[0];

        Assert.False(eintrag.GetProperty("aktiv").GetBoolean());
    }

    [Fact]
    public async Task Liste_enthaelt_weder_issuer_noch_subject()
    {
        var konto = await KontoAsync("Betrachter");

        using var antwort = await Client.GetAsync(BenutzerUrl);
        var body = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.DoesNotContain(konto.Subject, body);
        Assert.DoesNotContain(Testbenutzer.AdminSubject, body);
        Assert.DoesNotContain(TestIdentitaetsanbieter.StandardAuthority, body);
        Assert.DoesNotContain("\"issuer\"", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"subject\"", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Ohne_Parameter_gelten_seite_1_und_groesse_25()
    {
        var json = await ListeAsync();

        Assert.Equal(1, json.GetProperty("seite").GetInt32());
        Assert.Equal(25, json.GetProperty("groesse").GetInt32());
    }

    // ---------- Suche ----------

    [Fact]
    public async Task Leere_Suche_liefert_alle_Benutzer()
    {
        await KontoAsync(null);
        await KontoAsync("Betrachter");

        var json = await ListeAsync("?suche=");

        Assert.Equal(3, json.GetProperty("gesamt").GetInt32());
    }

    [Fact]
    public async Task Suche_aus_Leerzeichen_liefert_alle_Benutzer()
    {
        await KontoAsync(null);

        var json = await ListeAsync(Url("   "));

        Assert.Equal(2, json.GetProperty("gesamt").GetInt32());
    }

    [Fact]
    public async Task Suche_findet_Teilstrings_im_Anzeigenamen_ohne_Beachtung_der_Gross_Kleinschreibung()
    {
        await KontoAsync(null, name: "Test Bernhardine");
        await KontoAsync(null, name: "Test Anderer");

        Assert.Equal(["Test Bernhardine"], Namen(await ListeAsync(Url("BERNHARD"))));
    }

    [Fact]
    public async Task Suche_findet_Teilstrings_in_der_Email_ohne_Beachtung_der_Gross_Kleinschreibung()
    {
        await KontoAsync(null, name: "Test Mailtreffer", email: "mailtreffer.xyz@coin-test.invalid");
        await KontoAsync(null, name: "Test Anderer");

        Assert.Equal(["Test Mailtreffer"], Namen(await ListeAsync(Url("TREFFER.XYZ@"))));
    }

    [Fact]
    public async Task Suche_wird_getrimmt()
    {
        await KontoAsync(null, name: "Test Getrimmt");

        Assert.Equal(["Test Getrimmt"], Namen(await ListeAsync(Url("  Getrimmt  "))));
    }

    [Fact]
    public async Task Suche_ohne_Treffer_liefert_eine_leere_Liste_mit_gesamt_0()
    {
        var json = await ListeAsync(Url("gibt-es-nicht"));

        Assert.Empty(Namen(json));
        Assert.Equal(0, json.GetProperty("gesamt").GetInt32());
    }

    [Fact]
    public async Task Prozentzeichen_in_der_Suche_gilt_woertlich()
    {
        await KontoAsync(null, name: "Test Rabatt 100% Voll");
        await KontoAsync(null, name: "Test Rabatt 1000 Voll");

        Assert.Equal(["Test Rabatt 100% Voll"], Namen(await ListeAsync(Url("100%"))));
    }

    [Fact]
    public async Task Prozentzeichen_allein_findet_nicht_alle_Benutzer()
    {
        await KontoAsync(null, name: "Test Ohne Sonderzeichen");

        Assert.Empty(Namen(await ListeAsync(Url("%"))));
    }

    [Fact]
    public async Task Unterstrich_in_der_Suche_gilt_woertlich()
    {
        await KontoAsync(null, name: "Test a_b");
        await KontoAsync(null, name: "Test axb");

        Assert.Equal(["Test a_b"], Namen(await ListeAsync(Url("a_b"))));
    }

    [Fact]
    public async Task Backslash_in_der_Suche_gilt_woertlich()
    {
        await KontoAsync(null, name: @"Test Pfad\Name");
        await KontoAsync(null, name: "Test PfadName");

        Assert.Equal([@"Test Pfad\Name"], Namen(await ListeAsync(Url(@"d\N"))));
    }

    [Fact]
    public async Task Backslash_vor_Prozent_gilt_woertlich()
    {
        await KontoAsync(null, name: @"Test x\%y");
        await KontoAsync(null, name: "Test x%y");

        Assert.Equal([@"Test x\%y"], Namen(await ListeAsync(Url(@"\%"))));
    }

    [Fact]
    public async Task Suche_mit_SQL_Sonderzeichen_liefert_200_ohne_Fehler()
    {
        using var antwort = await Client.GetAsync($"{BenutzerUrl}{Url("'; DROP TABLE benutzer; --")}");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.True(await BenutzerDb.AnzahlAsync() >= 1);
    }

    // ---------- Sortierung ----------

    [Fact]
    public async Task Sortierung_nach_Anzeigename_ohne_Beachtung_der_Gross_Kleinschreibung()
    {
        await KontoAsync(null, name: "sort beta");
        await KontoAsync(null, name: "Sort Alpha");
        await KontoAsync(null, name: "SORT gamma");

        Assert.Equal(["Sort Alpha", "sort beta", "SORT gamma"], Namen(await ListeAsync(Url("sort "))));
    }

    [Fact]
    public async Task Bei_gleichem_Namen_wird_nach_id_sortiert()
    {
        var erster = await KontoAsync(null, name: "Sort Gleich");
        var zweiter = await KontoAsync(null, name: "Sort Gleich");

        var ids = (await ListeAsync(Url("Sort Gleich"))).GetProperty("eintraege").EnumerateArray()
            .Select(e => e.GetProperty("id").GetGuid()).ToArray();

        Assert.Equal(new[] { erster.Id, zweiter.Id }.Order(), ids);
    }

    // ---------- Paging ----------

    [Fact]
    public async Task Seite_2_mit_Groesse_2_liefert_den_dritten_und_vierten_Eintrag()
    {
        foreach (var name in new[] { "Seite A", "Seite B", "Seite C", "Seite D", "Seite E" })
        {
            await KontoAsync(null, name: name);
        }

        var json = await ListeAsync($"{Url("Seite ")}&seite=2&groesse=2");

        Assert.Equal(["Seite C", "Seite D"], Namen(json));
        Assert.Equal(5, json.GetProperty("gesamt").GetInt32());
        Assert.Equal(2, json.GetProperty("seite").GetInt32());
        Assert.Equal(2, json.GetProperty("groesse").GetInt32());
    }

    [Fact]
    public async Task Seite_hinter_dem_Ende_liefert_eine_leere_Liste_mit_gesamt()
    {
        await KontoAsync(null, name: "Seite Einzig");

        var json = await ListeAsync($"{Url("Seite Einzig")}&seite=9&groesse=25");

        Assert.Empty(Namen(json));
        Assert.Equal(1, json.GetProperty("gesamt").GetInt32());
    }

    [Theory]
    [InlineData("?groesse=1")]
    [InlineData("?groesse=100")]
    [InlineData("?seite=1")]
    public async Task Grenzwerte_im_gueltigen_Bereich_liefern_200(string query)
    {
        using var antwort = await Client.GetAsync($"{BenutzerUrl}{query}");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Suche_mit_genau_100_Zeichen_liefert_200()
    {
        using var antwort = await Client.GetAsync($"{BenutzerUrl}{Url(new string('x', 100))}");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Theory]
    [InlineData("?seite=0", "seite")]
    [InlineData("?seite=-1", "seite")]
    [InlineData("?groesse=0", "groesse")]
    [InlineData("?groesse=101", "groesse")]
    public async Task Ungueltiges_Paging_liefert_400_mit_Fehler_am_Feld(string query, string feld)
    {
        using var antwort = await Client.GetAsync($"{BenutzerUrl}{query}");

        Assert.Contains(feld, await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task Suche_mit_101_Zeichen_liefert_400_mit_Fehler_an_suche()
    {
        using var antwort = await Client.GetAsync($"{BenutzerUrl}{Url(new string('x', 101))}");

        Assert.Contains("suche", await AssertValidierungsfehlerAsync(antwort));
    }

    [Theory]
    [InlineData("?seite=0")]
    [InlineData("?groesse=101")]
    [InlineData("SUCHE_101")]
    public async Task Validierungsmeldungen_sind_deutsch(string query)
    {
        var url = query == "SUCHE_101" ? Url(new string('x', 101)) : query;
        using var antwort = await Client.GetAsync($"{BenutzerUrl}{url}");
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);

        var meldungen = json.GetProperty("errors").EnumerateObject()
            .SelectMany(p => p.Value.EnumerateArray().Select(m => m.GetString() ?? string.Empty))
            .ToList();
        Assert.NotEmpty(meldungen);
        Assert.All(meldungen, m => Assert.DoesNotMatch(Englisch, m));
    }
}
