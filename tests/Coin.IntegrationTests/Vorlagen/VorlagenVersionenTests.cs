using System.Net;
using System.Text;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen, AK-6, AK-7 und AK-17 bis AK-20 (ADR-0023): Vorlagenstatus, Versionen, Downloads,
/// Zurücksetzen, parallele Uploads.
/// </summary>
public class VorlagenVersionenTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private static string[] Feldnamen(JsonElement json) =>
        json.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray();

    private static byte[] DateiMitText(string text) => Gueltig().Absaetze(Text(text)).Bytes();

    // ---------- AK-17: Status ohne eigene Vorlage ----------

    [Fact]
    public async Task Status_ohne_eigene_Vorlage_ist_Standard_ohne_Versionen()
    {
        var coinId = await CoinAsync();

        var status = await StatusAsync(coinId);

        Assert.Equal("standard", status.GetProperty("quelle").GetString());
        Assert.Equal(JsonValueKind.Null, status.GetProperty("aktiveVersion").ValueKind);
        Assert.Equal(0, status.GetProperty("versionen").GetArrayLength());
    }

    [Fact]
    public async Task Status_hat_genau_die_Felder_quelle_aktiveVersion_versionen()
    {
        var coinId = await CoinAsync();

        Assert.Equal(["aktiveVersion", "quelle", "versionen"], Feldnamen(await StatusAsync(coinId)));
    }

    [Fact]
    public async Task Status_fuer_unbekannten_Coin_liefert_404_Coin_nicht_gefunden()
    {
        using var antwort = await Client.GetAsync(VorlageUrl(Guid.NewGuid()));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Coin nicht gefunden", json.GetProperty("title").GetString());
    }

    // ---------- AK-7, AK-17: erster Upload ----------

    [Fact]
    public async Task Erster_Upload_liefert_201_mit_Version_1_aktiv()
    {
        var coinId = await CoinAsync();

        var status = await LadeVorlageHochAsync(coinId);

        Assert.Equal("eigene", status.GetProperty("quelle").GetString());
        Assert.Equal(1, status.GetProperty("aktiveVersion").GetInt32());
    }

    [Fact]
    public async Task Upload_Antwort_hat_keinen_Location_Header()
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, Gueltig().Bytes());

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
        Assert.Null(antwort.Headers.Location);
    }

    [Fact]
    public async Task Upload_Antwort_entspricht_dem_Status()
    {
        var coinId = await CoinAsync();

        var antwort = await LadeVorlageHochAsync(coinId);

        Assert.Equal(antwort.ToString(), (await StatusAsync(coinId)).ToString());
    }

    [Fact]
    public async Task Version_hat_genau_die_Felder_aus_dem_Entwurf()
    {
        var coinId = await CoinAsync();

        var version = (await LadeVorlageHochAsync(coinId)).GetProperty("versionen")[0];

        Assert.Equal(["aktiv", "groesseBytes", "hochgeladenAm", "hochgeladenVon", "version"], Feldnamen(version));
        Assert.Equal(["id", "name"], Feldnamen(version.GetProperty("hochgeladenVon")));
    }

    [Fact]
    public async Task Version_nennt_Hochladenden_mit_Id_und_Namen()
    {
        var coinId = await CoinAsync();
        var konto = await KontoAsync("Sachbearbeiter", name: "Test Sachbearbeiter Versionen");

        var version = (await LadeVorlageHochAsync(coinId, client: konto.Client)).GetProperty("versionen")[0];

        Assert.Equal(konto.Id, version.GetProperty("hochgeladenVon").GetProperty("id").GetGuid());
        Assert.Equal("Test Sachbearbeiter Versionen", version.GetProperty("hochgeladenVon").GetProperty("name").GetString());
    }

    [Fact]
    public async Task Version_nennt_den_aktuellen_Anzeigenamen_des_Hochladenden()
    {
        var coinId = await CoinAsync();
        var konto = await KontoAsync("Sachbearbeiter", name: "Test Name Vorher");
        await LadeVorlageHochAsync(coinId, client: konto.Client);
        var neu = ClientMit(new TokenDaten { Subject = konto.Subject, Email = konto.Email, Name = "Test Name Nachher" });
        using (var me = await neu.GetAsync(MeUrl))
        {
            Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        }

        var version = (await StatusAsync(coinId)).GetProperty("versionen")[0];

        Assert.Equal("Test Name Nachher", version.GetProperty("hochgeladenVon").GetProperty("name").GetString());
    }

    [Fact]
    public async Task Version_nennt_Zeitpunkt_mit_Offset_wie_in_der_Datenbank()
    {
        var coinId = await CoinAsync();
        var vorher = DateTimeOffset.UtcNow.AddMinutes(-1);

        var version = (await LadeVorlageHochAsync(coinId)).GetProperty("versionen")[0];

        var zeitpunkt = version.GetProperty("hochgeladenAm").GetDateTimeOffset();
        Assert.InRange(zeitpunkt, vorher, DateTimeOffset.UtcNow.AddMinutes(1));
        Assert.Equal(Assert.Single(await VorlageDb.VersionenAsync(coinId)).HochgeladenAm, zeitpunkt);
    }

    [Fact]
    public async Task Version_ist_aktiv_markiert()
    {
        var coinId = await CoinAsync();

        var version = (await LadeVorlageHochAsync(coinId)).GetProperty("versionen")[0];

        Assert.Equal((1, true), (version.GetProperty("version").GetInt32(), version.GetProperty("aktiv").GetBoolean()));
    }

    // ---------- AK-19: zweiter Upload ----------

    [Fact]
    public async Task Zweiter_Upload_erzeugt_Version_2_und_macht_sie_aktiv()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId, DateiMitText("Erste"));

        var status = await LadeVorlageHochAsync(coinId, DateiMitText("Zweite"));

        Assert.Equal(2, status.GetProperty("aktiveVersion").GetInt32());
    }

    [Fact]
    public async Task Versionen_stehen_neueste_zuerst_nur_die_aktive_ist_aktiv()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId, DateiMitText("Erste"));

        var versionen = (await LadeVorlageHochAsync(coinId, DateiMitText("Zweite"))).GetProperty("versionen").EnumerateArray()
            .Select(v => (v.GetProperty("version").GetInt32(), v.GetProperty("aktiv").GetBoolean()));

        Assert.Equal([(2, true), (1, false)], versionen);
    }

    [Fact]
    public async Task Version_1_bleibt_nach_dem_zweiten_Upload_byte_gleich_abrufbar()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId, DateiMitText("Erste"));
        var v1Vorher = await LadeAsync(VersionDateiUrl(coinId, 1));

        await LadeVorlageHochAsync(coinId, DateiMitText("Zweite"));

        Assert.Equal(v1Vorher, await LadeAsync(VersionDateiUrl(coinId, 1)));
    }

    [Fact]
    public async Task Version_1_bleibt_in_der_Datenbank_unveraendert()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId, DateiMitText("Erste"));
        var vorher = Assert.Single(await VorlageDb.VersionenAsync(coinId));

        await LadeVorlageHochAsync(coinId, DateiMitText("Zweite"));

        var nachher = (await VorlageDb.VersionenAsync(coinId))[0];
        Assert.Equal((vorher.Id, vorher.Sha256, vorher.GroesseBytes, vorher.HochgeladenAm), (nachher.Id, nachher.Sha256, nachher.GroesseBytes, nachher.HochgeladenAm));
        Assert.Equal(vorher.Inhalt, nachher.Inhalt);
    }

    [Fact]
    public async Task Aktive_Datei_ist_nach_dem_zweiten_Upload_Version_2()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId, DateiMitText("Erste"));
        await LadeVorlageHochAsync(coinId, DateiMitText("Zweite"));

        Assert.Equal(await LadeAsync(VersionDateiUrl(coinId, 2)), await LadeAsync(AktiveDateiUrl(coinId)));
    }

    [Fact]
    public async Task Versionen_sind_je_Coin_nummeriert()
    {
        var erster = await CoinAsync();
        var zweiter = await CoinAsync();
        await LadeVorlageHochAsync(erster);
        await LadeVorlageHochAsync(erster);

        var status = await LadeVorlageHochAsync(zweiter);

        Assert.Equal(1, status.GetProperty("aktiveVersion").GetInt32());
    }

    [Fact]
    public async Task Parallele_Uploads_ergeben_fortlaufende_Versionen_ohne_Doppelung()
    {
        var coinId = await CoinAsync();
        var dateien = Enumerable.Range(1, 4).Select(i => DateiMitText($"Parallel {i}")).ToList();

        var antworten = await Task.WhenAll(dateien.Select(d => PostVersionAsync(coinId, d)));
        foreach (var antwort in antworten)
        {
            Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
            antwort.Dispose();
        }

        Assert.Equal([1, 2, 3, 4], (await VorlageDb.VersionenAsync(coinId)).Select(v => v.Version));
    }

    [Fact]
    public async Task Nach_parallelen_Uploads_ist_die_hoechste_Version_aktiv()
    {
        var coinId = await CoinAsync();

        var antworten = await Task.WhenAll(Enumerable.Range(1, 3).Select(i => PostVersionAsync(coinId, DateiMitText($"P{i}"))));
        foreach (var antwort in antworten)
        {
            antwort.Dispose();
        }

        Assert.Equal(3, (await StatusAsync(coinId)).GetProperty("aktiveVersion").GetInt32());
    }

    // ---------- AK-18: Downloads ----------

    [Fact]
    public async Task Aktive_Datei_ohne_eigene_Vorlage_ist_die_Standardvorlage()
    {
        var coinId = await CoinAsync();

        var aktiv = await LadeAsync(AktiveDateiUrl(coinId));

        Assert.Equal(DocxLeser.Absatztexte(await StandardvorlageAsync()), DocxLeser.Absatztexte(aktiv));
    }

    [Fact]
    public async Task Aktive_Datei_ist_byte_gleich_zur_gespeicherten_Fassung()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);

        var aktiv = await LadeAsync(AktiveDateiUrl(coinId));

        Assert.Equal(Assert.Single(await VorlageDb.VersionenAsync(coinId)).Inhalt, aktiv);
    }

    [Fact]
    public async Task Header_der_aktiven_Datei_ohne_eigene_Vorlage()
    {
        var coinId = await CoinAsync();

        using var antwort = await Client.GetAsync(AktiveDateiUrl(coinId));

        AssertDownloadHeader(antwort, $"zertifikatsvorlage-{coinId}-standard.docx");
    }

    [Fact]
    public async Task Header_der_aktiven_eigenen_Vorlage()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);
        await LadeVorlageHochAsync(coinId);

        using var antwort = await Client.GetAsync(AktiveDateiUrl(coinId));

        AssertDownloadHeader(antwort, $"zertifikatsvorlage-{coinId}-v2.docx");
    }

    [Fact]
    public async Task Header_einer_bestimmten_Version()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);
        await LadeVorlageHochAsync(coinId);

        using var antwort = await Client.GetAsync(VersionDateiUrl(coinId, 1));

        AssertDownloadHeader(antwort, $"zertifikatsvorlage-{coinId}-v1.docx");
    }

    [Theory]
    [InlineData("2")]
    [InlineData("0")]
    [InlineData("-1")]
    public async Task Unbekannte_Version_liefert_404_Vorlage_nicht_gefunden(string version)
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);

        using var antwort = await Client.GetAsync($"{VersionenUrl(coinId)}/{version}/datei");

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Vorlage nicht gefunden", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Version_als_Text_liefert_404()
    {
        var coinId = await CoinAsync();

        using var antwort = await Client.GetAsync($"{VersionenUrl(coinId)}/eins/datei");

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Fact]
    public async Task Version_eines_anderen_Coins_ist_nicht_abrufbar()
    {
        var mitVorlage = await CoinAsync();
        var ohneVorlage = await CoinAsync();
        await LadeVorlageHochAsync(mitVorlage);

        using var antwort = await Client.GetAsync(VersionDateiUrl(ohneVorlage, 1));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Vorlage nicht gefunden", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Versions_Download_fuer_unbekannten_Coin_liefert_404_Coin_nicht_gefunden()
    {
        using var antwort = await Client.GetAsync(VersionDateiUrl(Guid.NewGuid(), 1));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Coin nicht gefunden", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Aktive_Datei_fuer_unbekannten_Coin_liefert_404_Coin_nicht_gefunden()
    {
        using var antwort = await Client.GetAsync(AktiveDateiUrl(Guid.NewGuid()));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Coin nicht gefunden", json.GetProperty("title").GetString());
    }

    // ---------- AK-20: Zurücksetzen ----------

    [Fact]
    public async Task Zuruecksetzen_liefert_200_mit_Standard_und_allen_Versionen()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);
        await LadeVorlageHochAsync(coinId);

        using var antwort = await PostZuruecksetzenAsync(Client, coinId);
        var status = await JsonAsync(antwort);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("standard", status.GetProperty("quelle").GetString());
        Assert.Equal(JsonValueKind.Null, status.GetProperty("aktiveVersion").ValueKind);
        Assert.Equal(
            [(2, false), (1, false)],
            status.GetProperty("versionen").EnumerateArray().Select(v => (v.GetProperty("version").GetInt32(), v.GetProperty("aktiv").GetBoolean())));
    }

    [Fact]
    public async Task Nach_dem_Zuruecksetzen_ist_die_aktive_Datei_die_Standardvorlage()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId, DateiMitText("Eigene Vorlage Zr01"));

        using (await PostZuruecksetzenAsync(Client, coinId))
        {
        }

        using var antwort = await Client.GetAsync(AktiveDateiUrl(coinId));
        AssertDownloadHeader(antwort, $"zertifikatsvorlage-{coinId}-standard.docx");
        Assert.DoesNotContain("Zr01", DocxLeser.AllesAlsText(await antwort.Content.ReadAsByteArrayAsync()), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Nach_dem_Zuruecksetzen_bleiben_die_Versionen_abrufbar()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);
        var v1 = await LadeAsync(VersionDateiUrl(coinId, 1));

        using (await PostZuruecksetzenAsync(Client, coinId))
        {
        }

        Assert.Equal(v1, await LadeAsync(VersionDateiUrl(coinId, 1)));
    }

    [Fact]
    public async Task Zuruecksetzen_bei_aktiver_Standardvorlage_liefert_200_ohne_Aenderung()
    {
        var coinId = await CoinAsync();
        var vorher = await SpeicherZustandAsync(coinId);

        using var antwort = await PostZuruecksetzenAsync(Client, coinId);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("standard", (await JsonAsync(antwort)).GetProperty("quelle").GetString());
        Assert.Equal(vorher, await SpeicherZustandAsync(coinId));
    }

    [Fact]
    public async Task Zuruecksetzen_fuer_unbekannten_Coin_liefert_404()
    {
        using var antwort = await PostZuruecksetzenAsync(Client, Guid.NewGuid());

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Coin nicht gefunden", json.GetProperty("title").GetString());
    }

    [Theory]
    [InlineData("application/json", "{\"version\": 1}")]
    [InlineData("text/plain", "beliebig")]
    public async Task Zuruecksetzen_ignoriert_einen_mitgesendeten_Body(string contentType, string body)
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);

        using var antwort = await Client.PostAsync(ZuruecksetzenUrl(coinId), new StringContent(body, Encoding.UTF8, contentType));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Null(await VorlageDb.AktiveVersionAsync(coinId));
    }

    [Fact]
    public async Task Nach_dem_Zuruecksetzen_erhaelt_ein_Upload_die_naechste_freie_Nummer()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);
        await LadeVorlageHochAsync(coinId);
        using (await PostZuruecksetzenAsync(Client, coinId))
        {
        }

        var status = await LadeVorlageHochAsync(coinId);

        Assert.Equal(3, status.GetProperty("aktiveVersion").GetInt32());
    }

    [Fact]
    public async Task Nach_dem_Zuruecksetzen_wird_die_Nummer_1_nie_wieder_vergeben()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);
        using (await PostZuruecksetzenAsync(Client, coinId))
        {
        }

        var status = await LadeVorlageHochAsync(coinId);

        Assert.Equal(2, status.GetProperty("aktiveVersion").GetInt32());
    }

    // ---------- F6: kein Aktivieren ----------

    [Theory]
    [InlineData("POST", "/versionen/1/aktivieren")]
    [InlineData("PUT", "/versionen/1/aktivieren")]
    [InlineData("PUT", "/aktiv")]
    [InlineData("PUT", "")]
    public async Task Es_gibt_keinen_Endpunkt_zum_Aktivieren_einer_Version(string methode, string pfad)
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);
        await LadeVorlageHochAsync(coinId);

        using var anfrage = new HttpRequestMessage(new HttpMethod(methode), VorlageUrl(coinId) + pfad)
        {
            Content = new StringContent("{\"version\": 1}", Encoding.UTF8, "application/json"),
        };
        using var antwort = await Client.SendAsync(anfrage);

        Assert.Contains((int)antwort.StatusCode, new[] { 404, 405 });
        Assert.Equal(2, await VorlageDb.AktiveVersionAsync(coinId));
    }

    // ---------- Cache-Control und öffentliches DTO ----------

    public static TheoryData<string> NeueEndpunkte => ["Status", "aktive Datei", "Version", "Standard", "Upload", "Zuruecksetzen"];

    [Theory]
    [MemberData(nameof(NeueEndpunkte))]
    public async Task Alle_neuen_Endpunkte_senden_Cache_Control_no_store(string endpunkt)
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);

        using var antwort = endpunkt switch
        {
            "Status" => await Client.GetAsync(VorlageUrl(coinId)),
            "aktive Datei" => await Client.GetAsync(AktiveDateiUrl(coinId)),
            "Version" => await Client.GetAsync(VersionDateiUrl(coinId, 1)),
            "Standard" => await Client.GetAsync(StandardUrl),
            "Upload" => await PostVersionAsync(coinId, Gueltig().Bytes()),
            _ => await PostZuruecksetzenAsync(Client, coinId),
        };

        Assert.True(antwort.IsSuccessStatusCode, $"{endpunkt}: {(int)antwort.StatusCode}");
        Assert.True(antwort.Headers.CacheControl?.NoStore, $"{endpunkt}: Cache-Control {antwort.Headers.CacheControl}");
    }

    [Fact]
    public async Task Oeffentliches_Coin_DTO_bleibt_bei_sieben_Feldern()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);

        using var antwort = await Anonym.GetAsync($"{CoinsUrl}/{coinId}");

        Assert.Equal(
            ["auflage", "beschreibung", "bildUrl", "erstelltAm", "herausgeber", "id", "name"],
            Feldnamen(await JsonAsync(antwort)));
    }
}
