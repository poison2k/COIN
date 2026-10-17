using System.Globalization;
using System.Net;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;
using Npgsql;

namespace Coin.IntegrationTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-1 bis AK-5 (ADR-0027): Coin-Kennung per Sequenz, unveränderlich; Zertifikatsnummer
/// <c>&lt;Kennung&gt;-&lt;Exemplar&gt;</c> bei der Erfassung, eindeutig unter den aktiven Ausgaben, je Ausgabe
/// unveränderlich, gleich bei Neuausgabe nach Storno. Die Sequenz wird von <c>TRUNCATE</c> nicht zurückgesetzt; die
/// Tests vergleichen deshalb nur relativ zur Kennung des Coins.
/// </summary>
public class ZertifikatsnummerTests(PostgresFixture fixture) : ZertifikatTestBasis(fixture)
{
    private static string SqlState(Exception? fehler) => Assert.IsType<PostgresException>(fehler).SqlState;

    private static long Laufnummer(string kennung) => long.Parse(kennung[1..], CultureInfo.InvariantCulture);

    private async Task<string> KennungAsync(Guid coinId) =>
        await AusgabeDb.KennungAsync(coinId) ?? throw new Xunit.Sdk.XunitException("Coin ohne Kennung.");

    private static string Erwartet(string kennung, int exemplar) =>
        $"{kennung}-{exemplar.ToString(CultureInfo.InvariantCulture).PadLeft(4, '0')}";

    // ---------- AK-1: Kennung ----------

    [Fact]
    public async Task Neuer_Coin_erhaelt_eine_Kennung_C_mit_mindestens_vier_Ziffern()
    {
        var coinId = await LegeCoinAnUndLiefereIdAsync($"Coin Kennung {Guid.NewGuid():N}");

        Assert.Matches(KennungsMuster(), await KennungAsync(coinId));
    }

    [Fact]
    public async Task Nacheinander_angelegte_Coins_erhalten_aufsteigende_Kennungen()
    {
        var erster = await LegeCoinAnUndLiefereIdAsync("Coin Kennung Erster");
        var zweiter = await LegeCoinAnUndLiefereIdAsync("Coin Kennung Zweiter");

        Assert.True(Laufnummer(await KennungAsync(zweiter)) > Laufnummer(await KennungAsync(erster)));
    }

    [Fact]
    public async Task Ein_abgelehntes_Duplikat_verbraucht_eine_Nummer()
    {
        var erster = await LegeCoinAnUndLiefereIdAsync("Coin Kennung Luecke", "Herausgeber Luecke");
        using (var duplikat = await PostCoinAsync(GueltigerCoin("Coin Kennung Luecke", "Herausgeber Luecke")))
        {
            Assert.Equal(HttpStatusCode.Conflict, duplikat.StatusCode);
        }

        var zweiter = await LegeCoinAnUndLiefereIdAsync("Coin Kennung Nach Luecke", "Herausgeber Luecke");

        Assert.Equal(Laufnummer(await KennungAsync(erster)) + 2, Laufnummer(await KennungAsync(zweiter)));
    }

    [Fact]
    public async Task Mitgesendete_Kennung_beim_Anlegen_wird_ignoriert()
    {
        using var antwort = await PostRohJsonAsync("""{"name":"Coin Kennung Ignoriert","herausgeber":"H","kennung":"C9876"}""");
        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
        var coinId = (await JsonAsync(antwort)).GetProperty("id").GetGuid();

        Assert.NotEqual("C9876", await KennungAsync(coinId));
    }

    [Fact]
    public async Task Coin_Antwort_bleibt_bei_sieben_Feldern_ohne_Kennung()
    {
        var coin = await LegeCoinAnAsync("Coin Kennung Felder");

        Assert.Equal(["auflage", "beschreibung", "bildUrl", "erstelltAm", "herausgeber", "id", "name"], Feldnamen(coin));
    }

    [Fact]
    public async Task Oeffentliche_Coin_Antwort_enthaelt_die_Kennung_nicht()
    {
        var coinId = await LegeCoinAnUndLiefereIdAsync("Coin Kennung Oeffentlich");
        var kennung = await KennungAsync(coinId);

        using var einzeln = await Anonym.GetAsync($"{CoinsUrl}/{coinId}");
        using var liste = await Anonym.GetAsync(CoinsUrl);

        Assert.DoesNotContain(kennung, await einzeln.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.DoesNotContain(kennung, await liste.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Bearbeiten_aendert_die_Kennung_nicht_auch_wenn_eine_mitgesendet_wird()
    {
        var coinId = await LegeCoinAnUndLiefereIdAsync("Coin Kennung Bearbeiten");
        var vorher = await KennungAsync(coinId);

        using var antwort = await PutRohAsync(Client, $"{CoinsUrl}/{coinId}",
            """{"name":"Coin Kennung Bearbeitet","herausgeber":"Herausgeber Neu","auflage":null,"beschreibung":null,"kennung":"C0001"}""");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(vorher, await KennungAsync(coinId));
    }

    // ---------- AK-2: Kennung unveränderlich (DB) ----------

    [Fact]
    public async Task Aendern_der_Kennung_per_SQL_scheitert()
    {
        var coinId = await LegeCoinAnUndLiefereIdAsync("Coin Kennung SQL");
        var vorher = await KennungAsync(coinId);

        var fehler = await AusgabeDb.RohAusfuehrenAsync($"UPDATE coin_typ SET kennung = 'C9990' WHERE id = '{coinId}'");

        AssertAbgelehnt(fehler);
        Assert.Equal(vorher, await KennungAsync(coinId));
    }

    [Theory]
    [InlineData("name = 'Coin Kennung Neuer Name'")]
    [InlineData("auflage = 7")]
    [InlineData("beschreibung = 'Neu'")]
    public async Task Aendern_anderer_Spalten_per_SQL_bleibt_moeglich(string zuweisung)
    {
        var coinId = await LegeCoinAnUndLiefereIdAsync("Coin Kennung Andere Spalte");

        var fehler = await AusgabeDb.RohAusfuehrenAsync($"UPDATE coin_typ SET {zuweisung} WHERE id = '{coinId}'");

        Assert.Null(fehler);
    }

    [Fact]
    public async Task Setzen_der_aktiven_Vorlage_bleibt_moeglich()
    {
        var coinId = await LegeCoinAnUndLiefereIdAsync("Coin Kennung Vorlage");

        var version = await LadeVorlageHochAsync(coinId, DocxBauer.Gueltig().Bytes());

        Assert.Equal(version, await VorlageDb.AktiveVersionAsync(coinId));
    }

    [Fact]
    public async Task Kennung_mit_falschem_Format_scheitert_am_Check_Constraint()
    {
        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            "INSERT INTO coin_typ (id, name, herausgeber, erstellt_am, kennung) VALUES (gen_random_uuid(), 'Coin Check', 'H', now(), 'X12')");

        Assert.Equal(PostgresErrorCodes.CheckViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Doppelte_Kennung_scheitert_am_eindeutigen_Index()
    {
        var coinId = await LegeCoinAnUndLiefereIdAsync("Coin Kennung Doppelt");
        var kennung = await KennungAsync(coinId);

        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            $"INSERT INTO coin_typ (id, name, herausgeber, erstellt_am, kennung) VALUES (gen_random_uuid(), 'Coin Doppelt Zwei', 'H', now(), '{kennung}')");

        var postgres = Assert.IsType<PostgresException>(fehler);
        Assert.Equal((PostgresErrorCodes.UniqueViolation, "ux_coin_typ_kennung"), (postgres.SqlState, postgres.ConstraintName));
    }

    [Fact]
    public async Task Coin_per_SQL_ohne_Kennung_erhaelt_sie_per_Default()
    {
        var id = Guid.CreateVersion7();

        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            $"INSERT INTO coin_typ (id, name, herausgeber, erstellt_am) VALUES ('{id}', 'Coin Default', 'H', now())");

        Assert.Null(fehler);
        Assert.Matches(KennungsMuster(), await KennungAsync(id));
    }

    // ---------- AK-3: Zertifikatsnummer bei der Erfassung ----------

    [Fact]
    public async Task Antwort_der_Erfassung_enthaelt_Kennung_Bindestrich_vierstelliges_Exemplar()
    {
        var k = await AusgabeAsync(exemplar: 12);

        Assert.Equal(Erwartet(await KennungAsync(k.CoinId), 12), k.Nummer);
    }

    [Fact]
    public async Task Gespeicherte_Nummer_stimmt_mit_der_Antwort_ueberein()
    {
        var k = await AusgabeAsync(exemplar: 3);

        Assert.Equal(k.Nummer, await AusgabeDb.ZertifikatsnummerAsync(k.AusgabeId));
    }

    [Fact]
    public async Task Naechstes_freies_Exemplar_ergibt_dessen_Nummer()
    {
        var coinId = await CoinMitAuflageAsync(20);
        await AusgabeZuAsync(coinId, 1);

        var k = await AusgabeZuAsync(coinId);

        Assert.Equal(Erwartet(await KennungAsync(coinId), 2), k.Nummer);
    }

    [Theory]
    [InlineData(1, 1, "0001")]
    [InlineData(9999, 9999, "9999")]
    [InlineData(10000, 10000, "10000")]
    // Exemplar 1.000.000 deckt der Unit-Test ab (Auflage 1.000.000 legt eine Million Exemplare an).
    public async Task Exemplar_hat_mindestens_vier_Stellen_und_wird_nicht_gekuerzt(int auflage, int exemplar, string teil)
    {
        var k = await AusgabeAsync(exemplar: exemplar, auflage: auflage);

        Assert.Equal($"{await KennungAsync(k.CoinId)}-{teil}", k.Nummer);
    }

    [Fact]
    public async Task Mitgesendete_Zertifikatsnummer_wird_ignoriert()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var body = GueltigeAusgabe(4);
        body["zertifikatsnummer"] = "C0000-0000";

        var k = await AusgabeZuAsync(coinId, 4, body);

        Assert.Equal(Erwartet(await KennungAsync(coinId), 4), k.Nummer);
    }

    [Fact]
    public async Task Historie_enthaelt_die_Zertifikatsnummer_je_Eintrag()
    {
        var k = await AusgabeAsync(exemplar: 5);

        var eintrag = Assert.Single((await HistorieAsync(k.CoinId)).GetProperty("eintraege").EnumerateArray());

        Assert.Equal(k.Nummer, eintrag.GetProperty("zertifikatsnummer").GetString());
    }

    [Fact]
    public async Task Storno_Antwort_enthaelt_die_unveraenderte_Zertifikatsnummer()
    {
        var k = await AusgabeAsync(exemplar: 5);

        var storniert = await StornierenAsync(k.CoinId, k.AusgabeId);

        Assert.Equal(k.Nummer, storniert.GetProperty("zertifikatsnummer").GetString());
    }

    // ---------- AK-5: verschiedene Exemplare, Storno, Neuausgabe ----------

    [Fact]
    public async Task Zwei_Ausgaben_verschiedener_Exemplare_erhalten_verschiedene_Nummern()
    {
        var coinId = await CoinMitAuflageAsync(10);

        var a = await AusgabeZuAsync(coinId, 1);
        var b = await AusgabeZuAsync(coinId, 2);

        Assert.NotEqual(a.Nummer, b.Nummer);
    }

    [Fact]
    public async Task Storno_einer_Ausgabe_aendert_die_Nummer_einer_anderen_nicht()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var a = await AusgabeZuAsync(coinId, 1);
        var b = await AusgabeZuAsync(coinId, 2);

        await StornierenAsync(coinId, a.AusgabeId);

        Assert.Equal(b.Nummer, await AusgabeDb.ZertifikatsnummerAsync(b.AusgabeId));
    }

    [Fact]
    public async Task Stornierte_Ausgabe_behaelt_ihre_Nummer()
    {
        var k = await AusgabeAsync(exemplar: 3);

        await StornierenAsync(k.CoinId, k.AusgabeId);

        Assert.Equal(k.Nummer, await AusgabeDb.ZertifikatsnummerAsync(k.AusgabeId));
    }

    [Fact]
    public async Task Neuausgabe_nach_Storno_erhaelt_dieselbe_Nummer()
    {
        var alt = await AusgabeAsync(exemplar: 12);
        await StornierenAsync(alt.CoinId, alt.AusgabeId);

        var neu = await AusgabeZuAsync(alt.CoinId, 12);

        Assert.Equal(alt.Nummer, neu.Nummer);
        Assert.NotEqual(alt.AusgabeId, neu.AusgabeId);
    }

    [Fact]
    public async Task Historie_zeigt_nach_Neuausgabe_zwei_Eintraege_mit_derselben_Nummer_einer_storniert()
    {
        var alt = await AusgabeAsync(exemplar: 12);
        await StornierenAsync(alt.CoinId, alt.AusgabeId);
        await AusgabeZuAsync(alt.CoinId, 12);

        var eintraege = (await HistorieAsync(alt.CoinId)).GetProperty("eintraege").EnumerateArray().ToList();

        Assert.Equal(2, eintraege.Count);
        Assert.All(eintraege, e => Assert.Equal(alt.Nummer, e.GetProperty("zertifikatsnummer").GetString()));
        Assert.Equal(1, eintraege.Count(e => e.GetProperty("storno").ValueKind == JsonValueKind.Null));
    }

    [Fact]
    public async Task Neuausgabe_nach_Storno_ueber_naechstes_freies_Exemplar_erhaelt_dieselbe_Nummer()
    {
        var alt = await AusgabeAsync(exemplar: 1, auflage: 3);
        await StornierenAsync(alt.CoinId, alt.AusgabeId);

        var neu = await AusgabeZuAsync(alt.CoinId);

        Assert.Equal(alt.Nummer, neu.Nummer);
    }

    [Fact]
    public async Task Parallele_Erfassungen_naechste_freie_ergeben_verschiedene_Nummern()
    {
        await AdminIdAsync();
        var coinId = await CoinMitAuflageAsync(20);
        using var start = new SemaphoreSlim(0);

        var laufend = Enumerable.Range(0, 5).Select(async _ =>
        {
            await start.WaitAsync();
            using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe());
            return antwort.StatusCode == HttpStatusCode.Created
                ? (await JsonAsync(antwort)).GetProperty("zertifikatsnummer").GetString() ?? "ohne Nummer"
                : $"Status {(int)antwort.StatusCode}";
        }).ToArray();
        start.Release(5);
        var nummern = await Task.WhenAll(laufend);

        Assert.All(nummern, n => Assert.Matches(NummernMuster(), n));
        Assert.Equal(5, nummern.Distinct(StringComparer.Ordinal).Count());
    }

    // ---------- AK-4: Index und Trigger (DB) ----------

    [Fact]
    public async Task Zweite_aktive_Ausgabe_mit_gleicher_Nummer_per_SQL_scheitert_mit_23505()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var adminId = await AdminIdAsync();
        await AusgabeDb.AktiveAusgabeEinfuegenAsync(coinId, 1, adminId, zertifikatsnummer: "T-Gleich-0001");

        var fehler = await Record.ExceptionAsync(() => AusgabeDb.AktiveAusgabeEinfuegenAsync(coinId, 2, adminId, zertifikatsnummer: "T-Gleich-0001"));

        var postgres = Assert.IsType<PostgresException>(fehler);
        Assert.Equal((PostgresErrorCodes.UniqueViolation, "ux_ausgabe_zertifikatsnummer_aktiv"), (postgres.SqlState, postgres.ConstraintName));
    }

    [Fact]
    public async Task Stornierte_und_aktive_Ausgabe_mit_gleicher_Nummer_sind_zulaessig()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var adminId = await AdminIdAsync();
        await AusgabeDb.AktiveAusgabeEinfuegenAsync(coinId, 1, adminId, zertifikatsnummer: "T-Gleich-0002", storniert: true);

        var fehler = await Record.ExceptionAsync(() => AusgabeDb.AktiveAusgabeEinfuegenAsync(coinId, 1, adminId, zertifikatsnummer: "T-Gleich-0002"));

        Assert.Null(fehler);
    }

    [Fact]
    public async Task Ausgabe_ohne_Zertifikatsnummer_per_SQL_scheitert_an_NOT_NULL()
    {
        var coinId = await CoinMitAuflageAsync(10);
        var adminId = await AdminIdAsync();

        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO ausgabe (id, coin_id, exemplar_nummer, empfaenger_name, datum, gelegenheit, begruendung,
                                 ausgebende_stelle, erfasst_am, erfasst_von)
            VALUES (gen_random_uuid(), '{coinId}', 1, 'Test', DATE '2026-10-01', 'G', 'B', 'S', now(), '{adminId}')
            """);

        Assert.Equal(PostgresErrorCodes.NotNullViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Aendern_der_Zertifikatsnummer_per_SQL_scheitert()
    {
        var k = await AusgabeAsync(exemplar: 2);

        var fehler = await AusgabeDb.RohAusfuehrenAsync($"UPDATE ausgabe SET zertifikatsnummer = 'C0000-9999' WHERE id = '{k.AusgabeId}'");

        AssertAbgelehnt(fehler);
        Assert.Equal(k.Nummer, await AusgabeDb.ZertifikatsnummerAsync(k.AusgabeId));
    }

    [Fact]
    public async Task Aendern_der_Zertifikatsnummer_zusammen_mit_einem_Storno_per_SQL_scheitert()
    {
        var k = await AusgabeAsync(exemplar: 2);
        var adminId = await AdminIdAsync();

        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            $"UPDATE ausgabe SET storniert_am = now(), storniert_von = '{adminId}', storno_grund = 'G', zertifikatsnummer = 'C0000-9999' WHERE id = '{k.AusgabeId}'");

        AssertAbgelehnt(fehler);
        Assert.Equal(k.Nummer, await AusgabeDb.ZertifikatsnummerAsync(k.AusgabeId));
    }

    [Fact]
    public async Task Verletzung_des_Nummern_Index_trotz_Sperre_liefert_409_exemplar_ausgegeben()
    {
        // Ein Test-Trigger fügt vor dem eigentlichen INSERT eine aktive Ausgabe eines anderen Exemplars mit derselben
        // Zertifikatsnummer ein; nur ux_ausgabe_zertifikatsnummer_aktiv schlägt an (AK-4: nie 500).
        var coinId = await CoinMitAuflageAsync(10);
        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            """
            CREATE OR REPLACE FUNCTION test_ausgabe_nummer_doppelt() RETURNS trigger LANGUAGE plpgsql AS $$
            DECLARE kopie ausgabe;
            BEGIN
                IF pg_trigger_depth() = 1 THEN
                    kopie := NEW;
                    kopie.id := gen_random_uuid();
                    kopie.exemplar_nummer := CASE WHEN NEW.exemplar_nummer = 1 THEN 2 ELSE 1 END;
                    INSERT INTO ausgabe SELECT (kopie).*;
                END IF;
                RETURN NEW;
            END $$;
            CREATE TRIGGER test_ausgabe_nummer_doppelt BEFORE INSERT ON ausgabe
                FOR EACH ROW EXECUTE FUNCTION test_ausgabe_nummer_doppelt();
            """);
        Assert.Null(fehler);
        try
        {
            using var antwort = await PostAusgabeAsync(coinId, GueltigeAusgabe(5));

            var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.Conflict);
            Assert.Equal("exemplar_ausgegeben", json.GetProperty("code").GetString());
        }
        finally
        {
            await AusgabeDb.RohAusfuehrenAsync(
                "DROP TRIGGER IF EXISTS test_ausgabe_nummer_doppelt ON ausgabe; DROP FUNCTION IF EXISTS test_ausgabe_nummer_doppelt();");
        }
    }

    [Fact]
    public async Task Index_ux_ausgabe_zertifikatsnummer_aktiv_ist_partiell_auf_aktive_Ausgaben()
    {
        var definition = (string?)await ZertifikatDb.WertAsync(
            "SELECT indexdef FROM pg_indexes WHERE indexname = 'ux_ausgabe_zertifikatsnummer_aktiv'");

        Assert.NotNull(definition);
        Assert.Contains("UNIQUE", definition, StringComparison.Ordinal);
        Assert.Contains("(zertifikatsnummer)", definition, StringComparison.Ordinal);
        Assert.Contains("storniert_am IS NULL", definition, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Antwort_mit_ungueltigem_Koerper_enthaelt_keine_Nummer()
    {
        // Abgelehnte Erfassungen vergeben keine Nummer: Die nächste erfolgreiche erhält das erste freie Exemplar.
        var coinId = await CoinMitAuflageAsync(5);
        using (var ungueltig = await PostAusgabeAsync(coinId, GueltigeAusgabe(1, empfaengerName: "")))
        {
            Assert.Equal(HttpStatusCode.BadRequest, ungueltig.StatusCode);
        }

        var k = await AusgabeZuAsync(coinId);

        Assert.Equal(Erwartet(await KennungAsync(coinId), 1), k.Nummer);
    }

    [Fact]
    public async Task Gleiche_Exemplarnummer_bei_zwei_Coins_ergibt_verschiedene_Nummern()
    {
        var a = await AusgabeAsync(exemplar: 1);
        var b = await AusgabeAsync(exemplar: 1);

        Assert.NotEqual(a.Nummer, b.Nummer);
    }
}
