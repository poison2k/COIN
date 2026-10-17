using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Ausgaben;

/// <summary>
/// Feature coin-ausgaben, AK-6 bis AK-8 und AK-10: <c>POST /api/coins/{id}/ausgaben</c> – Format der Antwort,
/// Validierung mit wörtlichen Meldungen, fachliche Fehler, Prüfreihenfolge und „nächste freie Nummer“.
/// </summary>
public class AusgabeErfassenTests(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    // ---------- AK-6: Erfolg und Format ----------

    [Fact]
    public async Task Erfassen_liefert_201()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe());

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Erfassen_liefert_keinen_Location_Header()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe());

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
        Assert.Null(antwort.Headers.Location);
    }

    [Fact]
    public async Task Antwort_hat_genau_die_Felder_aus_Abschnitt_5_2()
    {
        var coinId = await CoinMitAuflageAsync(10);

        var json = await ErfasseAsync(coinId);

        Assert.Equal(
            // zertifikat-erzeugen (Abschnitt 5.3, AK-3): zusätzlich zertifikatsnummer.
            ["ausgebendeStelle", "begruendung", "datum", "empfaenger", "erfasstAm", "erfasstVon", "exemplarNummer", "gelegenheit", "id", "storno", "zertifikatsnummer"],
            Feldnamen(json));
    }

    [Fact]
    public async Task Antwort_enthaelt_die_erfassten_Angaben()
    {
        var coinId = await CoinMitAuflageAsync(10);

        var json = await ErfasseAsync(coinId, 4);

        Assert.Equal(
            (4, "Max Beispiel", "Hauptmann", "Beispielbataillon 1", Datum, "Truppenbesuch", "Herausragende Leistung", "Kommandeur Beispielbataillon 1"),
            (json.GetProperty("exemplarNummer").GetInt32(),
                json.GetProperty("empfaenger").GetProperty("name").GetString(),
                json.GetProperty("empfaenger").GetProperty("dienstgrad").GetString(),
                json.GetProperty("empfaenger").GetProperty("dienststelle").GetString(),
                json.GetProperty("datum").GetString(),
                json.GetProperty("gelegenheit").GetString(),
                json.GetProperty("begruendung").GetString(),
                json.GetProperty("ausgebendeStelle").GetString()));
    }

    [Fact]
    public async Task Empfaenger_hat_genau_name_dienstgrad_dienststelle()
    {
        var coinId = await CoinMitAuflageAsync(10);

        var json = await ErfasseAsync(coinId);

        Assert.Equal(["dienstgrad", "dienststelle", "name"], Feldnamen(json.GetProperty("empfaenger")));
    }

    [Fact]
    public async Task Eine_neue_Ausgabe_hat_storno_null()
    {
        var coinId = await CoinMitAuflageAsync(10);

        var json = await ErfasseAsync(coinId);

        Assert.Equal(JsonValueKind.Null, json.GetProperty("storno").ValueKind);
    }

    [Fact]
    public async Task ErfasstVon_ist_der_angemeldete_Benutzer_mit_Id_und_Name()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var konto = await KontoAsync("Sachbearbeiter", name: "Test Sachbearbeiter Erfasser");

        var json = await ErfasseAsync(coinId, client: konto.Client);
        var von = json.GetProperty("erfasstVon");

        Assert.Equal(["id", "name"], Feldnamen(von));
        Assert.Equal((konto.Id, "Test Sachbearbeiter Erfasser"), (von.GetProperty("id").GetGuid(), von.GetProperty("name").GetString()));
    }

    [Fact]
    public async Task ErfasstAm_ist_die_Serverzeit()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var vorher = DateTimeOffset.UtcNow.AddSeconds(-5);

        var json = await ErfasseAsync(coinId);

        var erfasstAm = json.GetProperty("erfasstAm").GetDateTimeOffset();
        Assert.InRange(erfasstAm, vorher, DateTimeOffset.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task Erfassen_speichert_die_Ausgabe_mit_Erfasser()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var adminId = await AdminIdAsync();

        var json = await ErfasseAsync(coinId, 3);

        var zeile = Assert.Single(await AusgabeDb.AusgabenAsync());
        Assert.Equal((json.GetProperty("id").GetGuid(), coinId, 3, adminId), (zeile.Id, zeile.CoinId, zeile.ExemplarNummer, zeile.ErfasstVon));
    }

    [Fact]
    public async Task Id_ist_eine_GUID_Version_7()
    {
        var coinId = await CoinMitAuflageAsync(10);

        var json = await ErfasseAsync(coinId);

        Assert.Equal(7, json.GetProperty("id").GetGuid().Version);
    }

    [Fact]
    public async Task Texte_werden_getrimmt()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var body = GueltigeAusgabe(empfaengerName: "  Max Beispiel  ", gelegenheit: " Truppenbesuch\t", ausgebendeStelle: " Kommandeur ");

        using var antwort = await PostAusgabeAsync(coinId, body);
        var json = await JsonAsync(antwort);

        Assert.Equal(
            ("Max Beispiel", "Truppenbesuch", "Kommandeur"),
            (json.GetProperty("empfaenger").GetProperty("name").GetString(), json.GetProperty("gelegenheit").GetString(),
                json.GetProperty("ausgebendeStelle").GetString()));
    }

    [Fact]
    public async Task Leere_optionale_Texte_werden_null()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var body = GueltigeAusgabe(empfaengerDienstgrad: "   ", empfaengerDienststelle: "");

        using var antwort = await PostAusgabeAsync(coinId, body);
        var empfaenger = (await JsonAsync(antwort)).GetProperty("empfaenger");

        Assert.Equal(
            (JsonValueKind.Null, JsonValueKind.Null),
            (empfaenger.GetProperty("dienstgrad").ValueKind, empfaenger.GetProperty("dienststelle").ValueKind));
    }

    [Fact]
    public async Task Fehlende_optionale_Felder_sind_erlaubt()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var body = GueltigeAusgabe();
        body.Remove("empfaengerDienstgrad");
        body.Remove("empfaengerDienststelle");
        body.Remove("exemplarNummer");

        using var antwort = await PostAusgabeAsync(coinId, body);

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Mitgesendete_Felder_id_erfasstVon_erfasstAm_storno_werden_ignoriert()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var fremdeId = Guid.NewGuid();
        var body = GueltigeAusgabe();
        body["id"] = fremdeId;
        body["erfasstVon"] = new { id = Guid.NewGuid(), name = "Test Fremd" };
        body["erfasstAm"] = "2001-01-01T00:00:00+00:00";
        body["storno"] = new { am = "2001-01-01T00:00:00+00:00", grund = "Test" };

        using var antwort = await PostAusgabeAsync(coinId, body);
        var json = await JsonAsync(antwort);

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
        Assert.NotEqual(fremdeId, json.GetProperty("id").GetGuid());
        Assert.Equal(Testbenutzer.AdminName, json.GetProperty("erfasstVon").GetProperty("name").GetString());
        Assert.True(json.GetProperty("erfasstAm").GetDateTimeOffset().Year > 2001);
        Assert.Equal(JsonValueKind.Null, json.GetProperty("storno").ValueKind);
    }

    [Fact]
    public async Task Erfassen_traegt_Cache_Control_no_store()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe());

        Assert.True(antwort.Headers.CacheControl?.NoStore, $"Cache-Control: {antwort.Headers.CacheControl}");
    }

    [Fact]
    public async Task Erfassen_aendert_das_Coin_DTO_nicht()
    {
        var coinId = await CoinMitAuflageAsync(10);
        using var vorher = await Anonym.GetAsync($"{CoinsUrl}/{coinId}");

        await ErfasseAsync(coinId);

        using var nachher = await Anonym.GetAsync($"{CoinsUrl}/{coinId}");
        Assert.Equal(await vorher.Content.ReadAsStringAsync(), await nachher.Content.ReadAsStringAsync());
    }

    // ---------- AK-10: nächste freie Nummer ----------

    [Fact]
    public async Task Ohne_Nummer_wird_Exemplar_1_vergeben()
    {
        var coinId = await CoinMitAuflageAsync(10);

        var json = await ErfasseAsync(coinId);

        Assert.Equal(1, json.GetProperty("exemplarNummer").GetInt32());
    }

    [Fact]
    public async Task Exemplar_Nummer_null_bedeutet_naechste_freie()
    {
        var coinId = await CoinMitAuflageAsync(10);
        await ErfasseAsync(coinId);

        var json = await ErfasseAsync(coinId, exemplarNummer: null);

        Assert.Equal(2, json.GetProperty("exemplarNummer").GetInt32());
    }

    [Fact]
    public async Task Naechste_freie_ist_die_kleinste_Nummer_ohne_aktive_Ausgabe()
    {
        var coinId = await CoinMitAuflageAsync(10);
        await ErfasseAsync(coinId, 1);
        await ErfasseAsync(coinId, 2);
        await ErfasseAsync(coinId, 4);

        var json = await ErfasseAsync(coinId);

        Assert.Equal(3, json.GetProperty("exemplarNummer").GetInt32());
    }

    [Fact]
    public async Task Eine_stornierte_Nummer_wird_wieder_vergeben()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var erste = await ErfasseAsync(coinId);
        await ErfasseAsync(coinId);
        await StornierenAsync(coinId, erste.GetProperty("id").GetGuid());

        var json = await ErfasseAsync(coinId);

        Assert.Equal(1, json.GetProperty("exemplarNummer").GetInt32());
    }

    [Fact]
    public async Task Ein_storniertes_Exemplar_kann_gezielt_erneut_ausgegeben_werden()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var erste = await ErfasseAsync(coinId, 5);
        await StornierenAsync(coinId, erste.GetProperty("id").GetGuid());

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(5));

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Bestimmte_Nummer_wird_vergeben()
    {
        var coinId = await CoinMitAuflageAsync(150);

        var json = await ErfasseAsync(coinId, 150);

        Assert.Equal(150, json.GetProperty("exemplarNummer").GetInt32());
    }

    // ---------- AK-7: Validierung ----------

    public static TheoryData<string, object?, string> Pflichtfelder => new()
    {
        { "empfaengerName", null, "Name des Empfängers ist erforderlich." },
        { "empfaengerName", "   ", "Name des Empfängers ist erforderlich." },
        { "datum", null, "Datum ist erforderlich." },
        { "gelegenheit", "", "Gelegenheit ist erforderlich." },
        { "begruendung", null, "Begründung ist erforderlich." },
        { "ausgebendeStelle", " ", "Ausgebende Stelle ist erforderlich." },
    };

    [Theory]
    [MemberData(nameof(Pflichtfelder))]
    public async Task Fehlendes_Pflichtfeld_liefert_400_mit_woertlicher_Meldung(string feld, object? wert, string meldung)
    {
        var coinId = await CoinMitAuflageAsync(10);
        var body = GueltigeAusgabe();
        body[feld] = wert;

        using var antwort = await PostAusgabeAsync(coinId, body);

        Assert.Equal([meldung], await FehlerZuFeldAsync(antwort, feld));
    }

    public static TheoryData<string, int, string> Laengen => new()
    {
        { "empfaengerName", 201, "Name des Empfängers darf höchstens 200 Zeichen lang sein." },
        { "empfaengerDienstgrad", 101, "Dienstgrad darf höchstens 100 Zeichen lang sein." },
        { "empfaengerDienststelle", 201, "Dienststelle darf höchstens 200 Zeichen lang sein." },
        { "gelegenheit", 201, "Gelegenheit darf höchstens 200 Zeichen lang sein." },
        { "begruendung", 2001, "Begründung darf höchstens 2000 Zeichen lang sein." },
        { "ausgebendeStelle", 201, "Ausgebende Stelle darf höchstens 200 Zeichen lang sein." },
    };

    [Theory]
    [MemberData(nameof(Laengen))]
    public async Task Zu_langer_Text_liefert_400_mit_woertlicher_Meldung(string feld, int laenge, string meldung)
    {
        var coinId = await CoinMitAuflageAsync(10);
        var body = GueltigeAusgabe();
        body[feld] = new string('x', laenge);

        using var antwort = await PostAusgabeAsync(coinId, body);

        Assert.Equal([meldung], await FehlerZuFeldAsync(antwort, feld));
    }

    [Theory]
    [InlineData("empfaengerName", 200)]
    [InlineData("empfaengerDienstgrad", 100)]
    [InlineData("empfaengerDienststelle", 200)]
    [InlineData("gelegenheit", 200)]
    [InlineData("begruendung", 2000)]
    [InlineData("ausgebendeStelle", 200)]
    public async Task Text_mit_Hoechstlaenge_wird_gespeichert(string feld, int laenge)
    {
        var coinId = await CoinMitAuflageAsync(10);
        var body = GueltigeAusgabe();
        body[feld] = new string('x', laenge);

        using var antwort = await PostAusgabeAsync(coinId, body);

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Datum_in_der_Zukunft_liefert_400()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var morgenInBerlin = DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin")).DateTime).AddDays(1);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(datum: morgenInBerlin.ToString("yyyy-MM-dd")));

        Assert.Equal(["Das Datum darf nicht in der Zukunft liegen."], await FehlerZuFeldAsync(antwort, "datum"));
    }

    [Fact]
    public async Task Datum_heute_in_Berlin_ist_gueltig()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var heuteInBerlin = DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin")).DateTime);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(datum: heuteInBerlin.ToString("yyyy-MM-dd")));

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Weit_zurueckliegendes_Datum_ist_gueltig()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(datum: "1960-01-01"));

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Theory]
    [InlineData("2026-13-45")]
    [InlineData("01.10.2026")]
    [InlineData("gestern")]
    public async Task Nicht_lesbares_Datum_liefert_Ungueltiger_Wert(string datum)
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(datum: datum));

        Assert.Equal(["Ungültiger Wert für dieses Feld."], await FehlerZuFeldAsync(antwort, "datum"));
    }

    [Fact]
    public async Task Text_als_Exemplar_Nummer_liefert_Ungueltiger_Wert()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var body = GueltigeAusgabe();
        body["exemplarNummer"] = "drei";

        using var antwort = await PostAusgabeAsync(coinId, body);

        Assert.Equal(["Ungültiger Wert für dieses Feld."], await FehlerZuFeldAsync(antwort, "exemplarNummer"));
    }

    [Fact]
    public async Task Kein_JSON_liefert_400_mit_errors_anfrage()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostRohAsync(Client, AusgabenUrl(coinId), """{ "empfaengerName": """);

        Assert.NotEmpty(await FehlerZuFeldAsync(antwort, "anfrage"));
    }

    [Fact]
    public async Task Alle_Fehler_werden_gemeinsam_gemeldet()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostRohAsync(Client, AusgabenUrl(coinId), "{}");

        Assert.Equal(
            ["ausgebendeStelle", "begruendung", "datum", "empfaengerName", "gelegenheit"],
            await AssertValidierungsfehlerAsync(antwort));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(151)]
    public async Task Exemplar_Nummer_ausserhalb_der_Auflage_liefert_400(int nummer)
    {
        var coinId = await CoinMitAuflageAsync(150);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(nummer));

        Assert.Equal(["Exemplar-Nummer muss zwischen 1 und 150 liegen."], await FehlerZuFeldAsync(antwort, "exemplarNummer"));
    }

    [Fact]
    public async Task Validierungsfehler_speichert_nichts()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(empfaengerName: ""));

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        Assert.Empty(await AusgabeDb.AusgabenAsync());
        Assert.Empty(await AusgabeDb.AuditAsync());
    }

    [Fact]
    public async Task Validierungsfehler_enthaelt_keine_Eingabewerte()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(empfaengerName: "Test Geheimname 4711", datum: "2999-01-01"));
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        Assert.DoesNotContain("Test Geheimname 4711", text);
    }

    // ---------- AK-8: fachliche Fehler ----------

    [Fact]
    public async Task Unbekannter_Coin_liefert_404_Coin_nicht_gefunden()
    {
        using var antwort = await PostAusgabeAsync(Guid.NewGuid(), GueltigeAusgabe());

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Coin nicht gefunden", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Id_ohne_GUID_Format_liefert_404()
    {
        using var antwort = await Client.PostAsJsonAsync($"{CoinsUrl}/keine-guid/ausgaben", GueltigeAusgabe());

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Fact]
    public async Task Coin_ohne_Auflage_liefert_409_auflage_unbekannt()
    {
        var coinId = await CoinMitAuflageAsync(null);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe());

        await AssertAusgabeKonfliktAsync(antwort, "auflage_unbekannt",
            "Für diesen Coin ist keine Auflage erfasst. Ausgaben sind erst nach dem Festlegen der Auflage möglich.");
    }

    [Fact]
    public async Task Bereits_ausgegebenes_Exemplar_liefert_409_exemplar_ausgegeben()
    {
        var coinId = await CoinMitAuflageAsync(150);
        await ErfasseAsync(coinId, 12);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(12));

        await AssertAusgabeKonfliktAsync(antwort, "exemplar_ausgegeben", "Exemplar Nr. 12 ist bereits ausgegeben.");
    }

    [Fact]
    public async Task Alle_Exemplare_ausgegeben_liefert_409_kein_exemplar_frei()
    {
        var coinId = await CoinMitAuflageAsync(2);
        await ErfasseAsync(coinId);
        await ErfasseAsync(coinId);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe());

        await AssertAusgabeKonfliktAsync(antwort, "kein_exemplar_frei", "Alle Exemplare dieses Coins sind ausgegeben.");
    }

    [Fact]
    public async Task Konflikt_speichert_nichts_weiter()
    {
        var coinId = await CoinMitAuflageAsync(3);
        await ErfasseAsync(coinId, 1);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(1));

        Assert.Equal(HttpStatusCode.Conflict, antwort.StatusCode);
        Assert.Single(await AusgabeDb.AusgabenAsync());
        Assert.Single(await AusgabeDb.AuditAsync());
    }

    [Fact]
    public async Task Konflikt_enthaelt_keine_Empfaengerdaten()
    {
        var coinId = await CoinMitAuflageAsync(3);
        await ErfasseAsync(coinId, 1, empfaengerName: "Test Erstempfaenger 0815");

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(1, empfaengerName: "Test Zweitempfaenger 0816"));
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.DoesNotContain("Test Erstempfaenger 0815", text);
        Assert.DoesNotContain("Test Zweitempfaenger 0816", text);
    }

    [Fact]
    public async Task Indexverletzung_trotz_Sperre_liefert_409_exemplar_ausgegeben_nie_500()
    {
        var coinId = await CoinMitAuflageAsync(5);
        await AdminIdAsync();

        HttpResponseMessage antwort;
        await using (await AusgabeDb.EinfuegenVerletztIndexAsync())
        {
            antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(3));
        }

        using (antwort)
        {
            Assert.Equal(HttpStatusCode.Conflict, antwort.StatusCode);
            Assert.Equal("exemplar_ausgegeben", (await JsonAsync(antwort)).GetProperty("code").GetString());
        }
    }

    // ---------- AK-8: Reihenfolge 401 → 403 → 415 → 400 → 404 → 409/400 exemplarNummer ----------

    [Fact]
    public async Task Ohne_JSON_Content_Type_liefert_415()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await Client.PostAsync(AusgabenUrl(coinId), new StringContent("name=x", Encoding.UTF8, "text/plain"));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.UnsupportedMediaType);
    }

    [Fact]
    public async Task Anonym_mit_falschem_Content_Type_liefert_401_vor_415()
    {
        var coinId = await CoinMitAuflageAsync(10);

        using var antwort = await Anonym.PostAsync(AusgabenUrl(coinId), new StringContent("x", Encoding.UTF8, "text/plain"));

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Betrachter_mit_falschem_Content_Type_liefert_403_vor_415()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using var antwort = await betrachter.PostAsync(AusgabenUrl(coinId), new StringContent("x", Encoding.UTF8, "text/plain"));

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
    }

    [Fact]
    public async Task Ungueltiger_Body_fuer_unbekannten_Coin_liefert_400_vor_404()
    {
        using var antwort = await PostAusgabeAsync(Guid.NewGuid(), GueltigeAusgabe(empfaengerName: ""));

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
    }

    [Fact]
    public async Task Unbekannter_Coin_mit_Nummer_liefert_404_vor_400_exemplarNummer()
    {
        using var antwort = await PostAusgabeAsync(Guid.NewGuid(), GueltigeAusgabe(999));

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Fact]
    public async Task Ungueltiger_Body_fuer_Coin_ohne_Auflage_liefert_400_vor_409()
    {
        var coinId = await CoinMitAuflageAsync(null);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(gelegenheit: ""));

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
    }

    [Fact]
    public async Task Ungueltiger_Body_mit_ausgegebener_Nummer_liefert_400_vor_409()
    {
        var coinId = await CoinMitAuflageAsync(3);
        await ErfasseAsync(coinId, 1);

        using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(1, begruendung: ""));

        Assert.Equal(["begruendung"], await AssertValidierungsfehlerAsync(antwort));
    }
}
