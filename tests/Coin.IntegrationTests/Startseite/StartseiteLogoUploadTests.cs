using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using Coin.IntegrationTests.Infrastruktur;
using Coin.Testdaten;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-10, AK-11 und Abschnitt 5.5 („Fertig, wenn“: SVG, umbenannte Nicht-Bilddatei und zu großes Bild
/// mit konkreter Meldung abgelehnt): Logoprüfung am Inhalt über <c>PUT /api/startseite/konfiguration</c>. Dateiname und
/// deklarierter Typ werden ignoriert; je Datei genau eine Meldung; Datei über 2 MiB → <c>413</c> mit <c>feld</c>.
/// Ersetzen, Entfernen und Alternativtext ändern.
/// </summary>
public class StartseiteLogoUploadTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    // ---------- SVG ----------

    [Fact]
    public async Task Svg_wird_mit_der_SVG_Meldung_abgelehnt()
    {
        Assert.Equal([MeldungSvg], await LogoAbgelehntAsync(LogoBilder.Svg(), "logo.svg", "image/svg+xml"));
    }

    [Fact]
    public async Task Svg_mit_Endung_png_und_Typ_image_png_wird_mit_der_SVG_Meldung_abgelehnt()
    {
        Assert.Equal([MeldungSvg], await LogoAbgelehntAsync(LogoBilder.Svg(), "logo.png", "image/png"));
    }

    [Fact]
    public async Task Svg_mit_BOM_wird_mit_der_SVG_Meldung_abgelehnt()
    {
        Assert.Equal([MeldungSvg], await LogoAbgelehntAsync(LogoBilder.SvgMitBom()));
    }

    [Fact]
    public async Task Svg_mit_XML_Deklaration_wird_mit_der_SVG_Meldung_abgelehnt()
    {
        Assert.Equal([MeldungSvg], await LogoAbgelehntAsync(LogoBilder.SvgMitXmlDeklaration()));
    }

    [Fact]
    public async Task Svg_in_Grossbuchstaben_wird_mit_der_SVG_Meldung_abgelehnt()
    {
        Assert.Equal([MeldungSvg], await LogoAbgelehntAsync(LogoBilder.SvgGrossgeschrieben(), "LOGO.PNG"));
    }

    // ---------- umbenannte Nicht-Bilddateien ----------

    public static TheoryData<string> UmbenannteDateien => new() { "Text", "PDF", "HTML", "ZIP", "GIF", "BMP", "ICO", "SVGZ" };

    [Theory]
    [MemberData(nameof(UmbenannteDateien))]
    public async Task Umbenannte_Nicht_Bilddatei_mit_Endung_png_wird_als_kein_Bild_abgelehnt(string art)
    {
        var inhalt = art switch
        {
            "PDF" => LogoBilder.Pdf(),
            "HTML" => LogoBilder.Html(),
            "ZIP" => LogoBilder.Zip(),
            "GIF" => LogoBilder.Gif(),
            "BMP" => LogoBilder.Bmp(),
            "ICO" => LogoBilder.Ico(),
            "SVGZ" => LogoBilder.Svgz(),
            _ => LogoBilder.Text(),
        };

        Assert.Equal([MeldungKeinBild], await LogoAbgelehntAsync(inhalt, "logo.png", "image/png"));
    }

    [Fact]
    public async Task Textdatei_mit_Endung_jpg_wird_als_kein_Bild_abgelehnt()
    {
        Assert.Equal([MeldungKeinBild], await LogoAbgelehntAsync(LogoBilder.Text(), "wappen.jpg", "image/jpeg"));
    }

    [Fact]
    public async Task Leere_Datei_wird_als_leer_abgelehnt()
    {
        Assert.Equal([MeldungLeer], await LogoAbgelehntAsync([]));
    }

    // ---------- beschädigte Köpfe, Animation ----------

    [Fact]
    public async Task Png_ohne_IHDR_wird_als_beschaedigt_abgelehnt()
    {
        Assert.Equal([MeldungBeschaedigt], await LogoAbgelehntAsync(LogoBilder.PngOhneIhdrZuerst()));
    }

    [Fact]
    public async Task Jpeg_ohne_SOF_wird_als_beschaedigt_abgelehnt()
    {
        Assert.Equal([MeldungBeschaedigt], await LogoAbgelehntAsync(LogoBilder.JpegOhneSof(), "logo.jpg", "image/jpeg"));
    }

    [Fact]
    public async Task Abgeschnittenes_WebP_wird_als_beschaedigt_abgelehnt()
    {
        Assert.Equal([MeldungBeschaedigt], await LogoAbgelehntAsync(LogoBilder.WebpAbgeschnitten(), "logo.webp", "image/webp"));
    }

    [Fact]
    public async Task Apng_wird_als_animiert_abgelehnt()
    {
        Assert.Equal([MeldungAnimiert], await LogoAbgelehntAsync(LogoBilder.Apng(10, 10)));
    }

    [Fact]
    public async Task Animiertes_WebP_wird_als_animiert_abgelehnt()
    {
        Assert.Equal([MeldungAnimiert], await LogoAbgelehntAsync(LogoBilder.WebpVp8X(10, 10, animiert: true), "logo.webp", "image/webp"));
    }

    // ---------- zu groß: Pixel und Bytes ----------

    [Fact]
    public async Task Png_mit_2049_mal_10_Pixeln_wird_mit_den_Maßen_abgelehnt()
    {
        Assert.Equal([MeldungPixel(2049, 10)], await LogoAbgelehntAsync(LogoBilder.Png(2049, 10)));
    }

    [Fact]
    public async Task Jpeg_mit_3000_mal_3000_Pixeln_wird_mit_den_Maßen_abgelehnt()
    {
        Assert.Equal([MeldungPixel(3000, 3000)], await LogoAbgelehntAsync(LogoBilder.Jpeg(3000, 3000), "logo.jpg", "image/jpeg"));
    }

    [Fact]
    public async Task Png_mit_2048_mal_2048_Pixeln_wird_angenommen()
    {
        var antwort = await LogoHochladenAsync("bereitsteller", LogoBilder.Png(2048, 2048));

        Assert.Equal(2048, antwort.GetProperty("kopf").GetProperty("logoBereitsteller").GetProperty("breite").GetInt32());
    }

    [Fact]
    public async Task Logo_mit_2_MiB_plus_1_Byte_liefert_413_mit_feld_logoBereitsteller()
    {
        using var antwort = await PutKonfigurationAsync(
            MitKopf(alttextBereitsteller: "Wappen"),
            new LogoTeil("logoBereitsteller", LogoBilder.PngMitGroesse(10, 10, ZweiMiB + 1)));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.RequestEntityTooLarge);
        Assert.Equal("Datei zu groß", json.GetProperty("title").GetString());
        Assert.Equal("datei_zu_gross", json.GetProperty("code").GetString());
        Assert.Equal("logoBereitsteller", json.GetProperty("feld").GetString());
        Assert.Equal("Das Logo des Bereitstellers darf höchstens 2 MB groß sein.", json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Logo_der_Software_ueber_2_MiB_liefert_413_mit_feld_logoSoftware()
    {
        using var antwort = await PutKonfigurationAsync(
            MitKopf(alttextSoftware: "Software"),
            new LogoTeil("logoSoftware", LogoBilder.PngMitGroesse(10, 10, ZweiMiB + 1)));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.RequestEntityTooLarge);
        Assert.Equal("logoSoftware", json.GetProperty("feld").GetString());
        Assert.Equal("Das Logo der Software darf höchstens 2 MB groß sein.", json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Logo_mit_genau_2_MiB_wird_angenommen()
    {
        var antwort = await LogoHochladenAsync("software", LogoBilder.PngMitGroesse(10, 10, ZweiMiB));

        Assert.Equal(ZweiMiB, antwort.GetProperty("kopf").GetProperty("logoSoftware").GetProperty("groesseBytes").GetInt32());
    }

    [Fact]
    public async Task Teil_konfiguration_ueber_64_KiB_liefert_413_mit_feld_konfiguration()
    {
        var k = Mit(StandardKonfiguration(), k => k["polster"] = new string('x', 70 * 1024));

        using var antwort = await PutKonfigurationAsync(k);

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.RequestEntityTooLarge);
        Assert.Equal("konfiguration", json.GetProperty("feld").GetString());
        Assert.Equal("Die Konfiguration ist zu groß.", json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Request_ueber_6_MiB_liefert_413_mit_feld_anfrage()
    {
        // Drei Teile unter 2 MiB ergeben zusammen mehr als 6 MiB; der dritte ist ein unbekannter Teil, die Größe greift zuerst.
        using var inhalt = KonfigurationsInhalt(
            MitKopf(alttextBereitsteller: "Wappen", alttextSoftware: "Software"),
            new LogoTeil("logoBereitsteller", LogoBilder.PngMitGroesse(10, 10, ZweiMiB)),
            new LogoTeil("logoSoftware", LogoBilder.PngMitGroesse(10, 10, ZweiMiB)),
            new LogoTeil("logoSoftware", LogoBilder.PngMitGroesse(10, 10, ZweiMiB)),
            new LogoTeil("logoSoftware", LogoBilder.PngMitGroesse(10, 10, ZweiMiB)));

        using var antwort = await Client.PutAsync(KonfigurationUrl, inhalt);

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.RequestEntityTooLarge);
        Assert.Equal("anfrage", json.GetProperty("feld").GetString());
        Assert.Equal("Die Anfrage ist zu groß. Logos dürfen höchstens 2 MB groß sein.", json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Zu_grosses_Logo_speichert_nichts()
    {
        using var antwort = await PutKonfigurationAsync(
            MitKopf(alttextBereitsteller: "Wappen"),
            new LogoTeil("logoBereitsteller", LogoBilder.PngMitGroesse(10, 10, ZweiMiB + 1)));

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, antwort.StatusCode);
        Assert.Equal(0, await StartseiteDb.AnzahlKonfigurationenAsync());
        Assert.Empty(await StartseiteDb.LogosAsync());
    }

    // ---------- Chunked Upload über echtes Kestrel (QA-Runde 1) ----------
    // Ohne Content-Length (Transfer-Encoding: chunked) greifen die Grenzen erst beim Lesen. Der TestServer setzt
    // [RequestSizeLimit] nicht durch; deshalb echter Kestrel-Server und echter HttpClient (Muster BildHochladenRobustheitTests).

    [Theory]
    [InlineData(4)]  // gut 8 MiB: über der fachlichen Grenze von 6 MiB
    [InlineData(10)] // gut 20 MiB: deutlich darüber
    public async Task Put_chunked_ohne_Content_Length_ueber_6_MiB_liefert_413_mit_feld_anfrage(int anzahlTeile)
    {
        await using var factory = Fixture.NeueFactory();
        factory.UseKestrel(0);
        factory.StartServer();
        using var client = EchterClient(factory);
        var logos = Enumerable.Range(0, anzahlTeile)
            .Select(i => new LogoTeil(i == 0 ? "logoBereitsteller" : "logoSoftware", LogoBilder.PngMitGroesse(10, 10, ZweiMiB)))
            .ToArray();

        using var inhalt = ChunkedKonfigurationsInhalt(MitKopf(alttextBereitsteller: "Wappen", alttextSoftware: "Software"), logos);
        using var anfrage = ChunkedPut(inhalt);
        using var antwort = await client.SendAsync(anfrage);

        Assert.True(anfrage.Headers.TransferEncodingChunked); // Voraussetzung: ohne Content-Length gesendet
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.RequestEntityTooLarge);
        Assert.Equal("anfrage", json.GetProperty("feld").GetString());
        Assert.Equal("Die Anfrage ist zu groß. Logos dürfen höchstens 2 MB groß sein.", json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Put_chunked_ohne_Content_Length_mit_Logo_ueber_2_MiB_liefert_413_mit_feld_logoBereitsteller()
    {
        await using var factory = Fixture.NeueFactory();
        factory.UseKestrel(0);
        factory.StartServer();
        using var client = EchterClient(factory);

        using var inhalt = ChunkedKonfigurationsInhalt(
            MitKopf(alttextBereitsteller: "Wappen"),
            new LogoTeil("logoBereitsteller", LogoBilder.PngMitGroesse(10, 10, ZweiMiB + 1)));
        using var anfrage = ChunkedPut(inhalt);
        using var antwort = await client.SendAsync(anfrage);

        Assert.True(anfrage.Headers.TransferEncodingChunked);
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.RequestEntityTooLarge);
        Assert.Equal("logoBereitsteller", json.GetProperty("feld").GetString());
        Assert.Equal("Das Logo des Bereitstellers darf höchstens 2 MB groß sein.", json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Put_chunked_ohne_Content_Length_mit_gueltigem_Logo_liefert_200()
    {
        await using var factory = Fixture.NeueFactory();
        factory.UseKestrel(0);
        factory.StartServer();
        using var client = EchterClient(factory);
        var logo = LogoBilder.Png(64, 32);

        using var inhalt = ChunkedKonfigurationsInhalt(MitKopf(alttextBereitsteller: "Wappen"), new LogoTeil("logoBereitsteller", logo));
        using var anfrage = ChunkedPut(inhalt);
        using var antwort = await client.SendAsync(anfrage);

        Assert.True(anfrage.Headers.TransferEncodingChunked);
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(logo, await StartseiteDb.LogoInhaltAsync("bereitsteller"));
    }

    /// <summary>
    /// Einfacher HttpClient direkt gegen die Kestrel-Adresse mit dem Admin-Token des Standard-Clients. Der Client aus
    /// CreateClient() puffert den Body (Redirect-Handler) und würde dadurch eine Content-Length setzen.
    /// </summary>
    private static HttpClient EchterClient(CoinApiFactory factory)
    {
        using var vorlage = factory.CreateClient();
        var adresse = vorlage.BaseAddress!;
        Assert.NotEqual(80, adresse.Port); // Voraussetzung: echter Kestrel mit dynamischem Port, nicht TestServer
        var client = new HttpClient { BaseAddress = adresse, Timeout = TimeSpan.FromMinutes(2) };
        client.DefaultRequestHeaders.Authorization = vorlage.DefaultRequestHeaders.Authorization;
        return client;
    }

    private static HttpRequestMessage ChunkedPut(HttpContent inhalt)
    {
        var anfrage = new HttpRequestMessage(HttpMethod.Put, KonfigurationUrl) { Content = inhalt };
        anfrage.Headers.TransferEncodingChunked = true;
        return anfrage;
    }

    /// <summary>Wie <see cref="StartseiteTestBasis.KonfigurationsInhalt"/>, die Dateiteile aber als nicht suchbare Streams (Länge unbekannt).</summary>
    private static MultipartFormDataContent ChunkedKonfigurationsInhalt(JsonNode konfiguration, params LogoTeil[] logos)
    {
        var inhalt = new MultipartFormDataContent
        {
            { new StringContent(konfiguration.ToJsonString(), Encoding.UTF8, "application/json"), "konfiguration" },
        };
        foreach (var logo in logos)
        {
            var datei = new StreamContent(new NichtSuchbarerStream(logo.Inhalt));
            datei.Headers.ContentType = MediaTypeHeaderValue.Parse(logo.ContentType);
            inhalt.Add(datei, logo.Feld, logo.Dateiname);
        }

        return inhalt;
    }

    private sealed class NichtSuchbarerStream(byte[] daten) : Stream
    {
        private readonly MemoryStream _inner = new(daten, writable: false);

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count) => _inner.Read(buffer, offset, count);
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
            _inner.ReadAsync(buffer, cancellationToken);
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        protected override void Dispose(bool disposing)
        {
            if (disposing) _inner.Dispose();
            base.Dispose(disposing);
        }
    }

    // ---------- gültige Formate, Inhalt statt Name ----------

    [Fact]
    public async Task Jpeg_mit_Dateiname_logo_png_wird_als_jpeg_gespeichert()
    {
        var antwort = await SpeichernAsync(
            MitKopf(alttextBereitsteller: "Wappen"),
            new LogoTeil("logoBereitsteller", LogoBilder.Jpeg(64, 32), "logo.png", "image/png"));

        Assert.Equal("jpeg", antwort.GetProperty("kopf").GetProperty("logoBereitsteller").GetProperty("format").GetString());
    }

    [Fact]
    public async Task WebP_wird_mit_seinen_Maßen_gespeichert()
    {
        var antwort = await SpeichernAsync(
            MitKopf(alttextSoftware: "Software"),
            new LogoTeil("logoSoftware", LogoBilder.WebpVp8L(120, 60), "x.bin", "application/octet-stream"));

        var meta = antwort.GetProperty("kopf").GetProperty("logoSoftware");
        Assert.Equal(("webp", 120, 60), (meta.GetProperty("format").GetString(), meta.GetProperty("breite").GetInt32(), meta.GetProperty("hoehe").GetInt32()));
    }

    [Fact]
    public async Task Gespeicherte_Bytes_sind_unveraendert_einschliesslich_Metadaten()
    {
        var logo = LogoBilder.PngMitMetadaten(32, 32, "Kamera Test 1");

        await LogoHochladenAsync("bereitsteller", logo);

        Assert.Equal(logo, await StartseiteDb.LogoInhaltAsync("bereitsteller"));
    }

    [Fact]
    public async Task Logo_Zeile_speichert_Hash_Maße_und_den_Hochladenden()
    {
        var logo = LogoBilder.Png(400, 480);
        var adminId = await AdminIdAsync();

        await LogoHochladenAsync("bereitsteller", logo, "Wappen Test");

        var zeile = Assert.Single(await StartseiteDb.LogosAsync());
        Assert.Equal(
            new StartseiteLogoZeile("bereitsteller", "png", logo.Length, 400, 480, Sha256(logo), "Wappen Test", adminId),
            zeile);
    }

    // ---------- Ersetzen, Entfernen, Alternativtext ----------

    [Fact]
    public async Task Neuer_Dateiteil_ersetzt_das_vorhandene_Logo()
    {
        await LogoHochladenAsync("bereitsteller", LogoBilder.Png(10, 10));
        var neu = LogoBilder.Png(20, 20);

        await SpeichernAsync(MitKopf(1, alttextBereitsteller: "Wappen Test"), new LogoTeil("logoBereitsteller", neu));

        Assert.Equal(neu, await StartseiteDb.LogoInhaltAsync("bereitsteller"));
    }

    [Fact]
    public async Task Logo_null_ohne_Dateiteil_entfernt_das_Logo()
    {
        await LogoHochladenAsync("bereitsteller", LogoBilder.Png(10, 10));

        var antwort = await SpeichernAsync(MitKopf(1));

        Assert.Empty(await StartseiteDb.LogosAsync());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, antwort.GetProperty("kopf").GetProperty("logoBereitsteller").ValueKind);
    }

    [Fact]
    public async Task Logo_Objekt_ohne_Dateiteil_behaelt_das_Logo_und_aendert_den_Alternativtext()
    {
        var logo = LogoBilder.Png(10, 10);
        await LogoHochladenAsync("bereitsteller", logo, "Wappen alt");

        await SpeichernAsync(MitKopf(1, alttextBereitsteller: "Wappen neu"));

        var zeile = Assert.Single(await StartseiteDb.LogosAsync());
        Assert.Equal((Sha256(logo), "Wappen neu"), (zeile.Sha256, zeile.Alternativtext));
    }

    [Fact]
    public async Task Logo_wird_auch_bei_ausgeschaltetem_Kopfbereich_gespeichert()
    {
        var k = Mit(MitKopf(alttextSoftware: "Software"), k => Kopf(k)["aktiv"] = false);

        await SpeichernAsync(k, new LogoTeil("logoSoftware", LogoBilder.Png(10, 10)));

        Assert.Equal("software", Assert.Single(await StartseiteDb.LogosAsync()).Platz);
    }

    [Fact]
    public async Task Beide_Logos_lassen_sich_in_einem_Request_hochladen()
    {
        await SpeichernAsync(
            MitKopf(alttextBereitsteller: "Wappen", alttextSoftware: "Software"),
            new LogoTeil("logoBereitsteller", LogoBilder.Png(10, 10)),
            new LogoTeil("logoSoftware", LogoBilder.WebpVp8(10, 10), "s.webp", "image/webp"));

        Assert.Equal(["bereitsteller", "software"], (await StartseiteDb.LogosAsync()).Select(l => l.Platz));
    }

    // ---------- Body vor 401/403 nicht gelesen (AK-14) ----------

    [Theory]
    [InlineData("anonym")]
    [InlineData("Betrachter")]
    public async Task Bei_401_oder_403_liest_die_API_den_Body_nicht(string wer)
    {
        var zaehler = new KoerperLeseZaehler();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { KoerperZaehler = zaehler });
        using var client = wer == "anonym" ? factory.ClientOhneToken() : await BetrachterInAsync(factory);
        zaehler.Zuruecksetzen();

        using var antwort = await client.PutAsync(
            KonfigurationUrl,
            KonfigurationsInhalt(MitKopf(alttextBereitsteller: "Wappen"), new LogoTeil("logoBereitsteller", LogoBilder.PngMitGroesse(10, 10, 1024 * 1024))));

        Assert.True(antwort.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden, $"Status {antwort.StatusCode}");
        Assert.Equal(0, zaehler.GelesenBytes);
    }

    [Fact]
    public async Task Bei_401_kommt_auch_ein_zu_grosser_Body_nicht_als_413_an()
    {
        using var antwort = await Anonym.PutAsync(
            KonfigurationUrl,
            KonfigurationsInhalt(MitKopf(alttextBereitsteller: "Wappen"), new LogoTeil("logoBereitsteller", LogoBilder.PngMitGroesse(10, 10, ZweiMiB + 1))));

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    private async Task<HttpClient> BetrachterInAsync(CoinApiFactory factory)
    {
        var daten = Testbenutzer.OhneRolle();
        var client = factory.ClientMitToken(Idp.ErzeugeToken(daten));
        using var me = await client.GetAsync(MeUrl);
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        await BenutzerDb.RolleSetzenAsync(daten.Subject!, "Betrachter");
        return client;
    }

    [Fact]
    public async Task Kontrolle_der_Body_Messung_Admin_Speichern_liest_den_Body()
    {
        var zaehler = new KoerperLeseZaehler();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { KoerperZaehler = zaehler });
        using var admin = factory.CreateClient();
        using (await admin.GetAsync(MeUrl))
        {
        }

        zaehler.Zuruecksetzen();

        using var antwort = await admin.PutAsync(
            KonfigurationUrl,
            KonfigurationsInhalt(MitKopf(alttextBereitsteller: "Wappen"), new LogoTeil("logoBereitsteller", LogoBilder.PngMitGroesse(10, 10, 1024 * 1024))));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.True(zaehler.GelesenBytes >= 1024 * 1024, $"gelesen: {zaehler.GelesenBytes}");
    }
}
