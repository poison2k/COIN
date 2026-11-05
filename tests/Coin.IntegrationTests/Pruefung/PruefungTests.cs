using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Pruefung;

/// <summary>
/// Feature hologrammnummer, AK-16, AK-18, AK-20 und AK-21 (ADR-0034 Punkt 1 bis 3 und 5): <c>POST /api/pruefung</c>
/// und <c>POST /api/pruefung/mit-empfaenger</c> – Ergebnis in fester Reihenfolge aus der aktuellen Zuordnung,
/// Antwortformat, gleichförmige Antworten für <c>falscherCoin</c>/<c>nichtGefunden</c>, Mindestdauer, Prüf-Audit und
/// Eingabefehler. Jede Prüfung läuft über ein eigenes Konto (Ratenbegrenzung je Benutzer).
/// </summary>
public class PruefungTests(PostgresFixture fixture) : PruefungTestBasis(fixture)
{
    // ---------- AK-16: Ergebnisse ----------

    [Fact]
    public async Task Gueltige_Nummer_ohne_Coin_ergibt_gueltig()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        Assert.Equal("gueltig", Ergebnis(await PruefeAsync(pruefer.Client, "AB1234")));
    }

    [Fact]
    public async Task Antwort_hat_genau_ergebnis_und_datensatz()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        var json = await PruefeAsync(pruefer.Client, "AB1234");

        Assert.Equal(["datensatz", "ergebnis"], Feldnamen(json));
    }

    [Fact]
    public async Task Datensatz_ohne_Empfaenger_hat_genau_die_Felder_aus_Abschnitt_5_4()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        var datensatz = (await PruefeAsync(pruefer.Client, "AB1234")).GetProperty("datensatz");

        Assert.Equal(["coin", "datum", "exemplarNummer", "hologrammnummer", "status", "storniertAm", "zertifikatsnummer"], Feldnamen(datensatz));
        Assert.Equal(["id", "name"], Feldnamen(datensatz.GetProperty("coin")));
    }

    [Fact]
    public async Task Datensatz_enthaelt_Coin_Exemplar_Nummern_Datum_und_Status()
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        var d = (await PruefeAsync(pruefer.Client, "AB1234")).GetProperty("datensatz");

        Assert.Equal(
            (s.CoinA, s.CoinAName, 12, s.AktivZertifikatsnummer, "AB 12-34", Datum, "aktiv", JsonValueKind.Null),
            (d.GetProperty("coin").GetProperty("id").GetGuid(), d.GetProperty("coin").GetProperty("name").GetString(),
                d.GetProperty("exemplarNummer").GetInt32(), d.GetProperty("zertifikatsnummer").GetString(),
                d.GetProperty("hologrammnummer").GetString(), d.GetProperty("datum").GetString(), d.GetProperty("status").GetString(),
                d.GetProperty("storniertAm").ValueKind));
    }

    [Fact]
    public async Task Gueltige_Nummer_mit_passendem_Coin_ergibt_gueltig()
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        Assert.Equal("gueltig", Ergebnis(await PruefeAsync(pruefer.Client, "AB1234", s.CoinA)));
    }

    [Fact]
    public async Task Nummer_in_beliebiger_Schreibweise_wird_gefunden()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        Assert.Equal("gueltig", Ergebnis(await PruefeAsync(pruefer.Client, " ab– 12 34 ")));
    }

    [Fact]
    public async Task Nummer_eines_anderen_Coins_ergibt_falscherCoin_ohne_Datensatz()
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        var json = await PruefeAsync(pruefer.Client, "AB1234", s.CoinB);

        Assert.Equal(("falscherCoin", JsonValueKind.Null), (Ergebnis(json), json.GetProperty("datensatz").ValueKind));
    }

    [Fact]
    public async Task Stornierte_Ausgabe_eines_anderen_Coins_ergibt_falscherCoin()
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        Assert.Equal("falscherCoin", Ergebnis(await PruefeAsync(pruefer.Client, "CD5678", s.CoinB)));
    }

    [Fact]
    public async Task Unbekannter_Coin_gilt_wie_ein_anderer_Coin()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        Assert.Equal("falscherCoin", Ergebnis(await PruefeAsync(pruefer.Client, "AB1234", Guid.NewGuid())));
    }

    [Fact]
    public async Task Unbekannte_Nummer_ergibt_nichtGefunden_ohne_Datensatz()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        var json = await PruefeAsync(pruefer.Client, "ZZ9999");

        Assert.Equal(("nichtGefunden", JsonValueKind.Null), (Ergebnis(json), json.GetProperty("datensatz").ValueKind));
    }

    [Fact]
    public async Task Unbekannte_Nummer_mit_Coin_ergibt_nichtGefunden()
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        Assert.Equal("nichtGefunden", Ergebnis(await PruefeAsync(pruefer.Client, "ZZ9999", s.CoinA)));
    }

    [Fact]
    public async Task Abgeloeste_Nummer_ergibt_nichtGefunden()
    {
        var a = await NeueAusgabeAsync("EF1243");
        await AendereAsync(a, "EF1234", "Tippfehler");
        var pruefer = await PrueferAsync();

        Assert.Equal("nichtGefunden", Ergebnis(await PruefeAsync(pruefer.Client, "EF1243")));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Stornierte_Ausgabe_ergibt_storniert_mit_Status_und_Storno_Datum(bool mitEmpfaenger)
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        var json = await PruefeAsync(pruefer.Client, "cd 56-78", mitEmpfaenger: mitEmpfaenger);
        var d = json.GetProperty("datensatz");

        Assert.Equal(
            ("storniert", "storniert", HeuteInBerlin(), s.StorniertZertifikatsnummer, "CD 56-78"),
            (Ergebnis(json), d.GetProperty("status").GetString(), d.GetProperty("storniertAm").GetString(),
                d.GetProperty("zertifikatsnummer").GetString(), d.GetProperty("hologrammnummer").GetString()));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Stornierte_Ausgabe_liefert_keinen_Storno_Grund(bool mitEmpfaenger)
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        using var antwort = await PostPruefungAsync(pruefer.Client, "CD5678", mitEmpfaenger: mitEmpfaenger);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.DoesNotContain("Pv17", await antwort.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Storniert_Datum_hat_das_Format_JJJJ_MM_TT()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        var storniertAm = (await PruefeAsync(pruefer.Client, "CD5678")).GetProperty("datensatz").GetProperty("storniertAm").GetString();

        Assert.Matches(@"^\d{4}-\d{2}-\d{2}$", storniertAm);
    }

    // ---------- AK-16: Antwort mit Empfänger ----------

    [Fact]
    public async Task Datensatz_mit_Empfaenger_hat_zusaetzlich_genau_die_Empfaengerfelder()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        var datensatz = (await PruefeAsync(pruefer.Client, "AB1234", mitEmpfaenger: true)).GetProperty("datensatz");

        Assert.Equal(
            ["ausgabeId", "ausgebendeStelle", "begruendung", "coin", "datum", "empfaenger", "exemplarNummer", "gelegenheit", "hologrammnummer", "status", "storniertAm", "zertifikatsnummer"],
            Feldnamen(datensatz));
        Assert.Equal(["dienstgrad", "dienststelle", "name"], Feldnamen(datensatz.GetProperty("empfaenger")));
    }

    [Fact]
    public async Task Datensatz_mit_Empfaenger_enthaelt_die_Angaben_der_Ausgabe()
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        var d = (await PruefeAsync(pruefer.Client, "AB1234", mitEmpfaenger: true)).GetProperty("datensatz");
        var e = d.GetProperty("empfaenger");

        Assert.Equal(
            (s.AktivId, Name, Dienstgrad, Dienststelle, Gelegenheit, Begruendung, Stelle),
            (d.GetProperty("ausgabeId").GetGuid(), e.GetProperty("name").GetString(), e.GetProperty("dienstgrad").GetString(),
                e.GetProperty("dienststelle").GetString(), d.GetProperty("gelegenheit").GetString(),
                d.GetProperty("begruendung").GetString(), d.GetProperty("ausgebendeStelle").GetString()));
    }

    [Fact]
    public async Task Mit_Empfaenger_falscherCoin_hat_ebenfalls_keinen_Datensatz()
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        var json = await PruefeAsync(pruefer.Client, "AB1234", s.CoinB, mitEmpfaenger: true);

        Assert.Equal(("falscherCoin", JsonValueKind.Null), (Ergebnis(json), json.GetProperty("datensatz").ValueKind));
    }

    // ---------- AK-18: Gleichförmigkeit ----------

    private static Dictionary<string, string> OhneErgebnis(JsonElement json) =>
        json.EnumerateObject().Where(p => p.Name != "ergebnis").ToDictionary(p => p.Name, p => p.Value.GetRawText());

    private static string[] HeaderNamen(HttpResponseMessage antwort) =>
        [.. antwort.Headers.Select(h => h.Key).Concat(antwort.Content.Headers.Select(h => h.Key))
            .Where(n => !n.Equals("Content-Length", StringComparison.OrdinalIgnoreCase))
            .Select(n => n.ToLowerInvariant()).Order(StringComparer.Ordinal)];

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FalscherCoin_und_nichtGefunden_unterscheiden_sich_nur_im_Ergebniswert(bool mitEmpfaenger)
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        using var falsch = await PostPruefungAsync(pruefer.Client, "AB1234", s.CoinB, mitEmpfaenger);
        using var unbekannt = await PostPruefungAsync(pruefer.Client, "ZZ9999", s.CoinB, mitEmpfaenger);

        Assert.Equal((HttpStatusCode.OK, HttpStatusCode.OK), (falsch.StatusCode, unbekannt.StatusCode));
        Assert.Equal(OhneErgebnis(await JsonAsync(unbekannt)), OhneErgebnis(await JsonAsync(falsch)));
    }

    [Fact]
    public async Task FalscherCoin_und_nichtGefunden_haben_dieselben_Header_Namen()
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        using var falsch = await PostPruefungAsync(pruefer.Client, "AB1234", s.CoinB);
        using var unbekannt = await PostPruefungAsync(pruefer.Client, "ZZ9999", s.CoinB);

        Assert.Equal((HttpStatusCode.OK, HttpStatusCode.OK), (falsch.StatusCode, unbekannt.StatusCode));
        Assert.Equal(HeaderNamen(unbekannt), HeaderNamen(falsch));
    }

    [Fact]
    public async Task FalscherCoin_nennt_weder_den_anderen_Coin_noch_die_Ausgabe()
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        using var antwort = await PostPruefungAsync(pruefer.Client, "AB1234", s.CoinB, mitEmpfaenger: true);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.DoesNotContain(s.CoinA.ToString(), text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(s.AktivId.ToString(), text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(s.CoinAName, text, StringComparison.Ordinal);
        Assert.DoesNotContain(s.AktivZertifikatsnummer, text, StringComparison.Ordinal);
    }

    public static TheoryData<string, bool> AlleFaelle()
    {
        var daten = new TheoryData<string, bool>();
        foreach (var fall in new[] { "gueltig", "storniert", "falscherCoin", "nichtGefunden" })
        {
            daten.Add(fall, false);
            daten.Add(fall, true);
        }

        return daten;
    }

    private static Task<HttpResponseMessage> PruefeFallAsync(HttpClient client, PruefSzenario s, string fall, bool mitEmpfaenger) => fall switch
    {
        "gueltig" => PostPruefungAsync(client, "AB1234", s.CoinA, mitEmpfaenger),
        "storniert" => PostPruefungAsync(client, "CD5678", null, mitEmpfaenger),
        "falscherCoin" => PostPruefungAsync(client, "AB1234", s.CoinB, mitEmpfaenger),
        _ => PostPruefungAsync(client, "ZZ9999", s.CoinA, mitEmpfaenger),
    };

    [Theory]
    [MemberData(nameof(AlleFaelle))]
    public async Task Jede_Pruefantwort_kommt_fruehestens_nach_250_ms(string fall, bool mitEmpfaenger)
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();
        // Warm-up außerhalb der Messung (erste Anfrage des Kontos, JIT); zählt im Kontingent mit.
        using (await PostPruefungAsync(pruefer.Client, "ZZ0000"))
        {
        }

        var uhr = Stopwatch.StartNew();
        using var antwort = await PruefeFallAsync(pruefer.Client, s, fall, mitEmpfaenger);
        uhr.Stop();

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.True(uhr.Elapsed >= TimeSpan.FromMilliseconds(250), $"{fall}: Antwort nach {uhr.Elapsed.TotalMilliseconds:F0} ms.");
    }

    [Theory]
    [MemberData(nameof(AlleFaelle))]
    public async Task Jede_Pruefantwort_liefert_das_erwartete_Ergebnis(string fall, bool mitEmpfaenger)
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        using var antwort = await PruefeFallAsync(pruefer.Client, s, fall, mitEmpfaenger);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(fall, Ergebnis(await JsonAsync(antwort)));
    }

    [Fact]
    public async Task Pruefantwort_wird_nicht_zwischengespeichert()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        using var antwort = await PostPruefungAsync(pruefer.Client, "AB1234");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.True(antwort.Headers.CacheControl?.NoStore, "Cache-Control ohne no-store ([KeinCache]).");
    }

    // ---------- AK-20: Prüf-Audit ----------

    [Theory]
    [InlineData("gueltig", "Gueltig")]
    [InlineData("storniert", "Storniert")]
    [InlineData("falscherCoin", "FalscherCoin")]
    [InlineData("nichtGefunden", "NichtGefunden")]
    public async Task Jede_Pruefung_schreibt_genau_einen_Audit_Eintrag_mit_der_Ergebnisart(string fall, string erwartet)
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        using (await PruefeFallAsync(pruefer.Client, s, fall, false))
        {
        }

        Assert.Equal(erwartet, Assert.Single(await HologrammDb.PruefAuditAsync(pruefer.Id)).Ergebnis);
    }

    [Fact]
    public async Task Audit_bei_gueltig_enthaelt_Akteur_Normalform_Coin_Ausgabe_und_Zeitpunkt()
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();
        var vorher = DateTimeOffset.UtcNow.AddSeconds(-5);

        await PruefeAsync(pruefer.Client, "ab 12-34", s.CoinA);

        var audit = Assert.Single(await HologrammDb.PruefAuditAsync(pruefer.Id));
        Assert.Equal(
            (pruefer.Id, "AB1234", (Guid?)s.CoinA, (Guid?)s.AktivId, false),
            (audit.AkteurId, audit.Nummer, audit.CoinIdGewaehlt, audit.AusgabeId, audit.MitEmpfaenger));
        Assert.InRange(audit.Zeitpunkt, vorher, DateTimeOffset.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task Audit_bei_nichtGefunden_hat_keine_Ausgabe()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        await PruefeAsync(pruefer.Client, "ZZ9999");

        var audit = Assert.Single(await HologrammDb.PruefAuditAsync(pruefer.Id));
        Assert.Equal(("ZZ9999", (Guid?)null, (Guid?)null), (audit.Nummer, audit.AusgabeId, audit.CoinIdGewaehlt));
    }

    [Fact]
    public async Task Audit_bei_falscherCoin_vermerkt_die_Ausgabe_und_den_gewaehlten_Coin()
    {
        var s = await SzenarioAsync();
        var pruefer = await PrueferAsync();

        await PruefeAsync(pruefer.Client, "AB1234", s.CoinB);

        var audit = Assert.Single(await HologrammDb.PruefAuditAsync(pruefer.Id));
        Assert.Equal(((Guid?)s.AktivId, (Guid?)s.CoinB), (audit.AusgabeId, audit.CoinIdGewaehlt));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Audit_vermerkt_ob_Empfaengerdaten_ausgeliefert_wurden(bool mitEmpfaenger)
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        await PruefeAsync(pruefer.Client, "AB1234", mitEmpfaenger: mitEmpfaenger);

        Assert.Equal(mitEmpfaenger, Assert.Single(await HologrammDb.PruefAuditAsync(pruefer.Id)).MitEmpfaenger);
    }

    [Fact]
    public async Task Pruef_Audit_enthaelt_keine_Empfaengerdaten()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();
        await PruefeAsync(pruefer.Client, "AB1234", mitEmpfaenger: true);
        await PruefeAsync(pruefer.Client, "CD5678", mitEmpfaenger: true);

        Assert.DoesNotContain("Pv1", await HologrammDb.AlsTextAsync("pruefung_audit"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Ungueltige_Eingabe_schreibt_kein_Audit()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        using (await PostPruefungAsync(pruefer.Client, "AB/1"))
        {
        }

        Assert.Empty(await HologrammDb.PruefAuditAsync());
    }

    [Fact]
    public async Task Fehlende_Berechtigung_schreibt_kein_Audit()
    {
        await SzenarioAsync();
        var betrachter = await PrueferAsync("Betrachter");
        var ohneRolle = await ClientMitRolleAsync(null);

        using (await PostPruefungAsync(betrachter.Client, "AB1234", mitEmpfaenger: true))
        using (await PostPruefungAsync(ohneRolle, "AB1234"))
        using (await PostPruefungAsync(Anonym, "AB1234"))
        {
        }

        Assert.Empty(await HologrammDb.PruefAuditAsync());
    }

    [Fact]
    public async Task Scheitert_das_Audit_antwortet_die_Pruefung_mit_500_ohne_Ergebnis()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();
        await using (await HologrammDb.PruefAuditScheitertAsync())
        {
            using var antwort = await PostPruefungAsync(pruefer.Client, "AB1234");

            Assert.Equal(HttpStatusCode.InternalServerError, antwort.StatusCode);
            var text = await antwort.Content.ReadAsStringAsync();
            Assert.DoesNotContain("gueltig", text, StringComparison.Ordinal);
            Assert.DoesNotContain("AB 12-34", text, StringComparison.Ordinal);
        }
    }

    // ---------- AK-21: Eingabefehler ----------

    [Theory]
    [InlineData(null, MeldungLeer)]
    [InlineData("", MeldungLeer)]
    [InlineData("   ", MeldungLeer)]
    [InlineData("AB/1234", MeldungZeichen)]
    [InlineData("- -", MeldungNurTrenner)]
    public async Task Ungueltige_Nummer_liefert_400_am_Feld_hologrammnummer(string? eingabe, string meldung)
    {
        var pruefer = await PrueferAsync();

        using var antwort = await PostPruefungAsync(pruefer.Client, eingabe);

        Assert.Equal([meldung], await FehlerZuFeldAsync(antwort, "hologrammnummer"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Nummer_mit_41_Zeichen_liefert_den_Laengenfehler(bool mitEmpfaenger)
    {
        var pruefer = await PrueferAsync();

        using var antwort = await PostPruefungAsync(pruefer.Client, new string('A', 41), mitEmpfaenger: mitEmpfaenger);

        Assert.Equal([MeldungLaenge], await FehlerZuFeldAsync(antwort, "hologrammnummer"));
    }

    [Fact]
    public async Task Fehlendes_Feld_hologrammnummer_liefert_400()
    {
        var pruefer = await PrueferAsync();

        using var antwort = await PostRohAsync(pruefer.Client, PruefungUrl, "{}");

        Assert.Equal([MeldungLeer], await FehlerZuFeldAsync(antwort, "hologrammnummer"));
    }

    [Theory]
    [InlineData("\"keine-guid\"")]
    [InlineData("12345")]
    public async Task CoinId_ohne_GUID_Format_liefert_400_am_Feld_coinId(string coinId)
    {
        var pruefer = await PrueferAsync();

        using var antwort = await PostRohAsync(pruefer.Client, PruefungUrl, $"{{\"hologrammnummer\":\"AB1234\",\"coinId\":{coinId}}}");

        Assert.Contains("coinId", await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task CoinId_null_gilt_als_kein_Coin()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        using var antwort = await PostRohAsync(pruefer.Client, PruefungUrl, "{\"hologrammnummer\":\"AB1234\",\"coinId\":null}");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("gueltig", Ergebnis(await JsonAsync(antwort)));
    }

    [Fact]
    public async Task Kaputtes_JSON_liefert_400()
    {
        var pruefer = await PrueferAsync();

        using var antwort = await PostRohAsync(pruefer.Client, PruefungUrl, "{\"hologrammnummer\":");

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
    }

    [Theory]
    [InlineData(PruefungUrl)]
    [InlineData(PruefungMitEmpfaengerUrl)]
    public async Task Falscher_Content_Type_liefert_415(string url)
    {
        var pruefer = await PrueferAsync();

        using var antwort = await pruefer.Client.PostAsync(url, new StringContent("{\"hologrammnummer\":\"AB1234\"}", Encoding.UTF8, "text/plain"));

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, antwort.StatusCode);
    }

    [Fact]
    public async Task Pruefung_per_GET_mit_Nummer_in_der_URL_ist_nicht_moeglich()
    {
        await SzenarioAsync();
        var pruefer = await PrueferAsync();

        using var antwort = await pruefer.Client.GetAsync($"{PruefungUrl}?hologrammnummer=AB1234");

        Assert.NotEqual(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Empty(await HologrammDb.PruefAuditAsync());
    }
}
