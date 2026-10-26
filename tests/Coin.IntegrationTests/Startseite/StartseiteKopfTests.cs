using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;
using Coin.Testdaten;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-37 (Rev. 2) und Abschnitt 5.2a: <c>GET /api/startseite/kopf</c> liefert immer <c>aktiv</c> und
/// <c>position</c>, nur bei aktivem Kopfbereich Titel, Untertitel und Logos – nie Kennzahlen, Coins, Infotext, Anzahlen,
/// Version oder Angaben zu Speichernden und Hochladenden. Nach einem <c>PUT</c> liefert der nächste Abruf den neuen Stand.
/// </summary>
public class StartseiteKopfTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    private const string Testtitel = "Kopftitel-Testwert-8231";
    private const string Testuntertitel = "Kopfuntertitel-Testwert-8231";

    [Fact]
    public async Task Aktiver_Kopf_liefert_aktiv_position_titel_untertitel_und_beide_Logo_Felder()
    {
        await SpeichernAsync(MitKopf(titel: Testtitel, untertitel: Testuntertitel));

        var kopf = await KopfAsync();

        Assert.Equal(["aktiv", "logoBereitsteller", "logoSoftware", "position", "titel", "untertitel"], Feldnamen(kopf));
        Assert.True(kopf.GetProperty("aktiv").GetBoolean());
        Assert.Equal((Testtitel, Testuntertitel), (kopf.GetProperty("titel").GetString(), kopf.GetProperty("untertitel").GetString()));
    }

    [Fact]
    public async Task Aktiver_Kopf_ohne_Logos_liefert_Logo_Felder_null()
    {
        await SpeichernAsync(MitKopf());

        var kopf = await KopfAsync();

        Assert.Equal(JsonValueKind.Null, kopf.GetProperty("logoBereitsteller").ValueKind);
        Assert.Equal(JsonValueKind.Null, kopf.GetProperty("logoSoftware").ValueKind);
    }

    [Fact]
    public async Task Aktiver_Kopf_liefert_das_Logo_mit_url_alternativtext_breite_hoehe()
    {
        var logo = LogoBilder.Png(400, 480);
        await LogoHochladenAsync("bereitsteller", logo, "Wappen des Testverbands");

        var meta = (await KopfAsync()).GetProperty("logoBereitsteller");

        Assert.Equal(["alternativtext", "breite", "hoehe", "url"], Feldnamen(meta));
        Assert.Equal(
            ($"/api/startseite/logos/bereitsteller?v={Sha256(logo)[..16]}", "Wappen des Testverbands", 400, 480),
            (meta.GetProperty("url").GetString(), meta.GetProperty("alternativtext").GetString(),
                meta.GetProperty("breite").GetInt32(), meta.GetProperty("hoehe").GetInt32()));
    }

    [Fact]
    public async Task Inaktiver_Kopf_liefert_nur_aktiv_und_position()
    {
        await SpeichernAsync(Mit(MitKopf(titel: Testtitel), k => Kopf(k)["aktiv"] = false));

        var kopf = await KopfAsync();

        Assert.Equal(["aktiv", "position"], Feldnamen(kopf));
    }

    [Fact]
    public async Task Inaktiver_Kopf_enthaelt_den_gespeicherten_Titel_nicht()
    {
        await SpeichernAsync(Mit(MitKopf(titel: Testtitel, untertitel: Testuntertitel), k => Kopf(k)["aktiv"] = false));

        using var antwort = await Anonym.GetAsync(KopfUrl);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.DoesNotContain(Testtitel, text);
        Assert.DoesNotContain(Testuntertitel, text);
    }

    [Fact]
    public async Task Inaktiver_Kopf_mit_gespeichertem_Logo_liefert_keine_Logo_Angaben()
    {
        await LogoHochladenAsync("bereitsteller", LogoBilder.Png(10, 10), "Alttext-geheim-8231");
        await SpeichernAsync(Mit(MitKopf(1, alttextBereitsteller: "Alttext-geheim-8231"), k => Kopf(k)["aktiv"] = false));

        using var antwort = await Anonym.GetAsync(KopfUrl);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.DoesNotContain("8231", text);
        Assert.DoesNotContain("/logos/", text);
    }

    [Theory]
    [InlineData(new[] { "kopf", "infotext", "kennzahlen", "neueste", "meistausgegeben" }, 1)]
    [InlineData(new[] { "infotext", "kennzahlen", "kopf", "neueste", "meistausgegeben" }, 3)]
    [InlineData(new[] { "infotext", "kennzahlen", "neueste", "meistausgegeben", "kopf" }, 5)]
    public async Task Position_ist_die_Stelle_von_kopf_in_der_Reihenfolge(string[] folge, int position)
    {
        await SpeichernAsync(Mit(MitKopf(), k => Reihenfolge(k, folge)));

        Assert.Equal(position, (await KopfAsync()).GetProperty("position").GetInt32());
    }

    [Fact]
    public async Task Position_gilt_auch_bei_inaktivem_Kopf()
    {
        await SpeichernAsync(Mit(StandardKonfiguration(), k => Reihenfolge(k, "infotext", "kennzahlen", "kopf", "neueste", "meistausgegeben")));

        var kopf = await KopfAsync();

        Assert.Equal((false, 3), (kopf.GetProperty("aktiv").GetBoolean(), kopf.GetProperty("position").GetInt32()));
    }

    [Fact]
    public async Task Kopf_enthaelt_weder_Kennzahlen_noch_Coin_Namen_noch_Infotext()
    {
        var coinName = "Coin-Kopfprobe-8231";
        await LegeCoinAnAsync(coinName, auflage: 50);
        await SpeichernAsync(Mit(MitKopf(), k => k["infotext"]!["text"] = "Infotext-Kopfprobe-8231"));

        using var antwort = await Anonym.GetAsync(KopfUrl);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.DoesNotContain("8231", text);
        foreach (var feld in new[] { "kennzahlen", "coins", "exemplare", "ausgegeben", "verfuegbar", "eintraege", "text", "anzahl" })
        {
            Assert.DoesNotContain($"\"{feld}\"", text);
        }
    }

    [Fact]
    public async Task Kopf_enthaelt_weder_version_noch_geaendert_noch_hochgeladen()
    {
        await LogoHochladenAsync("bereitsteller", LogoBilder.Png(10, 10));

        using var antwort = await Anonym.GetAsync(KopfUrl);
        var text = await antwort.Content.ReadAsStringAsync();

        foreach (var verboten in new[] { "version", "geaendertAm", "geaendertVon", "hochgeladen", "groesseBytes", "format", Testbenutzer.AdminName, Testbenutzer.AdminEmail })
        {
            Assert.DoesNotContain(verboten, text, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task Nach_einem_PUT_liefert_der_naechste_Abruf_den_neuen_Stand()
    {
        await SpeichernAsync(MitKopf(titel: "Erster Titel"));
        Assert.Equal("Erster Titel", (await KopfAsync()).GetProperty("titel").GetString());

        await SpeichernAsync(MitKopf(1, titel: "Zweiter Titel"));

        Assert.Equal("Zweiter Titel", (await KopfAsync()).GetProperty("titel").GetString());
    }

    [Fact]
    public async Task Kopf_traegt_Cache_Control_no_store()
    {
        await SpeichernAsync(MitKopf());

        using var antwort = await Anonym.GetAsync(KopfUrl);

        Assert.True(antwort.Headers.CacheControl?.NoStore, $"Cache-Control: {antwort.Headers.CacheControl}");
    }

    [Fact]
    public async Task Titel_mit_XSS_Nutzlast_wird_als_JSON_Text_geliefert()
    {
        const string nutzlast = "<script>window.__xss=1</script><img src=x onerror=\"window.__xss=2\">";
        await SpeichernAsync(MitKopf(titel: nutzlast));

        Assert.Equal(nutzlast, (await KopfAsync()).GetProperty("titel").GetString());
    }
}
