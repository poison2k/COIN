using System.Net;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-19 (ADR-0021): Rechte je Rolle für die neuen Endpunkte, eine Methode je Spalte.
/// „deaktiviert“ = Rolle Administrator mit aktiv=false. 403 geht 404 vor; kein 401/403-Body enthält Werte der Ausgabe;
/// abgelehnte Downloads schreiben kein Audit.
/// </summary>
public class ZertifikatRechteTests(PostgresFixture fixture) : ZertifikatTestBasis(fixture)
{
    private const string GetZertifikat = "GET /api/coins/{id}/ausgaben/{ausgabeId}/zertifikat";
    private const string GetAusgabe = "GET /api/coins/{id}/ausgaben/{ausgabeId}";

    private const string DetailIssuesRead = "Ihr Benutzerkonto ist nicht berechtigt, Ausgaben einzusehen.";
    private const string DetailDeaktiviert = "Ihr Benutzerkonto ist deaktiviert.";

    /// <summary>Eindeutige Testwerte der Ausgabe (keine echten Personendaten).</summary>
    private static readonly string[] Testwerte =
    [
        "Rechte Empfaenger Zr61", "Rechte Dienstgrad Zr62", "Rechte Dienststelle Zr63", "Rechte Gelegenheit Zr64",
        "Rechte Begruendung Zr65", "Rechte Stelle Zr66",
    ];

    /// <summary>Matrix aus AK-19: Admin, Sachbearbeiter, Betrachter, keine Rolle, deaktiviert, anonym.</summary>
    private static readonly (string Endpunkt, int[] Status)[] Matrix =
    [
        (GetZertifikat, [200, 200, 403, 403, 403, 401]),
        (GetAusgabe, [200, 200, 403, 403, 403, 401]),
    ];

    public static TheoryData<string, int> Spalte(int index)
    {
        var daten = new TheoryData<string, int>();
        foreach (var (endpunkt, status) in Matrix)
        {
            daten.Add(endpunkt, status[index]);
        }

        return daten;
    }

    private async Task<ZertifikatKontext> VorbereitenAsync()
    {
        var coinId = await CoinMitAuflageAsync(10, "Rechte Coin Zr67");
        return await AusgabeZuAsync(coinId, 4, GueltigeAusgabe(4, Testwerte[0], Testwerte[1], Testwerte[2], Datum, Testwerte[3], Testwerte[4], Testwerte[5]));
    }

    private static Task<HttpResponseMessage> SendeAsync(HttpClient client, string endpunkt, Guid coinId, Guid ausgabeId) => endpunkt switch
    {
        GetZertifikat => client.GetAsync(ZertifikatUrl(coinId, ausgabeId)),
        GetAusgabe => client.GetAsync(AusgabeUrl(coinId, ausgabeId)),
        _ => throw new ArgumentOutOfRangeException(nameof(endpunkt), endpunkt, null),
    };

    private async Task PruefeZelleAsync(Func<Task<HttpClient>> clientFabrik, string endpunkt, int erwartet)
    {
        var k = await VorbereitenAsync();
        var client = await clientFabrik();

        using var antwort = await SendeAsync(client, endpunkt, k.CoinId, k.AusgabeId);

        Assert.Equal($"{endpunkt} -> {erwartet}", $"{endpunkt} -> {(int)antwort.StatusCode}");
        if (erwartet is 401 or 403)
        {
            Assert.Equal(0L, await ZertifikatDb.AnzahlAsync());
        }
    }

    [Theory]
    [MemberData(nameof(Spalte), 0)]
    public Task Spalte_Administrator(string endpunkt, int erwartet) =>
        PruefeZelleAsync(() => Task.FromResult(Client), endpunkt, erwartet);

    [Theory]
    [MemberData(nameof(Spalte), 1)]
    public Task Spalte_Sachbearbeiter(string endpunkt, int erwartet) =>
        PruefeZelleAsync(() => ClientMitRolleAsync("Sachbearbeiter"), endpunkt, erwartet);

    [Theory]
    [MemberData(nameof(Spalte), 2)]
    public Task Spalte_Betrachter(string endpunkt, int erwartet) =>
        PruefeZelleAsync(() => ClientMitRolleAsync("Betrachter"), endpunkt, erwartet);

    [Theory]
    [MemberData(nameof(Spalte), 3)]
    public Task Spalte_keine_Rolle(string endpunkt, int erwartet) =>
        PruefeZelleAsync(() => ClientMitRolleAsync(null), endpunkt, erwartet);

    [Theory]
    [MemberData(nameof(Spalte), 4)]
    public Task Spalte_deaktiviert(string endpunkt, int erwartet) =>
        PruefeZelleAsync(() => ClientMitRolleAsync("Administrator", aktiv: false), endpunkt, erwartet);

    [Theory]
    [MemberData(nameof(Spalte), 5)]
    public Task Spalte_anonym(string endpunkt, int erwartet) =>
        PruefeZelleAsync(() => Task.FromResult(Anonym), endpunkt, erwartet);

    [Fact]
    public async Task Betrachter_erhaelt_fuer_den_Download_403_keine_berechtigung()
    {
        var k = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await GetZertifikatAsync(k, betrachter);

        await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
    }

    [Fact]
    public async Task Betrachter_erhaelt_fuer_die_Ausgabe_403_mit_dem_Text_fuer_issues_read()
    {
        var k = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await betrachter.GetAsync(AusgabeUrl(k.CoinId, k.AusgabeId));

        var json = await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
        Assert.Equal(DetailIssuesRead, json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Deaktivierter_erhaelt_403_benutzer_deaktiviert()
    {
        var k = await VorbereitenAsync();
        var deaktiviert = await ClientMitRolleAsync("Administrator", aktiv: false);

        using var antwort = await GetZertifikatAsync(k, deaktiviert);

        var json = await AssertKeinZugriffAsync(antwort, "benutzer_deaktiviert");
        Assert.Equal(DetailDeaktiviert, json.GetProperty("detail").GetString());
    }

    [Theory]
    [InlineData(GetZertifikat)]
    [InlineData(GetAusgabe)]
    public async Task Ohne_Recht_kommt_403_vor_404_bei_unbekannter_Ausgabe(string endpunkt)
    {
        var k = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await SendeAsync(betrachter, endpunkt, k.CoinId, Guid.NewGuid());

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Theory]
    [InlineData(GetZertifikat)]
    [InlineData(GetAusgabe)]
    public async Task Ohne_Recht_kommt_403_vor_404_bei_unbekanntem_Coin(string endpunkt)
    {
        var k = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await SendeAsync(betrachter, endpunkt, Guid.NewGuid(), k.AusgabeId);

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Theory]
    [InlineData("Betrachter")]
    [InlineData("keine")]
    [InlineData("deaktiviert")]
    [InlineData("anonym")]
    public async Task Keine_abgelehnte_Antwort_enthaelt_Werte_der_Ausgabe(string wer)
    {
        var k = await VorbereitenAsync();
        var client = wer switch
        {
            "anonym" => Anonym,
            "deaktiviert" => await ClientMitRolleAsync("Administrator", aktiv: false),
            "keine" => await ClientMitRolleAsync(null),
            _ => await ClientMitRolleAsync(wer),
        };

        var texte = new List<string>();
        foreach (var endpunkt in new[] { GetZertifikat, GetAusgabe })
        {
            using var antwort = await SendeAsync(client, endpunkt, k.CoinId, k.AusgabeId);
            texte.Add(await antwort.Content.ReadAsStringAsync());
        }

        var gesamt = string.Join("\n", texte);
        Assert.All(Testwerte, wert => Assert.DoesNotContain(wert, gesamt, StringComparison.Ordinal));
        Assert.DoesNotContain(k.Nummer, gesamt, StringComparison.Ordinal);
        Assert.DoesNotContain("Zr67", gesamt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Sachbearbeiter_kann_das_Zertifikat_einer_vom_Administrator_erfassten_Ausgabe_laden()
    {
        var k = await VorbereitenAsync();
        var sachbearbeiter = await ClientMitRolleAsync("Sachbearbeiter");

        var bytes = await ZertifikatAsync(k, sachbearbeiter);

        Assert.Contains(DocxLeser.Absatztexte(bytes), t => t.Contains(Testwerte[0], StringComparison.Ordinal));
    }
}
