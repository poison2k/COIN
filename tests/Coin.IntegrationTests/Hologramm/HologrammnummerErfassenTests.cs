using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Hologramm;

/// <summary>
/// Feature hologrammnummer, AK-5 bis AK-8 und AK-14: <c>POST /api/coins/{id}/ausgaben</c> mit dem optionalen Feld
/// <c>hologrammnummer</c> – Anzeigeform in der Antwort, Speichern samt Audit <c>Gesetzt</c> in einer Transaktion,
/// Validierung gemeinsam mit den anderen Feldern, <c>409 hologrammnummer_vergeben</c> über alle Coins und auch für
/// stornierte Ausgaben, Prüfreihenfolge; <c>hologrammnummer</c> in allen Ausgabe-Antworten.
/// </summary>
public class HologrammnummerErfassenTests(PostgresFixture fixture) : HologrammTestBasis(fixture)
{
    // ---------- AK-5: Erfolg ----------

    [Fact]
    public async Task Erfassen_mit_Nummer_liefert_201_mit_der_Anzeigeform()
    {
        var coinId = await CoinMitAuflageAsync(10);

        var ausgabe = await ErfasseMitNummerAsync(coinId, "ab 12-34");

        Assert.Equal("AB 12-34", ausgabe.Hologrammnummer);
    }

    [Fact]
    public async Task Erfassen_ohne_Feld_hologrammnummer_liefert_hologrammnummer_null()
    {
        var coinId = await CoinMitAuflageAsync(10);

        var json = await ErfasseAsync(coinId);

        Assert.True(json.TryGetProperty("hologrammnummer", out var nummer), "Antwort ohne Feld hologrammnummer (AK-14).");
        Assert.Equal(JsonValueKind.Null, nummer.ValueKind);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Erfassen_mit_leerer_Nummer_liefert_hologrammnummer_null(string? eingabe)
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinId, AusgabeMit(eingabe));

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await JsonAsync(antwort)).GetProperty("hologrammnummer").ValueKind);
    }

    [Fact]
    public async Task Erfassen_mit_leerer_Nummer_legt_keine_Zuordnung_und_kein_Hologramm_Audit_an()
    {
        var coinId = await CoinMitAuflageAsync(10);

        await ErfasseMitNummerAsync(coinId, "   ");

        Assert.Equal((0, 0), ((await HologrammDb.ZeilenAsync()).Count, (await HologrammDb.AuditAsync()).Count));
    }

    [Fact]
    public async Task Erfassen_speichert_die_Anzeigeform_und_die_Normalform()
    {
        var coinId = await CoinMitAuflageAsync(10);

        var ausgabe = await ErfasseMitNummerAsync(coinId, "ab 12-34");

        var zeile = Assert.Single(await HologrammDb.ZeilenAsync(ausgabe.AusgabeId));
        Assert.Equal(("AB 12-34", "AB1234", (DateTimeOffset?)null), (zeile.Nummer, zeile.NummerNormalisiert, zeile.AbgeloestAm));
    }

    [Fact]
    public async Task Gesetzt_von_ist_der_angemeldete_Benutzer()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var konto = await KontoAsync("Sachbearbeiter");

        var ausgabe = await ErfasseMitNummerAsync(coinId, "AB1234", client: konto.Client);

        Assert.Equal(konto.Id, Assert.Single(await HologrammDb.ZeilenAsync(ausgabe.AusgabeId)).GesetztVon);
    }

    [Fact]
    public async Task Erfassen_mit_Nummer_schreibt_ein_Hologramm_Audit_Gesetzt()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var adminId = await AdminIdAsync();

        var ausgabe = await ErfasseMitNummerAsync(coinId, "ab 12-34");

        var audit = Assert.Single(await HologrammDb.AuditAsync());
        Assert.Equal(
            ("Gesetzt", (string?)null, "AB1234", (string?)null, ausgabe.AusgabeId, coinId, adminId),
            (audit.Art, audit.NummerAlt, audit.NummerNeu, audit.Grund, audit.AusgabeId, audit.CoinId, audit.AkteurId));
    }

    [Fact]
    public async Task Erfassen_mit_Nummer_schreibt_weiterhin_das_Ausgabe_Audit_Erfasst()
    {
        var coinId = await CoinMitAuflageAsync(10);

        await ErfasseMitNummerAsync(coinId, "AB1234");

        Assert.Equal(["Erfasst"], (await AusgabeDb.AuditAsync()).Select(z => z.Art));
    }

    [Fact]
    public async Task Scheitert_das_Ausgabe_Audit_entsteht_auch_keine_Zuordnung()
    {
        var coinId = await CoinMitAuflageAsync(10);
        await AdminIdAsync();
        await using (await AusgabeDb.AuditEinfuegenScheitertAsync())
        {
            using var antwort = await PostAusgabeAsync(coinId, AusgabeMit("AB1234"));
            Assert.Equal(HttpStatusCode.InternalServerError, antwort.StatusCode);
        }

        Assert.Equal((0, 0, 0), ((await AusgabeDb.AusgabenAsync()).Count, (await HologrammDb.ZeilenAsync()).Count, (await HologrammDb.AuditAsync()).Count));
    }

    // ---------- AK-6: Validierung ----------

    [Theory]
    [InlineData("AB/1234", MeldungZeichen)]
    [InlineData("AB.1234", MeldungZeichen)]
    [InlineData("--", MeldungNurTrenner)]
    public async Task Ungueltige_Nummer_liefert_400_mit_der_Meldung_am_Feld_hologrammnummer(string eingabe, string meldung)
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinId, AusgabeMit(eingabe));

        Assert.Equal([meldung], await FehlerZuFeldAsync(antwort, "hologrammnummer"));
    }

    [Fact]
    public async Task Nummer_mit_41_Zeichen_liefert_den_Laengenfehler()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinId, AusgabeMit(new string('A', 41)));

        Assert.Equal([MeldungLaenge], await FehlerZuFeldAsync(antwort, "hologrammnummer"));
    }

    [Fact]
    public async Task Nummer_mit_mehr_als_200_Zeichen_roh_liefert_den_Laengenfehler()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinId, AusgabeMit(new string(' ', 201) + "A"));

        Assert.Equal([MeldungLaenge], await FehlerZuFeldAsync(antwort, "hologrammnummer"));
    }

    [Fact]
    public async Task Nummernfehler_erscheint_gemeinsam_mit_den_anderen_Feldfehlern()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var body = AusgabeMit("AB/1");
        body["empfaengerName"] = "";
        body["gelegenheit"] = null;

        using var antwort = await PostAusgabeAsync(coinId, body);

        Assert.Equal(["empfaengerName", "gelegenheit", "hologrammnummer"], await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task Nummer_als_Zahl_statt_Text_liefert_400()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var body = GueltigeAusgabe();
        body["hologrammnummer"] = 1234;

        using var antwort = await PostAusgabeAsync(coinId, body);

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
    }

    [Fact]
    public async Task Ungueltige_Nummer_legt_keine_Ausgabe_an()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using (await PostAusgabeAsync(coinId, AusgabeMit("AB/1")))
        {
        }

        Assert.Empty(await AusgabeDb.AusgabenAsync());
    }

    // ---------- AK-7: vergeben ----------

    [Fact]
    public async Task Vergebene_Nummer_in_anderer_Schreibweise_bei_anderem_Coin_liefert_409_hologrammnummer_vergeben()
    {
        await NeueAusgabeAsync("AB1234");
        var coinB = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinB, AusgabeMit("ab 12-34"));

        await AssertKonfliktAsync(antwort, TitelErfassen, "hologrammnummer_vergeben", DetailVergeben);
    }

    [Fact]
    public async Task Vergebene_Nummer_beim_selben_Coin_liefert_409_hologrammnummer_vergeben()
    {
        var erste = await NeueAusgabeAsync("AB1234");

        using var antwort = await PostAusgabeAsync(erste.CoinId, AusgabeMit("AB-12-34"));

        Assert.Equal("hologrammnummer_vergeben", await CodeAsync(antwort));
    }

    [Fact]
    public async Task Nummer_einer_stornierten_Ausgabe_liefert_409_hologrammnummer_vergeben()
    {
        var erste = await NeueAusgabeAsync("AB1234");
        await StornierenAsync(erste.CoinId, erste.AusgabeId);
        var coinB = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinB, AusgabeMit("AB1234"));

        Assert.Equal((HttpStatusCode.Conflict, "hologrammnummer_vergeben"), (antwort.StatusCode, await CodeAsync(antwort)));
    }

    [Fact]
    public async Task Konfliktantwort_nennt_weder_Empfaenger_noch_Coin_noch_Ausgabe()
    {
        var coinA = await CoinMitAuflageAsync(10, "Test Coin Vergeben Kx41");
        using (var erste = await PostAusgabeAsync(coinA, AusgabeMit("AB1234", empfaengerName: "Test Empfaenger Kx42")))
        {
            Assert.Equal(HttpStatusCode.Created, erste.StatusCode);
        }

        var coinB = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinB, AusgabeMit("AB1234"));
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, antwort.StatusCode);
        Assert.DoesNotContain("Kx4", text, StringComparison.Ordinal);
        Assert.DoesNotContain(coinA.ToString(), text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain((await AusgabeDb.AusgabenAsync()).Single().Id.ToString(), text, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Bei_vergebener_Nummer_entsteht_keine_Ausgabe()
    {
        await NeueAusgabeAsync("AB1234");
        var coinB = await CoinMitAuflageAsync(10);

        using (await PostAusgabeAsync(coinB, AusgabeMit("ab 12-34")))
        {
        }

        Assert.DoesNotContain(await AusgabeDb.AusgabenAsync(), a => a.CoinId == coinB);
    }

    [Fact]
    public async Task Bei_vergebener_Nummer_entsteht_kein_Audit()
    {
        await NeueAusgabeAsync("AB1234");
        var coinB = await CoinMitAuflageAsync(10);

        using (await PostAusgabeAsync(coinB, AusgabeMit("ab 12-34")))
        {
        }

        Assert.Equal((1, 1), ((await AusgabeDb.AuditAsync()).Count, (await HologrammDb.AuditAsync()).Count));
    }

    [Fact]
    public async Task Bei_vergebener_Nummer_bleibt_das_Exemplar_verfuegbar()
    {
        await NeueAusgabeAsync("AB1234");
        var coinB = await CoinMitAuflageAsync(10);

        using (await PostAusgabeAsync(coinB, AusgabeMit("ab 12-34", exemplarNummer: 3)))
        {
        }

        Assert.Equal((10, 0, 10), await KennzahlenAsync(coinB));
    }

    [Fact]
    public async Task Nach_vergebener_Nummer_gelingt_dasselbe_Exemplar_mit_einer_anderen_Nummer()
    {
        await NeueAusgabeAsync("AB1234");
        var coinB = await CoinMitAuflageAsync(10);
        using (await PostAusgabeAsync(coinB, AusgabeMit("AB1234", exemplarNummer: 3)))
        {
        }

        var zweite = await ErfasseMitNummerAsync(coinB, "CD5678", exemplarNummer: 3);

        Assert.Equal((3, "CD5678"), (zweite.ExemplarNummer, zweite.Hologrammnummer));
    }

    // ---------- AK-8: Reihenfolge ----------

    [Fact]
    public async Task Ungueltige_Nummer_geht_dem_unbekannten_Coin_vor()
    {
        using var antwort = await PostAusgabeAsync(Guid.NewGuid(), AusgabeMit("AB/1"));

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
    }

    [Fact]
    public async Task Unbekannter_Coin_geht_der_vergebenen_Nummer_vor()
    {
        await NeueAusgabeAsync("AB1234");

        using var antwort = await PostAusgabeAsync(Guid.NewGuid(), AusgabeMit("AB1234"));

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Fact]
    public async Task Unbekannte_Auflage_geht_der_vergebenen_Nummer_vor()
    {
        await NeueAusgabeAsync("AB1234");
        var ohneAuflage = await CoinMitAuflageAsync(null);

        using var antwort = await PostAusgabeAsync(ohneAuflage, AusgabeMit("AB1234"));

        Assert.Equal("auflage_unbekannt", await CodeAsync(antwort));
    }

    [Fact]
    public async Task Exemplar_ausserhalb_der_Auflage_geht_der_vergebenen_Nummer_vor()
    {
        await NeueAusgabeAsync("AB1234");
        var coinB = await CoinMitAuflageAsync(5);

        using var antwort = await PostAusgabeAsync(coinB, AusgabeMit("AB1234", exemplarNummer: 6));

        Assert.Equal(["Exemplar-Nummer muss zwischen 1 und 5 liegen."], await FehlerZuFeldAsync(antwort, "exemplarNummer"));
    }

    [Fact]
    public async Task Ausgegebenes_Exemplar_geht_der_vergebenen_Nummer_vor()
    {
        var erste = await NeueAusgabeAsync("AB1234");

        using var antwort = await PostAusgabeAsync(erste.CoinId, AusgabeMit("AB1234", exemplarNummer: erste.ExemplarNummer));

        Assert.Equal("exemplar_ausgegeben", await CodeAsync(antwort));
    }

    [Fact]
    public async Task Kein_freies_Exemplar_geht_der_vergebenen_Nummer_vor()
    {
        var erste = await NeueAusgabeAsync("AB1234", auflage: 1);

        using var antwort = await PostAusgabeAsync(erste.CoinId, AusgabeMit("AB1234"));

        Assert.Equal("kein_exemplar_frei", await CodeAsync(antwort));
    }

    // ---------- AK-14: hologrammnummer in allen Ausgabe-Antworten ----------

    [Fact]
    public async Task Antwort_hat_genau_die_bisherigen_Felder_und_hologrammnummer()
    {
        var coinId = await CoinMitAuflageAsync(10);

        var json = await ErfasseAsync(coinId);

        Assert.Equal(
            ["ausgebendeStelle", "begruendung", "datum", "empfaenger", "erfasstAm", "erfasstVon", "exemplarNummer", "gelegenheit", "hologrammnummer", "id", "storno", "zertifikatsnummer"],
            Feldnamen(json));
    }

    [Fact]
    public async Task Historie_enthaelt_die_Hologrammnummer_je_Eintrag()
    {
        var coinId = await CoinMitAuflageAsync(10);
        await ErfasseMitNummerAsync(coinId, "ab 12-34");
        await ErfasseAsync(coinId);

        var eintraege = (await HistorieAsync(coinId)).GetProperty("eintraege").EnumerateArray()
            .Select(e => e.GetProperty("hologrammnummer"))
            .Select(n => n.ValueKind == JsonValueKind.Null ? "null" : n.GetString())
            .Order(StringComparer.Ordinal);

        Assert.Equal(["AB 12-34", "null"], eintraege);
    }

    [Fact]
    public async Task Einzelabruf_enthaelt_die_Hologrammnummer()
    {
        var ausgabe = await NeueAusgabeAsync("ab 12-34");

        using var antwort = await Client.GetAsync(AusgabeUrl(ausgabe.CoinId, ausgabe.AusgabeId));

        Assert.Equal("AB 12-34", (await JsonAsync(antwort)).GetProperty("hologrammnummer").GetString());
    }

    [Fact]
    public async Task Storno_Antwort_enthaelt_die_Hologrammnummer()
    {
        var ausgabe = await NeueAusgabeAsync("ab 12-34");

        var json = await StornierenAsync(ausgabe.CoinId, ausgabe.AusgabeId);

        Assert.Equal("AB 12-34", json.GetProperty("hologrammnummer").GetString());
    }

    [Fact]
    public async Task Stornierte_Ausgabe_behaelt_ihre_Hologrammnummer_in_der_Historie()
    {
        var ausgabe = await NeueAusgabeAsync("AB1234");
        await StornierenAsync(ausgabe.CoinId, ausgabe.AusgabeId);

        var eintrag = Assert.Single((await HistorieAsync(ausgabe.CoinId)).GetProperty("eintraege").EnumerateArray());

        Assert.Equal("AB1234", eintrag.GetProperty("hologrammnummer").GetString());
    }

    [Fact]
    public async Task Mitgesendete_unbekannte_Felder_rund_um_die_Nummer_werden_ignoriert()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var body = AusgabeMit("AB1234");
        body["nummerNormalisiert"] = "XY9999";
        body["abgeloestAm"] = "2026-10-01T00:00:00Z";

        using var antwort = await Client.PostAsJsonAsync(AusgabenUrl(coinId), body);

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
        Assert.Equal("AB1234", Assert.Single(await HologrammDb.ZeilenAsync()).NummerNormalisiert);
    }
}
