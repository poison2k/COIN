using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;
using Npgsql;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-3, AK-4, AK-5 und AK-7 (Abschnitt 6, Entscheidungen S2/S3): Kennzahlen über alle Coins
/// (Testdaten: 3 Coins, 450 Exemplare, 12 aktive Ausgaben), „Neueste Coins“ nach <c>erstellt_am</c> und „Meistausgegebene
/// Coins“ nach aktiven Ausgaben (Stornos zählen nicht, Gleichstand alphabetisch nach <c>lower(name)</c>), Vorschaudaten
/// der Konfiguration in Höchstanzahl (12 bzw. 10).
/// </summary>
public class StartseiteAuswertungTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    private static string AusgabenUrl(Guid coinId) => $"{CoinsUrl}/{coinId}/ausgaben";

    private async Task<Guid> CoinAsync(string name, int? auflage)
    {
        var coin = await LegeCoinAnAsync(name, auflage: auflage);
        return coin.GetProperty("id").GetGuid();
    }

    /// <summary>Erfasst <paramref name="anzahl"/> Ausgaben (nächstes freies Exemplar) und liefert deren Ids.</summary>
    private async Task<List<Guid>> ErfasseAsync(Guid coinId, int anzahl)
    {
        var ids = new List<Guid>();
        for (var i = 0; i < anzahl; i++)
        {
            using var antwort = await Client.PostAsJsonAsync(AusgabenUrl(coinId), new Dictionary<string, object?>
            {
                ["exemplarNummer"] = null,
                ["empfaengerName"] = $"Test Empfänger {i}",
                ["empfaengerDienstgrad"] = null,
                ["empfaengerDienststelle"] = null,
                ["datum"] = "2026-10-01",
                ["gelegenheit"] = "Testgelegenheit",
                ["begruendung"] = "Testbegründung",
                ["ausgebendeStelle"] = "Teststelle",
            });
            Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"Erfassen: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
            ids.Add((await JsonAsync(antwort)).GetProperty("id").GetGuid());
        }

        return ids;
    }

    private async Task StornierenAsync(Guid coinId, Guid ausgabeId)
    {
        using var antwort = await Client.PostAsJsonAsync($"{AusgabenUrl(coinId)}/{ausgabeId}/storno", new { grund = "Teststorno" });
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Storno: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
    }

    /// <summary>Testdaten aus AK-3: A 100 (7 Ausgaben), B 150 (5), C 200 (1, storniert).</summary>
    private async Task<(Guid A, Guid B, Guid C)> TestdatenAk3Async()
    {
        var a = await CoinAsync("Coin A", 100);
        var b = await CoinAsync("Coin B", 150);
        var c = await CoinAsync("Coin C", 200);
        await ErfasseAsync(a, 7);
        await ErfasseAsync(b, 5);
        var storniert = await ErfasseAsync(c, 1);
        await StornierenAsync(c, storniert[0]);
        return (a, b, c);
    }

    private static (int Coins, int Exemplare, int Ausgegeben, int Verfuegbar) Kennzahlen(JsonElement block) =>
        (block.GetProperty("coins").GetInt32(), block.GetProperty("exemplare").GetInt32(),
            block.GetProperty("ausgegeben").GetInt32(), block.GetProperty("verfuegbar").GetInt32());

    private static (string Name, int Ausgegeben)[] Rangliste(JsonElement block) =>
        block.GetProperty("eintraege").EnumerateArray()
            .Select(e => (e.GetProperty("name").GetString()!, e.GetProperty("ausgegeben").GetInt32()))
            .ToArray();

    // ---------- AK-3: Kennzahlen ----------

    [Fact]
    public async Task Kennzahlen_mit_den_Testdaten_aus_AK_3()
    {
        await TestdatenAk3Async();

        var block = Block(await StartseiteAsync(await BetrachterAsync()), "kennzahlen");

        Assert.Equal((3, 450, 12, 438), Kennzahlen(block));
    }

    [Fact]
    public async Task Ein_Coin_ohne_Auflage_zaehlt_bei_coins_aber_nicht_bei_exemplare()
    {
        await TestdatenAk3Async();
        await CoinAsync("Coin ohne Auflage", null);

        var block = Block(await StartseiteAsync(await BetrachterAsync()), "kennzahlen");

        Assert.Equal((4, 450, 12, 438), Kennzahlen(block));
    }

    [Fact]
    public async Task Kennzahlen_hat_genau_die_Felder_art_coins_exemplare_ausgegeben_verfuegbar()
    {
        var block = Block(await StartseiteAsync(await BetrachterAsync()), "kennzahlen");

        Assert.Equal(["art", "ausgegeben", "coins", "exemplare", "verfuegbar"], Feldnamen(block));
    }

    [Fact]
    public async Task Summe_der_Auflagen_entspricht_der_Anzahl_der_Exemplare()
    {
        // Abschnitt 6: Die Kennzahl liest exemplar nicht; die Gleichheit sum(auflage) = count(exemplar) (ADR-0020) gilt.
        await TestdatenAk3Async();
        await CoinAsync("Coin ohne Auflage", null);

        await using var verbindung = new NpgsqlConnection(Fixture.ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand("SELECT (SELECT coalesce(sum(auflage), 0) FROM coin_typ) = (SELECT count(*) FROM exemplar)", verbindung);

        Assert.True((bool)(await befehl.ExecuteScalarAsync())!);
        Assert.Equal(450, Block(await StartseiteAsync(await BetrachterAsync()), "kennzahlen").GetProperty("exemplare").GetInt32());
    }

    // ---------- AK-5: Meistausgegebene ----------

    [Fact]
    public async Task Rangliste_mit_den_Testdaten_aus_AK_3_ist_A_7_dann_B_5_und_C_fehlt()
    {
        await TestdatenAk3Async();

        var block = Block(await StartseiteAsync(await BetrachterAsync()), "meistausgegeben");

        Assert.Equal([("Coin A", 7), ("Coin B", 5)], Rangliste(block));
    }

    [Fact]
    public async Task Stornierte_Ausgaben_zaehlen_in_der_Rangliste_nicht()
    {
        var a = await CoinAsync("Coin Storno", 10);
        var ids = await ErfasseAsync(a, 3);
        await StornierenAsync(a, ids[0]);

        var block = Block(await StartseiteAsync(await BetrachterAsync()), "meistausgegeben");

        Assert.Equal([("Coin Storno", 2)], Rangliste(block));
    }

    [Fact]
    public async Task Gleichstand_wird_alphabetisch_nach_lower_name_sortiert()
    {
        // Ordinal stünde „Zulu“ (Z = 90) vor „alpha“ (a = 97); verlangt ist lower(name) aufsteigend.
        var zulu = await CoinAsync("Zulu Coin", 10);
        var alpha = await CoinAsync("alpha Coin", 10);
        await ErfasseAsync(zulu, 5);
        await ErfasseAsync(alpha, 5);

        var block = Block(await StartseiteAsync(await BetrachterAsync()), "meistausgegeben");

        Assert.Equal([("alpha Coin", 5), ("Zulu Coin", 5)], Rangliste(block));
    }

    [Fact]
    public async Task Rangliste_liefert_bei_Anzahl_3_und_5_Coins_mit_Ausgaben_genau_3()
    {
        for (var i = 1; i <= 5; i++)
        {
            await ErfasseAsync(await CoinAsync($"Coin Rang {i}", 10), i);
        }

        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["meistausgegeben"]!["anzahl"] = 3));

        var block = Block(await StartseiteAsync(await BetrachterAsync()), "meistausgegeben");

        Assert.Equal([("Coin Rang 5", 5), ("Coin Rang 4", 4), ("Coin Rang 3", 3)], Rangliste(block));
    }

    [Fact]
    public async Task Rangliste_ohne_aktive_Ausgaben_ist_leer()
    {
        var c = await CoinAsync("Coin nur Storno", 10);
        var ids = await ErfasseAsync(c, 1);
        await StornierenAsync(c, ids[0]);

        var block = Block(await StartseiteAsync(await BetrachterAsync()), "meistausgegeben");

        Assert.Empty(Rangliste(block));
    }

    [Fact]
    public async Task Ranglisteneintrag_hat_genau_id_name_herausgeber_ausgegeben()
    {
        await ErfasseAsync(await CoinAsync("Coin Felder", 10), 1);

        var eintrag = Block(await StartseiteAsync(await BetrachterAsync()), "meistausgegeben").GetProperty("eintraege")[0];

        Assert.Equal(["ausgegeben", "herausgeber", "id", "name"], Feldnamen(eintrag));
    }

    // ---------- AK-4: Neueste ----------

    [Fact]
    public async Task Neueste_liefert_die_6_zuletzt_angelegten_Coins_absteigend()
    {
        for (var i = 1; i <= 8; i++)
        {
            await CoinAsync($"Coin Neu {i}", null);
        }

        var block = Block(await StartseiteAsync(await BetrachterAsync()), "neueste");

        Assert.Equal(
            ["Coin Neu 8", "Coin Neu 7", "Coin Neu 6", "Coin Neu 5", "Coin Neu 4", "Coin Neu 3"],
            block.GetProperty("eintraege").EnumerateArray().Select(e => e.GetProperty("name").GetString()));
    }

    [Fact]
    public async Task Neueste_liefert_bei_weniger_Coins_als_Anzahl_alle()
    {
        await CoinAsync("Coin Eins", null);
        await CoinAsync("Coin Zwei", null);

        var block = Block(await StartseiteAsync(await BetrachterAsync()), "neueste");

        Assert.Equal(["Coin Zwei", "Coin Eins"], block.GetProperty("eintraege").EnumerateArray().Select(e => e.GetProperty("name").GetString()));
    }

    [Fact]
    public async Task Neueste_Eintrag_hat_id_name_herausgeber_bildUrl()
    {
        await CoinAsync("Coin Felder", null);

        var eintrag = Block(await StartseiteAsync(await BetrachterAsync()), "neueste").GetProperty("eintraege")[0];

        Assert.Equal(["bildUrl", "herausgeber", "id", "name"], Feldnamen(eintrag));
        Assert.Equal(JsonValueKind.Null, eintrag.GetProperty("bildUrl").ValueKind);
    }

    [Fact]
    public async Task Neueste_bildUrl_entspricht_der_des_Katalogs()
    {
        var id = await LegeCoinAnUndLiefereIdAsync("Coin mit Bild");
        var katalog = await LadeBildHochAsync(id, Testbilder.Png());

        var eintrag = Block(await StartseiteAsync(await BetrachterAsync()), "neueste").GetProperty("eintraege")[0];

        Assert.Equal(katalog.GetProperty("bildUrl").GetString(), eintrag.GetProperty("bildUrl").GetString());
    }

    [Fact]
    public async Task Neueste_bei_gleichem_erstellt_am_absteigend_nach_id()
    {
        var erster = await CoinAsync("Coin Gleichzeitig 1", null);
        var zweiter = await CoinAsync("Coin Gleichzeitig 2", null);
        await using (var verbindung = new NpgsqlConnection(Fixture.ConnectionString))
        {
            await verbindung.OpenAsync();
            await using var befehl = new NpgsqlCommand("UPDATE coin_typ SET erstellt_am = TIMESTAMPTZ '2026-10-01 08:00:00+00'", verbindung);
            await befehl.ExecuteNonQueryAsync();
        }

        var ids = Block(await StartseiteAsync(await BetrachterAsync()), "neueste").GetProperty("eintraege").EnumerateArray()
            .Select(e => e.GetProperty("id").GetGuid()).ToArray();

        Assert.Equal(new[] { erster, zweiter }.OrderByDescending(g => g.ToString(), StringComparer.Ordinal).ToArray(), ids);
    }

    // ---------- AK-7: Vorschaudaten ----------

    [Fact]
    public async Task Konfiguration_liefert_12_neueste_unabhaengig_von_der_eingestellten_Anzahl()
    {
        for (var i = 1; i <= 14; i++)
        {
            await CoinAsync($"Coin Vorschau {i:D2}", null);
        }

        var daten = (await KonfigurationAsync()).GetProperty("daten");

        Assert.Equal(12, daten.GetProperty("neueste").GetArrayLength());
        Assert.Equal("Coin Vorschau 14", daten.GetProperty("neueste")[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task Konfiguration_liefert_10_meistausgegebene_unabhaengig_von_der_eingestellten_Anzahl()
    {
        for (var i = 1; i <= 11; i++)
        {
            await ErfasseAsync(await CoinAsync($"Coin Top {i:D2}", 20), i);
        }

        var daten = (await KonfigurationAsync()).GetProperty("daten");

        Assert.Equal(10, daten.GetProperty("meistausgegeben").GetArrayLength());
        Assert.Equal(11, daten.GetProperty("meistausgegeben")[0].GetProperty("ausgegeben").GetInt32());
    }

    [Fact]
    public async Task Konfiguration_liefert_die_Kennzahlen_mit_den_Testdaten_aus_AK_3()
    {
        await TestdatenAk3Async();

        var kennzahlen = (await KonfigurationAsync()).GetProperty("daten").GetProperty("kennzahlen");

        Assert.Equal((3, 450, 12, 438), Kennzahlen(kennzahlen));
    }

    [Fact]
    public async Task Daten_inaktiver_Bloecke_fehlen_in_GET_startseite()
    {
        await TestdatenAk3Async();
        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));

        using var antwort = await (await BetrachterAsync()).GetAsync(StartseiteUrl);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.DoesNotContain("\"exemplare\"", text);
        Assert.DoesNotContain("\"verfuegbar\"", text);
    }
}
