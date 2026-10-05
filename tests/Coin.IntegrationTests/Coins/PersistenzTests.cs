using System.Net;
using System.Net.Http.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Coins;

/// <summary>AK-20: Coins und Bilder überstehen einen Neustart der API.</summary>
public class PersistenzTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    [Fact]
    public async Task Angelegter_Coin_ist_nach_Neustart_der_API_vorhanden()
    {
        Guid id;
        await using (var ersteInstanz = Fixture.NeueFactory())
        {
            using var client = ersteInstanz.CreateClient();
            using var antwort = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin("Coin Neustart", "Herausgeber Beta", 42));
            Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
            id = (await JsonAsync(antwort)).GetProperty("id").GetGuid();
        }

        await using var zweiteInstanz = Fixture.NeueFactory();
        using var neuerClient = zweiteInstanz.CreateClient();
        using var abruf = await neuerClient.GetAsync($"{CoinsUrl}/{id}");

        Assert.Equal(HttpStatusCode.OK, abruf.StatusCode);
        var coin = await JsonAsync(abruf);
        Assert.Equal("Coin Neustart", coin.GetProperty("name").GetString());
        Assert.Equal(42, coin.GetProperty("auflage").GetInt32());
    }

    [Fact]
    public async Task Hochgeladenes_Bild_ist_nach_Neustart_der_API_unveraendert_vorhanden()
    {
        var inhalt = Testbilder.Webp(2048);
        Guid id;
        await using (var ersteInstanz = Fixture.NeueFactory())
        {
            using var client = ersteInstanz.CreateClient();
            using var anlegen = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin("Coin Neustart Bild"));
            id = (await JsonAsync(anlegen)).GetProperty("id").GetGuid();
            using var upload = await client.PutAsync(BildUrl(id), Multipart(inhalt));
            Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        }

        await using var zweiteInstanz = Fixture.NeueFactory();
        using var neuerClient = zweiteInstanz.CreateClient();
        using var abruf = await neuerClient.GetAsync(BildUrl(id));

        Assert.Equal(HttpStatusCode.OK, abruf.StatusCode);
        Assert.Equal(inhalt, await abruf.Content.ReadAsByteArrayAsync());
    }
}
