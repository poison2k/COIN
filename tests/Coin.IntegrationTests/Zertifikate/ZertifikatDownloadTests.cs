using System.Net;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;
using Npgsql;

namespace Coin.IntegrationTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-7, AK-18, AK-20 und AK-22 (ADR-0029): Header und Dateiname des Downloads,
/// Fehlerreihenfolge (404, 409 storniert), Audit je erfolgreichem Download (atomar mit der Storno-Prüfung,
/// unveränderlich, ohne Empfängerdaten) und der Lese-Endpunkt <c>GET …/ausgaben/{ausgabeId}</c>.
/// </summary>
public class ZertifikatDownloadTests(PostgresFixture fixture) : ZertifikatTestBasis(fixture)
{
    private static string SqlState(Exception? fehler) => Assert.IsType<PostgresException>(fehler).SqlState;

    // ---------- AK-7: Header und Dateiname ----------

    [Fact]
    public async Task Download_liefert_200_mit_den_Download_Headern_und_dem_Dateinamen_aus_der_Nummer()
    {
        var k = await AusgabeAsync(exemplar: 12);

        using var antwort = await GetZertifikatAsync(k);

        AssertDownloadHeader(antwort, $"Zertifikat_{k.Nummer}.docx");
    }

    [Fact]
    public async Task Dateiname_besteht_nur_aus_ASCII_Zeichen_und_folgt_dem_Muster()
    {
        var k = await AusgabeAsync(exemplar: 3);

        using var antwort = await GetZertifikatAsync(k);
        var name = antwort.Content.Headers.ContentDisposition?.FileName?.Trim('"') ?? string.Empty;

        Assert.Matches(@"^Zertifikat_C[0-9]{4,}-[0-9]{4,}\.docx$", name);
        Assert.All(string.Join(";", antwort.Content.Headers.GetValues("Content-Disposition")), c => Assert.True(c < 128, $"Nicht-ASCII-Zeichen {(int)c}."));
    }

    [Fact]
    public async Task Download_setzt_Cache_Control_no_store()
    {
        var k = await AusgabeAsync();

        using var antwort = await GetZertifikatAsync(k);

        Assert.True(antwort.Headers.CacheControl?.NoStore, "Cache-Control ohne no-store.");
    }

    [Fact]
    public async Task Antwort_ist_ein_DOCX()
    {
        var k = await AusgabeAsync();

        var bytes = await ZertifikatAsync(k);

        Assert.Equal((byte)'P', bytes[0]);
        Assert.Equal((byte)'K', bytes[1]);
        Assert.Contains("word/document.xml", DocxLeser.Eintraege(bytes).Keys);
    }

    [Fact]
    public async Task CORS_gibt_Content_Disposition_fuer_das_Frontend_frei()
    {
        var k = await AusgabeAsync();
        using var anfrage = new HttpRequestMessage(HttpMethod.Get, ZertifikatUrl(k.CoinId, k.AusgabeId));
        anfrage.Headers.Add("Origin", CoinApiFactory.FrontendUrsprung);

        using var antwort = await Client.SendAsync(anfrage);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Contains("Content-Disposition",
            string.Join(",", antwort.Headers.TryGetValues("Access-Control-Expose-Headers", out var werte) ? werte : []),
            StringComparison.OrdinalIgnoreCase);
    }

    // ---------- AK-18: 404 ----------

    [Fact]
    public async Task Unbekannter_Coin_liefert_404_Ausgabe_nicht_gefunden()
    {
        var k = await AusgabeAsync();

        using var antwort = await Client.GetAsync(ZertifikatUrl(Guid.NewGuid(), k.AusgabeId));

        await AssertAusgabeNichtGefundenAsync(antwort);
    }

    [Fact]
    public async Task Unbekannte_Ausgabe_liefert_404_Ausgabe_nicht_gefunden()
    {
        var k = await AusgabeAsync();

        using var antwort = await Client.GetAsync(ZertifikatUrl(k.CoinId, Guid.NewGuid()));

        await AssertAusgabeNichtGefundenAsync(antwort);
    }

    [Fact]
    public async Task Ausgabe_eines_anderen_Coins_liefert_404()
    {
        var k = await AusgabeAsync();
        var andererCoin = await CoinMitAuflageAsync(5);

        using var antwort = await Client.GetAsync(ZertifikatUrl(andererCoin, k.AusgabeId));

        await AssertAusgabeNichtGefundenAsync(antwort);
    }

    [Theory]
    [InlineData("keine-guid")]
    [InlineData("12")]
    public async Task Ausgabe_Id_ohne_GUID_Format_liefert_404(string ausgabeId)
    {
        var k = await AusgabeAsync();

        using var antwort = await Client.GetAsync($"{AusgabenUrl(k.CoinId)}/{ausgabeId}/zertifikat");

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Fact]
    public async Task Abgelehnte_Downloads_schreiben_kein_Audit()
    {
        var k = await AusgabeAsync();
        var betrachter = await ClientMitRolleAsync("Betrachter");

        using (await Client.GetAsync(ZertifikatUrl(Guid.NewGuid(), k.AusgabeId)))
        using (await Client.GetAsync(ZertifikatUrl(k.CoinId, Guid.NewGuid())))
        using (await GetZertifikatAsync(k, betrachter))
        using (await GetZertifikatAsync(k, Anonym))
        {
        }

        Assert.Equal(0L, await ZertifikatDb.AnzahlAsync());
    }

    // ---------- AK-18: 409 storniert ----------

    [Fact]
    public async Task Stornierte_Ausgabe_liefert_409_ausgabe_storniert()
    {
        var k = await AusgabeAsync();
        await StornierenAsync(k.CoinId, k.AusgabeId);

        using var antwort = await GetZertifikatAsync(k);

        await AssertZertifikatKonfliktAsync(antwort, "ausgabe_storniert", DetailStorniert);
    }

    [Fact]
    public async Task Stornierte_Ausgabe_schreibt_kein_Audit()
    {
        var k = await AusgabeAsync();
        await StornierenAsync(k.CoinId, k.AusgabeId);

        using (await GetZertifikatAsync(k))
        {
        }

        Assert.Equal(0L, await ZertifikatDb.AnzahlAsync());
    }

    [Fact]
    public async Task Bei_stornierter_und_aktiver_Ausgabe_gleicher_Nummer_liefert_die_stornierte_409_und_die_aktive_200()
    {
        var alt = await AusgabeAsync(exemplar: 12);
        await StornierenAsync(alt.CoinId, alt.AusgabeId);
        var neu = await AusgabeZuAsync(alt.CoinId, 12);
        Assert.Equal(alt.Nummer, neu.Nummer);

        using var stornierte = await GetZertifikatAsync(alt);
        using var aktive = await GetZertifikatAsync(neu);

        Assert.Equal((HttpStatusCode.Conflict, HttpStatusCode.OK), (stornierte.StatusCode, aktive.StatusCode));
    }

    [Fact]
    public async Task Storno_zwischen_Laden_und_Audit_liefert_409_ohne_Datei_und_ohne_Audit()
    {
        // Testhaken: Der Erzeuger storniert die Ausgabe per SQL, bevor er erzeugt – also nach dem Laden und vor dem
        // Audit-Eintrag (ADR-0029 Punkt 4: INSERT … WHERE storniert_am IS NULL).
        var k = await AusgabeAsync();
        var adminId = await AdminIdAsync();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Dienste = dienste => ZertifikatErzeugerErsatz.MitVorlauf(dienste, async () =>
                Assert.Null(await AusgabeDb.PerSqlStornierenAsync(k.AusgabeId, adminId))),
        });
        using var client = factory.CreateClient();

        using var antwort = await client.GetAsync(ZertifikatUrl(k.CoinId, k.AusgabeId));

        await AssertZertifikatKonfliktAsync(antwort, "ausgabe_storniert", DetailStorniert);
        Assert.Equal(0L, await ZertifikatDb.AnzahlAsync());
    }

    // ---------- AK-20: Audit ----------

    [Fact]
    public async Task Erfolgreicher_Download_schreibt_genau_einen_Audit_Eintrag()
    {
        var k = await AusgabeAsync();

        await ZertifikatAsync(k);

        Assert.Single(await ZertifikatDb.AuditAsync());
    }

    [Fact]
    public async Task Audit_Eintrag_nennt_Akteur_Ausgabe_Coin_Nummer_und_Art()
    {
        var sachbearbeiter = await KontoAsync("Sachbearbeiter");
        var k = await AusgabeAsync();

        await ZertifikatAsync(k, sachbearbeiter.Client);

        var eintrag = Assert.Single(await ZertifikatDb.AuditAsync());
        Assert.Equal(
            (sachbearbeiter.Id, k.AusgabeId, k.CoinId, k.Nummer, "Heruntergeladen"),
            (eintrag.AkteurId, eintrag.AusgabeId, eintrag.CoinId, eintrag.Zertifikatsnummer, eintrag.Art));
    }

    [Fact]
    public async Task Audit_Zeitpunkt_liegt_im_Zeitraum_des_Downloads()
    {
        var k = await AusgabeAsync();
        var vorher = DateTimeOffset.UtcNow.AddSeconds(-5);

        await ZertifikatAsync(k);

        var eintrag = Assert.Single(await ZertifikatDb.AuditAsync());
        Assert.InRange(eintrag.Zeitpunkt, vorher, DateTimeOffset.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task Audit_mit_Standardvorlage_hat_vorlage_version_null()
    {
        var k = await AusgabeAsync();

        await ZertifikatAsync(k);

        Assert.Null(Assert.Single(await ZertifikatDb.AuditAsync()).VorlageVersion);
    }

    [Fact]
    public async Task Audit_mit_eigener_Vorlage_nennt_die_aktive_Version()
    {
        var k = await AusgabeAsync();
        await LadeVorlageHochAsync(k.CoinId, DocxBauer.Gueltig().Bytes());
        var version = await LadeVorlageHochAsync(k.CoinId, Zertifikatvorlagen.MitAbsaetzen(DocxBauer.Text("Zweite Fassung")).Bytes());

        await ZertifikatAsync(k);

        Assert.Equal(version, Assert.Single(await ZertifikatDb.AuditAsync()).VorlageVersion);
        Assert.Equal(2, version);
    }

    [Fact]
    public async Task Zwei_Downloads_schreiben_zwei_Eintraege()
    {
        var k = await AusgabeAsync();

        await ZertifikatAsync(k);
        await ZertifikatAsync(k);

        Assert.Equal(2, (await ZertifikatDb.AuditAsync()).Count);
    }

    [Fact]
    public async Task Nach_Neuausgabe_haben_Downloads_dieselbe_Nummer_aber_verschiedene_ausgabe_id()
    {
        var alt = await AusgabeAsync(exemplar: 12);
        await ZertifikatAsync(alt);
        await StornierenAsync(alt.CoinId, alt.AusgabeId);
        var neu = await AusgabeZuAsync(alt.CoinId, 12);

        await ZertifikatAsync(neu);

        var eintraege = await ZertifikatDb.AuditAsync();
        Assert.Equal([alt.Nummer, alt.Nummer], eintraege.Select(e => e.Zertifikatsnummer));
        Assert.Equal([alt.AusgabeId, neu.AusgabeId], eintraege.Select(e => e.AusgabeId));
    }

    [Fact]
    public async Task Audit_hat_genau_die_Spalten_aus_Abschnitt_6()
    {
        Assert.Equal(
            ["akteur_id", "art", "ausgabe_id", "coin_id", "id", "vorlage_version", "zeitpunkt", "zertifikatsnummer"],
            await ZertifikatDb.SpaltenAsync());
    }

    [Fact]
    public async Task Audit_enthaelt_keine_Empfaengerdaten_und_keine_Ausgabewerte()
    {
        var werte = new[] { "Audit Empfaenger Za81", "Audit Dienstgrad Za82", "Audit Dienststelle Za83", "Audit Gelegenheit Za84", "Audit Begruendung Za85", "Audit Stelle Za86" };
        var coinId = await CoinMitAuflageAsync(5, "Audit Coin Za87");
        var k = await AusgabeZuAsync(coinId, 1, GueltigeAusgabe(1, werte[0], werte[1], werte[2], Datum, werte[3], werte[4], werte[5]));

        await ZertifikatAsync(k);

        var text = await ZertifikatDb.AlsTextAsync();
        Assert.NotEmpty(text);
        Assert.DoesNotContain("Za8", text, StringComparison.Ordinal);
        Assert.DoesNotContain("PK", text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task UPDATE_eines_Audit_Eintrags_per_SQL_scheitert()
    {
        var k = await AusgabeAsync();
        await ZertifikatAsync(k);

        var fehler = await ZertifikatDb.RohAusfuehrenAsync("UPDATE zertifikat_audit SET zertifikatsnummer = 'C0000-0000'");

        AssertAbgelehnt(fehler);
        Assert.Equal(k.Nummer, Assert.Single(await ZertifikatDb.AuditAsync()).Zertifikatsnummer);
    }

    [Fact]
    public async Task DELETE_eines_Audit_Eintrags_per_SQL_scheitert()
    {
        var k = await AusgabeAsync();
        await ZertifikatAsync(k);

        var fehler = await ZertifikatDb.RohAusfuehrenAsync("DELETE FROM zertifikat_audit");

        AssertAbgelehnt(fehler);
        Assert.Single(await ZertifikatDb.AuditAsync());
    }

    [Fact]
    public async Task Audit_mit_unzulaessiger_Art_scheitert_am_Check_Constraint()
    {
        var k = await AusgabeAsync();
        var adminId = await AdminIdAsync();

        var fehler = await ZertifikatDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO zertifikat_audit (id, zeitpunkt, akteur_id, ausgabe_id, coin_id, zertifikatsnummer, vorlage_version, art)
            VALUES (gen_random_uuid(), now(), '{adminId}', '{k.AusgabeId}', '{k.CoinId}', '{k.Nummer}', NULL, 'Gedruckt')
            """);

        Assert.Equal(PostgresErrorCodes.CheckViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Audit_zu_einer_unbekannten_Ausgabe_scheitert_am_Fremdschluessel()
    {
        var k = await AusgabeAsync();
        var adminId = await AdminIdAsync();

        var fehler = await ZertifikatDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO zertifikat_audit (id, zeitpunkt, akteur_id, ausgabe_id, coin_id, zertifikatsnummer, vorlage_version, art)
            VALUES (gen_random_uuid(), now(), '{adminId}', '{Guid.NewGuid()}', '{k.CoinId}', '{k.Nummer}', NULL, 'Heruntergeladen')
            """);

        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Es_gibt_keinen_Lese_Endpunkt_fuer_das_Download_Audit()
    {
        var k = await AusgabeAsync();

        using var antwort = await Client.GetAsync($"{ZertifikatUrl(k.CoinId, k.AusgabeId)}/audit");

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    // ---------- AK-22: GET …/ausgaben/{ausgabeId} ----------

    [Fact]
    public async Task Einzelne_Ausgabe_liefert_200_im_Format_der_Historie()
    {
        var k = await AusgabeAsync(exemplar: 7);
        var ausHistorie = Assert.Single((await HistorieAsync(k.CoinId)).GetProperty("eintraege").EnumerateArray());

        using var antwort = await Client.GetAsync(AusgabeUrl(k.CoinId, k.AusgabeId));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(ausHistorie.GetRawText(), (await JsonAsync(antwort)).GetRawText());
    }

    [Fact]
    public async Task Einzelne_Ausgabe_hat_die_Felder_aus_Abschnitt_5_3()
    {
        var k = await AusgabeAsync(exemplar: 7);

        using var antwort = await Client.GetAsync(AusgabeUrl(k.CoinId, k.AusgabeId));
        var json = await JsonAsync(antwort);

        Assert.Equal(
            ["ausgebendeStelle", "begruendung", "datum", "empfaenger", "erfasstAm", "erfasstVon", "exemplarNummer", "gelegenheit", "id", "storno", "zertifikatsnummer"],
            Feldnamen(json));
        Assert.Equal((7, k.Nummer), (json.GetProperty("exemplarNummer").GetInt32(), json.GetProperty("zertifikatsnummer").GetString()));
    }

    [Fact]
    public async Task Stornierte_Ausgabe_ist_einzeln_lesbar_mit_Storno()
    {
        var k = await AusgabeAsync();
        await StornierenAsync(k.CoinId, k.AusgabeId, "Test Storno Einzeln");

        using var antwort = await Client.GetAsync(AusgabeUrl(k.CoinId, k.AusgabeId));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        var storno = (await JsonAsync(antwort)).GetProperty("storno");
        Assert.Equal(JsonValueKind.Object, storno.ValueKind);
        Assert.Equal("Test Storno Einzeln", storno.GetProperty("grund").GetString());
    }

    [Fact]
    public async Task Einzelne_Ausgabe_setzt_Cache_Control_no_store()
    {
        var k = await AusgabeAsync();

        using var antwort = await Client.GetAsync(AusgabeUrl(k.CoinId, k.AusgabeId));

        Assert.True(antwort.Headers.CacheControl?.NoStore, "Cache-Control ohne no-store.");
    }

    [Fact]
    public async Task Einzelne_Ausgabe_eines_anderen_Coins_liefert_404()
    {
        var k = await AusgabeAsync();
        var andererCoin = await CoinMitAuflageAsync(5);

        using var antwort = await Client.GetAsync(AusgabeUrl(andererCoin, k.AusgabeId));

        await AssertAusgabeNichtGefundenAsync(antwort);
    }

    [Fact]
    public async Task Unbekannte_einzelne_Ausgabe_liefert_404()
    {
        var k = await AusgabeAsync();

        using var antwort = await Client.GetAsync(AusgabeUrl(k.CoinId, Guid.NewGuid()));

        await AssertAusgabeNichtGefundenAsync(antwort);
    }

    [Fact]
    public async Task Einzelne_Ausgabe_bei_unbekanntem_Coin_liefert_404()
    {
        var k = await AusgabeAsync();

        using var antwort = await Client.GetAsync(AusgabeUrl(Guid.NewGuid(), k.AusgabeId));

        await AssertAusgabeNichtGefundenAsync(antwort);
    }

    [Fact]
    public async Task Lesen_einer_einzelnen_Ausgabe_schreibt_kein_Audit()
    {
        var k = await AusgabeAsync();

        using (await Client.GetAsync(AusgabeUrl(k.CoinId, k.AusgabeId)))
        {
        }

        Assert.Equal(0L, await ZertifikatDb.AnzahlAsync());
    }

    [Fact]
    public async Task Erfassen_seite_bleibt_kein_Ausgabe_Lesepfad()
    {
        // /coins/{id}/ausgaben/neu ist im Frontend die Erfassen-Seite; die API kennt „neu“ nicht als Ausgabe-Id.
        var k = await AusgabeAsync();

        using var antwort = await Client.GetAsync($"{AusgabenUrl(k.CoinId)}/neu");

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }
}
