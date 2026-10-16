using System.Net;
using System.Net.Http.Json;
using System.Text;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen, AK-24 (A2): Rechte je Rolle für alle neuen Endpunkte, eine Methode je Spalte.
/// „deaktiviert“ = Rolle Administrator mit aktiv=false. 401/403 kommen vor 404, 413, 415 und 400; bei 401/403 wird
/// nichts gespeichert und der Upload-Body nicht gelesen.
/// </summary>
public class VorlagenRechteTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string GetStandard = "GET /api/zertifikatsvorlagen/standard";
    private const string GetStatus = "GET /api/coins/{id}/zertifikatsvorlage";
    private const string GetAktiv = "GET /api/coins/{id}/zertifikatsvorlage/datei";
    private const string GetVersion = "GET /api/coins/{id}/zertifikatsvorlage/versionen/{version}/datei";
    private const string PostVersion = "POST /api/coins/{id}/zertifikatsvorlage/versionen";
    private const string PostZuruecksetzen = "POST /api/coins/{id}/zertifikatsvorlage/zuruecksetzen";
    private const string PutCoin = "PUT /api/coins/{id}";

    private const string DetailCoinsWrite = "Ihr Benutzerkonto ist nicht berechtigt, den Coin-Katalog zu ändern.";
    private const string DetailDeaktiviert = "Ihr Benutzerkonto ist deaktiviert.";

    private static readonly string[] Alle = [GetStandard, GetStatus, GetAktiv, GetVersion, PostVersion, PostZuruecksetzen, PutCoin];

    /// <summary>Matrix aus AK-24: Admin, Sachbearbeiter, Betrachter, keine Rolle, deaktiviert, anonym.</summary>
    private static readonly (string Endpunkt, int[] Status)[] Matrix =
    [
        (GetStandard, [200, 200, 403, 403, 403, 401]),
        (GetStatus, [200, 200, 403, 403, 403, 401]),
        (GetAktiv, [200, 200, 403, 403, 403, 401]),
        (GetVersion, [200, 200, 403, 403, 403, 401]),
        (PostVersion, [201, 201, 403, 403, 403, 401]),
        (PostZuruecksetzen, [200, 200, 403, 403, 403, 401]),
        (PutCoin, [200, 200, 403, 403, 403, 401]),
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

    public static TheoryData<string> Endpunkte => [.. Alle];

    /// <summary>Coin mit eigener Vorlage Version 1 (durch den Bootstrap-Administrator).</summary>
    private async Task<Guid> VorbereitenAsync()
    {
        var coinId = await CoinAsync("Coin Rechte Vorlage");
        await LadeVorlageHochAsync(coinId);
        return coinId;
    }

    private static async Task<HttpResponseMessage> SendeAsync(HttpClient client, string endpunkt, Guid coinId) => endpunkt switch
    {
        GetStandard => await client.GetAsync(StandardUrl),
        GetStatus => await client.GetAsync(VorlageUrl(coinId)),
        GetAktiv => await client.GetAsync(AktiveDateiUrl(coinId)),
        GetVersion => await client.GetAsync(VersionDateiUrl(coinId, 1)),
        PostVersion => await PostVersionAsync(client, coinId, Gueltig().Bytes()),
        PostZuruecksetzen => await PostZuruecksetzenAsync(client, coinId),
        PutCoin => await client.PutAsJsonAsync($"{CoinsUrl}/{coinId}", GueltigerCoin("Coin Rechte Geaendert", "Herausgeber Rechte")),
        _ => throw new ArgumentOutOfRangeException(nameof(endpunkt), endpunkt, null),
    };

    /// <summary>Beobachtbarer Zustand: Versionen, Zeiger, Audit und Coin-DTO.</summary>
    private async Task<string> ZustandAsync(Guid coinId)
    {
        using var coin = await Anonym.GetAsync($"{CoinsUrl}/{coinId}");
        return $"{await SpeicherZustandAsync(coinId)}|{await coin.Content.ReadAsStringAsync()}";
    }

    private async Task PruefeZelleAsync(Func<Task<HttpClient>> clientFabrik, string endpunkt, int erwartet)
    {
        var coinId = await VorbereitenAsync();
        var client = await clientFabrik();
        var vorher = await ZustandAsync(coinId);

        using var antwort = await SendeAsync(client, endpunkt, coinId);

        Assert.Equal($"{endpunkt} -> {erwartet}", $"{endpunkt} -> {(int)antwort.StatusCode}");
        if (erwartet is 401 or 403)
        {
            Assert.Equal(vorher, await ZustandAsync(coinId));
        }
    }

    // ---------- AK-24: eine Methode je Spalte ----------

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

    // ---------- 403-Texte ----------

    [Theory]
    [MemberData(nameof(Endpunkte))]
    public async Task Betrachter_erhaelt_403_keine_berechtigung_mit_Text_fuer_coins_write(string endpunkt)
    {
        var coinId = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await SendeAsync(betrachter, endpunkt, coinId);

        var json = await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
        Assert.Equal(DetailCoinsWrite, json.GetProperty("detail").GetString());
    }

    [Theory]
    [MemberData(nameof(Endpunkte))]
    public async Task Deaktiviert_erhaelt_403_benutzer_deaktiviert(string endpunkt)
    {
        var coinId = await VorbereitenAsync();
        var client = await ClientMitRolleAsync("Administrator", aktiv: false);

        using var antwort = await SendeAsync(client, endpunkt, coinId);

        var json = await AssertKeinZugriffAsync(antwort, "benutzer_deaktiviert");
        Assert.Equal(DetailDeaktiviert, json.GetProperty("detail").GetString());
    }

    [Theory]
    [MemberData(nameof(Endpunkte))]
    public async Task Antwort_an_den_Betrachter_enthaelt_keine_Vorlagendaten(string endpunkt)
    {
        var coinId = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await SendeAsync(betrachter, endpunkt, coinId);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.DoesNotContain(Testbenutzer.AdminName, text, StringComparison.Ordinal);
        Assert.DoesNotContain("versionen", text, StringComparison.Ordinal);
        Assert.NotEqual(DocxContentType, antwort.Content.Headers.ContentType?.MediaType);
    }

    // ---------- 401/403 vor 404, 413, 415, 400 ----------

    [Theory]
    [InlineData(GetStatus)]
    [InlineData(GetAktiv)]
    [InlineData(GetVersion)]
    [InlineData(PostVersion)]
    [InlineData(PostZuruecksetzen)]
    [InlineData(PutCoin)]
    public async Task Betrachter_mit_unbekannter_Coin_Id_erhaelt_403_statt_404(string endpunkt)
    {
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await SendeAsync(betrachter, endpunkt, Guid.NewGuid());

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Theory]
    [InlineData(GetStatus)]
    [InlineData(PostVersion)]
    [InlineData(PutCoin)]
    public async Task Anonym_mit_unbekannter_Coin_Id_erhaelt_401_statt_404(string endpunkt)
    {
        using var antwort = await SendeAsync(Anonym, endpunkt, Guid.NewGuid());

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_mit_unbekannter_Version_erhaelt_403_statt_404()
    {
        var coinId = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await betrachter.GetAsync(VersionDateiUrl(coinId, 99));

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_mit_zu_grosser_Datei_erhaelt_403_statt_413()
    {
        var coinId = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await PostVersionAsync(betrachter, coinId, new byte[FuenfMiB + 1]);

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_mit_JSON_statt_multipart_erhaelt_403_statt_415()
    {
        var coinId = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await betrachter.PostAsync(VersionenUrl(coinId), new StringContent("{}", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_mit_ungueltiger_Datei_erhaelt_403_statt_400()
    {
        var coinId = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await PostVersionAsync(betrachter, coinId, Testvorlagen.Textdatei());

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Anonym_mit_zu_grosser_Datei_erhaelt_401_statt_413()
    {
        var coinId = await VorbereitenAsync();

        using var antwort = await PostVersionAsync(Anonym, coinId, new byte[FuenfMiB + 1]);

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_mit_Text_statt_JSON_beim_Bearbeiten_erhaelt_403_statt_415()
    {
        var coinId = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await betrachter.PutAsync($"{CoinsUrl}/{coinId}", new StringContent("x", Encoding.UTF8, "text/plain"));

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_mit_ungueltigem_Body_beim_Bearbeiten_erhaelt_403_statt_400()
    {
        var coinId = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await PutRohAsync(betrachter, $"{CoinsUrl}/{coinId}", "{}");

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Upload_Body_wird_bei_403_nicht_gelesen()
    {
        var zaehler = new KoerperLeseZaehler();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { KoerperZaehler = zaehler });
        var coinId = await VorbereitenAsync();
        var konto = await KontoAsync("Betrachter");
        using var betrachter = factory.ClientMitToken(Idp.ErzeugeToken(new TokenDaten { Subject = konto.Subject, Email = konto.Email, Name = konto.Name }));
        zaehler.Zuruecksetzen();

        using var antwort = await PostVersionAsync(betrachter, coinId, Gueltig().Bytes());

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
        Assert.Equal(0, zaehler.GelesenBytes);
    }

    // ---------- Wirkung ohne neues Token ----------

    [Fact]
    public async Task Herabgestufter_Sachbearbeiter_verliert_sofort_den_Zugriff_auf_Vorlagen()
    {
        var coinId = await VorbereitenAsync();
        var konto = await KontoAsync("Sachbearbeiter");
        using (var vorher = await konto.Client.GetAsync(VorlageUrl(coinId)))
        {
            Assert.Equal(HttpStatusCode.OK, vorher.StatusCode);
        }

        await BenutzerDb.RolleSetzenAsync(konto.Subject, "Betrachter");

        using var nachher = await konto.Client.GetAsync(VorlageUrl(coinId));
        Assert.Equal(HttpStatusCode.Forbidden, nachher.StatusCode);
    }
}
