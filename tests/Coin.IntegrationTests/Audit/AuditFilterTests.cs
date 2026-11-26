using System.Globalization;
using System.Net;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;
using Npgsql;

namespace Coin.IntegrationTests.Audit;

/// <summary>
/// Feature nacharbeiten-audit-filter, AK-1 bis AK-6 und AK-9 (Abschnitt 4.1, ADR-0045): <c>GET /api/audit</c> mit
/// <c>von</c>, <c>bis</c>, <c>aktion</c> und <c>benutzerId</c>. Testdaten aus Abschnitt 10.2 direkt per INSERT: je
/// Stichtag der letzte Eintrag davor, der erste und letzte Eintrag des Tages und der erste danach, je Zeitpunkt ein
/// Eintrag „Rolle“ und einer „Status“, abwechselnd auf zwei Benutzer verteilt. Erwartete Mengen und Reihenfolgen
/// kommen aus der Datenbank selbst (Bootstrap-Eintrag des Administrators eingeschlossen).
/// </summary>
public class AuditFilterTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const string DatumMeldung = "Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.";
    private const string ReihenfolgeMeldung = "Das Datum „bis“ darf nicht vor dem Datum „von“ liegen.";
    private const string ZeitraumMeldung = "Der Zeitraum darf höchstens 366 Tage umfassen.";
    private const string AktionMeldung = "Unbekannte Aktion. Erlaubt sind: Rolle, Status.";

    private sealed record Stichtag(string Tag, DateTimeOffset Davor, DateTimeOffset Erster, DateTimeOffset Letzter, DateTimeOffset Danach);

    private static DateTimeOffset Z(string utc) => DateTimeOffset.Parse(utc, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal);

    /// <summary>Abschnitt 10.2 (UTC).</summary>
    private static readonly Dictionary<string, Stichtag> Stichtage = new[]
    {
        new Stichtag("2026-01-15", Z("2026-01-14T22:59:59.999999Z"), Z("2026-01-14T23:00:00Z"), Z("2026-01-15T22:59:59.999999Z"), Z("2026-01-15T23:00:00Z")),
        new Stichtag("2026-03-29", Z("2026-03-28T22:59:59.999999Z"), Z("2026-03-28T23:00:00Z"), Z("2026-03-29T21:59:59.999999Z"), Z("2026-03-29T22:00:00Z")),
        new Stichtag("2026-07-01", Z("2026-06-30T21:59:59.999999Z"), Z("2026-06-30T22:00:00Z"), Z("2026-07-01T21:59:59.999999Z"), Z("2026-07-01T22:00:00Z")),
        new Stichtag("2026-10-25", Z("2026-10-24T21:59:59.999999Z"), Z("2026-10-24T22:00:00Z"), Z("2026-10-25T22:59:59.999999Z"), Z("2026-10-25T23:00:00Z")),
    }.ToDictionary(s => s.Tag);

    private sealed record Testdaten(Guid BenutzerA, Guid BenutzerB);

    /// <summary>Legt den Administrator, zwei Zielbenutzer und die Einträge aus 10.2 an.</summary>
    private async Task<Testdaten> TestdatenAsync()
    {
        await AdminIdAsync();
        var a = await KontoAsync(null, name: "Test Zielperson Filter A");
        var b = await KontoAsync(null, name: "Test Zielperson Filter B");
        var zeitpunkte = Stichtage.Values.SelectMany(s => new[] { s.Davor, s.Erster, s.Letzter, s.Danach }).ToArray();

        await using var verbindung = new NpgsqlConnection(Fixture.ConnectionString);
        await verbindung.OpenAsync();
        for (var i = 0; i < zeitpunkte.Length; i++)
        {
            await EinfuegenAsync(verbindung, zeitpunkte[i], i % 2 == 0 ? a.Id : b.Id, "Rolle");
            await EinfuegenAsync(verbindung, zeitpunkte[i], i % 2 == 0 ? b.Id : a.Id, "Status");
        }

        return new Testdaten(a.Id, b.Id);
    }

    private static async Task EinfuegenAsync(NpgsqlConnection verbindung, DateTimeOffset zeitpunkt, Guid benutzer, string art)
    {
        await using var befehl = new NpgsqlCommand(
            """
            INSERT INTO benutzer_audit (id, zeitpunkt, akteur_id, benutzer_id, art, alt, neu)
            VALUES (@id, @zeitpunkt, NULL, @benutzer, @art, @alt, @neu)
            """,
            verbindung);
        befehl.Parameters.AddWithValue("id", Guid.CreateVersion7());
        befehl.Parameters.AddWithValue("zeitpunkt", zeitpunkt.UtcDateTime);
        befehl.Parameters.AddWithValue("benutzer", benutzer);
        befehl.Parameters.AddWithValue("art", art);
        befehl.Parameters.AddWithValue("alt", art == "Rolle" ? "keine" : "aktiv");
        befehl.Parameters.AddWithValue("neu", art == "Rolle" ? "Betrachter" : "deaktiviert");
        await befehl.ExecuteNonQueryAsync();
    }

    /// <summary>Ids aus der Datenbank in der Sortierung der API (Orakel für Menge, Reihenfolge und gesamt).</summary>
    private async Task<string[]> ErwartetAsync(
        DateTimeOffset? ab = null, DateTimeOffset? vor = null, string[]? arten = null, Guid? benutzer = null)
    {
        await using var verbindung = new NpgsqlConnection(Fixture.ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(
            """
            SELECT id FROM benutzer_audit
            WHERE (@ab::timestamptz IS NULL OR zeitpunkt >= @ab)
              AND (@vor::timestamptz IS NULL OR zeitpunkt < @vor)
              AND (@arten::text[] IS NULL OR art = ANY(@arten))
              AND (@benutzer::uuid IS NULL OR benutzer_id = @benutzer)
            ORDER BY zeitpunkt DESC, id DESC
            """,
            verbindung);
        befehl.Parameters.Add(new NpgsqlParameter("ab", NpgsqlTypes.NpgsqlDbType.TimestampTz) { Value = (object?)ab?.UtcDateTime ?? DBNull.Value });
        befehl.Parameters.Add(new NpgsqlParameter("vor", NpgsqlTypes.NpgsqlDbType.TimestampTz) { Value = (object?)vor?.UtcDateTime ?? DBNull.Value });
        befehl.Parameters.Add(new NpgsqlParameter("arten", NpgsqlTypes.NpgsqlDbType.Array | NpgsqlTypes.NpgsqlDbType.Text) { Value = (object?)arten ?? DBNull.Value });
        befehl.Parameters.Add(new NpgsqlParameter("benutzer", NpgsqlTypes.NpgsqlDbType.Uuid) { Value = (object?)benutzer ?? DBNull.Value });
        await using var leser = await befehl.ExecuteReaderAsync();
        var ids = new List<string>();
        while (await leser.ReadAsync())
        {
            ids.Add(leser.GetGuid(0).ToString());
        }

        return [.. ids];
    }

    private async Task<JsonElement> AuditAsync(string query)
    {
        using var antwort = await Client.GetAsync($"{AuditUrl}{query}");
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"{query} -> {(int)antwort.StatusCode}: {await antwort.Content.ReadAsStringAsync()}");
        return await JsonAsync(antwort);
    }

    private static string[] Ids(JsonElement seite) =>
        seite.GetProperty("eintraege").EnumerateArray().Select(e => e.GetProperty("id").GetGuid().ToString()).ToArray();

    private static int Gesamt(JsonElement seite) => seite.GetProperty("gesamt").GetInt32();

    private async Task<JsonElement> FehlerAsync(string query)
    {
        using var antwort = await Client.GetAsync($"{AuditUrl}{query}");
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
        return json.GetProperty("errors");
    }

    private static string[] Meldungen(JsonElement errors, string feld) =>
        errors.GetProperty(feld).EnumerateArray().Select(m => m.GetString()!).ToArray();

    private static string[] Schluessel(JsonElement errors) =>
        errors.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray();

    // ---------- AK-1: ohne Filter wie bisher ----------

    [Fact]
    public async Task Ohne_Filter_liefert_die_API_alle_Eintraege_neueste_zuerst()
    {
        await TestdatenAsync();

        var json = await AuditAsync("?groesse=100");

        Assert.Equal(await ErwartetAsync(), Ids(json));
    }

    [Fact]
    public async Task Ohne_Filter_ist_gesamt_die_Zahl_aller_Eintraege()
    {
        await TestdatenAsync();

        var json = await AuditAsync("");

        Assert.Equal(await AuditDb.AnzahlAsync(), Gesamt(json));
    }

    // ---------- AK-2: Stichtage einschließlich Zeitumstellung ----------

    [Theory]
    [InlineData("2026-01-15")]
    [InlineData("2026-03-29")]
    [InlineData("2026-07-01")]
    [InlineData("2026-10-25")]
    public async Task Von_gleich_bis_liefert_genau_die_Eintraege_des_Berliner_Kalendertags(string tag)
    {
        await TestdatenAsync();
        var s = Stichtage[tag];

        var json = await AuditAsync($"?von={tag}&bis={tag}&groesse=100");

        Assert.Equal(await ErwartetAsync(ab: s.Erster, vor: s.Danach), Ids(json));
    }

    [Theory]
    [InlineData("2026-01-15")]
    [InlineData("2026-03-29")]
    [InlineData("2026-07-01")]
    [InlineData("2026-10-25")]
    public async Task Von_gleich_bis_liefert_vier_Eintraege_und_gesamt_4(string tag)
    {
        await TestdatenAsync();

        var json = await AuditAsync($"?von={tag}&bis={tag}");

        Assert.Equal((4, 4), (Ids(json).Length, Gesamt(json)));
    }

    [Theory]
    [InlineData("2026-01-15")]
    [InlineData("2026-03-29")]
    [InlineData("2026-07-01")]
    [InlineData("2026-10-25")]
    public async Task Der_letzte_Eintrag_eine_Mikrosekunde_vor_Tagesbeginn_ist_nicht_dabei(string tag)
    {
        await TestdatenAsync();
        var s = Stichtage[tag];
        var davor = await ErwartetAsync(ab: s.Davor, vor: s.Erster);

        var json = await AuditAsync($"?von={tag}&bis={tag}&groesse=100");

        Assert.Equal(2, davor.Length);
        Assert.Empty(Ids(json).Intersect(davor));
    }

    [Theory]
    [InlineData("2026-01-15")]
    [InlineData("2026-03-29")]
    [InlineData("2026-07-01")]
    [InlineData("2026-10-25")]
    public async Task Der_Eintrag_am_Folgetag_um_Mitternacht_ist_nicht_dabei(string tag)
    {
        await TestdatenAsync();
        var s = Stichtage[tag];
        var danach = await ErwartetAsync(ab: s.Danach, vor: s.Danach.AddTicks(10));

        var json = await AuditAsync($"?von={tag}&bis={tag}&groesse=100");

        Assert.Equal(2, danach.Length);
        Assert.Empty(Ids(json).Intersect(danach));
    }

    [Theory]
    [InlineData("2026-01-15")]
    [InlineData("2026-03-29")]
    [InlineData("2026-07-01")]
    [InlineData("2026-10-25")]
    public async Task Erster_und_letzter_Mikrosekunden_Eintrag_des_Tages_sind_dabei(string tag)
    {
        await TestdatenAsync();
        var s = Stichtage[tag];
        var erster = await ErwartetAsync(ab: s.Erster, vor: s.Erster.AddTicks(10));
        var letzter = await ErwartetAsync(ab: s.Letzter, vor: s.Letzter.AddTicks(10));

        var json = await AuditAsync($"?von={tag}&bis={tag}&groesse=100");

        Assert.Subset(Ids(json).ToHashSet(), erster.Concat(letzter).ToHashSet());
    }

    // ---------- AK-3: einseitiger Zeitraum ----------

    [Fact]
    public async Task Nur_von_liefert_alle_Eintraege_ab_Tagesbeginn_einschliesslich()
    {
        await TestdatenAsync();

        var json = await AuditAsync("?von=2026-03-29&groesse=100");

        Assert.Equal(await ErwartetAsync(ab: Stichtage["2026-03-29"].Erster), Ids(json));
    }

    [Fact]
    public async Task Nur_bis_liefert_alle_Eintraege_bis_Tagesende_einschliesslich()
    {
        await TestdatenAsync();

        var json = await AuditAsync("?bis=2026-07-01&groesse=100");

        Assert.Equal(await ErwartetAsync(vor: Stichtage["2026-07-01"].Danach), Ids(json));
    }

    [Fact]
    public async Task Nur_von_zaehlt_in_gesamt_nur_die_Eintraege_ab_Tagesbeginn()
    {
        await TestdatenAsync();

        var json = await AuditAsync("?von=2026-10-25");

        Assert.Equal((await ErwartetAsync(ab: Stichtage["2026-10-25"].Erster)).Length, Gesamt(json));
    }

    [Fact]
    public async Task Ein_Zeitraum_ueber_mehrere_Stichtage_schliesst_beide_Randtage_ein()
    {
        await TestdatenAsync();

        var json = await AuditAsync("?von=2026-03-29&bis=2026-10-25&groesse=100");

        Assert.Equal(await ErwartetAsync(ab: Stichtage["2026-03-29"].Erster, vor: Stichtage["2026-10-25"].Danach), Ids(json));
    }

    [Fact]
    public async Task Ein_Zeitraum_ohne_Eintraege_liefert_eine_leere_Liste_mit_gesamt_0()
    {
        await TestdatenAsync();

        var json = await AuditAsync("?von=2025-05-01&bis=2025-05-31");

        Assert.Equal((0, 0), (Ids(json).Length, Gesamt(json)));
    }

    // ---------- AK-4: Aktion ----------

    [Theory]
    [InlineData("Rolle")]
    [InlineData("Status")]
    public async Task Eine_Aktion_liefert_nur_Eintraege_dieser_Art(string art)
    {
        await TestdatenAsync();

        var json = await AuditAsync($"?aktion={art}&groesse=100");

        Assert.Equal(await ErwartetAsync(arten: [art]), Ids(json));
    }

    [Theory]
    [InlineData("Rolle")]
    [InlineData("Status")]
    public async Task Eine_Aktion_liefert_im_Feld_art_nur_diese_Art(string art)
    {
        await TestdatenAsync();

        var json = await AuditAsync($"?aktion={art}&groesse=100");

        Assert.All(json.GetProperty("eintraege").EnumerateArray(), e => Assert.Equal(art, e.GetProperty("art").GetString()));
    }

    [Fact]
    public async Task Aktion_Status_hat_das_passende_gesamt()
    {
        await TestdatenAsync();

        var json = await AuditAsync("?aktion=Status");

        Assert.Equal((await ErwartetAsync(arten: ["Status"])).Length, Gesamt(json));
    }

    [Fact]
    public async Task Beide_Aktionen_liefern_alle_Eintraege()
    {
        await TestdatenAsync();

        var json = await AuditAsync("?aktion=Rolle&aktion=Status&groesse=100");

        Assert.Equal(await ErwartetAsync(), Ids(json));
    }

    [Fact]
    public async Task Doppelte_Aktionen_aendern_das_Ergebnis_nicht()
    {
        await TestdatenAsync();
        var einfach = await AuditAsync("?aktion=Status&groesse=100");

        var doppelt = await AuditAsync("?aktion=Status&aktion=Status&groesse=100");

        Assert.Equal(Ids(einfach), Ids(doppelt));
        Assert.Equal(Gesamt(einfach), Gesamt(doppelt));
    }

    // ---------- AK-5: Kombinationen, Sortierung, Blättern ----------

    [Fact]
    public async Task Zeitraum_und_Aktion_liefern_die_Schnittmenge()
    {
        await TestdatenAsync();

        var json = await AuditAsync("?von=2026-03-29&bis=2026-07-01&aktion=Rolle&groesse=100");

        Assert.Equal(
            await ErwartetAsync(ab: Stichtage["2026-03-29"].Erster, vor: Stichtage["2026-07-01"].Danach, arten: ["Rolle"]),
            Ids(json));
    }

    [Fact]
    public async Task Zeitraum_und_Benutzer_liefern_die_Schnittmenge()
    {
        var daten = await TestdatenAsync();

        var json = await AuditAsync($"?von=2026-01-15&bis=2026-03-29&benutzerId={daten.BenutzerA}&groesse=100");

        Assert.Equal(
            await ErwartetAsync(ab: Stichtage["2026-01-15"].Erster, vor: Stichtage["2026-03-29"].Danach, benutzer: daten.BenutzerA),
            Ids(json));
    }

    [Fact]
    public async Task Aktion_und_Benutzer_liefern_die_Schnittmenge()
    {
        var daten = await TestdatenAsync();

        var json = await AuditAsync($"?aktion=Status&benutzerId={daten.BenutzerB}&groesse=100");

        Assert.Equal(await ErwartetAsync(arten: ["Status"], benutzer: daten.BenutzerB), Ids(json));
    }

    [Fact]
    public async Task Zeitraum_Aktion_und_Benutzer_liefern_die_Schnittmenge()
    {
        var daten = await TestdatenAsync();

        var json = await AuditAsync($"?von=2026-10-25&bis=2026-10-25&aktion=Rolle&benutzerId={daten.BenutzerA}&groesse=100");

        var erwartet = await ErwartetAsync(
            ab: Stichtage["2026-10-25"].Erster, vor: Stichtage["2026-10-25"].Danach, arten: ["Rolle"], benutzer: daten.BenutzerA);
        Assert.Single(erwartet);
        Assert.Equal(erwartet, Ids(json));
    }

    [Fact]
    public async Task Alle_drei_Filter_zaehlen_in_gesamt_nur_die_Schnittmenge()
    {
        var daten = await TestdatenAsync();

        var json = await AuditAsync($"?von=2026-01-15&bis=2026-10-25&aktion=Status&benutzerId={daten.BenutzerB}");

        var erwartet = await ErwartetAsync(
            ab: Stichtage["2026-01-15"].Erster, vor: Stichtage["2026-10-25"].Danach, arten: ["Status"], benutzer: daten.BenutzerB);
        Assert.Equal(erwartet.Length, Gesamt(json));
    }

    [Fact]
    public async Task Gefilterte_Eintraege_sind_nach_Zeitpunkt_und_dann_id_absteigend_sortiert()
    {
        await TestdatenAsync();

        var json = await AuditAsync("?von=2026-01-15&bis=2026-10-25&groesse=100");

        var zeitpunkte = json.GetProperty("eintraege").EnumerateArray().Select(e => e.GetProperty("zeitpunkt").GetDateTimeOffset()).ToArray();
        Assert.Equal(zeitpunkte.OrderDescending(), zeitpunkte);
        Assert.Equal(await ErwartetAsync(ab: Stichtage["2026-01-15"].Erster, vor: Stichtage["2026-10-25"].Danach), Ids(json));
    }

    [Fact]
    public async Task Blaettern_laeuft_ueber_die_gefilterte_Menge()
    {
        await TestdatenAsync();
        var erwartet = await ErwartetAsync(ab: Stichtage["2026-01-15"].Erster, arten: ["Rolle"]);

        var json = await AuditAsync("?von=2026-01-15&aktion=Rolle&seite=2&groesse=3");

        Assert.Equal(erwartet.Skip(3).Take(3).ToArray(), Ids(json));
    }

    [Fact]
    public async Task Blaettern_behaelt_gesamt_der_gefilterten_Menge()
    {
        await TestdatenAsync();
        var erwartet = await ErwartetAsync(ab: Stichtage["2026-01-15"].Erster, arten: ["Rolle"]);

        var json = await AuditAsync("?von=2026-01-15&aktion=Rolle&seite=2&groesse=3");

        Assert.Equal((erwartet.Length, 2, 3), (Gesamt(json), json.GetProperty("seite").GetInt32(), json.GetProperty("groesse").GetInt32()));
    }

    [Fact]
    public async Task Eine_Seite_hinter_dem_Ende_liefert_keine_Eintraege_und_das_richtige_gesamt()
    {
        await TestdatenAsync();

        var json = await AuditAsync("?von=2026-07-01&bis=2026-07-01&aktion=Status&seite=5&groesse=25");

        Assert.Empty(Ids(json));
        Assert.Equal(2, Gesamt(json));
    }

    // ---------- AK-6: 400 mit deutscher Meldung ----------

    [Theory]
    [InlineData("2026-13-01")]
    [InlineData("2026-02-30")]
    [InlineData("01.10.2026")]
    [InlineData("2026-1-5")]
    [InlineData("abc")]
    [InlineData("1999-12-31")]
    [InlineData("3000-01-01")]
    public async Task Ungueltiges_von_liefert_400_mit_der_Datumsmeldung(string wert)
    {
        var errors = await FehlerAsync($"?von={Uri.EscapeDataString(wert)}");

        Assert.Equal([DatumMeldung], Meldungen(errors, "von"));
    }

    [Theory]
    [InlineData("2026-13-01")]
    [InlineData("2026-02-30")]
    [InlineData("01.10.2026")]
    [InlineData("2026-1-5")]
    [InlineData("abc")]
    [InlineData("1999-12-31")]
    [InlineData("3000-01-01")]
    public async Task Ungueltiges_bis_liefert_400_mit_der_Datumsmeldung(string wert)
    {
        var errors = await FehlerAsync($"?bis={Uri.EscapeDataString(wert)}");

        Assert.Equal([DatumMeldung], Meldungen(errors, "bis"));
    }

    [Theory]
    [InlineData("von")]
    [InlineData("bis")]
    public async Task Doppelt_angegebenes_Datum_liefert_400_mit_der_Datumsmeldung(string feld)
    {
        var errors = await FehlerAsync($"?{feld}=2026-10-01&{feld}=2026-10-02");

        Assert.Equal([DatumMeldung], Meldungen(errors, feld));
    }

    [Fact]
    public async Task Von_nach_bis_liefert_400_am_Schluessel_bis()
    {
        var errors = await FehlerAsync("?von=2026-10-31&bis=2026-10-01");

        Assert.Equal(["bis"], Schluessel(errors));
        Assert.Equal([ReihenfolgeMeldung], Meldungen(errors, "bis"));
    }

    [Fact]
    public async Task Zeitraum_von_367_Tagen_liefert_400_am_Schluessel_bis()
    {
        var errors = await FehlerAsync("?von=2026-01-01&bis=2027-01-02");

        Assert.Equal(["bis"], Schluessel(errors));
        Assert.Equal([ZeitraumMeldung], Meldungen(errors, "bis"));
    }

    [Fact]
    public async Task Zeitraum_von_366_Tagen_ist_gueltig()
    {
        await AdminIdAsync();

        using var antwort = await Client.GetAsync($"{AuditUrl}?von=2026-01-01&bis=2027-01-01");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Theory]
    [InlineData("rolle")]
    [InlineData("Unbekannt")]
    public async Task Unbekannte_Aktion_liefert_400_mit_der_Aktionsmeldung(string wert)
    {
        var errors = await FehlerAsync($"?aktion={wert}");

        Assert.Equal(["aktion"], Schluessel(errors));
        Assert.Equal([AktionMeldung], Meldungen(errors, "aktion"));
    }

    [Fact]
    public async Task Mehrere_Fehler_kommen_gemeinsam()
    {
        var errors = await FehlerAsync("?von=abc&bis=2026-13-01&aktion=Unbekannt&seite=0");

        Assert.Equal(["aktion", "bis", "seite", "von"], Schluessel(errors));
    }

    [Fact]
    public async Task Die_Meldungen_wiederholen_keine_Eingabewerte()
    {
        using var antwort = await Client.GetAsync($"{AuditUrl}?von=Eingabewert1&bis=Eingabewert2&aktion=Eingabewert3");
        var body = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        Assert.DoesNotContain("Eingabewert", body, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("?von=")]
    [InlineData("?bis=")]
    [InlineData("?aktion=")]
    [InlineData("?von=&bis=&aktion=")]
    public async Task Leere_Werte_gelten_als_nicht_angegeben(string query)
    {
        await TestdatenAsync();

        var json = await AuditAsync($"{query}&groesse=100");

        Assert.Equal(await ErwartetAsync(), Ids(json));
    }

    // ---------- AK-8: 403 vor 400 ----------

    [Theory]
    [InlineData("Betrachter", "?von=2026-10-01&bis=2026-10-31&aktion=Status")]
    [InlineData("Sachbearbeiter", "?von=2026-10-01&bis=2026-10-31&aktion=Status")]
    [InlineData(null, "?von=2026-10-01&bis=2026-10-31&aktion=Status")]
    [InlineData("Betrachter", "?von=abc&bis=2026-13-01&aktion=rolle")]
    [InlineData("Sachbearbeiter", "?von=abc&bis=2026-13-01&aktion=rolle")]
    [InlineData(null, "?von=2026-10-31&bis=2026-10-01")]
    public async Task Ohne_audit_read_gibt_es_auch_mit_Filtern_403_keine_berechtigung(string? rolle, string query)
    {
        var client = await ClientMitRolleAsync(rolle);

        using var antwort = await client.GetAsync($"{AuditUrl}{query}");

        await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
    }

    [Fact]
    public async Task Deaktivierte_erhalten_auch_mit_ungueltigen_Filtern_403_benutzer_deaktiviert()
    {
        var client = await ClientMitRolleAsync("Administrator", aktiv: false);

        using var antwort = await client.GetAsync($"{AuditUrl}?von=abc&aktion=rolle");

        await AssertKeinZugriffAsync(antwort, "benutzer_deaktiviert");
    }

    [Fact]
    public async Task Anonym_gibt_es_auch_mit_ungueltigen_Filtern_401()
    {
        using var antwort = await Anonym.GetAsync($"{AuditUrl}?von=abc&aktion=rolle");

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Die_403_Meldung_nennt_das_Aenderungsprotokoll()
    {
        var client = await ClientMitRolleAsync("Betrachter");

        using var antwort = await client.GetAsync($"{AuditUrl}?aktion=Status");

        var json = await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
        Assert.Equal("Ihr Benutzerkonto ist nicht berechtigt, das Änderungsprotokoll einzusehen.", json.GetProperty("detail").GetString());
    }

    // ---------- AK-9: nur lesen, Log ohne Query-Werte ----------

    [Fact]
    public async Task Filterabfragen_aendern_weder_Zahl_noch_Inhalt_der_Audit_Zeilen()
    {
        var daten = await TestdatenAsync();
        var vorher = await AuditDb.AlleAsync();

        foreach (var query in new[]
        {
            "", "?von=2026-03-29&bis=2026-03-29", "?von=2026-10-25", "?bis=2026-01-15", "?aktion=Rolle", "?aktion=Rolle&aktion=Status",
            $"?von=2026-01-15&bis=2026-10-25&aktion=Status&benutzerId={daten.BenutzerA}", "?seite=9&groesse=1",
            "?von=abc", "?von=2026-10-31&bis=2026-10-01", "?von=2026-01-01&bis=2027-01-02", "?aktion=rolle",
        })
        {
            using (await Client.GetAsync($"{AuditUrl}{query}"))
            {
            }
        }

        Assert.Equal(vorher, await AuditDb.AlleAsync());
    }

    [Fact]
    public async Task Das_Log_enthaelt_keine_Filterwerte_und_als_Route_nur_das_Template()
    {
        var logs = new SammelLoggerProvider();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Logger = logs,
            Einstellungen = new Dictionary<string, string?>
            {
                ["Logging:LogLevel:Default"] = "Trace",
                ["Logging:LogLevel:Microsoft"] = "Trace",
                ["Logging:LogLevel:Microsoft.AspNetCore"] = "Trace",
            },
        });
        using var admin = factory.CreateClient();
        using (await admin.GetAsync(MeUrl))
        {
        }

        var ziel = await KontoAsync(null, name: "Test Logziel Filter");
        var betrachter = Idp.ErzeugeToken(new TokenDaten { Subject = "sub-log-filter-betrachter", Email = "log.filter@coin-test.invalid", Name = "Test Log Filter" });
        using var betrachterClient = factory.ClientMitToken(betrachter);
        var abfragen = new[]
        {
            (admin, $"{AuditUrl}?von=2026-03-29&bis=2026-03-30&aktion=Status&benutzerId={ziel.Id}"),
            (admin, $"{AuditUrl}?von=1999-12-31&aktion=Unbekanntwert"),
            (admin, $"{AuditUrl}/aktionen"),
            (betrachterClient, $"{AuditUrl}?von=2026-03-29&aktion=Status&benutzerId={ziel.Id}"),
        };
        foreach (var (client, url) in abfragen)
        {
            using (await client.GetAsync(url))
            {
            }
        }

        Assert.All(
            ["2026-03-29", "2026-03-30", "1999-12-31", "Unbekanntwert", "aktion=", "von=", ziel.Id.ToString(), ziel.Name],
            wert => Assert.DoesNotContain(wert, logs.Gesamt, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Das_Request_Protokoll_nennt_die_Audit_Routen_nur_als_Template()
    {
        var logs = new SammelLoggerProvider();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { Logger = logs });
        using var admin = factory.CreateClient();
        using (await admin.GetAsync($"{AuditUrl}?von=2026-03-29&aktion=Status"))
        {
        }

        using (await admin.GetAsync($"{AuditUrl}/aktionen"))
        {
        }

        var routen = logs.Strukturiert
            .Where(e => e.Kategorie == "Coin.Api.Http.AnfrageProtokoll")
            .Select(e => Convert.ToString(e.Werte.GetValueOrDefault("Route"), CultureInfo.InvariantCulture))
            .Where(r => r is not null && r.Contains("audit", StringComparison.Ordinal))
            .ToHashSet(StringComparer.Ordinal);

        Assert.Equal(new HashSet<string?>(["/api/audit", "/api/audit/aktionen"]), routen);
    }
}
