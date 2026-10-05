using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Bilder;

/// <summary>GET /api/coins/{id}/bild: AK-26 und AK-27.</summary>
public class BildAbrufenTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private static string Sha256(byte[] inhalt) => Convert.ToHexStringLower(SHA256.HashData(inhalt));

    private async Task<(Guid Id, byte[] Inhalt)> CoinMitBildAsync(byte[] inhalt)
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        await LadeBildHochAsync(id, inhalt);
        return (id, inhalt);
    }

    // ---------- AK-26: Inhalt und Content-Type ----------

    [Fact]
    public async Task Get_liefert_200_mit_unveraenderten_Bytes()
    {
        var (id, inhalt) = await CoinMitBildAsync(Testbilder.Png(4096));

        using var antwort = await Anonym.GetAsync(BildUrl(id));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(inhalt, await antwort.Content.ReadAsByteArrayAsync());
    }

    [Theory]
    [InlineData("jpeg", "image/jpeg")]
    [InlineData("png", "image/png")]
    [InlineData("webp", "image/webp")]
    public async Task Get_liefert_den_erkannten_Content_Type(string format, string contentType)
    {
        var inhalt = format switch
        {
            "jpeg" => Testbilder.Jpeg(),
            "png" => Testbilder.Png(),
            _ => Testbilder.Webp(),
        };
        var (id, _) = await CoinMitBildAsync(inhalt);

        using var antwort = await Anonym.GetAsync(BildUrl(id));

        Assert.Equal(contentType, antwort.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Get_liefert_erkannten_statt_beim_Upload_deklarierten_Content_Type()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        using (var upload = await PutBildAsync(id, Testbilder.Jpeg(), contentType: "image/png", dateiname: "taeuschung.png"))
        {
            Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        }

        using var antwort = await Anonym.GetAsync(BildUrl(id));

        Assert.Equal("image/jpeg", antwort.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Get_ignoriert_den_Versionsparameter_v()
    {
        var (id, inhalt) = await CoinMitBildAsync(Testbilder.Png());

        using var antwort = await Anonym.GetAsync($"{BildUrl(id)}?v=beliebig");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(inhalt, await antwort.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Get_ueber_bildUrl_aus_der_Coin_Antwort_liefert_das_Bild()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var inhalt = Testbilder.Webp(777);
        var bildUrl = (await LadeBildHochAsync(id, inhalt)).GetProperty("bildUrl").GetString();

        using var antwort = await Anonym.GetAsync(bildUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(inhalt, await antwort.Content.ReadAsByteArrayAsync());
    }

    // ---------- AK-26: Sicherheits- und Cache-Header ----------

    [Fact]
    public async Task Get_setzt_X_Content_Type_Options_nosniff()
    {
        var (id, _) = await CoinMitBildAsync(Testbilder.Png());

        using var antwort = await Anonym.GetAsync(BildUrl(id));

        Assert.Equal(["nosniff"], antwort.Headers.GetValues("X-Content-Type-Options"));
    }

    [Fact]
    public async Task Get_setzt_Content_Security_Policy_default_src_none_und_sandbox()
    {
        var (id, _) = await CoinMitBildAsync(Testbilder.Png());

        using var antwort = await Anonym.GetAsync(BildUrl(id));

        Assert.Equal(["default-src 'none'; sandbox"], antwort.Headers.GetValues("Content-Security-Policy"));
    }

    [Theory]
    [InlineData("jpeg", "jpg")]
    [InlineData("png", "png")]
    [InlineData("webp", "webp")]
    public async Task Get_setzt_Content_Disposition_inline_mit_serverseitigem_Dateinamen(string format, string endung)
    {
        var inhalt = format switch
        {
            "jpeg" => Testbilder.Jpeg(),
            "png" => Testbilder.Png(),
            _ => Testbilder.Webp(),
        };
        var id = await LegeCoinAnUndLiefereIdAsync();
        using (var upload = await PutBildAsync(id, inhalt, dateiname: "originalname-darf-nicht-erscheinen.bin"))
        {
            Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        }

        using var antwort = await Anonym.GetAsync(BildUrl(id));

        var disposition = antwort.Content.Headers.ContentDisposition;
        Assert.NotNull(disposition);
        Assert.Equal("inline", disposition!.DispositionType);
        Assert.Equal($"coin-{id}.{endung}", disposition.FileName?.Trim('"'));
        Assert.Null(disposition.FileNameStar);
    }

    [Fact]
    public async Task Get_setzt_Cache_Control_private_max_age_ein_Jahr_immutable()
    {
        var (id, _) = await CoinMitBildAsync(Testbilder.Png());

        using var antwort = await Anonym.GetAsync(BildUrl(id));

        var cache = antwort.Headers.CacheControl;
        Assert.NotNull(cache);
        Assert.True(cache!.Private);
        Assert.False(cache.Public);
        Assert.Equal(TimeSpan.FromSeconds(31_536_000), cache.MaxAge);
        Assert.Contains(cache.Extensions, e => e.Name == "immutable");
    }

    [Fact]
    public async Task Get_setzt_starken_ETag_aus_dem_SHA256_des_Inhalts()
    {
        var (id, inhalt) = await CoinMitBildAsync(Testbilder.Jpeg(2222));

        using var antwort = await Anonym.GetAsync(BildUrl(id));

        var etag = antwort.Headers.ETag;
        Assert.NotNull(etag);
        Assert.False(etag!.IsWeak);
        Assert.Equal($"\"{Sha256(inhalt)}\"", etag.Tag);
    }

    [Fact]
    public async Task Get_mit_passendem_If_None_Match_liefert_304_ohne_Body()
    {
        var (id, inhalt) = await CoinMitBildAsync(Testbilder.Png(1500));
        using var anfrage = new HttpRequestMessage(HttpMethod.Get, BildUrl(id));
        anfrage.Headers.IfNoneMatch.Add(new EntityTagHeaderValue($"\"{Sha256(inhalt)}\""));

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.Equal(HttpStatusCode.NotModified, antwort.StatusCode);
        Assert.Empty(await antwort.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Get_mit_veraltetem_If_None_Match_liefert_200_mit_Bytes()
    {
        var (id, inhalt) = await CoinMitBildAsync(Testbilder.Png(1500));
        using var anfrage = new HttpRequestMessage(HttpMethod.Get, BildUrl(id));
        anfrage.Headers.IfNoneMatch.Add(new EntityTagHeaderValue($"\"{new string('0', 64)}\""));

        using var antwort = await Anonym.SendAsync(anfrage);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(inhalt, await antwort.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Get_nach_Ersetzen_liefert_neuen_ETag()
    {
        var (id, _) = await CoinMitBildAsync(Testbilder.Png(100));
        var neuerInhalt = Testbilder.Jpeg(300);
        await LadeBildHochAsync(id, neuerInhalt);

        using var antwort = await Anonym.GetAsync(BildUrl(id));

        Assert.Equal($"\"{Sha256(neuerInhalt)}\"", antwort.Headers.ETag?.Tag);
    }

    // ---------- AK-27: kein Bild ----------

    [Fact]
    public async Task Get_fuer_unbekannten_Coin_liefert_404_ProblemDetails()
    {
        using var antwort = await Anonym.GetAsync(BildUrl(Guid.NewGuid()));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Get_fuer_Coin_ohne_Bild_liefert_404_ProblemDetails()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await Anonym.GetAsync(BildUrl(id));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
    }
}
