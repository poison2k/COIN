using System.Net;
using System.Net.Http.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Berechtigungen;

/// <summary>
/// Feature rollen-benutzerverwaltung, AK-5 bis AK-8: Rollen-Endpunkt-Matrix. Je Spalte eine Testmethode (Theory über
/// die Zeilen). Daten sind gültig, Ziel-Ids existieren. Bei 401/403 wird nichts gespeichert und kein Audit geschrieben.
/// „deaktiviert“ = Rolle Administrator mit aktiv=false, damit nur der Status den Ausschlag gibt.
/// </summary>
public class RollenEndpunktMatrixTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const string GetCoins = "GET /api/coins";
    private const string GetCoin = "GET /api/coins/{id}";
    private const string GetBild = "GET /api/coins/{id}/bild";
    private const string PostCoins = "POST /api/coins";
    private const string PutBild = "PUT /api/coins/{id}/bild";
    private const string GetMe = "GET /api/me";
    private const string GetBenutzer = "GET /api/benutzer";
    private const string PutRolle = "PUT /api/benutzer/{id}/rolle";
    private const string PutStatus = "PUT /api/benutzer/{id}/status";
    private const string GetAudit = "GET /api/audit";

    private const string DetailDeaktiviert = "Ihr Benutzerkonto ist deaktiviert.";
    private const string DetailCoinsWrite = "Ihr Benutzerkonto ist nicht berechtigt, den Coin-Katalog zu ändern.";
    private const string DetailUsersManage = "Ihr Benutzerkonto ist nicht berechtigt, Benutzer zu verwalten.";
    private const string DetailAuditRead = "Ihr Benutzerkonto ist nicht berechtigt, das Audit-Log einzusehen.";

    /// <summary>Matrix aus AK-5: Admin, Sachbearbeiter, Betrachter, keine, deaktiviert, anonym.</summary>
    private static readonly (string Endpunkt, int[] Status)[] Matrix =
    [
        (GetCoins, [200, 200, 200, 200, 200, 200]),
        (GetCoin, [200, 200, 200, 200, 200, 200]),
        (GetBild, [200, 200, 200, 200, 200, 200]),
        (PostCoins, [201, 201, 403, 403, 403, 401]),
        (PutBild, [200, 200, 403, 403, 403, 401]),
        (GetMe, [200, 200, 200, 200, 403, 401]),
        (GetBenutzer, [200, 403, 403, 403, 403, 401]),
        (PutRolle, [200, 403, 403, 403, 403, 401]),
        (PutStatus, [200, 403, 403, 403, 403, 401]),
        (GetAudit, [200, 403, 403, 403, 403, 401]),
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

    private sealed record Kontext(Guid CoinId, Guid ZielId);

    /// <summary>Coin mit Bild (durch den Bootstrap-Admin) und ein Zielbenutzer ohne Rolle.</summary>
    private async Task<Kontext> VorbereitenAsync()
    {
        var coinId = await LegeCoinAnUndLiefereIdAsync();
        await LadeBildHochAsync(coinId, Testbilder.Png());
        var ziel = await KontoAsync(null, name: "Test Zielperson");
        return new Kontext(coinId, ziel.Id);
    }

    private static async Task<HttpResponseMessage> SendeAsync(HttpClient client, string endpunkt, Kontext k) => endpunkt switch
    {
        GetCoins => await client.GetAsync(CoinsUrl),
        GetCoin => await client.GetAsync($"{CoinsUrl}/{k.CoinId}"),
        GetBild => await client.GetAsync(BildUrl(k.CoinId)),
        PostCoins => await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin($"Coin Matrix {Guid.NewGuid():N}")),
        PutBild => await client.PutAsync(BildUrl(k.CoinId), Multipart(Testbilder.Jpeg())),
        GetMe => await client.GetAsync(MeUrl),
        GetBenutzer => await client.GetAsync(BenutzerUrl),
        PutRolle => await PutRolleAsync(client, k.ZielId, "Betrachter"),
        PutStatus => await PutStatusAsync(client, k.ZielId, false),
        GetAudit => await client.GetAsync(AuditUrl),
        _ => throw new ArgumentOutOfRangeException(nameof(endpunkt), endpunkt, null),
    };

    /// <summary>Beobachtbarer Zustand: Katalog (inkl. Bildversion), Rolle/Status des Ziels, Anzahl Audit-Einträge.</summary>
    private async Task<string> ZustandAsync(Kontext k)
    {
        using var liste = await Anonym.GetAsync(CoinsUrl);
        var (rolle, aktiv, _) = await BenutzerDb.RolleUndStatusAsync(k.ZielId);
        return $"{await liste.Content.ReadAsStringAsync()}|{rolle}|{aktiv}|{await AuditDb.AnzahlAsync()}";
    }

    private async Task PruefeZelleAsync(Func<Task<HttpClient>> clientFabrik, string endpunkt, int erwartet)
    {
        var k = await VorbereitenAsync();
        var client = await clientFabrik();
        var vorher = await ZustandAsync(k);

        using var antwort = await SendeAsync(client, endpunkt, k);

        Assert.Equal($"{endpunkt} -> {erwartet}", $"{endpunkt} -> {(int)antwort.StatusCode}");
        if (erwartet is 401 or 403)
        {
            Assert.Equal(vorher, await ZustandAsync(k));
        }
    }

    // ---------- AK-5: eine Methode je Spalte ----------

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

    // ---------- Entscheidung 1: öffentliche GETs für Deaktivierte identisch mit anonym ----------

    [Theory]
    [InlineData(GetCoins)]
    [InlineData(GetCoin)]
    [InlineData(GetBild)]
    public async Task Deaktivierte_erhalten_auf_oeffentlichen_GETs_dieselbe_Antwort_wie_Anonyme(string endpunkt)
    {
        var k = await VorbereitenAsync();
        var deaktiviert = await ClientMitRolleAsync("Administrator", aktiv: false);

        using var mitToken = await SendeAsync(deaktiviert, endpunkt, k);
        using var ohneToken = await SendeAsync(Anonym, endpunkt, k);

        Assert.Equal(HttpStatusCode.OK, mitToken.StatusCode);
        Assert.Equal(ohneToken.Content.Headers.ContentType?.ToString(), mitToken.Content.Headers.ContentType?.ToString());
        Assert.Equal(await ohneToken.Content.ReadAsByteArrayAsync(), await mitToken.Content.ReadAsByteArrayAsync());
    }

    // ---------- AK-6: 403-Bodies ----------

    public static TheoryData<string> GeschuetzteEndpunkte => [PostCoins, PutBild, GetMe, GetBenutzer, PutRolle, PutStatus, GetAudit];

    [Theory]
    [MemberData(nameof(GeschuetzteEndpunkte))]
    public async Task Deaktiviert_liefert_403_mit_code_benutzer_deaktiviert_und_festem_detail(string endpunkt)
    {
        var k = await VorbereitenAsync();
        var client = await ClientMitRolleAsync("Administrator", aktiv: false);

        using var antwort = await SendeAsync(client, endpunkt, k);

        var json = await AssertKeinZugriffAsync(antwort, "benutzer_deaktiviert");
        Assert.Equal(DetailDeaktiviert, json.GetProperty("detail").GetString());
    }

    [Theory]
    [InlineData("Betrachter", PostCoins)]
    [InlineData(null, PostCoins)]
    [InlineData("Sachbearbeiter", GetBenutzer)]
    [InlineData("Betrachter", PutRolle)]
    [InlineData(null, GetAudit)]
    public async Task Deaktiviert_geht_der_Berechtigungspruefung_vor(string? rolle, string endpunkt)
    {
        var k = await VorbereitenAsync();
        var client = await ClientMitRolleAsync(rolle, aktiv: false);

        using var antwort = await SendeAsync(client, endpunkt, k);

        await AssertKeinZugriffAsync(antwort, "benutzer_deaktiviert");
    }

    [Theory]
    [InlineData("Betrachter", PostCoins, DetailCoinsWrite)]
    [InlineData(null, PutBild, DetailCoinsWrite)]
    [InlineData("Sachbearbeiter", GetBenutzer, DetailUsersManage)]
    [InlineData("Betrachter", PutRolle, DetailUsersManage)]
    [InlineData(null, PutStatus, DetailUsersManage)]
    [InlineData("Sachbearbeiter", GetAudit, DetailAuditRead)]
    [InlineData(null, GetAudit, DetailAuditRead)]
    public async Task Fehlende_Berechtigung_liefert_403_mit_code_keine_berechtigung_und_detail_je_Berechtigung(
        string? rolle, string endpunkt, string detail)
    {
        var k = await VorbereitenAsync();
        var client = await ClientMitRolleAsync(rolle);

        using var antwort = await SendeAsync(client, endpunkt, k);

        var json = await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
        Assert.Equal(detail, json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Antwort_403_enthaelt_weder_Rolle_noch_Berechtigungsliste_noch_Personendaten()
    {
        var k = await VorbereitenAsync();
        var konto = await KontoAsync("Betrachter", name: "Test Betrachterin Geheim");

        using var antwort = await SendeAsync(konto.Client, GetBenutzer, k);
        var body = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
        Assert.DoesNotContain("Test Betrachterin Geheim", body);
        Assert.DoesNotContain(konto.Email!, body);
        Assert.DoesNotContain("Betrachter", body);
        Assert.DoesNotContain("users.manage", body);
    }

    // ---------- AK-6: Reihenfolge 401 → 403 → 400/404/409 auf den neuen Endpunkten ----------

    [Theory]
    [InlineData("anonym", 401)]
    [InlineData("Betrachter", 403)]
    [InlineData("deaktiviert", 403)]
    public async Task Rolle_setzen_mit_ungueltigem_Body_liefert_401_oder_403_statt_400(string wer, int erwartet)
    {
        var k = await VorbereitenAsync();
        var client = wer switch
        {
            "anonym" => Anonym,
            "deaktiviert" => await ClientMitRolleAsync("Administrator", aktiv: false),
            _ => await ClientMitRolleAsync(wer),
        };

        using var antwort = await PutRohAsync(client, RolleUrl(k.ZielId), "{ \"rolle\": \"Superuser\" }");

        Assert.Equal(erwartet, (int)antwort.StatusCode);
    }

    [Theory]
    [InlineData("anonym", 401)]
    [InlineData("Sachbearbeiter", 403)]
    public async Task Status_setzen_fuer_unbekannte_Id_liefert_401_oder_403_statt_404(string wer, int erwartet)
    {
        var client = wer == "anonym" ? Anonym : await ClientMitRolleAsync(wer);

        using var antwort = await PutStatusAsync(client, Guid.NewGuid(), false);

        Assert.Equal(erwartet, (int)antwort.StatusCode);
    }

    [Fact]
    public async Task Audit_mit_ungueltiger_benutzerId_liefert_fuer_Betrachter_403_statt_400()
    {
        var client = await ClientMitRolleAsync("Betrachter");

        using var antwort = await client.GetAsync($"{AuditUrl}?benutzerId=keine-guid");

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Bei_403_fuer_Deaktivierte_liest_die_API_den_Upload_Body_nicht()
    {
        var zaehler = new KoerperLeseZaehler();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { KoerperZaehler = zaehler });
        using var admin = factory.CreateClient();
        using var anlegen = await admin.PostAsJsonAsync(CoinsUrl, GueltigerCoin());
        var id = (await JsonAsync(anlegen)).GetProperty("id").GetGuid();
        var konto = await KontoAsync("Administrator", aktiv: false);
        using var client = factory.ClientMitToken(Idp.ErzeugeToken(new TokenDaten
        {
            Subject = konto.Subject,
            Email = konto.Email,
            Name = konto.Name,
        }));
        zaehler.Zuruecksetzen();

        using var antwort = await client.PutAsync(BildUrl(id), Multipart(Testbilder.Png(1024 * 1024)));

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
        Assert.Equal(0, zaehler.GelesenBytes);
    }

    // ---------- AK-7: Wirkung ohne neues Token ----------

    [Fact]
    public async Task Rollenwechsel_wirkt_ab_dem_naechsten_Request_mit_demselben_Token()
    {
        await AdminIdAsync();
        var sachbearbeiter = await KontoAsync("Sachbearbeiter");
        using (var vorher = await sachbearbeiter.Client.PostAsJsonAsync(CoinsUrl, GueltigerCoin("Coin Vorher")))
        {
            Assert.Equal(HttpStatusCode.Created, vorher.StatusCode);
        }

        using (var aendern = await PutRolleAsync(Client, sachbearbeiter.Id, "Betrachter"))
        {
            Assert.Equal(HttpStatusCode.OK, aendern.StatusCode);
        }

        using var nachher = await sachbearbeiter.Client.PostAsJsonAsync(CoinsUrl, GueltigerCoin("Coin Nachher"));
        await AssertKeinZugriffAsync(nachher, "keine_berechtigung");
    }

    [Fact]
    public async Task Deaktivierung_wirkt_ab_dem_naechsten_Request_mit_demselben_Token()
    {
        await AdminIdAsync();
        var konto = await KontoAsync("Sachbearbeiter");

        using (var aendern = await PutStatusAsync(Client, konto.Id, false))
        {
            Assert.Equal(HttpStatusCode.OK, aendern.StatusCode);
        }

        using var me = await konto.Client.GetAsync(MeUrl);
        await AssertKeinZugriffAsync(me, "benutzer_deaktiviert");
    }

    [Fact]
    public async Task Reaktivierung_wirkt_ab_dem_naechsten_Request_mit_demselben_Token()
    {
        await AdminIdAsync();
        var konto = await KontoAsync("Sachbearbeiter", aktiv: false);

        using (var aendern = await PutStatusAsync(Client, konto.Id, true))
        {
            Assert.Equal(HttpStatusCode.OK, aendern.StatusCode);
        }

        using var antwort = await konto.Client.PostAsJsonAsync(CoinsUrl, GueltigerCoin("Coin Reaktiviert"));
        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    // ---------- AK-8 ----------

    [Theory]
    [InlineData("/api/gibt-es-nicht")]
    [InlineData("/api/benutzer/gibt-es-nicht/unterpfad")]
    [InlineData("/gibt-es-nicht")]
    public async Task Unbekannter_Pfad_mit_gueltigem_Token_liefert_404_und_legt_keinen_Benutzer_an(string pfad)
    {
        var client = ClientMit(Testbenutzer.OhneRolle());

        using var antwort = await client.GetAsync(pfad);

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
        Assert.Equal(0, await BenutzerDb.AnzahlAsync());
    }
}
