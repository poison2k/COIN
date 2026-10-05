using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Bilder;

/// <summary>PUT /api/coins/{id}/bild: AK-9 bis AK-11 über HTTP sowie AK-21 bis AK-25.</summary>
public class BildHochladenTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const int FuenfMiB = 5_242_880;

    private static string Sha256(byte[] inhalt) => Convert.ToHexStringLower(SHA256.HashData(inhalt));

    private async Task<byte[]> LadeBildAsync(Guid id)
    {
        using var antwort = await Client.GetAsync(BildUrl(id));
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        return await antwort.Content.ReadAsByteArrayAsync();
    }

    private async Task AssertKeinBildAsync(Guid id)
    {
        using var antwort = await Client.GetAsync(BildUrl(id));
        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    // ---------- AK-21: Erfolg ----------

    [Theory]
    [InlineData("jpeg")]
    [InlineData("png")]
    [InlineData("webp")]
    public async Task Put_mit_gueltigem_Bild_liefert_200(string format)
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var inhalt = format switch
        {
            "jpeg" => Testbilder.Jpeg(),
            "png" => Testbilder.Png(),
            _ => Testbilder.Webp(),
        };

        using var antwort = await PutBildAsync(id, inhalt);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Put_liefert_den_aktualisierten_Coin_mit_gesetzter_bildUrl()
    {
        var id = await LegeCoinAnUndLiefereIdAsync("Coin Alpha", "Herausgeber Beta");
        var inhalt = Testbilder.Png(512);

        var coin = await LadeBildHochAsync(id, inhalt);

        Assert.Equal(id, coin.GetProperty("id").GetGuid());
        Assert.Equal("Coin Alpha", coin.GetProperty("name").GetString());
        Assert.Equal($"/api/coins/{id}/bild?v={Sha256(inhalt)[..16]}", coin.GetProperty("bildUrl").GetString());
    }

    [Fact]
    public async Task Put_speichert_die_Bytes_unveraendert()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var inhalt = Testbilder.Jpeg(10_000);

        await LadeBildHochAsync(id, inhalt);

        Assert.Equal(inhalt, await LadeBildAsync(id));
    }

    [Fact]
    public async Task Put_mit_genau_5_MiB_liefert_200()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await PutBildAsync(id, Testbilder.Jpeg(FuenfMiB));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Put_ersetzt_ein_vorhandenes_Bild()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        await LadeBildHochAsync(id, Testbilder.Png(100));
        var neuerInhalt = Testbilder.Jpeg(200);

        await LadeBildHochAsync(id, neuerInhalt);

        Assert.Equal(neuerInhalt, await LadeBildAsync(id));
    }

    [Fact]
    public async Task Put_mit_geaendertem_Inhalt_aendert_die_bildUrl()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var ersteUrl = (await LadeBildHochAsync(id, Testbilder.Png(100))).GetProperty("bildUrl").GetString();

        var zweiteUrl = (await LadeBildHochAsync(id, Testbilder.Png(101))).GetProperty("bildUrl").GetString();

        Assert.NotEqual(ersteUrl, zweiteUrl);
    }

    [Fact]
    public async Task Put_vertraut_nicht_dem_deklarierten_Content_Type()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await PutBildAsync(id, Testbilder.Jpeg(), contentType: "image/gif", dateiname: "motiv.gif");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    // ---------- AK-22: unbekannter Coin ----------

    [Fact]
    public async Task Put_fuer_unbekannten_Coin_liefert_404_ProblemDetails()
    {
        using var antwort = await PutBildAsync(Guid.NewGuid(), Testbilder.Png());

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
    }

    // ---------- AK-23: fehlende/mehrere/leere Datei, kein multipart ----------

    [Fact]
    public async Task Put_ohne_Feld_datei_liefert_400_mit_Fehler_fuer_datei()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await Client.PutAsync(BildUrl(id), Multipart(Testbilder.Png(), feld: "bild"));

        Assert.Equal(["datei"], await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task Put_mit_leerem_multipart_liefert_400_mit_Fehler_fuer_datei()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var inhalt = new MultipartFormDataContent { { new StringContent("nur Text"), "kommentar" } };

        using var antwort = await Client.PutAsync(BildUrl(id), inhalt);

        Assert.Equal(["datei"], await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task Put_mit_zwei_Dateien_liefert_400_mit_Fehler_fuer_datei()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var erste = new ByteArrayContent(Testbilder.Png());
        erste.Headers.ContentType = MediaTypeHeaderValue.Parse("image/png");
        var zweite = new ByteArrayContent(Testbilder.Jpeg());
        zweite.Headers.ContentType = MediaTypeHeaderValue.Parse("image/jpeg");
        var inhalt = new MultipartFormDataContent
        {
            { erste, "datei", "eins.png" },
            { zweite, "datei", "zwei.jpg" },
        };

        using var antwort = await Client.PutAsync(BildUrl(id), inhalt);

        Assert.Equal(["datei"], await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task Put_mit_zwei_Dateien_speichert_nichts()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var inhalt = new MultipartFormDataContent
        {
            { new ByteArrayContent(Testbilder.Png()), "datei", "eins.png" },
            { new ByteArrayContent(Testbilder.Jpeg()), "datei", "zwei.jpg" },
        };

        using var antwort = await Client.PutAsync(BildUrl(id), inhalt);
        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);

        await AssertKeinBildAsync(id);
    }

    [Fact]
    public async Task Put_mit_leerer_Datei_liefert_400_mit_Fehler_fuer_datei()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await PutBildAsync(id, [], contentType: "image/png", dateiname: "leer.png");

        Assert.Equal(["datei"], await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task Put_mit_rohem_Bild_statt_multipart_liefert_415()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var inhalt = new ByteArrayContent(Testbilder.Png());
        inhalt.Headers.ContentType = MediaTypeHeaderValue.Parse("image/png");

        using var antwort = await Client.PutAsync(BildUrl(id), inhalt);

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.UnsupportedMediaType);
    }

    [Fact]
    public async Task Put_mit_JSON_statt_multipart_liefert_415()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await Client.PutAsync(BildUrl(id),
            new StringContent("""{ "datei": "AAAA" }""", Encoding.UTF8, "application/json"));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.UnsupportedMediaType);
    }

    // ---------- AK-24 / AK-10: unzulässiges Format ----------

    public static TheoryData<string, byte[], string> UnzulaessigeDateien => new()
    {
        { "SVG", Testbilder.Svg(), "image/svg+xml" },
        { "GIF", Testbilder.Gif(), "image/gif" },
        { "BMP", Testbilder.Bmp(), "image/bmp" },
        { "HEIC", Testbilder.Heic(), "image/heic" },
        { "Text als PNG deklariert", Testbilder.Text(), "image/png" },
        { "RIFF ohne WEBP", Testbilder.RiffOhneWebp(), "image/webp" },
    };

    [Theory]
    [MemberData(nameof(UnzulaessigeDateien))]
    public async Task Put_mit_unzulaessigem_Format_liefert_415_ProblemDetails(string art, byte[] inhalt, string contentType)
    {
        _ = art;
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await PutBildAsync(id, inhalt, contentType: contentType, dateiname: "motiv.png");

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.UnsupportedMediaType);
    }

    [Fact]
    public async Task Put_mit_unzulaessigem_Format_speichert_nichts()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await PutBildAsync(id, Testbilder.Svg(), contentType: "image/svg+xml");
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, antwort.StatusCode);

        await AssertKeinBildAsync(id);
    }

    [Fact]
    public async Task Put_mit_unzulaessigem_Format_laesst_vorhandenes_Bild_unveraendert()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var original = Testbilder.Png(333);
        await LadeBildHochAsync(id, original);

        using var antwort = await PutBildAsync(id, Testbilder.Gif(), contentType: "image/gif");
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, antwort.StatusCode);

        Assert.Equal(original, await LadeBildAsync(id));
    }

    [Fact]
    public async Task Put_mit_unzulaessigem_Format_laesst_bildUrl_unveraendert()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var urlVorher = (await LadeBildHochAsync(id, Testbilder.Png(333))).GetProperty("bildUrl").GetString();

        using var antwort = await PutBildAsync(id, Testbilder.Text(), contentType: "image/png");
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, antwort.StatusCode);

        using var abruf = await Client.GetAsync($"{CoinsUrl}/{id}");
        Assert.Equal(urlVorher, (await JsonAsync(abruf)).GetProperty("bildUrl").GetString());
    }

    // ---------- AK-25 / AK-11: zu groß ----------

    [Fact]
    public async Task Put_mit_5_MiB_plus_ein_Byte_liefert_413_ProblemDetails()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await PutBildAsync(id, Testbilder.Jpeg(FuenfMiB + 1));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.RequestEntityTooLarge);
    }

    [Fact]
    public async Task Put_mit_zu_grosser_Datei_speichert_nichts()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await PutBildAsync(id, Testbilder.Jpeg(FuenfMiB + 1));
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, antwort.StatusCode);

        await AssertKeinBildAsync(id);
    }

    [Fact]
    public async Task Put_mit_20_MiB_liefert_413_ProblemDetails_statt_400()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        using var antwort = await PutBildAsync(id, Testbilder.Jpeg(20 * 1024 * 1024));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.RequestEntityTooLarge);
    }

    [Fact]
    public async Task Put_mit_zu_grosser_Datei_laesst_vorhandenes_Bild_unveraendert()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var original = Testbilder.Webp(400);
        await LadeBildHochAsync(id, original);

        using var antwort = await PutBildAsync(id, Testbilder.Jpeg(FuenfMiB + 1));
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, antwort.StatusCode);

        Assert.Equal(original, await LadeBildAsync(id));
    }

    [Fact]
    public async Task Put_Antwort_enthaelt_keine_Bilddaten()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();

        var coin = await LadeBildHochAsync(id, Testbilder.Png(2048));

        var felder = coin.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { "auflage", "beschreibung", "bildUrl", "erstelltAm", "herausgeber", "id", "name" }, felder);
        Assert.Equal(JsonValueKind.String, coin.GetProperty("bildUrl").ValueKind);
    }
}
