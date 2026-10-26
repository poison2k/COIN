using System.Net;
using System.Net.Http.Headers;
using Coin.IntegrationTests.Infrastruktur;
using Coin.Testdaten;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-12 (Rev. 2) und ADR-0032 Punkt 3: <c>GET /api/startseite/logos/{platz}</c> liefert die
/// gespeicherten Bytes unverändert mit erkanntem Content-Type, <c>nosniff</c>, CSP-Sandbox, generiertem Dateinamen und
/// ETag (SHA-256). Cache: aktuelles <c>v</c> → <c>private, max-age=31536000, immutable</c>; ohne oder veraltetes
/// <c>v</c> → <c>no-cache</c>. Unbekannter Platz oder kein Logo → <c>404</c> „Logo nicht gefunden“.
/// </summary>
public class StartseiteLogoAbrufTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    private async Task<(byte[] Inhalt, string Url)> LogoAsync(string platz = "bereitsteller", byte[]? inhalt = null)
    {
        var logo = inhalt ?? LogoBilder.Png(64, 32);
        var antwort = await LogoHochladenAsync(platz, logo);
        var feld = platz == "bereitsteller" ? "logoBereitsteller" : "logoSoftware";
        return (logo, antwort.GetProperty("kopf").GetProperty(feld).GetProperty("url").GetString()!);
    }

    [Fact]
    public async Task Get_liefert_200_mit_den_unveraenderten_Bytes()
    {
        var (logo, url) = await LogoAsync();

        using var antwort = await Anonym.GetAsync(url);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(logo, await antwort.Content.ReadAsByteArrayAsync());
    }

    [Theory]
    [InlineData("png", "image/png")]
    [InlineData("jpeg", "image/jpeg")]
    [InlineData("webp", "image/webp")]
    public async Task Get_liefert_den_erkannten_Content_Type(string format, string contentType)
    {
        var inhalt = format switch
        {
            "jpeg" => LogoBilder.Jpeg(10, 10),
            "webp" => LogoBilder.WebpVp8(10, 10),
            _ => LogoBilder.Png(10, 10),
        };
        var (_, url) = await LogoAsync(inhalt: inhalt);

        using var antwort = await Anonym.GetAsync(url);

        Assert.Equal(contentType, antwort.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Get_setzt_X_Content_Type_Options_nosniff()
    {
        var (_, url) = await LogoAsync();

        using var antwort = await Anonym.GetAsync(url);

        Assert.Equal(["nosniff"], antwort.Headers.GetValues("X-Content-Type-Options"));
    }

    [Fact]
    public async Task Get_setzt_Content_Security_Policy_default_src_none_und_sandbox()
    {
        var (_, url) = await LogoAsync();

        using var antwort = await Anonym.GetAsync(url);

        Assert.Equal(["default-src 'none'; sandbox"], antwort.Headers.GetValues("Content-Security-Policy"));
    }

    [Theory]
    [InlineData("bereitsteller", "png")]
    [InlineData("software", "png")]
    public async Task Get_setzt_Content_Disposition_inline_mit_generiertem_Namen(string platz, string endung)
    {
        var (_, url) = await LogoAsync(platz);

        using var antwort = await Anonym.GetAsync(url);

        var disposition = antwort.Content.Headers.ContentDisposition;
        Assert.Equal("inline", disposition?.DispositionType);
        Assert.Equal($"logo-{platz}.{endung}", disposition?.FileName?.Trim('"'));
    }

    [Fact]
    public async Task Get_setzt_Content_Disposition_mit_Endung_jpg_fuer_JPEG()
    {
        var (_, url) = await LogoAsync("software", LogoBilder.Jpeg(10, 10));

        using var antwort = await Anonym.GetAsync(url);

        Assert.Equal("logo-software.jpg", antwort.Content.Headers.ContentDisposition?.FileName?.Trim('"'));
    }

    [Fact]
    public async Task Get_setzt_ETag_als_SHA256_in_Anfuehrungszeichen()
    {
        var (logo, url) = await LogoAsync();

        using var antwort = await Anonym.GetAsync(url);

        Assert.Equal($"\"{Sha256(logo)}\"", antwort.Headers.ETag?.Tag);
    }

    [Fact]
    public async Task Get_mit_passendem_If_None_Match_liefert_304()
    {
        var (logo, url) = await LogoAsync();
        using var anfrage = new HttpRequestMessage(HttpMethod.Get, url);
        anfrage.Headers.IfNoneMatch.Add(new EntityTagHeaderValue($"\"{Sha256(logo)}\""));

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.Equal(HttpStatusCode.NotModified, antwort.StatusCode);
    }

    [Fact]
    public async Task Get_mit_fremdem_If_None_Match_liefert_200()
    {
        var (_, url) = await LogoAsync();
        using var anfrage = new HttpRequestMessage(HttpMethod.Get, url);
        anfrage.Headers.IfNoneMatch.Add(new EntityTagHeaderValue($"\"{new string('0', 64)}\""));

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    // ---------- Cache-Regeln (ADR-0032 Punkt 3) ----------

    [Fact]
    public async Task Url_aus_der_Antwort_traegt_v_mit_den_ersten_16_Hex_Zeichen_des_SHA256()
    {
        var (logo, url) = await LogoAsync();

        Assert.Equal($"/api/startseite/logos/bereitsteller?v={Sha256(logo)[..16]}", url);
    }

    [Fact]
    public async Task Get_mit_aktuellem_v_ist_private_ein_Jahr_immutable()
    {
        var (_, url) = await LogoAsync();

        using var antwort = await Anonym.GetAsync(url);

        var cache = antwort.Headers.CacheControl;
        Assert.NotNull(cache);
        Assert.True(cache!.Private);
        Assert.False(cache.Public);
        Assert.Equal(TimeSpan.FromSeconds(31536000), cache.MaxAge);
        Assert.Contains(cache.Extensions, e => e.Name == "immutable");
    }

    [Fact]
    public async Task Get_ohne_v_ist_no_cache()
    {
        await LogoAsync();

        using var antwort = await Anonym.GetAsync(LogoUrl("bereitsteller"));

        var cache = antwort.Headers.CacheControl;
        Assert.True(cache?.NoCache, $"Cache-Control: {cache}");
        Assert.DoesNotContain(cache!.Extensions, e => e.Name == "immutable");
    }

    [Fact]
    public async Task Get_mit_veraltetem_v_ist_no_cache_und_liefert_den_aktuellen_Inhalt()
    {
        var (_, alteUrl) = await LogoAsync(inhalt: LogoBilder.Png(10, 10));
        var neu = LogoBilder.Png(20, 20);
        await SpeichernAsync(MitKopf(1, alttextBereitsteller: "Wappen Test"), new LogoTeil("logoBereitsteller", neu));

        using var antwort = await Anonym.GetAsync(alteUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.True(antwort.Headers.CacheControl?.NoCache, $"Cache-Control: {antwort.Headers.CacheControl}");
        Assert.Equal(neu, await antwort.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Nach_dem_Ersetzen_traegt_die_Url_ein_neues_v()
    {
        var (_, alteUrl) = await LogoAsync(inhalt: LogoBilder.Png(10, 10));
        var neu = LogoBilder.Png(20, 20);

        var antwort = await SpeichernAsync(MitKopf(1, alttextBereitsteller: "Wappen Test"), new LogoTeil("logoBereitsteller", neu));

        var neueUrl = antwort.GetProperty("kopf").GetProperty("logoBereitsteller").GetProperty("url").GetString();
        Assert.NotEqual(alteUrl, neueUrl);
        Assert.EndsWith($"?v={Sha256(neu)[..16]}", neueUrl);
    }

    // ---------- 404 ----------

    [Fact]
    public async Task Get_ohne_gespeichertes_Logo_liefert_404_Logo_nicht_gefunden()
    {
        using var antwort = await Anonym.GetAsync(LogoUrl("bereitsteller"));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Logo nicht gefunden", json.GetProperty("title").GetString());
    }

    [Theory]
    [InlineData("unbekannt")]
    [InlineData("Bereitsteller")]
    [InlineData("logo")]
    public async Task Get_mit_unbekanntem_Platz_liefert_404_Logo_nicht_gefunden(string platz)
    {
        await LogoAsync();

        using var antwort = await Anonym.GetAsync(LogoUrl(platz));

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Logo nicht gefunden", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Nach_dem_Entfernen_liefert_Get_404()
    {
        var (_, url) = await LogoAsync();
        await SpeichernAsync(MitKopf(1));

        using var antwort = await Anonym.GetAsync(url);

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Fact]
    public async Task Gespeichertes_Logo_wird_auch_bei_ausgeschaltetem_Kopfbereich_ausgeliefert()
    {
        var (logo, url) = await LogoAsync();
        await SpeichernAsync(Mit(MitKopf(1, alttextBereitsteller: "Wappen Test"), k => Kopf(k)["aktiv"] = false));

        using var antwort = await Anonym.GetAsync(url);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(logo, await antwort.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Logo_eines_Platzes_liefert_nicht_das_des_anderen()
    {
        var bereitsteller = LogoBilder.Png(10, 10);
        await SpeichernAsync(
            MitKopf(alttextBereitsteller: "Wappen", alttextSoftware: "Software"),
            new LogoTeil("logoBereitsteller", bereitsteller),
            new LogoTeil("logoSoftware", LogoBilder.Jpeg(10, 10)));

        using var antwort = await Anonym.GetAsync(LogoUrl("bereitsteller"));

        Assert.Equal(bereitsteller, await antwort.Content.ReadAsByteArrayAsync());
    }
}
