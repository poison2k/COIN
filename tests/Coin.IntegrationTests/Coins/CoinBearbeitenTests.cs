using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Coin.IntegrationTests.Ausgaben;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Coins;

/// <summary>
/// Feature zertifikatsvorlagen, AK-22 und AK-23 (ADR-0025, F1–F4): <c>PUT /api/coins/{id}</c> ersetzt die Stammdaten;
/// Auflage nach derselben Regel wie <c>PUT …/auflage</c>; Duplikate mit <c>coin_existiert</c>; kein Audit.
/// </summary>
public class CoinBearbeitenTests(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    private static string CoinUrl(Guid id) => $"{CoinsUrl}/{id}";

    private Task<HttpResponseMessage> PutCoinAsync(Guid id, object body) => Client.PutAsJsonAsync(CoinUrl(id), body);

    private static object Body(string? name = "Coin Neu", string? herausgeber = "Herausgeber Neu", int? auflage = null, string? beschreibung = null) =>
        new { name, herausgeber, auflage, beschreibung };

    private async Task<JsonElement> DetailAsync(Guid id)
    {
        using var antwort = await Anonym.GetAsync(CoinUrl(id));
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        return await JsonAsync(antwort);
    }

    private static async Task AssertDuplikatAsync(HttpResponseMessage antwort)
    {
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.Conflict);
        Assert.Equal("Coin existiert bereits", json.GetProperty("title").GetString());
        Assert.Equal("Ein Coin mit diesem Namen und Herausgeber existiert bereits.", json.GetProperty("detail").GetString());
        Assert.Equal("coin_existiert", json.GetProperty("code").GetString());
    }

    // ---------- Erfolg ----------

    [Fact]
    public async Task Bearbeiten_liefert_200_mit_dem_Coin_in_sieben_Feldern()
    {
        var id = await CoinMitAuflageAsync(10, "Coin Alt");

        using var antwort = await PutCoinAsync(id, Body("Coin Neu", "Herausgeber Neu", 10, "Neue Beschreibung"));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(["auflage", "beschreibung", "bildUrl", "erstelltAm", "herausgeber", "id", "name"], Feldnamen(await JsonAsync(antwort)));
    }

    [Fact]
    public async Task Bearbeiten_ersetzt_Name_Herausgeber_und_Beschreibung()
    {
        var id = await CoinMitAuflageAsync(10, "Coin Alt");

        using (await PutCoinAsync(id, Body("Coin Neu", "Herausgeber Neu", 10, "Neue Beschreibung")))
        {
        }

        var coin = await DetailAsync(id);
        Assert.Equal(
            ("Coin Neu", "Herausgeber Neu", "Neue Beschreibung"),
            (coin.GetProperty("name").GetString(), coin.GetProperty("herausgeber").GetString(), coin.GetProperty("beschreibung").GetString()));
    }

    [Fact]
    public async Task Bearbeiten_trimmt_die_Werte()
    {
        var id = await CoinMitAuflageAsync(null, "Coin Alt");

        using var antwort = await PutCoinAsync(id, Body("  Coin Getrimmt ", " Herausgeber Getrimmt  ", null, "  Text  "));
        var coin = await JsonAsync(antwort);

        Assert.Equal(
            ("Coin Getrimmt", "Herausgeber Getrimmt", "Text"),
            (coin.GetProperty("name").GetString(), coin.GetProperty("herausgeber").GetString(), coin.GetProperty("beschreibung").GetString()));
    }

    [Fact]
    public async Task Leere_Beschreibung_wird_null()
    {
        var id = await CoinMitAuflageAsync(null);
        using (await PutCoinAsync(id, Body(beschreibung: "Vorher")))
        {
        }

        using var antwort = await PutCoinAsync(id, Body(beschreibung: "   "));

        Assert.Equal(JsonValueKind.Null, (await JsonAsync(antwort)).GetProperty("beschreibung").ValueKind);
    }

    [Fact]
    public async Task Id_erstelltAm_und_bildUrl_im_Body_werden_ignoriert()
    {
        var id = await CoinMitAuflageAsync(null, "Coin Ignorieren");
        await LadeBildHochAsync(id, Testbilder.Png(300));
        var vorher = await DetailAsync(id);

        using var antwort = await PutRohAsync(Client, CoinUrl(id),
            $$"""{ "id": "{{Guid.NewGuid()}}", "erstelltAm": "2000-01-01T00:00:00Z", "bildUrl": "/fremd", "name": "Coin Ignorieren", "herausgeber": "Herausgeber Beta", "auflage": null, "beschreibung": null }""");
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);

        var nachher = await DetailAsync(id);
        Assert.Equal(
            (vorher.GetProperty("id").GetGuid(), vorher.GetProperty("erstelltAm").GetString(), vorher.GetProperty("bildUrl").GetString()),
            (nachher.GetProperty("id").GetGuid(), nachher.GetProperty("erstelltAm").GetString(), nachher.GetProperty("bildUrl").GetString()));
    }

    [Fact]
    public async Task Unveraenderte_Werte_liefern_200()
    {
        var id = await CoinMitAuflageAsync(5, "Coin Gleich");
        var vorher = await DetailAsync(id);

        using var antwort = await PutCoinAsync(id, Body("Coin Gleich", "Herausgeber Beta", 5, null));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(vorher.ToString(), (await DetailAsync(id)).ToString());
    }

    [Fact]
    public async Task Eigenen_Namen_nur_in_der_Schreibweise_aendern_ist_kein_Duplikat()
    {
        var id = await CoinMitAuflageAsync(null, "Coin Schreibweise");

        using var antwort = await PutCoinAsync(id, Body("COIN SCHREIBWEISE", "Herausgeber Beta"));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("COIN SCHREIBWEISE", (await JsonAsync(antwort)).GetProperty("name").GetString());
    }

    [Fact]
    public async Task Motivbild_bleibt_beim_Bearbeiten_erhalten()
    {
        var id = await CoinMitAuflageAsync(null);
        var bildUrl = (await LadeBildHochAsync(id, Testbilder.Png(400))).GetProperty("bildUrl").GetString();

        using var antwort = await PutCoinAsync(id, Body());

        Assert.Equal(bildUrl, (await JsonAsync(antwort)).GetProperty("bildUrl").GetString());
    }

    // ---------- 400 ----------

    public static TheoryData<string, string, string> Feldfehler => new()
    {
        { "name", """{ "name": "", "herausgeber": "H" }""", "Name ist erforderlich." },
        { "name", $$"""{ "name": "{{new string('n', 201)}}", "herausgeber": "H" }""", "Name darf höchstens 200 Zeichen lang sein." },
        { "herausgeber", """{ "name": "N", "herausgeber": "   " }""", "Herausgeber ist erforderlich." },
        { "herausgeber", $$"""{ "name": "N", "herausgeber": "{{new string('h', 201)}}" }""", "Herausgeber darf höchstens 200 Zeichen lang sein." },
        { "auflage", """{ "name": "N", "herausgeber": "H", "auflage": 0 }""", "Auflage muss zwischen 1 und 1000000 liegen." },
        { "auflage", """{ "name": "N", "herausgeber": "H", "auflage": 1000001 }""", "Auflage muss zwischen 1 und 1000000 liegen." },
        { "beschreibung", $$"""{ "name": "N", "herausgeber": "H", "beschreibung": "{{new string('b', 2001)}}" }""", "Beschreibung darf höchstens 2000 Zeichen lang sein." },
    };

    [Theory]
    [MemberData(nameof(Feldfehler))]
    public async Task Ungueltiges_Feld_liefert_400_mit_der_Meldung_wie_beim_Anlegen(string feld, string json, string meldung)
    {
        var id = await CoinMitAuflageAsync(null);

        using var antwort = await PutRohAsync(Client, CoinUrl(id), json);

        Assert.Equal([meldung], await FehlerZuFeldAsync(antwort, feld));
    }

    [Fact]
    public async Task Leerer_Body_liefert_400_fuer_Name_und_Herausgeber()
    {
        var id = await CoinMitAuflageAsync(null);

        using var antwort = await PutRohAsync(Client, CoinUrl(id), "{}");

        Assert.Equal(["herausgeber", "name"], await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task Kaputtes_JSON_liefert_400()
    {
        var id = await CoinMitAuflageAsync(null);

        using var antwort = await PutRohAsync(Client, CoinUrl(id), "{ \"name\": ");

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Auflage_null_bei_gesetzter_Auflage_liefert_400_Auflage_ist_erforderlich()
    {
        var id = await CoinMitAuflageAsync(10);

        using var antwort = await PutCoinAsync(id, Body(auflage: null));

        Assert.Equal(["Auflage ist erforderlich."], await FehlerZuFeldAsync(antwort, "auflage"));
    }

    [Fact]
    public async Task Auflage_null_ohne_bisherige_Auflage_ist_erlaubt()
    {
        var id = await CoinMitAuflageAsync(null);

        using var antwort = await PutCoinAsync(id, Body(auflage: null));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await JsonAsync(antwort)).GetProperty("auflage").ValueKind);
    }

    [Fact]
    public async Task Fehlerhafte_Eingaben_speichern_nichts()
    {
        var id = await CoinMitAuflageAsync(10, "Coin Bleibt");
        var vorher = await DetailAsync(id);

        using (var antwort = await PutRohAsync(Client, CoinUrl(id), """{ "name": "Coin Geaendert", "herausgeber": "" }"""))
        {
            Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        }

        Assert.Equal(vorher.ToString(), (await DetailAsync(id)).ToString());
    }

    [Fact]
    public async Task Text_statt_JSON_liefert_415()
    {
        var id = await CoinMitAuflageAsync(null);

        using var antwort = await Client.PutAsync(CoinUrl(id), new StringContent("name=x", Encoding.UTF8, "text/plain"));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.UnsupportedMediaType);
    }

    // ---------- 404 ----------

    [Fact]
    public async Task Unbekannter_Coin_liefert_404_Coin_nicht_gefunden()
    {
        using var antwort = await PutCoinAsync(Guid.NewGuid(), Body());

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Coin nicht gefunden", json.GetProperty("title").GetString());
    }

    // ---------- Auflage (F1, gleiche Regel wie PUT …/auflage) ----------

    [Fact]
    public async Task Erhoehung_der_Auflage_erzeugt_die_Exemplare()
    {
        var id = await CoinMitAuflageAsync(3);

        using var antwort = await PutCoinAsync(id, Body(auflage: 6));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal([1, 2, 3, 4, 5, 6], await AusgabeDb.ExemplarNummernAsync(id));
    }

    [Fact]
    public async Task Erste_Auflage_fuer_einen_Coin_ohne_Auflage_erzeugt_die_Exemplare()
    {
        var id = await CoinMitAuflageAsync(null);

        using var antwort = await PutCoinAsync(id, Body(auflage: 4));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal([1, 2, 3, 4], await AusgabeDb.ExemplarNummernAsync(id));
    }

    [Fact]
    public async Task Senkung_ohne_Ausgaben_loescht_die_Exemplare_ueber_der_neuen_Auflage()
    {
        var id = await CoinMitAuflageAsync(10);

        using var antwort = await PutCoinAsync(id, Body(auflage: 4));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal([1, 2, 3, 4], await AusgabeDb.ExemplarNummernAsync(id));
    }

    [Fact]
    public async Task Senkung_unter_ein_storniertes_Exemplar_liefert_409_auflage_zu_klein()
    {
        var id = await CoinMitAuflageAsync(10);
        var ausgabe = await ErfasseAsync(id, 7);
        await StornierenAsync(id, ausgabe.GetProperty("id").GetGuid());

        using var antwort = await PutCoinAsync(id, Body(auflage: 6));

        var json = await AssertKonfliktAsync(antwort, "auflage_zu_klein");
        Assert.Equal("Die Auflage kann nicht unter 7 gesenkt werden, weil Exemplar Nr. 7 ausgegeben wurde.", json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Senkung_bis_auf_ein_storniertes_Exemplar_ist_erlaubt()
    {
        var id = await CoinMitAuflageAsync(10);
        var ausgabe = await ErfasseAsync(id, 7);
        await StornierenAsync(id, ausgabe.GetProperty("id").GetGuid());

        using var antwort = await PutCoinAsync(id, Body(auflage: 7));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(Enumerable.Range(1, 7), await AusgabeDb.ExemplarNummernAsync(id));
    }

    [Fact]
    public async Task Abgelehnte_Senkung_speichert_auch_die_uebrigen_Stammdaten_nicht()
    {
        var id = await CoinMitAuflageAsync(10, "Coin Unveraendert");
        await ErfasseAsync(id, 9);
        var vorher = await DetailAsync(id);

        using (var antwort = await PutCoinAsync(id, Body("Coin Anderer Name", "Herausgeber Beta", 3)))
        {
            Assert.Equal(HttpStatusCode.Conflict, antwort.StatusCode);
        }

        Assert.Equal(vorher.ToString(), (await DetailAsync(id)).ToString());
        Assert.Equal(10, await AusgabeDb.AnzahlExemplareAsync(id));
    }

    // ---------- Duplikat ----------

    [Fact]
    public async Task Name_und_Herausgeber_eines_anderen_Coins_liefern_409_coin_existiert()
    {
        await LegeCoinAnAsync("Coin Vorhanden", "Herausgeber Vorhanden");
        var id = await CoinMitAuflageAsync(null, "Coin Eigener");

        using var antwort = await PutCoinAsync(id, Body("Coin Vorhanden", "Herausgeber Vorhanden"));

        await AssertDuplikatAsync(antwort);
    }

    [Fact]
    public async Task Duplikat_wird_ohne_Gross_und_Kleinschreibung_und_nach_dem_Trimmen_erkannt()
    {
        await LegeCoinAnAsync("Coin Vorhanden", "Herausgeber Vorhanden");
        var id = await CoinMitAuflageAsync(null, "Coin Eigener");

        using var antwort = await PutCoinAsync(id, Body("  coin VORHANDEN ", "herausgeber vorhanden "));

        await AssertDuplikatAsync(antwort);
    }

    [Fact]
    public async Task Duplikat_speichert_nichts()
    {
        await LegeCoinAnAsync("Coin Vorhanden", "Herausgeber Vorhanden");
        var id = await CoinMitAuflageAsync(null, "Coin Eigener");
        var vorher = await DetailAsync(id);

        using (await PutCoinAsync(id, Body("Coin Vorhanden", "Herausgeber Vorhanden", beschreibung: "Neu")))
        {
        }

        Assert.Equal(vorher.ToString(), (await DetailAsync(id)).ToString());
    }

    [Fact]
    public async Task Gleichzeitige_Umbenennung_zweier_Coins_auf_denselben_Namen_liefert_einmal_409_nie_500()
    {
        var a = await CoinMitAuflageAsync(null, "Coin Parallel A");
        var b = await CoinMitAuflageAsync(null, "Coin Parallel B");

        var antworten = await Task.WhenAll(
            PutCoinAsync(a, Body("Coin Parallel Ziel", "Herausgeber Parallel")),
            PutCoinAsync(b, Body("Coin Parallel Ziel", "Herausgeber Parallel")));
        var status = antworten.Select(r => (int)r.StatusCode).Order().ToArray();
        foreach (var antwort in antworten)
        {
            antwort.Dispose();
        }

        Assert.Equal([200, 409], status);
    }

    // ---------- Reihenfolge ----------

    [Fact]
    public async Task Ungueltiger_Body_kommt_vor_404()
    {
        using var antwort = await PutRohAsync(Client, CoinUrl(Guid.NewGuid()), """{ "name": "", "herausgeber": "" }""");

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
    }

    [Fact]
    public async Task Unbekannter_Coin_mit_Auflage_null_liefert_404()
    {
        using var antwort = await PutCoinAsync(Guid.NewGuid(), Body(auflage: null));

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Fact]
    public async Task Auflage_null_kommt_vor_dem_Duplikat()
    {
        await LegeCoinAnAsync("Coin Vorhanden", "Herausgeber Vorhanden");
        var id = await CoinMitAuflageAsync(10, "Coin Eigener");

        using var antwort = await PutCoinAsync(id, Body("Coin Vorhanden", "Herausgeber Vorhanden", null));

        Assert.Equal(["Auflage ist erforderlich."], await FehlerZuFeldAsync(antwort, "auflage"));
    }

    [Fact]
    public async Task Duplikat_kommt_vor_auflage_zu_klein()
    {
        await LegeCoinAnAsync("Coin Vorhanden", "Herausgeber Vorhanden");
        var id = await CoinMitAuflageAsync(10, "Coin Eigener");
        await ErfasseAsync(id, 9);

        using var antwort = await PutCoinAsync(id, Body("Coin Vorhanden", "Herausgeber Vorhanden", 3));

        await AssertDuplikatAsync(antwort);
    }

    // ---------- F3: kein Audit, AK-23: PUT …/auflage bleibt ----------

    [Fact]
    public async Task Bearbeiten_schreibt_kein_Audit()
    {
        var id = await CoinMitAuflageAsync(10);
        var vorher = (await AuditDb.AnzahlAsync(), (await AusgabeDb.AuditAsync()).Count);

        using (await PutCoinAsync(id, Body("Coin Ohne Audit", "Herausgeber Ohne Audit", 12, "Text")))
        {
        }

        Assert.Equal(vorher, (await AuditDb.AnzahlAsync(), (await AusgabeDb.AuditAsync()).Count));
    }

    [Fact]
    public async Task PUT_auflage_funktioniert_weiterhin()
    {
        var id = await CoinMitAuflageAsync(3);

        using var antwort = await PutAuflageAsync(Client, id, 5);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal([1, 2, 3, 4, 5], await AusgabeDb.ExemplarNummernAsync(id));
    }

    [Fact]
    public async Task Sachbearbeiter_darf_bearbeiten()
    {
        var id = await CoinMitAuflageAsync(null);
        var sachbearbeiter = await ClientMitRolleAsync("Sachbearbeiter");

        using var antwort = await sachbearbeiter.PutAsJsonAsync(CoinUrl(id), Body());

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }
}
