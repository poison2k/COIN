using System.Net;
using Coin.IntegrationTests.Infrastruktur;
using Coin.Testdaten;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-15 (Rev. 2) als Theory: Rechte je Endpunkt und Besuchergruppe. Betrachter und Sachbearbeiter
/// erhalten <c>403</c> auf die Konfigurations-API, anonym bzw. mit ungültigem Token <c>401</c>, deaktivierte Benutzer
/// <c>403 benutzer_deaktiviert</c>. Bei <c>401</c>/<c>403</c> wird nichts gespeichert und kein Audit geschrieben.
/// </summary>
public class StartseiteRechteTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    private const string GetKopf = "GET /api/startseite/kopf";
    private const string GetLogo = "GET /api/startseite/logos/{platz}";
    private const string GetStartseite = "GET /api/startseite";
    private const string GetKonfiguration = "GET /api/startseite/konfiguration";
    private const string PutKonfiguration = "PUT /api/startseite/konfiguration";

    private static readonly string[] Spalten = ["Administrator", "Sachbearbeiter", "Betrachter", "keine Rolle", "deaktiviert", "anonym", "ungültiges Token"];

    /// <summary>Tabelle aus AK-15.</summary>
    private static readonly (string Endpunkt, int[] Status)[] Matrix =
    [
        (GetKopf, [200, 200, 200, 200, 200, 200, 200]),
        (GetLogo, [200, 200, 200, 200, 200, 200, 200]),
        (GetStartseite, [200, 200, 200, 403, 403, 401, 401]),
        (GetKonfiguration, [200, 403, 403, 403, 403, 401, 401]),
        (PutKonfiguration, [200, 403, 403, 403, 403, 401, 401]),
    ];

    public static TheoryData<string, string, int> Zellen()
    {
        var daten = new TheoryData<string, string, int>();
        foreach (var (endpunkt, status) in Matrix)
        {
            for (var i = 0; i < Spalten.Length; i++)
            {
                daten.Add(endpunkt, Spalten[i], status[i]);
            }
        }

        return daten;
    }

    private async Task<HttpClient> ClientAsync(string spalte) => spalte switch
    {
        "Administrator" => Client,
        "keine Rolle" => await ClientMitRolleAsync(null),
        "deaktiviert" => await ClientMitRolleAsync("Administrator", aktiv: false),
        "anonym" => Anonym,
        "ungültiges Token" => ClientMitToken(Idp.ErzeugeToken(new TokenDaten { Audience = "fremde-api" })),
        _ => await ClientMitRolleAsync(spalte),
    };

    private static async Task<HttpResponseMessage> SendeAsync(HttpClient client, string endpunkt) => endpunkt switch
    {
        GetKopf => await client.GetAsync(KopfUrl),
        GetLogo => await client.GetAsync(LogoUrl("bereitsteller")),
        GetStartseite => await client.GetAsync(StartseiteUrl),
        GetKonfiguration => await client.GetAsync(KonfigurationUrl),
        PutKonfiguration => await PutKonfigurationAsync(client, Mit(MitKopf(1, alttextBereitsteller: "Wappen Rechte"), k => k["kennzahlen"]!["aktiv"] = false)),
        _ => throw new ArgumentOutOfRangeException(nameof(endpunkt), endpunkt, null),
    };

    /// <summary>Ein Logo ist vorhanden (Spalte „Logo vorhanden“), Konfiguration in Version 1.</summary>
    private Task VorbereitenAsync() => LogoHochladenAsync("bereitsteller", LogoBilder.Png(10, 10), "Wappen Rechte");

    [Theory]
    [MemberData(nameof(Zellen))]
    public async Task Status_entspricht_der_Rechtetabelle(string endpunkt, string spalte, int erwartet)
    {
        await VorbereitenAsync();
        var client = await ClientAsync(spalte);

        using var antwort = await SendeAsync(client, endpunkt);

        Assert.Equal(erwartet, (int)antwort.StatusCode);
    }

    [Theory]
    [InlineData(GetStartseite, "keine Rolle")]
    [InlineData(GetKonfiguration, "Betrachter")]
    [InlineData(GetKonfiguration, "Sachbearbeiter")]
    [InlineData(PutKonfiguration, "Betrachter")]
    [InlineData(PutKonfiguration, "Sachbearbeiter")]
    public async Task Ohne_Berechtigung_traegt_403_den_code_keine_berechtigung(string endpunkt, string spalte)
    {
        await VorbereitenAsync();

        using var antwort = await SendeAsync(await ClientAsync(spalte), endpunkt);

        await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
    }

    [Theory]
    [InlineData(GetStartseite)]
    [InlineData(GetKonfiguration)]
    [InlineData(PutKonfiguration)]
    public async Task Deaktivierte_erhalten_403_benutzer_deaktiviert(string endpunkt)
    {
        await VorbereitenAsync();

        using var antwort = await SendeAsync(await ClientAsync("deaktiviert"), endpunkt);

        await AssertKeinZugriffAsync(antwort, "benutzer_deaktiviert");
    }

    [Theory]
    [InlineData("Sachbearbeiter")]
    [InlineData("Betrachter")]
    [InlineData("keine Rolle")]
    [InlineData("deaktiviert")]
    [InlineData("anonym")]
    [InlineData("ungültiges Token")]
    public async Task Abgewiesenes_PUT_aendert_nichts_und_schreibt_kein_Audit(string spalte)
    {
        await VorbereitenAsync();
        var vorher = await StartseiteDb.ZustandAsync();

        using var antwort = await SendeAsync(await ClientAsync(spalte), PutKonfiguration);

        Assert.True(antwort.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden, $"Status {antwort.StatusCode}");
        Assert.Equal(vorher, await StartseiteDb.ZustandAsync());
    }

    [Theory]
    [InlineData("Sachbearbeiter")]
    [InlineData("Betrachter")]
    public async Task Abgewiesenes_GET_konfiguration_enthaelt_keine_Konfigurationsdaten(string spalte)
    {
        await VorbereitenAsync();

        using var antwort = await SendeAsync(await ClientAsync(spalte), GetKonfiguration);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.DoesNotContain("Wappen Rechte", text);
        Assert.DoesNotContain("\"version\"", text);
    }
}
