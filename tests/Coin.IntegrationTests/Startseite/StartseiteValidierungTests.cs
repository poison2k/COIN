using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using Coin.IntegrationTests.Infrastruktur;
using Coin.Testdaten;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-9, AK-10, AK-14 und Abschnitt 5.5: serverseitige Validierung mit den Meldungen im Wortlaut,
/// alle Feld- und Logobefunde gemeinsam als <c>400</c>, Formularfehler (<c>anfrage</c>, <c>konfiguration</c>), <c>415</c>
/// ohne <c>multipart/form-data</c>, fehlender Alternativtext und Logo-Kombinationen aus AK-10.
/// </summary>
public class StartseiteValidierungTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    private const string Boundary = "----StartseiteTestBoundary";

    private static ByteArrayContent RohesMultipart(string body)
    {
        var inhalt = new ByteArrayContent(Encoding.UTF8.GetBytes(body));
        inhalt.Headers.ContentType = MediaTypeHeaderValue.Parse($"multipart/form-data; boundary={Boundary}");
        return inhalt;
    }

    private async Task<string[]> MeldungenAsync(JsonObject konfiguration, string feld, params LogoTeil[] logos)
    {
        using var antwort = await PutKonfigurationAsync(konfiguration, logos);
        return await FehlerZuAsync(antwort, feld);
    }

    // ---------- Felder ----------

    [Fact]
    public async Task Reihenfolge_mit_doppeltem_Block_wird_abgelehnt()
    {
        var k = Mit(StandardKonfiguration(), k => Reihenfolge(k, "kopf", "kopf", "kennzahlen", "neueste", "meistausgegeben"));

        Assert.Equal(["Die Reihenfolge muss jeden Block genau einmal enthalten."], await MeldungenAsync(k, "reihenfolge"));
    }

    [Fact]
    public async Task Reihenfolge_mit_unbekanntem_Block_wird_abgelehnt()
    {
        var k = Mit(StandardKonfiguration(), k => Reihenfolge(k, "kopf", "infotext", "kennzahlen", "neueste", "diagramm"));

        Assert.Equal(["Die Reihenfolge muss jeden Block genau einmal enthalten."], await MeldungenAsync(k, "reihenfolge"));
    }

    [Fact]
    public async Task Reihenfolge_mit_vier_Bloecken_wird_abgelehnt()
    {
        var k = Mit(StandardKonfiguration(), k => Reihenfolge(k, "kopf", "infotext", "kennzahlen", "neueste"));

        Assert.Equal(["Die Reihenfolge muss jeden Block genau einmal enthalten."], await MeldungenAsync(k, "reihenfolge"));
    }

    [Fact]
    public async Task Aktiver_Kopfbereich_ohne_Titel_wird_abgelehnt()
    {
        Assert.Equal(
            ["Bitte einen Titel eingeben oder den Kopfbereich ausschalten."],
            await MeldungenAsync(MitKopf(titel: "   "), "kopf.titel"));
    }

    [Fact]
    public async Task Titel_mit_101_Zeichen_wird_abgelehnt()
    {
        Assert.Equal(["Der Titel darf höchstens 100 Zeichen lang sein."], await MeldungenAsync(MitKopf(titel: new string('T', 101)), "kopf.titel"));
    }

    [Fact]
    public async Task Untertitel_mit_201_Zeichen_wird_abgelehnt()
    {
        Assert.Equal(
            ["Der Untertitel darf höchstens 200 Zeichen lang sein."],
            await MeldungenAsync(MitKopf(untertitel: new string('U', 201)), "kopf.untertitel"));
    }

    [Fact]
    public async Task Aktiver_Infotext_ohne_Text_wird_abgelehnt()
    {
        var k = Mit(StandardKonfiguration(), k => k["infotext"]!["text"] = "");

        Assert.Equal(["Bitte einen Infotext eingeben oder den Block ausschalten."], await MeldungenAsync(k, "infotext.text"));
    }

    [Fact]
    public async Task Infotext_mit_5001_Zeichen_wird_abgelehnt()
    {
        var k = Mit(StandardKonfiguration(), k => k["infotext"]!["text"] = new string('i', 5001));

        Assert.Equal(["Der Infotext darf höchstens 5.000 Zeichen lang sein."], await MeldungenAsync(k, "infotext.text"));
    }

    [Fact]
    public async Task Inaktiver_Infotext_ohne_Text_ist_gueltig()
    {
        var antwort = await SpeichernAsync(Mit(StandardKonfiguration(), k =>
        {
            k["infotext"]!["aktiv"] = false;
            k["infotext"]!["text"] = "";
        }));

        Assert.False(antwort.GetProperty("infotext").GetProperty("aktiv").GetBoolean());
    }

    [Fact]
    public async Task Infotext_mit_Steuerzeichen_wird_abgelehnt()
    {
        var k = Mit(StandardKonfiguration(), k => k["infotext"]!["text"] = "Text\u0000mit Nullbyte");

        Assert.Equal(["Der Text enthält unzulässige Steuerzeichen."], await MeldungenAsync(k, "infotext.text"));
    }

    [Theory]
    [InlineData(2)]
    [InlineData(13)]
    public async Task Neueste_Anzahl_ausserhalb_3_bis_12_wird_abgelehnt(int anzahl)
    {
        var k = Mit(StandardKonfiguration(), k => k["neueste"]!["anzahl"] = anzahl);

        Assert.Equal(["Die Anzahl muss zwischen 3 und 12 liegen."], await MeldungenAsync(k, "neueste.anzahl"));
    }

    [Theory]
    [InlineData(2)]
    [InlineData(11)]
    public async Task Meistausgegebene_Anzahl_ausserhalb_3_bis_10_wird_abgelehnt(int anzahl)
    {
        var k = Mit(StandardKonfiguration(), k => k["meistausgegeben"]!["anzahl"] = anzahl);

        Assert.Equal(["Die Anzahl muss zwischen 3 und 10 liegen."], await MeldungenAsync(k, "meistausgegeben.anzahl"));
    }

    [Fact]
    public async Task Fehlendes_Feld_meldet_Ungueltiger_Wert_fuer_dieses_Feld()
    {
        var k = Mit(StandardKonfiguration(), k => ((JsonObject)k["neueste"]!).Remove("anzahl"));

        Assert.Equal(["Ungültiger Wert für dieses Feld."], await MeldungenAsync(k, "neueste.anzahl"));
    }

    [Fact]
    public async Task Alle_Feld_und_Logobefunde_werden_gemeinsam_gemeldet()
    {
        var k = Mit(MitKopf(titel: "", alttextBereitsteller: "Wappen"), k =>
        {
            Reihenfolge(k, "kopf");
            k["infotext"]!["text"] = "";
            k["neueste"]!["anzahl"] = 1;
        });

        using var antwort = await PutKonfigurationAsync(k, new LogoTeil("logoBereitsteller", LogoBilder.Svg()));

        Assert.Equal(
            ["infotext.text", "kopf.titel", "logoBereitsteller", "neueste.anzahl", "reihenfolge"],
            (await FehlerAsync(antwort)).Keys.Order(StringComparer.Ordinal));
    }

    // ---------- Alternativtext (Aufgabe: fehlender Alternativtext) ----------

    [Fact]
    public async Task Neues_Logo_ohne_Alternativtext_wird_abgelehnt()
    {
        var k = MitKopf(alttextBereitsteller: "  ");

        Assert.Equal(
            [MeldungAlttextBereitsteller],
            await MeldungenAsync(k, "kopf.logoBereitsteller.alternativtext", new LogoTeil("logoBereitsteller", LogoBilder.Png(10, 10))));
    }

    [Fact]
    public async Task Neues_Logo_der_Software_ohne_Alternativtext_wird_abgelehnt()
    {
        var k = MitKopf(alttextSoftware: "");

        Assert.Equal(
            [MeldungAlttextSoftware],
            await MeldungenAsync(k, "kopf.logoSoftware.alternativtext", new LogoTeil("logoSoftware", LogoBilder.Png(10, 10))));
    }

    [Fact]
    public async Task Logo_null_mit_Dateiteil_meldet_den_fehlenden_Alternativtext()
    {
        // 5.5: „… auch bei null mit Dateiteil“.
        var k = MitKopf();

        Assert.Equal(
            [MeldungAlttextBereitsteller],
            await MeldungenAsync(k, "kopf.logoBereitsteller.alternativtext", new LogoTeil("logoBereitsteller", LogoBilder.Png(10, 10))));
    }

    [Fact]
    public async Task Vorhandenes_Logo_mit_geleertem_Alternativtext_wird_abgelehnt()
    {
        await LogoHochladenAsync("bereitsteller", LogoBilder.Png(10, 10));

        Assert.Equal([MeldungAlttextBereitsteller], await MeldungenAsync(MitKopf(1, alttextBereitsteller: ""), "kopf.logoBereitsteller.alternativtext"));
    }

    [Fact]
    public async Task Alternativtext_mit_201_Zeichen_wird_abgelehnt()
    {
        var k = MitKopf(alttextBereitsteller: new string('A', 201));

        Assert.Equal(
            ["Der Alternativtext darf höchstens 200 Zeichen lang sein."],
            await MeldungenAsync(k, "kopf.logoBereitsteller.alternativtext", new LogoTeil("logoBereitsteller", LogoBilder.Png(10, 10))));
    }

    [Fact]
    public async Task Fehlender_Alternativtext_speichert_weder_Logo_noch_Konfiguration()
    {
        using var antwort = await PutKonfigurationAsync(MitKopf(alttextBereitsteller: ""), new LogoTeil("logoBereitsteller", LogoBilder.Png(10, 10)));

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        Assert.Empty(await StartseiteDb.LogosAsync());
        Assert.Equal(0, await StartseiteDb.AnzahlKonfigurationenAsync());
    }

    // ---------- AK-10: Logo-Kombinationen ----------

    [Fact]
    public async Task Logo_Objekt_ohne_Dateiteil_und_ohne_vorhandenes_Logo_wird_abgelehnt()
    {
        Assert.Equal([MeldungDateiBereitsteller], await MeldungenAsync(MitKopf(alttextBereitsteller: "Wappen"), "logoBereitsteller"));
    }

    [Fact]
    public async Task Logo_Objekt_der_Software_ohne_Dateiteil_und_ohne_vorhandenes_Logo_wird_abgelehnt()
    {
        Assert.Equal([MeldungDateiSoftware], await MeldungenAsync(MitKopf(alttextSoftware: "Software"), "logoSoftware"));
    }

    // ---------- 5.1: Formular und Content-Type ----------

    [Fact]
    public async Task Put_ohne_multipart_liefert_415()
    {
        using var antwort = await Client.PutAsync(
            KonfigurationUrl, new StringContent(StandardKonfiguration().ToJsonString(), Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, antwort.StatusCode);
    }

    [Fact]
    public async Task Put_ohne_Teil_konfiguration_meldet_Die_Konfiguration_fehlt()
    {
        using var antwort = await PutKonfigurationAsync(null, new LogoTeil("logoBereitsteller", LogoBilder.Png(10, 10)));

        Assert.Equal(["Die Konfiguration fehlt."], await FehlerZuAsync(antwort, "konfiguration"));
    }

    [Fact]
    public async Task Put_mit_ungueltigem_JSON_meldet_Die_Konfiguration_ist_kein_gueltiges_JSON()
    {
        using var inhalt = new MultipartFormDataContent
        {
            { new StringContent("{ \"version\": 0, ", Encoding.UTF8, "application/json"), "konfiguration" },
        };

        using var antwort = await Client.PutAsync(KonfigurationUrl, inhalt);

        Assert.Equal(["Die Konfiguration ist kein gültiges JSON."], await FehlerZuAsync(antwort, "konfiguration"));
    }

    [Fact]
    public async Task Put_mit_unbekanntem_Teil_meldet_anfrage()
    {
        using var inhalt = KonfigurationsInhalt(StandardKonfiguration(), new LogoTeil("logoUnbekannt", LogoBilder.Png(10, 10)));

        using var antwort = await Client.PutAsync(KonfigurationUrl, inhalt);

        Assert.Equal(["Die Anfrage enthält unbekannte oder doppelte Formularfelder."], await FehlerZuAsync(antwort, "anfrage"));
    }

    [Fact]
    public async Task Put_mit_doppeltem_Logo_Teil_meldet_anfrage()
    {
        using var inhalt = KonfigurationsInhalt(
            MitKopf(alttextBereitsteller: "Wappen"),
            new LogoTeil("logoBereitsteller", LogoBilder.Png(10, 10)),
            new LogoTeil("logoBereitsteller", LogoBilder.Png(20, 20)));

        using var antwort = await Client.PutAsync(KonfigurationUrl, inhalt);

        Assert.Equal(["Die Anfrage enthält unbekannte oder doppelte Formularfelder."], await FehlerZuAsync(antwort, "anfrage"));
    }

    [Fact]
    public async Task Put_mit_doppeltem_Teil_konfiguration_meldet_anfrage()
    {
        using var inhalt = KonfigurationsInhalt(StandardKonfiguration());
        inhalt.Add(new StringContent(StandardKonfiguration().ToJsonString(), Encoding.UTF8, "application/json"), "konfiguration");

        using var antwort = await Client.PutAsync(KonfigurationUrl, inhalt);

        Assert.Equal(["Die Anfrage enthält unbekannte oder doppelte Formularfelder."], await FehlerZuAsync(antwort, "anfrage"));
    }

    [Fact]
    public async Task Put_mit_abgeschnittenem_Formular_meldet_anfrage()
    {
        var body =
            $"--{Boundary}\r\n" +
            "Content-Disposition: form-data; name=\"konfiguration\"\r\n" +
            "Content-Type: application/json\r\n\r\n" +
            "{\"version\":0"; // keine abschließende Boundary

        using var antwort = await Client.PutAsync(KonfigurationUrl, RohesMultipart(body));

        Assert.Equal(["anfrage"], (await FehlerAsync(antwort)).Keys);
    }

    [Fact]
    public async Task Put_mit_Boundary_ohne_Inhalt_meldet_anfrage()
    {
        using var inhalt = new ByteArrayContent([]);
        inhalt.Headers.ContentType = MediaTypeHeaderValue.Parse("multipart/form-data");

        using var antwort = await Client.PutAsync(KonfigurationUrl, inhalt);

        Assert.Equal(["Die Anfrage ist kein gültiges multipart/form-data."], await FehlerZuAsync(antwort, "anfrage"));
    }

    [Fact]
    public async Task Fehlermeldungen_enthalten_keinen_Dateiinhalt_und_keinen_Dateinamen()
    {
        const string dateiname = "geheimer-dateiname-4711.png";
        using var antwort = await PutKonfigurationAsync(
            MitKopf(alttextBereitsteller: "Wappen"),
            new LogoTeil("logoBereitsteller", LogoBilder.Svg(), dateiname));

        var text = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        Assert.DoesNotContain("geheimer-dateiname", text);
        Assert.DoesNotContain("<script>", text);
    }
}
