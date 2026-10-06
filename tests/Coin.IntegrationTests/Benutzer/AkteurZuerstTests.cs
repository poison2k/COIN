using Coin.Domain.Benutzer;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.Extensions.DependencyInjection;

namespace Coin.IntegrationTests.Benutzer;

/// <summary>
/// Feature rollen-benutzerverwaltung, AK-40 und ADR-0018 (geändert 2026-10-06): Die Akteur-Prüfung kommt vor
/// <c>NichtGefunden</c> und <c>Unveraendert</c>. Geprüft auf Service-Ebene mit echtem Repository gegen PostgreSQL,
/// weil die Policy einen Akteur ohne <c>users.manage</c> über HTTP schon vorher abweist. Es wird nichts geschrieben,
/// es entsteht kein Audit-Eintrag.
/// </summary>
public class AkteurZuerstTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    /// <summary>Akteure ohne <c>users.manage</c>: Betrachter und deaktivierter Administrator.</summary>
    public static TheoryData<string, bool> UnberechtigteAkteure => new()
    {
        { "Betrachter", true },
        { "Administrator", false },
    };

    private async Task<AenderungErgebnis> MitServiceAsync(Func<BenutzerverwaltungService, Task<AenderungErgebnis>> aktion)
    {
        using var scope = Fixture.Factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<BenutzerverwaltungService>();
        return await aktion(service);
    }

    [Theory]
    [MemberData(nameof(UnberechtigteAkteure))]
    public async Task Gleiche_Rolle_durch_unberechtigten_Akteur_liefert_AkteurNichtBerechtigt_statt_Unveraendert(string rolle, bool aktiv)
    {
        await AdminIdAsync();
        var akteur = await KontoAsync(rolle, aktiv);
        var ziel = await KontoAsync("Sachbearbeiter");

        var ergebnis = await MitServiceAsync(s => s.RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Sachbearbeiter, CancellationToken.None));

        Assert.IsType<AenderungErgebnis.AkteurNichtBerechtigt>(ergebnis);
    }

    [Theory]
    [MemberData(nameof(UnberechtigteAkteure))]
    public async Task Gleicher_Status_durch_unberechtigten_Akteur_liefert_AkteurNichtBerechtigt_statt_Unveraendert(string rolle, bool aktiv)
    {
        await AdminIdAsync();
        var akteur = await KontoAsync(rolle, aktiv);
        var ziel = await KontoAsync("Betrachter");

        var ergebnis = await MitServiceAsync(s => s.StatusSetzenAsync(akteur.Id, ziel.Id, true, CancellationToken.None));

        Assert.IsType<AenderungErgebnis.AkteurNichtBerechtigt>(ergebnis);
    }

    [Theory]
    [MemberData(nameof(UnberechtigteAkteure))]
    public async Task Gleicher_inaktiver_Status_durch_unberechtigten_Akteur_liefert_AkteurNichtBerechtigt(string rolle, bool aktiv)
    {
        await AdminIdAsync();
        var akteur = await KontoAsync(rolle, aktiv);
        var ziel = await KontoAsync("Betrachter", aktiv: false);

        var ergebnis = await MitServiceAsync(s => s.StatusSetzenAsync(akteur.Id, ziel.Id, false, CancellationToken.None));

        Assert.IsType<AenderungErgebnis.AkteurNichtBerechtigt>(ergebnis);
    }

    [Theory]
    [MemberData(nameof(UnberechtigteAkteure))]
    public async Task Unbekanntes_Ziel_durch_unberechtigten_Akteur_liefert_AkteurNichtBerechtigt_statt_NichtGefunden(string rolle, bool aktiv)
    {
        await AdminIdAsync();
        var akteur = await KontoAsync(rolle, aktiv);

        var ergebnis = await MitServiceAsync(s => s.RolleZuweisenAsync(akteur.Id, Guid.NewGuid(), Rolle.Betrachter, CancellationToken.None));

        Assert.IsType<AenderungErgebnis.AkteurNichtBerechtigt>(ergebnis);
    }

    [Theory]
    [MemberData(nameof(UnberechtigteAkteure))]
    public async Task Unveraenderte_Rolle_durch_unberechtigten_Akteur_schreibt_nichts_und_keinen_Audit_Eintrag(string rolle, bool aktiv)
    {
        await AdminIdAsync();
        var akteur = await KontoAsync(rolle, aktiv);
        var ziel = await KontoAsync("Sachbearbeiter");
        var vorher = await BenutzerDb.RolleUndStatusAsync(ziel.Id);
        var auditVorher = await AuditDb.AnzahlAsync();

        await MitServiceAsync(s => s.RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Sachbearbeiter, CancellationToken.None));

        Assert.Equal(vorher, await BenutzerDb.RolleUndStatusAsync(ziel.Id));
        Assert.Equal(auditVorher, await AuditDb.AnzahlAsync());
    }

    [Theory]
    [MemberData(nameof(UnberechtigteAkteure))]
    public async Task Unveraenderter_Status_durch_unberechtigten_Akteur_schreibt_nichts_und_keinen_Audit_Eintrag(string rolle, bool aktiv)
    {
        await AdminIdAsync();
        var akteur = await KontoAsync(rolle, aktiv);
        var ziel = await KontoAsync("Betrachter");
        var vorher = await BenutzerDb.RolleUndStatusAsync(ziel.Id);
        var auditVorher = await AuditDb.AnzahlAsync();

        await MitServiceAsync(s => s.StatusSetzenAsync(akteur.Id, ziel.Id, true, CancellationToken.None));

        Assert.Equal(vorher, await BenutzerDb.RolleUndStatusAsync(ziel.Id));
        Assert.Equal(auditVorher, await AuditDb.AnzahlAsync());
    }

    // ---------- Berechtigter Akteur: unverändert wie bisher ----------

    [Fact]
    public async Task Gleiche_Rolle_durch_aktiven_Administrator_liefert_weiterhin_Unveraendert()
    {
        var adminId = await AdminIdAsync();
        var ziel = await KontoAsync("Sachbearbeiter");

        var ergebnis = await MitServiceAsync(s => s.RolleZuweisenAsync(adminId, ziel.Id, Rolle.Sachbearbeiter, CancellationToken.None));

        Assert.IsType<AenderungErgebnis.Unveraendert>(ergebnis);
    }

    [Fact]
    public async Task Unbekanntes_Ziel_durch_aktiven_Administrator_liefert_weiterhin_NichtGefunden()
    {
        var adminId = await AdminIdAsync();

        var ergebnis = await MitServiceAsync(s => s.StatusSetzenAsync(adminId, Guid.NewGuid(), false, CancellationToken.None));

        Assert.IsType<AenderungErgebnis.NichtGefunden>(ergebnis);
    }
}
