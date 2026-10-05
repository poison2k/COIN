using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Bilder;

/// <summary>
/// PUT /api/coins/{id}/bild mit fehlerhaften oder übergroßen Requests (AK-23, AK-25).
/// Fehlerhafte Formulare liefern 400 (Schlüssel <c>datei</c>), nur echte Größenüberschreitungen 413.
/// </summary>
public class BildHochladenRobustheitTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const int FuenfMiB = 5_242_880;
    private const string Boundary = "----CoinTestBoundary";

    private static ByteArrayContent RohesMultipart(string body)
    {
        var inhalt = new ByteArrayContent(Encoding.ASCII.GetBytes(body));
        inhalt.Headers.ContentType = MediaTypeHeaderValue.Parse($"multipart/form-data; boundary={Boundary}");
        return inhalt;
    }

    // ---------- Abgeschnittener Body ----------

    [Fact]
    public async Task Put_mit_abgeschnittenem_multipart_ohne_End_Boundary_liefert_400_mit_Fehler_fuer_datei()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var body =
            $"--{Boundary}\r\n" +
            "Content-Disposition: form-data; name=\"datei\"; filename=\"motiv.png\"\r\n" +
            "Content-Type: image/png\r\n\r\n" +
            "\u0089PNG\r\n\u001a\n0123456789"; // keine abschließende Boundary

        using var antwort = await Client.PutAsync(BildUrl(id), RohesMultipart(body));

        Assert.Equal(["datei"], await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task Put_mit_abgeschnittenem_multipart_mitten_im_Kopf_liefert_400_mit_Fehler_fuer_datei()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        var body = $"--{Boundary}\r\nContent-Disposition: form-data; name=\"da";

        using var antwort = await Client.PutAsync(BildUrl(id), RohesMultipart(body));

        Assert.Equal(["datei"], await AssertValidierungsfehlerAsync(antwort));
    }

    // ---------- Andere Formular-Limits sind kein „zu groß“ ----------

    [Fact]
    public async Task Put_mit_mehr_als_1024_Formularfeldern_liefert_400_mit_Fehler_fuer_datei_statt_413()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        using var inhalt = Multipart(Testbilder.Png());
        for (var i = 0; i < 1100; i++)
        {
            inhalt.Add(new StringContent("x"), $"feld{i}");
        }

        using var antwort = await Client.PutAsync(BildUrl(id), inhalt);

        Assert.Equal(["datei"], await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task Put_mit_mehr_als_1024_Formularfeldern_speichert_nichts()
    {
        var id = await LegeCoinAnUndLiefereIdAsync();
        using var inhalt = Multipart(Testbilder.Png());
        for (var i = 0; i < 1100; i++)
        {
            inhalt.Add(new StringContent("x"), $"feld{i}");
        }

        using var antwort = await Client.PutAsync(BildUrl(id), inhalt);
        Assert.NotEqual(HttpStatusCode.OK, antwort.StatusCode);

        using var abruf = await Client.GetAsync(BildUrl(id));
        Assert.Equal(HttpStatusCode.NotFound, abruf.StatusCode);
    }

    // ---------- Chunked Upload über echtes Kestrel ----------
    // Der TestServer setzt [RequestSizeLimit] nicht durch; deshalb echter Kestrel-Server und echter HttpClient.

    [Theory]
    [InlineData(FuenfMiB + FuenfMiB / 10)] // ca. 5,5 MiB: unter dem Request-Limit, über der fachlichen Grenze
    [InlineData(20 * 1024 * 1024)]         // 20 MiB: über dem Request-Limit des Servers
    public async Task Put_chunked_ohne_Content_Length_ueber_dem_Limit_liefert_413_ProblemDetails(int groesse)
    {
        await using var factory = Fixture.NeueFactory();
        factory.UseKestrel(0);
        factory.StartServer();
        using var client = EchterClient(factory);
        var id = await LegeCoinAnUeberAsync(client);

        using var inhalt = ChunkedMultipart(Testbilder.Jpeg(groesse));
        using var anfrage = ChunkedPut(id, inhalt);
        using var antwort = await client.SendAsync(anfrage);

        Assert.True(anfrage.Headers.TransferEncodingChunked); // Voraussetzung: ohne Content-Length gesendet

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.RequestEntityTooLarge);
    }

    [Fact]
    public async Task Put_chunked_ohne_Content_Length_mit_gueltigem_Bild_liefert_200_ueber_Kestrel()
    {
        await using var factory = Fixture.NeueFactory();
        factory.UseKestrel(0);
        factory.StartServer();
        using var client = EchterClient(factory);
        var id = await LegeCoinAnUeberAsync(client);

        using var inhalt = ChunkedMultipart(Testbilder.Png(100_000));
        using var anfrage = ChunkedPut(id, inhalt);
        using var antwort = await client.SendAsync(anfrage);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    /// <summary>
    /// Einfacher HttpClient direkt gegen die Kestrel-Adresse. Der Client aus CreateClient() puffert den Body
    /// (Redirect-Handler) und würde dadurch eine Content-Length setzen.
    /// </summary>
    private static HttpClient EchterClient(CoinApiFactory factory)
    {
        using var vorlage = factory.CreateClient();
        var adresse = vorlage.BaseAddress!;
        Assert.NotEqual(80, adresse.Port); // Voraussetzung: echter Kestrel mit dynamischem Port, nicht TestServer
        return new HttpClient { BaseAddress = adresse, Timeout = TimeSpan.FromMinutes(2) };
    }

    private static HttpRequestMessage ChunkedPut(Guid id, HttpContent inhalt)
    {
        var anfrage = new HttpRequestMessage(HttpMethod.Put, BildUrl(id)) { Content = inhalt };
        anfrage.Headers.TransferEncodingChunked = true;
        return anfrage;
    }

    private static async Task<Guid> LegeCoinAnUeberAsync(HttpClient client)
    {
        using var antwort = await client.PostAsync(CoinsUrl,
            new StringContent("""{ "name": "Coin Kestrel", "herausgeber": "Herausgeber Beta" }""", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
        return (await JsonAsync(antwort)).GetProperty("id").GetGuid();
    }

    /// <summary>Multipart mit nicht suchbarem Stream: Länge unbekannt, HttpClient sendet chunked.</summary>
    private static MultipartFormDataContent ChunkedMultipart(byte[] daten)
    {
        var datei = new StreamContent(new NichtSuchbarerStream(daten));
        datei.Headers.ContentType = MediaTypeHeaderValue.Parse("image/jpeg");
        return new MultipartFormDataContent { { datei, "datei", "motiv.jpg" } };
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
}
