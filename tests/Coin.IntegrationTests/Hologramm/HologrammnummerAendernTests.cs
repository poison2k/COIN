using System.Net;
using System.Text;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Hologramm;

/// <summary>
/// Feature hologrammnummer, AK-10, AK-11 und AK-15: <c>PUT /api/coins/{id}/ausgaben/{ausgabeId}/hologrammnummer</c> –
/// Ergänzen (ohne Grund), Korrektur (Grund Pflicht, bisherige Zeile abgelöst), Schutz gegen verlorene Aktualisierungen
/// über <c>bisherige</c>, „unverändert“ ohne Schreiben, kein Entfernen, Fehlerreihenfolge 401 → 403 → 415 → 400 → 404 →
/// 409 storniert → 409 geändert → (unverändert) → 400 grund → 409 vergeben; Audit <c>hologramm_audit</c> nur bei
/// tatsächlichen Änderungen und ohne Empfängerdaten.
/// </summary>
public class HologrammnummerAendernTests(PostgresFixture fixture) : HologrammTestBasis(fixture)
{
    private const string DetailIssuesWrite = "Ihr Benutzerkonto ist nicht berechtigt, Ausgaben zu erfassen oder zu stornieren.";

    // ---------- AK-10: Ergänzen ----------

    [Fact]
    public async Task Ergaenzen_liefert_200_mit_der_Anzeigeform()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "ab 12-34");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("AB 12-34", (await JsonAsync(antwort)).GetProperty("hologrammnummer").GetString());
    }

    [Fact]
    public async Task Antwort_hat_das_Format_der_Ausgabe()
    {
        var a = await NeueAusgabeAsync(null);
        using var lesen = await Client.GetAsync(AusgabeUrl(a.CoinId, a.AusgabeId));
        var erwartet = Feldnamen(await JsonAsync(lesen));

        var json = await AendereAsync(a, "AB1234");

        Assert.Equal(erwartet, Feldnamen(json));
        Assert.Equal(a.AusgabeId, json.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Ergaenzen_legt_eine_aktuelle_Zuordnung_an()
    {
        var a = await NeueAusgabeAsync(null);

        await AendereAsync(a, "ab 12-34");

        var zeile = Assert.Single(await HologrammDb.ZeilenAsync(a.AusgabeId));
        Assert.Equal(("AB 12-34", "AB1234", (DateTimeOffset?)null), (zeile.Nummer, zeile.NummerNormalisiert, zeile.AbgeloestAm));
    }

    [Fact]
    public async Task Ergaenzen_ignoriert_den_Grund_und_schreibt_Gesetzt_ohne_Grund()
    {
        var a = await NeueAusgabeAsync(null);

        await AendereAsync(a, "AB1234", grund: "Test Grund beim Ergaenzen");

        var audit = Assert.Single(await HologrammDb.AuditAsync());
        Assert.Equal(("Gesetzt", (string?)null, "AB1234", (string?)null), (audit.Art, audit.NummerAlt, audit.NummerNeu, audit.Grund));
    }

    [Fact]
    public async Task Ergaenzen_durch_Sachbearbeiter_vermerkt_ihn_als_Akteur()
    {
        var a = await NeueAusgabeAsync(null);
        var konto = await KontoAsync("Sachbearbeiter");

        using var antwort = await PutHologrammAsync(konto.Client, a.CoinId, a.AusgabeId, new { hologrammnummer = "AB1234" });

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        var audit = Assert.Single(await HologrammDb.AuditAsync());
        Assert.Equal((konto.Id, a.AusgabeId, a.CoinId), (audit.AkteurId, audit.AusgabeId, audit.CoinId));
    }

    [Fact]
    public async Task Ergaenzen_durch_Sachbearbeiter_vermerkt_ihn_in_gesetzt_von()
    {
        var a = await NeueAusgabeAsync(null);
        var konto = await KontoAsync("Sachbearbeiter");

        using (await PutHologrammAsync(konto.Client, a.CoinId, a.AusgabeId, new { hologrammnummer = "AB1234" }))
        {
        }

        Assert.Equal(konto.Id, Assert.Single(await HologrammDb.ZeilenAsync(a.AusgabeId)).GesetztVon);
    }

    [Fact]
    public async Task Nach_dem_Ergaenzen_liefert_der_Einzelabruf_die_Nummer()
    {
        var a = await NeueAusgabeAsync(null);
        await AendereAsync(a, "ab 12-34");

        using var antwort = await Client.GetAsync(AusgabeUrl(a.CoinId, a.AusgabeId));

        Assert.Equal("AB 12-34", (await JsonAsync(antwort)).GetProperty("hologrammnummer").GetString());
    }

    // ---------- AK-10: Korrektur ----------

    [Fact]
    public async Task Korrektur_liefert_200_mit_der_neuen_Nummer()
    {
        var a = await NeueAusgabeAsync("AB1243");

        var json = await AendereAsync(a, "AB 12-34", "Tippfehler bei der Erfassung");

        Assert.Equal("AB 12-34", json.GetProperty("hologrammnummer").GetString());
    }

    [Fact]
    public async Task Korrektur_loest_die_bisherige_Zeile_ab_und_legt_eine_neue_an()
    {
        var a = await NeueAusgabeAsync("AB1243");

        await AendereAsync(a, "AB1234", "Tippfehler");

        var zeilen = await HologrammDb.ZeilenAsync(a.AusgabeId);
        Assert.Equal(
            [("AB1243", true), ("AB1234", false)],
            zeilen.Select(z => (z.Nummer, z.AbgeloestAm is not null)));
    }

    [Fact]
    public async Task Korrektur_schreibt_ein_Audit_Geaendert_mit_alt_neu_und_Grund()
    {
        var a = await NeueAusgabeAsync("AB 12-43");
        var adminId = await AdminIdAsync();

        await AendereAsync(a, "ab 12-34", "  Tippfehler bei der Erfassung  ");

        var audit = (await HologrammDb.AuditAsync()).Last();
        Assert.Equal(
            ("Geaendert", (string?)"AB1243", "AB1234", (string?)"Tippfehler bei der Erfassung", a.AusgabeId, a.CoinId, adminId),
            (audit.Art, audit.NummerAlt, audit.NummerNeu, audit.Grund, audit.AusgabeId, audit.CoinId, audit.AkteurId));
    }

    [Fact]
    public async Task Korrektur_ohne_Grund_liefert_400_am_Feld_grund()
    {
        var a = await NeueAusgabeAsync("AB1243");

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234", null, "AB1243");

        Assert.Equal([MeldungGrundFehlt], await FehlerZuFeldAsync(antwort, "grund"));
    }

    [Fact]
    public async Task Korrektur_mit_Grund_aus_Leerzeichen_liefert_400_am_Feld_grund()
    {
        var a = await NeueAusgabeAsync("AB1243");

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234", "   ", "AB1243");

        Assert.Equal([MeldungGrundFehlt], await FehlerZuFeldAsync(antwort, "grund"));
    }

    [Fact]
    public async Task Grund_mit_501_Zeichen_liefert_400_am_Feld_grund()
    {
        var a = await NeueAusgabeAsync("AB1243");

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234", new string('x', 501), "AB1243");

        Assert.Equal([MeldungGrundZuLang], await FehlerZuFeldAsync(antwort, "grund"));
    }

    [Fact]
    public async Task Grund_mit_500_Zeichen_ist_erlaubt()
    {
        var a = await NeueAusgabeAsync("AB1243");

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234", new string('x', 500), "AB1243");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    // ---------- AK-10: bisherige ----------

    [Fact]
    public async Task Abweichende_bisherige_liefert_409_hologrammnummer_geaendert()
    {
        var a = await NeueAusgabeAsync("AB1243");

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234", "Tippfehler", "AB9999");

        await AssertKonfliktAsync(antwort, TitelHologramm, "hologrammnummer_geaendert", DetailGeaendert);
    }

    [Fact]
    public async Task Fehlende_bisherige_bei_vorhandener_Nummer_liefert_409_hologrammnummer_geaendert()
    {
        var a = await NeueAusgabeAsync("AB1243");

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234", "Tippfehler", null);

        Assert.Equal((HttpStatusCode.Conflict, "hologrammnummer_geaendert"), (antwort.StatusCode, await CodeAsync(antwort)));
    }

    [Fact]
    public async Task Bisherige_ohne_vorhandene_Nummer_liefert_409_hologrammnummer_geaendert()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234", null, "AB1243");

        Assert.Equal((HttpStatusCode.Conflict, "hologrammnummer_geaendert"), (antwort.StatusCode, await CodeAsync(antwort)));
    }

    [Fact]
    public async Task Leere_bisherige_gilt_als_keine_Nummer()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234", null, "");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Bisherige_wird_normalisiert_verglichen()
    {
        var a = await NeueAusgabeAsync("AB1243");

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234", "Tippfehler", "ab 12-43");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Veraltete_bisherige_aendert_nichts()
    {
        var a = await NeueAusgabeAsync("AB1243");

        using (await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234", "Tippfehler", "AB9999"))
        {
        }

        Assert.Equal(("AB1243", 1), ((await AktuelleZeileAsync(a.AusgabeId))?.Nummer, (await HologrammDb.AuditAsync()).Count));
    }

    // ---------- AK-10: unverändert ----------

    [Fact]
    public async Task Gleiche_Normalform_in_anderer_Schreibweise_liefert_200_ohne_Aenderung()
    {
        var a = await NeueAusgabeAsync("AB 12-34");

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "ab1234", null, "AB 12-34");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("AB 12-34", (await JsonAsync(antwort)).GetProperty("hologrammnummer").GetString());
    }

    [Fact]
    public async Task Unveraendert_schreibt_keine_Zeile_und_kein_Audit()
    {
        var a = await NeueAusgabeAsync("AB 12-34");

        using (await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234", "Test Grund", "AB 12-34"))
        {
        }

        Assert.Equal((1, 1), ((await HologrammDb.ZeilenAsync(a.AusgabeId)).Count, (await HologrammDb.AuditAsync()).Count));
    }

    [Fact]
    public async Task Unveraendert_geht_dem_fehlenden_Grund_vor()
    {
        var a = await NeueAusgabeAsync("AB1234");

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB 12-34", null, "AB1234");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    // ---------- AK-10, H5: kein Entfernen ----------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Leere_Nummer_liefert_400_Bitte_eine_Hologrammnummer_eingeben(string? nummer)
    {
        var a = await NeueAusgabeAsync("AB1234");

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, nummer, "Entfernen", "AB1234");

        Assert.Equal([MeldungLeer], await FehlerZuFeldAsync(antwort, "hologrammnummer"));
    }

    [Fact]
    public async Task Fehlendes_Feld_hologrammnummer_liefert_400()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await PutRohAsync(Client, HologrammUrl(a.CoinId, a.AusgabeId), "{}");

        Assert.Equal([MeldungLeer], await FehlerZuFeldAsync(antwort, "hologrammnummer"));
    }

    [Fact]
    public async Task Leere_Nummer_laesst_die_bisherige_Nummer_stehen()
    {
        var a = await NeueAusgabeAsync("AB1234");

        using (await PutHologrammAsync(a.CoinId, a.AusgabeId, "", "Entfernen", "AB1234"))
        {
        }

        Assert.Equal("AB1234", (await AktuelleZeileAsync(a.AusgabeId))?.Nummer);
    }

    [Theory]
    [InlineData("AB/1234", MeldungZeichen)]
    [InlineData("--", MeldungNurTrenner)]
    public async Task Ungueltige_Nummer_liefert_400_am_Feld_hologrammnummer(string nummer, string meldung)
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, nummer);

        Assert.Equal([meldung], await FehlerZuFeldAsync(antwort, "hologrammnummer"));
    }

    [Fact]
    public async Task Nummer_mit_41_Zeichen_liefert_den_Laengenfehler()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, new string('A', 41));

        Assert.Equal([MeldungLaenge], await FehlerZuFeldAsync(antwort, "hologrammnummer"));
    }

    [Fact]
    public async Task Kaputtes_JSON_liefert_400()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await PutRohAsync(Client, HologrammUrl(a.CoinId, a.AusgabeId), "{\"hologrammnummer\":");

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
    }

    // ---------- AK-11: 404 ----------

    private static async Task AssertAusgabeNichtGefundenAsync(HttpResponseMessage antwort)
    {
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Ausgabe nicht gefunden", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Unbekannter_Coin_liefert_404_Ausgabe_nicht_gefunden()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await PutHologrammAsync(Guid.NewGuid(), a.AusgabeId, "AB1234");

        await AssertAusgabeNichtGefundenAsync(antwort);
    }

    [Fact]
    public async Task Unbekannte_Ausgabe_liefert_404_Ausgabe_nicht_gefunden()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await PutHologrammAsync(a.CoinId, Guid.NewGuid(), "AB1234");

        await AssertAusgabeNichtGefundenAsync(antwort);
    }

    [Fact]
    public async Task Ausgabe_eines_anderen_Coins_liefert_404_Ausgabe_nicht_gefunden()
    {
        var a = await NeueAusgabeAsync(null);
        var anderer = await CoinMitAuflageAsync(5);

        using var antwort = await PutHologrammAsync(anderer, a.AusgabeId, "AB1234");

        await AssertAusgabeNichtGefundenAsync(antwort);
    }

    [Fact]
    public async Task Ausgabe_Id_ohne_GUID_Format_liefert_404()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await PutRohAsync(Client, $"{AusgabenUrl(a.CoinId)}/keine-guid/hologrammnummer", "{\"hologrammnummer\":\"AB1234\"}");

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Fact]
    public async Task Ungueltige_Nummer_geht_dem_404_vor()
    {
        using var antwort = await PutHologrammAsync(Guid.NewGuid(), Guid.NewGuid(), "AB/1");

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
    }

    [Fact]
    public async Task Zu_langer_Grund_geht_dem_404_vor()
    {
        using var antwort = await PutHologrammAsync(Guid.NewGuid(), Guid.NewGuid(), "AB1234", new string('x', 501));

        Assert.Equal(["grund"], await AssertValidierungsfehlerAsync(antwort));
    }

    // ---------- AK-11: 409 storniert, geändert, vergeben ----------

    [Fact]
    public async Task Stornierte_Ausgabe_liefert_409_ausgabe_storniert()
    {
        var a = await NeueAusgabeAsync(null);
        await StornierenAsync(a.CoinId, a.AusgabeId);

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234");

        await AssertKonfliktAsync(antwort, TitelHologramm, "ausgabe_storniert", DetailStorniert);
    }

    [Fact]
    public async Task Ungueltige_Nummer_geht_dem_Storno_vor()
    {
        var a = await NeueAusgabeAsync(null);
        await StornierenAsync(a.CoinId, a.AusgabeId);

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB/1");

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
    }

    [Fact]
    public async Task Storno_geht_der_abweichenden_bisherigen_vor()
    {
        var a = await NeueAusgabeAsync("AB1243");
        await StornierenAsync(a.CoinId, a.AusgabeId);

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234", "Tippfehler", "AB9999");

        Assert.Equal("ausgabe_storniert", await CodeAsync(antwort));
    }

    [Fact]
    public async Task Abweichende_bisherige_geht_unveraendert_vor()
    {
        var a = await NeueAusgabeAsync("AB1234");

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234", null, "AB9999");

        Assert.Equal("hologrammnummer_geaendert", await CodeAsync(antwort));
    }

    [Fact]
    public async Task Vergebene_Nummer_liefert_409_hologrammnummer_vergeben()
    {
        await NeueAusgabeAsync("AB1234");
        var y = await NeueAusgabeAsync(null);

        using var antwort = await PutHologrammAsync(y.CoinId, y.AusgabeId, "ab 12-34");

        await AssertKonfliktAsync(antwort, TitelHologramm, "hologrammnummer_vergeben", DetailVergeben);
    }

    [Fact]
    public async Task Fehlender_Grund_geht_der_vergebenen_Nummer_vor()
    {
        await NeueAusgabeAsync("AB1234");
        var y = await NeueAusgabeAsync("CD5678");

        using var antwort = await PutHologrammAsync(y.CoinId, y.AusgabeId, "AB1234", null, "CD5678");

        Assert.Equal(["grund"], await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task Vergebene_Nummer_bei_Korrektur_laesst_die_bisherige_Nummer_aktuell()
    {
        await NeueAusgabeAsync("AB1234");
        var y = await NeueAusgabeAsync("CD5678");

        using (await PutHologrammAsync(y.CoinId, y.AusgabeId, "AB1234", "Tippfehler", "CD5678"))
        {
        }

        var zeilen = await HologrammDb.ZeilenAsync(y.AusgabeId);
        Assert.Equal([("CD5678", false)], zeilen.Select(z => (z.Nummer, z.AbgeloestAm is not null)));
    }

    // ---------- AK-15: Audit nur bei Änderung ----------

    public static TheoryData<string> AbgelehnteFaelle => ["400", "404", "409 storniert", "409 geaendert", "409 vergeben", "unveraendert"];

    [Theory]
    [MemberData(nameof(AbgelehnteFaelle))]
    public async Task Abgelehnte_und_unveraenderte_Anfragen_schreiben_kein_Hologramm_Audit(string fall)
    {
        var vorhanden = await NeueAusgabeAsync("AB1234");
        var x = await NeueAusgabeAsync("CD5678");
        var storniert = await NeueAusgabeAsync(null);
        await StornierenAsync(storniert.CoinId, storniert.AusgabeId);
        var vorher = (await HologrammDb.AuditAsync()).Count;

        using var antwort = fall switch
        {
            "400" => await PutHologrammAsync(x.CoinId, x.AusgabeId, "AB/1", "Grund", "CD5678"),
            "404" => await PutHologrammAsync(x.CoinId, Guid.NewGuid(), "EF9012"),
            "409 storniert" => await PutHologrammAsync(storniert.CoinId, storniert.AusgabeId, "EF9012"),
            "409 geaendert" => await PutHologrammAsync(x.CoinId, x.AusgabeId, "EF9012", "Grund", "XX0000"),
            "409 vergeben" => await PutHologrammAsync(x.CoinId, x.AusgabeId, "AB1234", "Grund", "CD5678"),
            _ => await PutHologrammAsync(vorhanden.CoinId, vorhanden.AusgabeId, "AB 12-34", "Grund", "AB1234"),
        };

        Assert.True(antwort.StatusCode is HttpStatusCode.OK or HttpStatusCode.BadRequest or HttpStatusCode.NotFound or HttpStatusCode.Conflict,
            $"{fall}: {(int)antwort.StatusCode}");
        Assert.Equal(vorher, (await HologrammDb.AuditAsync()).Count);
    }

    [Fact]
    public async Task Hologramm_Audit_enthaelt_keine_Empfaengerdaten()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var body = GueltigeAusgabe(1, "Test Empfaenger Audit Hx51", "Test Dienstgrad Hx52", "Test Dienststelle Hx53", Datum,
            "Test Gelegenheit Hx54", "Test Begruendung Hx55", "Test Stelle Hx56");
        body["hologrammnummer"] = "AB1243";
        using (var erfasst = await PostAusgabeAsync(coinId, body))
        {
            Assert.Equal(HttpStatusCode.Created, erfasst.StatusCode);
            var id = (await JsonAsync(erfasst)).GetProperty("id").GetGuid();
            await AendereAsync(new HologrammAusgabe(coinId, id, 1, "AB1243"), "AB1234", "Tippfehler");
        }

        Assert.DoesNotContain("Hx5", await HologrammDb.AlsTextAsync("hologramm_audit"), StringComparison.Ordinal);
    }

    // ---------- AK-11: 401 → 403 → 415 ----------

    [Fact]
    public async Task Anonym_liefert_401()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await PutHologrammAsync(Anonym, a.CoinId, a.AusgabeId, new { hologrammnummer = "AB1234" });

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_liefert_403_mit_dem_Text_fuer_issues_write()
    {
        var a = await NeueAusgabeAsync(null);
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await PutHologrammAsync(betrachter, a.CoinId, a.AusgabeId, new { hologrammnummer = "AB1234" });

        var json = await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
        Assert.Equal(DetailIssuesWrite, json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Ohne_Rolle_liefert_403()
    {
        var a = await NeueAusgabeAsync(null);
        var ohne = await ClientMitRolleAsync(null);

        using var antwort = await PutHologrammAsync(ohne, a.CoinId, a.AusgabeId, new { hologrammnummer = "AB1234" });

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Deaktiviert_liefert_403_benutzer_deaktiviert()
    {
        var a = await NeueAusgabeAsync(null);
        var deaktiviert = await ClientMitRolleAsync("Administrator", aktiv: false);

        using var antwort = await PutHologrammAsync(deaktiviert, a.CoinId, a.AusgabeId, new { hologrammnummer = "AB1234" });

        await AssertKeinZugriffAsync(antwort, "benutzer_deaktiviert");
    }

    [Theory]
    [InlineData("Administrator")]
    [InlineData("Sachbearbeiter")]
    public async Task Rolle_mit_issues_write_darf_ergaenzen(string rolle)
    {
        var a = await NeueAusgabeAsync(null);
        var client = await ClientMitRolleAsync(rolle);

        using var antwort = await PutHologrammAsync(client, a.CoinId, a.AusgabeId, new { hologrammnummer = "AB1234" });

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_aendert_nichts()
    {
        var a = await NeueAusgabeAsync(null);
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using (await PutHologrammAsync(betrachter, a.CoinId, a.AusgabeId, new { hologrammnummer = "AB1234" }))
        {
        }

        Assert.Equal((0, 0), ((await HologrammDb.ZeilenAsync()).Count, (await HologrammDb.AuditAsync()).Count));
    }

    [Fact]
    public async Task Falscher_Content_Type_liefert_415()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await Client.PutAsync(HologrammUrl(a.CoinId, a.AusgabeId), new StringContent("{\"hologrammnummer\":\"AB1234\"}", Encoding.UTF8, "text/plain"));

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, antwort.StatusCode);
    }

    [Fact]
    public async Task Anonym_mit_falschem_Content_Type_liefert_401_vor_415()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await Anonym.PutAsync(HologrammUrl(a.CoinId, a.AusgabeId), new StringContent("x", Encoding.UTF8, "text/plain"));

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_mit_falschem_Content_Type_liefert_403_vor_415()
    {
        var a = await NeueAusgabeAsync(null);
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await betrachter.PutAsync(HologrammUrl(a.CoinId, a.AusgabeId), new StringContent("x", Encoding.UTF8, "text/plain"));

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_mit_ungueltiger_Nummer_liefert_403_vor_400()
    {
        var a = await NeueAusgabeAsync(null);
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await PutHologrammAsync(betrachter, a.CoinId, a.AusgabeId, new { hologrammnummer = "AB/1" });

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Falscher_Content_Type_geht_dem_400_vor()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await Client.PutAsync(HologrammUrl(a.CoinId, a.AusgabeId), new StringContent("{\"hologrammnummer\":\"\"}", Encoding.UTF8, "text/plain"));

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, antwort.StatusCode);
    }

    [Fact]
    public async Task Antwort_wird_nicht_zwischengespeichert()
    {
        var a = await NeueAusgabeAsync(null);

        using var antwort = await PutHologrammAsync(a.CoinId, a.AusgabeId, "AB1234");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.True(antwort.Headers.CacheControl?.NoStore, "Cache-Control ohne no-store ([KeinCache]).");
    }

    [Fact]
    public async Task Antwort_enthaelt_die_Personendaten_der_Ausgabe_wie_der_Einzelabruf()
    {
        var a = await NeueAusgabeAsync(null);

        var json = await AendereAsync(a, "AB1234");

        Assert.Equal(JsonValueKind.Object, json.GetProperty("empfaenger").ValueKind);
    }
}
