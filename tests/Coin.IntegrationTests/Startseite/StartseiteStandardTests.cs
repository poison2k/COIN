using System.Net;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-1, AK-7 und AK-37 (Standard): Ohne Zeile in <c>startseite_konfiguration</c> gilt die
/// Standardkonfiguration aus dem Code – auch bei leerer Datenbank, ohne Fehler und ohne Schreibzugriff.
/// </summary>
public class StartseiteStandardTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    [Fact]
    public async Task Get_startseite_liefert_ohne_Konfiguration_200()
    {
        var betrachter = await BetrachterAsync();

        using var antwort = await betrachter.GetAsync(StartseiteUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Get_startseite_liefert_ohne_Konfiguration_genau_infotext_kennzahlen_neueste_meistausgegeben()
    {
        var startseite = await StartseiteAsync(await BetrachterAsync());

        Assert.Equal(["infotext", "kennzahlen", "neueste", "meistausgegeben"], Arten(startseite));
    }

    [Fact]
    public async Task Get_startseite_liefert_ohne_Konfiguration_den_Standard_Infotext()
    {
        var startseite = await StartseiteAsync(await BetrachterAsync());

        Assert.Equal(StandardInfotext, Block(startseite, "infotext").GetProperty("text").GetString());
    }

    [Fact]
    public async Task Get_startseite_liefert_bei_leerer_Datenbank_Kennzahlen_0()
    {
        var kennzahlen = Block(await StartseiteAsync(await BetrachterAsync()), "kennzahlen");

        Assert.Equal(
            (0, 0, 0, 0),
            (kennzahlen.GetProperty("coins").GetInt32(), kennzahlen.GetProperty("exemplare").GetInt32(),
                kennzahlen.GetProperty("ausgegeben").GetInt32(), kennzahlen.GetProperty("verfuegbar").GetInt32()));
    }

    [Fact]
    public async Task Get_startseite_liefert_bei_leerer_Datenbank_leere_Listen()
    {
        var startseite = await StartseiteAsync(await BetrachterAsync());

        Assert.Empty(Block(startseite, "neueste").GetProperty("eintraege").EnumerateArray());
        Assert.Empty(Block(startseite, "meistausgegeben").GetProperty("eintraege").EnumerateArray());
    }

    [Fact]
    public async Task Get_startseite_schreibt_ohne_Konfiguration_nichts_in_die_Datenbank()
    {
        var betrachter = await BetrachterAsync();

        using (await betrachter.GetAsync(StartseiteUrl))
        using (await Anonym.GetAsync(KopfUrl))
        using (await Client.GetAsync(KonfigurationUrl))
        {
        }

        Assert.Equal(0, await StartseiteDb.AnzahlKonfigurationenAsync());
        Assert.Empty(await StartseiteDb.AuditAsync());
    }

    [Fact]
    public async Task Get_kopf_liefert_ohne_Konfiguration_aktiv_false_und_position_1()
    {
        var kopf = await KopfAsync();

        Assert.Equal(["aktiv", "position"], Feldnamen(kopf));
        Assert.False(kopf.GetProperty("aktiv").GetBoolean());
        Assert.Equal(1, kopf.GetProperty("position").GetInt32());
    }

    [Fact]
    public async Task Get_konfiguration_liefert_ohne_Konfiguration_standard_true_und_version_0()
    {
        var konfiguration = await KonfigurationAsync();

        Assert.True(konfiguration.GetProperty("standard").GetBoolean());
        Assert.Equal(0, konfiguration.GetProperty("version").GetInt32());
    }

    [Fact]
    public async Task Get_konfiguration_liefert_ohne_Konfiguration_geaendertAm_und_geaendertVon_null()
    {
        var konfiguration = await KonfigurationAsync();

        Assert.Equal(System.Text.Json.JsonValueKind.Null, konfiguration.GetProperty("geaendertAm").ValueKind);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, konfiguration.GetProperty("geaendertVon").ValueKind);
    }

    [Fact]
    public async Task Get_konfiguration_liefert_die_Standardwerte_aus_AK_1()
    {
        var k = await KonfigurationAsync();

        Assert.Equal(StandardReihenfolge, k.GetProperty("reihenfolge").EnumerateArray().Select(e => e.GetString()));
        Assert.False(k.GetProperty("kopf").GetProperty("aktiv").GetBoolean());
        Assert.Equal(StandardTitel, k.GetProperty("kopf").GetProperty("titel").GetString());
        Assert.Equal(StandardUntertitel, k.GetProperty("kopf").GetProperty("untertitel").GetString());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, k.GetProperty("kopf").GetProperty("logoBereitsteller").ValueKind);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, k.GetProperty("kopf").GetProperty("logoSoftware").ValueKind);
        Assert.Equal((true, StandardInfotext), (k.GetProperty("infotext").GetProperty("aktiv").GetBoolean(), k.GetProperty("infotext").GetProperty("text").GetString()));
        Assert.True(k.GetProperty("kennzahlen").GetProperty("aktiv").GetBoolean());
        Assert.Equal((true, 6), (k.GetProperty("neueste").GetProperty("aktiv").GetBoolean(), k.GetProperty("neueste").GetProperty("anzahl").GetInt32()));
        Assert.Equal((true, 5), (k.GetProperty("meistausgegeben").GetProperty("aktiv").GetBoolean(), k.GetProperty("meistausgegeben").GetProperty("anzahl").GetInt32()));
    }

    [Theory]
    [InlineData(StartseiteUrl)]
    [InlineData(KopfUrl)]
    [InlineData(KonfigurationUrl)]
    public async Task Antworten_tragen_Cache_Control_no_store(string url)
    {
        var client = url == KopfUrl ? Anonym : Client;

        using var antwort = await client.GetAsync(url);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.True(antwort.Headers.CacheControl?.NoStore, $"Cache-Control: {antwort.Headers.CacheControl}");
    }
}
