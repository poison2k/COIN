using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Coin.IntegrationTests.Infrastruktur;
using Coin.Testdaten;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-2, AK-8, AK-10 (Transaktion), AK-13 und AK-31: Speichern als Ganzes per Multipart, Versionsprüfung
/// mit <c>409 startseite_geaendert</c>, Round-Trip (der Betrachter sieht die Änderung beim nächsten Abruf), Speichern ohne
/// Änderung, Atomarität bei abgelehntem Logo.
/// </summary>
public class StartseiteSpeichernTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    // ---------- AK-8: Erfolg ----------

    [Fact]
    public async Task Erstes_Speichern_liefert_200_mit_version_1()
    {
        var antwort = await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));

        Assert.Equal(1, antwort.GetProperty("version").GetInt32());
    }

    [Fact]
    public async Task Speichern_liefert_standard_false()
    {
        var antwort = await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));

        Assert.False(antwort.GetProperty("standard").GetBoolean());
    }

    [Fact]
    public async Task Speichern_setzt_geaendertAm_und_geaendertVon_mit_dem_Anzeigenamen()
    {
        var vorher = DateTimeOffset.UtcNow.AddMinutes(-1);

        var antwort = await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));

        Assert.True(antwort.GetProperty("geaendertAm").GetDateTimeOffset() > vorher);
        Assert.Equal(Testbenutzer.AdminName, antwort.GetProperty("geaendertVon").GetString());
    }

    [Fact]
    public async Task Speichern_legt_genau_eine_Zeile_mit_der_neuen_Version_an()
    {
        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));

        Assert.Equal(1, await StartseiteDb.AnzahlKonfigurationenAsync());
        Assert.Equal(1, await StartseiteDb.VersionAsync());
    }

    [Fact]
    public async Task Zweites_Speichern_mit_version_1_erhoeht_auf_2()
    {
        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));

        var antwort = await SpeichernAsync(Mit(StandardKonfiguration(1), k => k["neueste"]!["anzahl"] = 8));

        Assert.Equal(2, antwort.GetProperty("version").GetInt32());
        Assert.Equal(1, await StartseiteDb.AnzahlKonfigurationenAsync());
    }

    [Fact]
    public async Task Antwort_von_PUT_entspricht_dem_folgenden_GET_konfiguration()
    {
        var gespeichert = await SpeichernAsync(Mit(StandardKonfiguration(), k => k["neueste"]!["anzahl"] = 9));

        var gelesen = await KonfigurationAsync();

        Assert.Equal(gespeichert.ToString(), gelesen.ToString());
    }

    [Fact]
    public async Task Speichern_ohne_inhaltliche_Aenderung_liefert_200_und_behaelt_die_Version()
    {
        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));

        var antwort = await SpeichernAsync(Mit(StandardKonfiguration(1), k => k["kennzahlen"]!["aktiv"] = false));

        Assert.Equal(1, antwort.GetProperty("version").GetInt32());
    }

    [Fact]
    public async Task Speichern_ohne_inhaltliche_Aenderung_schreibt_kein_Audit()
    {
        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));
        var vorher = (await StartseiteDb.AuditAsync()).Count;

        await SpeichernAsync(Mit(StandardKonfiguration(1), k => k["kennzahlen"]!["aktiv"] = false));

        Assert.Equal(vorher, (await StartseiteDb.AuditAsync()).Count);
    }

    [Fact]
    public async Task Speichern_der_unveraenderten_Standardkonfiguration_legt_keine_Zeile_an()
    {
        var antwort = await SpeichernAsync(StandardKonfiguration());

        Assert.Equal(0, antwort.GetProperty("version").GetInt32());
        Assert.Equal(0, await StartseiteDb.AnzahlKonfigurationenAsync());
    }

    [Fact]
    public async Task Unbekannte_Felder_im_Teil_konfiguration_werden_ignoriert()
    {
        var antwort = await SpeichernAsync(Mit(StandardKonfiguration(), k =>
        {
            k["kennzahlen"]!["aktiv"] = false;
            k["unbekannt"] = "wird ignoriert";
            k["standard"] = true;
        }));

        Assert.Equal(1, antwort.GetProperty("version").GetInt32());
    }

    // ---------- AK-2: Round-Trip, Reihenfolge, Abschalten ----------

    [Fact]
    public async Task Betrachter_sieht_nach_dem_Speichern_die_neue_Reihenfolge_ohne_ausgeschalteten_Block()
    {
        var betrachter = await BetrachterAsync();
        await SpeichernAsync(Mit(StandardKonfiguration(), k =>
        {
            k["kennzahlen"]!["aktiv"] = false;
            Reihenfolge(k, "meistausgegeben", "kopf", "infotext", "kennzahlen", "neueste");
        }));

        var startseite = await StartseiteAsync(betrachter);

        Assert.Equal(["meistausgegeben", "infotext", "neueste"], Arten(startseite));
    }

    [Fact]
    public async Task Get_startseite_liefert_den_aktiven_Kopfbereich_an_seiner_Stelle()
    {
        await SpeichernAsync(Mit(MitKopf(), k => Reihenfolge(k, "infotext", "kopf", "kennzahlen", "neueste", "meistausgegeben")));

        var startseite = await StartseiteAsync(await BetrachterAsync());

        Assert.Equal(["infotext", "kopf", "kennzahlen", "neueste", "meistausgegeben"], Arten(startseite));
        Assert.Equal("Titel Test", Block(startseite, "kopf").GetProperty("titel").GetString());
        Assert.Equal("Untertitel Test", Block(startseite, "kopf").GetProperty("untertitel").GetString());
    }

    [Fact]
    public async Task Alle_Bloecke_ausgeschaltet_liefert_eine_leere_Blockliste()
    {
        await SpeichernAsync(Mit(StandardKonfiguration(), k =>
        {
            foreach (var block in new[] { "infotext", "kennzahlen", "neueste", "meistausgegeben" })
            {
                k[block]!["aktiv"] = false;
            }
        }));

        Assert.Empty(Arten(await StartseiteAsync(await BetrachterAsync())));
    }

    [Fact]
    public async Task Geaenderter_Infotext_erscheint_unveraendert_als_Markdown_Quelle()
    {
        const string text = "**Fett** und *kursiv*\n\n- Punkt\n<script>alert(1)</script>";
        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["infotext"]!["text"] = text));

        var startseite = await StartseiteAsync(await BetrachterAsync());

        Assert.Equal(text, Block(startseite, "infotext").GetProperty("text").GetString());
    }

    [Fact]
    public async Task Infotext_mit_CRLF_wird_mit_LF_gespeichert()
    {
        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["infotext"]!["text"] = "Zeile 1\r\nZeile 2"));

        var konfiguration = await KonfigurationAsync();

        Assert.Equal("Zeile 1\nZeile 2", konfiguration.GetProperty("infotext").GetProperty("text").GetString());
    }

    [Fact]
    public async Task Titel_wird_getrimmt_gespeichert()
    {
        await SpeichernAsync(MitKopf(titel: "  Titel mit Rand  "));

        var konfiguration = await KonfigurationAsync();

        Assert.Equal("Titel mit Rand", konfiguration.GetProperty("kopf").GetProperty("titel").GetString());
    }

    [Fact]
    public async Task Gespeicherte_Anzahl_begrenzt_die_Neuesten_auf_der_Startseite()
    {
        for (var i = 1; i <= 5; i++)
        {
            await LegeCoinAnAsync($"Coin Anzahl {i}");
        }

        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["neueste"]!["anzahl"] = 3));

        var neueste = Block(await StartseiteAsync(await BetrachterAsync()), "neueste");
        Assert.Equal(3, neueste.GetProperty("eintraege").GetArrayLength());
    }

    // ---------- AK-13: Versionsprüfung ----------

    [Fact]
    public async Task Veraltete_Version_liefert_409_startseite_geaendert()
    {
        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));

        using var antwort = await PutKonfigurationAsync(Mit(StandardKonfiguration(0), k => k["neueste"]!["aktiv"] = false));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.Conflict);
        Assert.Equal("Speichern nicht möglich", json.GetProperty("title").GetString());
        Assert.Equal("startseite_geaendert", json.GetProperty("code").GetString());
        Assert.Equal("Die Startseite wurde inzwischen geändert. Bitte die Seite neu laden.", json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Zu_hohe_Version_liefert_409()
    {
        using var antwort = await PutKonfigurationAsync(Mit(StandardKonfiguration(5), k => k["kennzahlen"]!["aktiv"] = false));

        Assert.Equal(HttpStatusCode.Conflict, antwort.StatusCode);
    }

    [Fact]
    public async Task Bei_409_wird_nichts_geaendert()
    {
        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));
        var vorher = await StartseiteDb.ZustandAsync();

        using var antwort = await PutKonfigurationAsync(
            Mit(MitKopf(0, alttextBereitsteller: "Wappen"), k => k["neueste"]!["aktiv"] = false),
            new LogoTeil("logoBereitsteller", LogoBilder.Png(10, 10)));

        Assert.Equal(HttpStatusCode.Conflict, antwort.StatusCode);
        Assert.Equal(vorher, await StartseiteDb.ZustandAsync());
    }

    [Fact]
    public async Task Zwei_parallele_PUT_mit_derselben_Version_liefern_genau_ein_200_und_ein_409()
    {
        var erster = Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false);
        var zweiter = Mit(StandardKonfiguration(), k => k["neueste"]!["aktiv"] = false);
        using var zweiterClient = Fixture.Factory.CreateClient();

        var antworten = await Task.WhenAll(PutKonfigurationAsync(Client, erster), PutKonfigurationAsync(zweiterClient, zweiter));

        Assert.Equal([HttpStatusCode.OK, HttpStatusCode.Conflict], antworten.Select(a => a.StatusCode).Order());
        foreach (var antwort in antworten)
        {
            antwort.Dispose();
        }
    }

    [Fact]
    public async Task Zwei_parallele_PUT_schreiben_Audit_nur_fuer_den_erfolgreichen()
    {
        var erster = Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false);
        var zweiter = Mit(StandardKonfiguration(), k => k["neueste"]!["aktiv"] = false);
        using var zweiterClient = Fixture.Factory.CreateClient();

        var antworten = await Task.WhenAll(PutKonfigurationAsync(Client, erster), PutKonfigurationAsync(zweiterClient, zweiter));
        foreach (var antwort in antworten)
        {
            antwort.Dispose();
        }

        var audit = Assert.Single(await StartseiteDb.AuditAsync());
        Assert.Equal(1, audit.Version);
        Assert.Equal("BlockAusgeschaltet", audit.Art);
    }

    // ---------- AK-10: Atomarität ----------

    [Fact]
    public async Task Abgelehntes_Logo_verwirft_auch_die_uebrige_Konfiguration()
    {
        using var antwort = await PutKonfigurationAsync(
            Mit(MitKopf(alttextBereitsteller: "Wappen"), k => k["kennzahlen"]!["aktiv"] = false),
            new LogoTeil("logoBereitsteller", LogoBilder.Svg(), "logo.png"));

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        Assert.Equal(0, await StartseiteDb.AnzahlKonfigurationenAsync());
        Assert.Empty(await StartseiteDb.LogosAsync());
        Assert.Empty(await StartseiteDb.AuditAsync());
    }

    [Fact]
    public async Task Ein_gueltiges_und_ein_abgelehntes_Logo_speichern_keines()
    {
        using var antwort = await PutKonfigurationAsync(
            MitKopf(alttextBereitsteller: "Wappen", alttextSoftware: "Software"),
            new LogoTeil("logoBereitsteller", LogoBilder.Png(10, 10)),
            new LogoTeil("logoSoftware", LogoBilder.Apng(10, 10)));

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        Assert.Empty(await StartseiteDb.LogosAsync());
    }

    [Fact]
    public async Task Validierungsfehler_aendern_eine_gespeicherte_Konfiguration_nicht()
    {
        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));
        var vorher = await StartseiteDb.ZustandAsync();

        using var antwort = await PutKonfigurationAsync(Mit(StandardKonfiguration(1), k => k["neueste"]!["anzahl"] = 99));

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        Assert.Equal(vorher, await StartseiteDb.ZustandAsync());
    }

    [Fact]
    public async Task Speichern_mit_Logo_liefert_die_Logo_Metadaten_in_der_Antwort()
    {
        var logo = LogoBilder.Png(400, 480);

        var antwort = await LogoHochladenAsync("bereitsteller", logo, "Wappen Test");

        var meta = antwort.GetProperty("kopf").GetProperty("logoBereitsteller");
        Assert.Equal(
            ("Wappen Test", "png", 400, 480, logo.Length),
            (meta.GetProperty("alternativtext").GetString(), meta.GetProperty("format").GetString(),
                meta.GetProperty("breite").GetInt32(), meta.GetProperty("hoehe").GetInt32(), meta.GetProperty("groesseBytes").GetInt32()));
        Assert.Equal($"/api/startseite/logos/bereitsteller?v={Sha256(logo)[..16]}", meta.GetProperty("url").GetString());
    }

    [Fact]
    public async Task Konfigurationsantwort_hat_die_Felder_aus_Abschnitt_5_3()
    {
        var antwort = await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));

        Assert.Equal(
            ["daten", "geaendertAm", "geaendertVon", "infotext", "kennzahlen", "kopf", "meistausgegeben", "neueste", "reihenfolge", "standard", "version"],
            Feldnamen(antwort));
        Assert.Equal(["kennzahlen", "meistausgegeben", "neueste"], Feldnamen(antwort.GetProperty("daten")));
        Assert.Equal(JsonValueKind.Array, antwort.GetProperty("daten").GetProperty("neueste").ValueKind);
    }

    [Fact]
    public async Task Konfiguration_ohne_Teil_version_wird_abgelehnt()
    {
        var ohneVersion = StandardKonfiguration();
        ohneVersion.Remove("version");

        using var antwort = await PutKonfigurationAsync(ohneVersion);

        Assert.Equal(["Ungültiger Wert für dieses Feld."], await FehlerZuAsync(antwort, "version"));
    }

    [Fact]
    public async Task Negative_Version_wird_abgelehnt()
    {
        using var antwort = await PutKonfigurationAsync(StandardKonfiguration(-1));

        Assert.Equal(["Ungültiger Wert für dieses Feld."], await FehlerZuAsync(antwort, "version"));
    }

    [Fact]
    public async Task Speichern_mit_JsonNode_null_fuer_einen_Block_wird_abgelehnt()
    {
        var kaputt = Mit(StandardKonfiguration(), k => k["kennzahlen"] = null);

        using var antwort = await PutKonfigurationAsync(kaputt);

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        Assert.Equal(0, await StartseiteDb.AnzahlKonfigurationenAsync());
    }

    [Fact]
    public async Task Falscher_JSON_Typ_meldet_Ungueltiger_Wert_fuer_dieses_Feld()
    {
        var kaputt = Mit(StandardKonfiguration(), k => k["neueste"]!["anzahl"] = JsonValue.Create("sechs"));

        using var antwort = await PutKonfigurationAsync(kaputt);

        Assert.Equal(["Ungültiger Wert für dieses Feld."], await FehlerZuAsync(antwort, "neueste.anzahl"));
    }
}
