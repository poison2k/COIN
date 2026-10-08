using System.Net;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Ausgaben;

/// <summary>
/// Feature coin-ausgaben, AK-15 (ADR-0021): Rechte je Rolle für die neuen Endpunkte, eine Methode je Spalte.
/// „deaktiviert“ = Rolle Administrator mit aktiv=false. Vorgabe „Betrachter erhalten keine Empfängerdaten“:
/// Suche nach eindeutigen Testwerten im Antworttext. 403 geht 404 vor. Bei 401/403 wird nichts gespeichert.
/// </summary>
public class AusgabenRechteTests(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    private const string GetExemplare = "GET /api/coins/{id}/exemplare";
    private const string GetAusgaben = "GET /api/coins/{id}/ausgaben";
    private const string PostAusgaben = "POST /api/coins/{id}/ausgaben";
    private const string PostStorno = "POST /api/coins/{id}/ausgaben/{ausgabeId}/storno";
    private const string PutAuflage = "PUT /api/coins/{id}/auflage";

    private const string DetailCoinsRead = "Ihr Benutzerkonto ist nicht berechtigt, die Exemplare einzusehen.";
    private const string DetailIssuesRead = "Ihr Benutzerkonto ist nicht berechtigt, Ausgaben einzusehen.";
    private const string DetailIssuesWrite = "Ihr Benutzerkonto ist nicht berechtigt, Ausgaben zu erfassen oder zu stornieren.";
    private const string DetailCoinsWrite = "Ihr Benutzerkonto ist nicht berechtigt, den Coin-Katalog zu ändern.";
    private const string DetailDeaktiviert = "Ihr Benutzerkonto ist deaktiviert.";

    /// <summary>Eindeutige Testwerte einer zuvor erfassten Ausgabe (keine echten Personendaten).</summary>
    private static readonly string[] Testwerte =
    [
        "Test Empfaenger Rechte 7f3a",
        "Test Dienstgrad Rechte 7f3a",
        "Test Dienststelle Rechte 7f3a",
        "Test Gelegenheit Rechte 7f3a",
        "Test Begruendung Rechte 7f3a",
        "Test Stelle Rechte 7f3a",
        "Test Stornogrund Rechte 7f3a",
    ];

    /// <summary>Matrix aus AK-15: Admin, Sachbearbeiter, Betrachter, keine Rolle, deaktiviert, anonym.</summary>
    private static readonly (string Endpunkt, int[] Status)[] Matrix =
    [
        (GetExemplare, [200, 200, 200, 403, 403, 401]),
        (GetAusgaben, [200, 200, 403, 403, 403, 401]),
        (PostAusgaben, [201, 201, 403, 403, 403, 401]),
        (PostStorno, [200, 200, 403, 403, 403, 401]),
        (PutAuflage, [200, 200, 403, 403, 403, 401]),
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

    private sealed record Kontext(Guid CoinId, Guid AktiveAusgabeId);

    /// <summary>
    /// Coin mit Auflage 10; Ausgabe Nr. 1 mit den Testwerten, storniert mit Testgrund; Ausgabe Nr. 2 aktiv
    /// (Ziel für das Storno). Alles durch den Bootstrap-Administrator.
    /// </summary>
    private async Task<Kontext> VorbereitenAsync()
    {
        var coinId = await CoinMitAuflageAsync(10);
        using (var mitTestwerten = await PostAusgabeAsync(coinId, GueltigeAusgabe(
            1, Testwerte[0], Testwerte[1], Testwerte[2], Datum, Testwerte[3], Testwerte[4], Testwerte[5])))
        {
            Assert.Equal(HttpStatusCode.Created, mitTestwerten.StatusCode);
            var id = (await JsonAsync(mitTestwerten)).GetProperty("id").GetGuid();
            await StornierenAsync(coinId, id, Testwerte[6]);
        }

        var aktiv = await ErfasseAsync(coinId, 2);
        return new Kontext(coinId, aktiv.GetProperty("id").GetGuid());
    }

    private static async Task<HttpResponseMessage> SendeAsync(HttpClient client, string endpunkt, Kontext k, Guid? coinId = null)
    {
        var id = coinId ?? k.CoinId;
        return endpunkt switch
        {
            GetExemplare => await client.GetAsync(ExemplareUrl(id)),
            GetAusgaben => await client.GetAsync(AusgabenUrl(id)),
            PostAusgaben => await PostAusgabeAsync(client, id, GueltigeAusgabe()),
            PostStorno => await PostStornoAsync(client, id, k.AktiveAusgabeId, "Test Storno Matrix"),
            PutAuflage => await PutAuflageAsync(client, id, 12),
            _ => throw new ArgumentOutOfRangeException(nameof(endpunkt), endpunkt, null),
        };
    }

    /// <summary>Beobachtbarer Zustand: Ausgaben (inkl. Storno), Audit, Exemplare und Coin-DTO.</summary>
    private async Task<string> ZustandAsync(Kontext k)
    {
        var ausgaben = string.Join(";", await AusgabeDb.AusgabenAsync());
        var audit = (await AusgabeDb.AuditAsync()).Count;
        var exemplare = await AusgabeDb.AnzahlExemplareAsync(k.CoinId);
        using var coin = await Anonym.GetAsync($"{CoinsUrl}/{k.CoinId}");
        return $"{ausgaben}|{audit}|{exemplare}|{await coin.Content.ReadAsStringAsync()}";
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

    // ---------- AK-15: eine Methode je Spalte ----------

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

    // ---------- AK-15: Betrachter erhalten keine Empfängerdaten ----------

    public static TheoryData<string> Betrachter_Endpunkte =>
        [GetExemplare, GetAusgaben, PostAusgaben, PostStorno, PutAuflage, "GET /api/coins/{id}", "GET /api/coins"];

    [Theory]
    [MemberData(nameof(Betrachter_Endpunkte))]
    public async Task Keine_Antwort_an_den_Betrachter_enthaelt_Ausgabedaten(string endpunkt)
    {
        var k = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = endpunkt switch
        {
            "GET /api/coins/{id}" => await betrachter.GetAsync($"{CoinsUrl}/{k.CoinId}"),
            "GET /api/coins" => await betrachter.GetAsync(CoinsUrl),
            _ => await SendeAsync(betrachter, endpunkt, k),
        };
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.All(Testwerte, wert => Assert.DoesNotContain(wert, text));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("deaktiviert")]
    [InlineData("anonym")]
    public async Task Keine_Antwort_an_Rollenlose_Deaktivierte_oder_Anonyme_enthaelt_Ausgabedaten(string? wer)
    {
        var k = await VorbereitenAsync();
        var client = wer switch
        {
            "anonym" => Anonym,
            "deaktiviert" => await ClientMitRolleAsync("Administrator", aktiv: false),
            _ => await ClientMitRolleAsync(null),
        };

        var texte = new List<string>();
        foreach (var endpunkt in new[] { GetExemplare, GetAusgaben, PostAusgaben, PostStorno, PutAuflage })
        {
            using var antwort = await SendeAsync(client, endpunkt, k);
            texte.Add(await antwort.Content.ReadAsStringAsync());
        }

        Assert.All(Testwerte, wert => Assert.DoesNotContain(wert, string.Join("\n", texte)));
    }

    [Fact]
    public async Task Betrachter_sieht_Kennzahlen_und_Status()
    {
        var k = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await betrachter.GetAsync(ExemplareUrl(k.CoinId));
        var json = await JsonAsync(antwort);

        Assert.Equal(1, json.GetProperty("kennzahlen").GetProperty("ausgegeben").GetInt32());
    }

    // ---------- AK-15: 403 vor 404 ----------

    [Theory]
    [InlineData("Betrachter", GetAusgaben)]
    [InlineData("Betrachter", PostAusgaben)]
    [InlineData("Betrachter", PostStorno)]
    [InlineData("Betrachter", PutAuflage)]
    [InlineData(null, GetExemplare)]
    public async Task Unbekannte_Coin_Id_ohne_Recht_liefert_403_statt_404(string? rolle, string endpunkt)
    {
        var k = await VorbereitenAsync();
        var client = await ClientMitRolleAsync(rolle);

        using var antwort = await SendeAsync(client, endpunkt, k, coinId: Guid.NewGuid());

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Anonym_mit_unbekannter_Coin_Id_liefert_401_statt_404()
    {
        var k = await VorbereitenAsync();

        using var antwort = await SendeAsync(Anonym, GetExemplare, k, coinId: Guid.NewGuid());

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_mit_ungueltigem_Body_liefert_403_statt_400()
    {
        var k = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await PostRohAsync(betrachter, AusgabenUrl(k.CoinId), "{}");

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_mit_ungueltigem_Status_Filter_liefert_403_statt_400()
    {
        var k = await VorbereitenAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await betrachter.GetAsync(AusgabenUrl(k.CoinId) + "?status=unsinn");

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    // ---------- ADR-0021 Punkt 7: 403-Texte ----------

    [Theory]
    [InlineData(null, GetExemplare, DetailCoinsRead)]
    [InlineData("Betrachter", GetAusgaben, DetailIssuesRead)]
    [InlineData(null, GetAusgaben, DetailIssuesRead)]
    [InlineData("Betrachter", PostAusgaben, DetailIssuesWrite)]
    [InlineData("Betrachter", PostStorno, DetailIssuesWrite)]
    [InlineData(null, PostStorno, DetailIssuesWrite)]
    [InlineData("Betrachter", PutAuflage, DetailCoinsWrite)]
    public async Task Fehlende_Berechtigung_liefert_403_keine_berechtigung_mit_Text_je_Berechtigung(
        string? rolle, string endpunkt, string detail)
    {
        var k = await VorbereitenAsync();
        var client = await ClientMitRolleAsync(rolle);

        using var antwort = await SendeAsync(client, endpunkt, k);

        var json = await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
        Assert.Equal(detail, json.GetProperty("detail").GetString());
    }

    [Theory]
    [InlineData(GetExemplare)]
    [InlineData(GetAusgaben)]
    [InlineData(PostAusgaben)]
    [InlineData(PostStorno)]
    [InlineData(PutAuflage)]
    public async Task Deaktiviert_liefert_403_benutzer_deaktiviert(string endpunkt)
    {
        var k = await VorbereitenAsync();
        var client = await ClientMitRolleAsync("Administrator", aktiv: false);

        using var antwort = await SendeAsync(client, endpunkt, k);

        var json = await AssertKeinZugriffAsync(antwort, "benutzer_deaktiviert");
        Assert.Equal(DetailDeaktiviert, json.GetProperty("detail").GetString());
    }

    // ---------- Wirkung ohne neues Token ----------

    [Fact]
    public async Task Herabgestufter_Sachbearbeiter_verliert_sofort_den_Zugriff_auf_die_Historie()
    {
        var k = await VorbereitenAsync();
        var konto = await KontoAsync("Sachbearbeiter");
        using (var vorher = await konto.Client.GetAsync(AusgabenUrl(k.CoinId)))
        {
            Assert.Equal(HttpStatusCode.OK, vorher.StatusCode);
        }

        await BenutzerDb.RolleSetzenAsync(konto.Subject, "Betrachter");

        using var nachher = await konto.Client.GetAsync(AusgabenUrl(k.CoinId));
        Assert.Equal(HttpStatusCode.Forbidden, nachher.StatusCode);
    }
}
