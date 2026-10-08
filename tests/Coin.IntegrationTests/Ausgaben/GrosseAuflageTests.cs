using System.Net;
using System.Net.Http.Json;
using Coin.IntegrationTests.Infrastruktur;
using Npgsql;

namespace Coin.IntegrationTests.Ausgaben;

/// <summary>
/// Feature coin-ausgaben, AK-1 und AK-17 an der Obergrenze (F9: 1.000.000): Anlegen und Senken großer Auflagen
/// dürfen nicht an Timeouts oder fehlenden Indizes scheitern (QA-Review Runde 1, Finding 1: Index
/// <c>ix_ausgabe_exemplar</c> und bewusst längeres Timeout für Erzeugen/Löschen von Exemplaren).
/// Die Tests mit 1.000.000 Exemplaren sind langsam (Kategorie „Langsam“), laufen aber im normalen <c>dotnet test</c> mit.
/// </summary>
public class GrosseAuflageTests(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    private const int Obergrenze = 1_000_000;

    /// <summary>
    /// Eigener Client mit großzügigem Timeout, damit ein langsamer Server als falscher Status (500) und nicht als
    /// Abbruch auf Client-Seite sichtbar wird.
    /// </summary>
    private HttpClient LangsamerClient()
    {
        var client = Fixture.Factory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(5);
        return client;
    }

    private static async Task<Guid> CoinMitObergrenzeAnlegenAsync(HttpClient client)
    {
        using var antwort = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin($"Coin {Guid.NewGuid():N}", auflage: Obergrenze));
        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"Anlegen: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return (await JsonAsync(antwort)).GetProperty("id").GetGuid();
    }

    [Fact]
    [Trait("Kategorie", "Langsam")]
    public async Task Coin_mit_Auflage_1000000_anlegen_liefert_201_mit_1000000_Exemplaren()
    {
        using var client = LangsamerClient();

        using var antwort = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin($"Coin {Guid.NewGuid():N}", auflage: Obergrenze));
        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"Anlegen: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        var coinId = (await JsonAsync(antwort)).GetProperty("id").GetGuid();

        Assert.Equal(Obergrenze, await AusgabeDb.AnzahlExemplareAsync(coinId));
    }

    [Fact]
    [Trait("Kategorie", "Langsam")]
    public async Task Senkung_von_1000000_auf_100000_ohne_Ausgaben_liefert_200_und_loescht_die_Exemplare()
    {
        using var client = LangsamerClient();
        var coinId = await CoinMitObergrenzeAnlegenAsync(client);

        using var antwort = await PutAuflageAsync(client, coinId, 100_000);

        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Senkung: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        Assert.Equal(100_000, await AusgabeDb.AnzahlExemplareAsync(coinId));
    }

    [Fact]
    [Trait("Kategorie", "Langsam")]
    public async Task Senkung_von_1000000_auf_100000_mit_Ausgaben_liefert_200_und_behaelt_die_Ausgaben()
    {
        using var client = LangsamerClient();
        var coinId = await CoinMitObergrenzeAnlegenAsync(client);
        await ErfasseAsync(coinId, 1, client);
        await ErfasseAsync(coinId, 50_000, client);
        await ErfasseAsync(coinId, 100_000, client);
        var storniert = await ErfasseAsync(coinId, 99_999, client);
        await StornierenAsync(coinId, storniert.GetProperty("id").GetGuid(), client: client);

        using var antwort = await PutAuflageAsync(client, coinId, 100_000);

        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Senkung: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        Assert.Equal((100_000, 3, 99_997), await KennzahlenAsync(coinId));
    }

    /// <summary>
    /// Viele Ausgaben machen den Fremdschlüssel-Check beim Löschen der Exemplare ohne Index
    /// <c>ix_ausgabe_exemplar</c> teuer (je gelöschtem Exemplar ein Scan über <c>ausgabe</c>). Die Ausgaben werden
    /// per SQL eingefügt (Testdaten, an der API vorbei), damit nur die Senkung gemessen wird.
    /// </summary>
    [Fact]
    [Trait("Kategorie", "Langsam")]
    public async Task Senkung_von_1000000_auf_100000_mit_20000_Ausgaben_liefert_200()
    {
        using var client = LangsamerClient();
        var coinId = await CoinMitObergrenzeAnlegenAsync(client);
        var adminId = await AdminIdAsync();
        var fehler = await AusgabeDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO ausgabe (id, coin_id, exemplar_nummer, empfaenger_name, datum, gelegenheit, begruendung,
                                 ausgebende_stelle, erfasst_am, erfasst_von)
            SELECT gen_random_uuid(), '{coinId}', n, 'Test Empfänger ' || n, DATE '2026-10-01', 'Test Gelegenheit',
                   'Test Begründung', 'Test Stelle', now(), '{adminId}'
              FROM generate_series(1, 20000) AS n
            """);
        Assert.Null(fehler);

        using var antwort = await PutAuflageAsync(client, coinId, 100_000);

        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Senkung: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        Assert.Equal(100_000, await AusgabeDb.AnzahlExemplareAsync(coinId));
    }

    [Fact]
    public async Task Index_ix_ausgabe_exemplar_auf_coin_id_und_exemplar_nummer_existiert_nicht_partiell()
    {
        await using var verbindung = new NpgsqlConnection(Fixture.ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(
            """
            SELECT t.relname,
                   i.indpred IS NULL AS ohne_bedingung,
                   (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                      FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
                      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) AS spalten
              FROM pg_index i
              JOIN pg_class c ON c.oid = i.indexrelid
              JOIN pg_class t ON t.oid = i.indrelid
             WHERE c.relname = 'ix_ausgabe_exemplar'
            """, verbindung);
        await using var leser = await befehl.ExecuteReaderAsync();

        Assert.True(await leser.ReadAsync(), "Index ix_ausgabe_exemplar fehlt.");
        Assert.Equal(("ausgabe", true, "coin_id,exemplar_nummer"), (leser.GetString(0), leser.GetBoolean(1), leser.GetString(2)));
    }
}
