using System.Net;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Audit;

/// <summary>
/// Feature nacharbeiten-audit-filter, AK-7 und AK-8 (Abschnitt 4.2, ADR-0045 Punkt 3): <c>GET /api/audit/aktionen</c>
/// liefert die Aktionstypen aus dem Enum als <c>[{ wert, bezeichnung }]</c>, nur mit <c>audit.read</c>, ohne Cache.
/// </summary>
public class AuditAktionenTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const string AktionenUrl = "/api/audit/aktionen";

    [Fact]
    public async Task Administrator_erhaelt_200_als_JSON()
    {
        using var antwort = await Client.GetAsync(AktionenUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("application/json", antwort.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Antwort_ist_genau_Rolle_und_Status_in_Enum_Reihenfolge()
    {
        using var antwort = await Client.GetAsync(AktionenUrl);
        var text = await antwort.Content.ReadAsStringAsync();

        using var erwartet = JsonDocument.Parse("""[{"wert":"Rolle","bezeichnung":"Rolle"},{"wert":"Status","bezeichnung":"Status"}]""");
        using var ist = JsonDocument.Parse(text);
        Assert.True(JsonElement.DeepEquals(erwartet.RootElement, ist.RootElement), text);
    }

    [Fact]
    public async Task Jeder_Eintrag_hat_genau_die_Felder_wert_und_bezeichnung()
    {
        using var antwort = await Client.GetAsync(AktionenUrl);
        var json = await JsonAsync(antwort);

        Assert.All(json.EnumerateArray(), e =>
            Assert.Equal(["bezeichnung", "wert"], e.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal)));
    }

    [Fact]
    public async Task Antwort_hat_Cache_Control_no_store()
    {
        using var antwort = await Client.GetAsync(AktionenUrl);

        Assert.True(antwort.Headers.CacheControl?.NoStore, $"Cache-Control: {antwort.Headers.CacheControl}");
    }

    [Fact]
    public async Task Die_Werte_sind_als_Filter_fuer_GET_api_audit_gueltig()
    {
        using var aktionen = await Client.GetAsync(AktionenUrl);
        var werte = (await JsonAsync(aktionen)).EnumerateArray().Select(e => e.GetProperty("wert").GetString()!).ToArray();

        using var antwort = await Client.GetAsync($"{AuditUrl}?{string.Join("&", werte.Select(w => $"aktion={w}"))}");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Theory]
    [InlineData("Betrachter")]
    [InlineData("Sachbearbeiter")]
    [InlineData(null)]
    public async Task Ohne_audit_read_gibt_es_403_keine_berechtigung(string? rolle)
    {
        var client = await ClientMitRolleAsync(rolle);

        using var antwort = await client.GetAsync(AktionenUrl);

        var json = await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
        Assert.Equal("Ihr Benutzerkonto ist nicht berechtigt, das Änderungsprotokoll einzusehen.", json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Deaktivierter_Administrator_erhaelt_403_benutzer_deaktiviert()
    {
        var client = await ClientMitRolleAsync("Administrator", aktiv: false);

        using var antwort = await client.GetAsync(AktionenUrl);

        await AssertKeinZugriffAsync(antwort, "benutzer_deaktiviert");
    }

    [Fact]
    public async Task Anonym_erhaelt_401()
    {
        using var antwort = await Anonym.GetAsync(AktionenUrl);

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Abruf_der_Aktionen_schreibt_keinen_Audit_Eintrag()
    {
        await AdminIdAsync();
        var vorher = await AuditDb.AlleAsync();

        using (await Client.GetAsync(AktionenUrl))
        {
        }

        Assert.Equal(vorher, await AuditDb.AlleAsync());
    }
}
