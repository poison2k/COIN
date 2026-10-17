using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Ausgaben;

/// <summary>
/// Feature coin-ausgaben, AK-11 bis AK-13: <c>POST /api/coins/{id}/ausgaben/{ausgabeId}/storno</c> – Storno mit
/// Pflichtgrund, Fehlerfälle, kein Lösch- oder Änderungsendpunkt.
/// </summary>
public class AusgabeStornoTests(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    private async Task<(Guid CoinId, Guid AusgabeId)> AusgabeAsync(int auflage = 10, int? nummer = null)
    {
        var coinId = await CoinMitAuflageAsync(auflage);
        var ausgabe = await ErfasseAsync(coinId, nummer);
        return (coinId, ausgabe.GetProperty("id").GetGuid());
    }

    // ---------- AK-11: Erfolg ----------

    [Fact]
    public async Task Storno_liefert_200()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();

        using var antwort = await PostStornoAsync(Client, coinId, ausgabeId, "Falsch erfasst");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Antwort_ist_die_Ausgabe_mit_gefuelltem_storno()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();

        var json = await StornierenAsync(coinId, ausgabeId, "Falsch erfasst");

        Assert.Equal(ausgabeId, json.GetProperty("id").GetGuid());
        Assert.Equal(["am", "grund", "von"], Feldnamen(json.GetProperty("storno")));
    }

    [Fact]
    public async Task Storno_enthaelt_Grund_und_den_angemeldeten_Benutzer()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();
        var konto = await KontoAsync("Sachbearbeiter", name: "Test Stornierer");

        var storno = (await StornierenAsync(coinId, ausgabeId, "  Falsch erfasst  ", konto.Client)).GetProperty("storno");

        Assert.Equal(
            ("Falsch erfasst", konto.Id, "Test Stornierer"),
            (storno.GetProperty("grund").GetString(), storno.GetProperty("von").GetProperty("id").GetGuid(),
                storno.GetProperty("von").GetProperty("name").GetString()));
    }

    [Fact]
    public async Task Storno_am_ist_die_Serverzeit()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();
        var vorher = DateTimeOffset.UtcNow.AddSeconds(-5);

        var am = (await StornierenAsync(coinId, ausgabeId)).GetProperty("storno").GetProperty("am").GetDateTimeOffset();

        Assert.InRange(am, vorher, DateTimeOffset.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task Storno_setzt_die_drei_Spalten_in_der_Datenbank()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();
        var adminId = await AdminIdAsync();

        await StornierenAsync(coinId, ausgabeId, "Falsch erfasst");

        var zeile = Assert.Single(await AusgabeDb.AusgabenAsync());
        Assert.NotNull(zeile.StorniertAm);
        Assert.Equal((adminId, "Falsch erfasst"), (zeile.StorniertVon, zeile.StornoGrund));
    }

    [Fact]
    public async Task Storno_laesst_die_Angaben_der_Ausgabe_unveraendert()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var vorher = await ErfasseAsync(coinId);

        var nachher = await StornierenAsync(coinId, vorher.GetProperty("id").GetGuid());

        // zertifikat-erzeugen (AK-5): auch die Zertifikatsnummer bleibt beim Storno unverändert.
        foreach (var feld in new[] { "id", "exemplarNummer", "zertifikatsnummer", "empfaenger", "datum", "gelegenheit", "begruendung", "ausgebendeStelle", "erfasstAm", "erfasstVon" })
        {
            Assert.Equal(vorher.GetProperty(feld).GetRawText(), nachher.GetProperty(feld).GetRawText());
        }
    }

    [Fact]
    public async Task Nach_dem_Storno_ist_das_Exemplar_verfuegbar_und_erneut_ausgebbar()
    {
        var (coinId, ausgabeId) = await AusgabeAsync(nummer: 4);
        await StornierenAsync(coinId, ausgabeId);

        var neu = await ErfasseAsync(coinId, 4);

        Assert.Equal(4, neu.GetProperty("exemplarNummer").GetInt32());
    }

    [Fact]
    public async Task Die_stornierte_Ausgabe_bleibt_in_der_Historie()
    {
        var (coinId, ausgabeId) = await AusgabeAsync(nummer: 4);
        await StornierenAsync(coinId, ausgabeId);
        await ErfasseAsync(coinId, 4);

        var ids = (await HistorieAsync(coinId)).GetProperty("eintraege").EnumerateArray().Select(e => e.GetProperty("id").GetGuid());

        Assert.Contains(ausgabeId, ids);
    }

    [Fact]
    public async Task Storno_traegt_Cache_Control_no_store()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();

        using var antwort = await PostStornoAsync(Client, coinId, ausgabeId, "Grund");

        Assert.True(antwort.Headers.CacheControl?.NoStore, $"Cache-Control: {antwort.Headers.CacheControl}");
    }

    // ---------- AK-12: Fehler ----------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Fehlender_Grund_liefert_400(string? grund)
    {
        var (coinId, ausgabeId) = await AusgabeAsync();

        using var antwort = await PostStornoAsync(Client, coinId, ausgabeId, grund);

        Assert.Equal(["Bitte einen Grund für das Storno angeben."], await FehlerZuFeldAsync(antwort, "grund"));
    }

    [Fact]
    public async Task Grund_mit_501_Zeichen_liefert_400()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();

        using var antwort = await PostStornoAsync(Client, coinId, ausgabeId, new string('g', 501));

        Assert.Equal(["Der Grund darf höchstens 500 Zeichen lang sein."], await FehlerZuFeldAsync(antwort, "grund"));
    }

    [Fact]
    public async Task Grund_mit_500_Zeichen_ist_gueltig()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();

        using var antwort = await PostStornoAsync(Client, coinId, ausgabeId, new string('g', 500));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Ungueltiger_Grund_storniert_nicht()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();

        using var antwort = await PostStornoAsync(Client, coinId, ausgabeId, "");

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        Assert.Null(Assert.Single(await AusgabeDb.AusgabenAsync()).StorniertAm);
    }

    [Fact]
    public async Task Kein_JSON_liefert_400_mit_errors_anfrage()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();

        using var antwort = await PostRohAsync(Client, StornoUrl(coinId, ausgabeId), "{ \"grund\": ");

        Assert.NotEmpty(await FehlerZuFeldAsync(antwort, "anfrage"));
    }

    [Fact]
    public async Task Ohne_JSON_Content_Type_liefert_415()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();

        using var antwort = await Client.PostAsync(StornoUrl(coinId, ausgabeId), new StringContent("grund=x", Encoding.UTF8, "text/plain"));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.UnsupportedMediaType);
    }

    [Fact]
    public async Task Unbekannte_Ausgabe_liefert_404_Ausgabe_nicht_gefunden()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostStornoAsync(Client, coinId, Guid.NewGuid(), "Grund");

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Ausgabe nicht gefunden", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Unbekannter_Coin_liefert_404_Ausgabe_nicht_gefunden()
    {
        var (_, ausgabeId) = await AusgabeAsync();

        using var antwort = await PostStornoAsync(Client, Guid.NewGuid(), ausgabeId, "Grund");

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Ausgabe nicht gefunden", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Ausgabe_eines_anderen_Coins_liefert_404_und_storniert_nicht()
    {
        var (_, ausgabeId) = await AusgabeAsync();
        var andererCoin = await CoinMitAuflageAsync(10);

        using var antwort = await PostStornoAsync(Client, andererCoin, ausgabeId, "Grund");

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
        Assert.Null(Assert.Single(await AusgabeDb.AusgabenAsync()).StorniertAm);
    }

    [Fact]
    public async Task AusgabeId_ohne_GUID_Format_liefert_404()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await Client.PostAsJsonAsync($"{AusgabenUrl(coinId)}/keine-guid/storno", new { grund = "Grund" });

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Fact]
    public async Task Zweites_Storno_liefert_409_bereits_storniert()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();
        await StornierenAsync(coinId, ausgabeId, "Erster Grund");

        using var antwort = await PostStornoAsync(Client, coinId, ausgabeId, "Zweiter Grund");

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.Conflict);
        Assert.Equal(
            ("bereits_storniert", "Diese Ausgabe ist bereits storniert."),
            (json.GetProperty("code").GetString(), json.GetProperty("detail").GetString()));
    }

    [Fact]
    public async Task Zweites_Storno_aendert_das_erste_nicht()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();
        await StornierenAsync(coinId, ausgabeId, "Erster Grund");

        using var antwort = await PostStornoAsync(Client, coinId, ausgabeId, "Zweiter Grund");

        Assert.Equal("Erster Grund", Assert.Single(await AusgabeDb.AusgabenAsync()).StornoGrund);
    }

    [Fact]
    public async Task Storno_Fehler_enthalten_keine_Empfaengerdaten()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var ausgabe = await ErfasseAsync(coinId, empfaengerName: "Test Empfaenger Storno 1234");
        var ausgabeId = ausgabe.GetProperty("id").GetGuid();
        await StornierenAsync(coinId, ausgabeId, "Erster Grund");

        using var antwort = await PostStornoAsync(Client, coinId, ausgabeId, "Zweiter Grund");

        Assert.DoesNotContain("Test Empfaenger Storno 1234", await antwort.Content.ReadAsStringAsync());
    }

    // ---------- AK-13: kein DELETE- oder PUT-Endpunkt ----------

    [Fact]
    public async Task DELETE_auf_eine_Ausgabe_ist_nicht_moeglich()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();

        using var antwort = await Client.DeleteAsync($"{AusgabenUrl(coinId)}/{ausgabeId}");

        Assert.Contains(antwort.StatusCode, new[] { HttpStatusCode.NotFound, HttpStatusCode.MethodNotAllowed });
        Assert.Single(await AusgabeDb.AusgabenAsync());
    }

    [Fact]
    public async Task PUT_auf_eine_Ausgabe_ist_nicht_moeglich()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();

        using var antwort = await Client.PutAsJsonAsync($"{AusgabenUrl(coinId)}/{ausgabeId}", GueltigeAusgabe(empfaengerName: "Test Geaendert"));

        Assert.Contains(antwort.StatusCode, new[] { HttpStatusCode.NotFound, HttpStatusCode.MethodNotAllowed });
        Assert.Equal("Max Beispiel", Assert.Single(await AusgabeDb.AusgabenAsync()).EmpfaengerName);
    }

    // zertifikat-erzeugen (AK-22): Der Einzelabruf GET …/ausgaben/{ausgabeId} ist jetzt vorgesehen; abgedeckt in
    // ZertifikatDownloadTests (Format, 404) und ZertifikatRechteTests (Rollen, 403 vor 404).

    [Fact]
    public async Task Storno_Antwort_ist_JSON_der_Ausgabe()
    {
        var (coinId, ausgabeId) = await AusgabeAsync();

        var json = await StornierenAsync(coinId, ausgabeId);

        Assert.Equal(JsonValueKind.Object, json.GetProperty("empfaenger").ValueKind);
    }
}
