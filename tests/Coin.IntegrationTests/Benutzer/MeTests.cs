using System.Net;
using Coin.Domain.Benutzer;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using DomainBenutzer = Coin.Domain.Benutzer.Benutzer;

namespace Coin.IntegrationTests.Benutzer;

/// <summary>Feature anmeldung-keycloak, AK-20: GET /api/me.</summary>
public class MeTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const string GeheimeMeldung = "Interner Benutzerfehler XYZ-0815";

    [Fact]
    public async Task Me_liefert_200_als_JSON()
    {
        using var antwort = await Client.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal("application/json", antwort.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Me_sendet_Cache_Control_no_store()
    {
        using var antwort = await Client.GetAsync(MeUrl);

        Assert.True(antwort.Headers.CacheControl?.NoStore, $"Cache-Control: {antwort.Headers.CacheControl}");
    }

    [Fact]
    public async Task Me_liefert_genau_die_Felder_id_name_email_rolle()
    {
        using var antwort = await Client.GetAsync(MeUrl);
        var json = await JsonAsync(antwort);

        Assert.Equal(["email", "id", "name", "rolle"], json.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Me_liefert_Name_und_Email_des_Bootstrap_Admins()
    {
        using var antwort = await Client.GetAsync(MeUrl);
        var json = await JsonAsync(antwort);

        Assert.Equal(Testbenutzer.AdminName, json.GetProperty("name").GetString());
        Assert.Equal(Testbenutzer.AdminEmail, json.GetProperty("email").GetString());
        Assert.Equal("Administrator", json.GetProperty("rolle").GetString());
    }

    [Fact]
    public async Task Me_id_ist_die_interne_GUID_und_nicht_das_sub()
    {
        using var antwort = await Client.GetAsync(MeUrl);
        var id = (await JsonAsync(antwort)).GetProperty("id").GetString();

        Assert.NotEqual(Testbenutzer.AdminSubject, id);
        Assert.Equal((await BenutzerDb.EinzigerAsync(Testbenutzer.AdminSubject)).Id, Guid.Parse(id!));
    }

    [Fact]
    public async Task Me_gibt_weder_sub_noch_Issuer_preis()
    {
        using var antwort = await Client.GetAsync(MeUrl);
        var body = await antwort.Content.ReadAsStringAsync();

        Assert.DoesNotContain(Testbenutzer.AdminSubject, body);
        Assert.DoesNotContain(TestIdentitaetsanbieter.StandardAuthority, body);
    }

    [Fact]
    public async Task Me_liefert_rolle_keine_fuer_Benutzer_ohne_Rolle()
    {
        using var antwort = await ClientMit(Testbenutzer.OhneRolle()).GetAsync(MeUrl);

        Assert.Equal("keine", (await JsonAsync(antwort)).GetProperty("rolle").GetString());
    }

    [Theory]
    [InlineData("Sachbearbeiter")]
    [InlineData("Betrachter")]
    [InlineData("Administrator")]
    public async Task Me_liefert_die_Rolle_aus_der_Datenbank(string rolle)
    {
        var client = await ClientMitRolleAsync(rolle);

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal(rolle, (await JsonAsync(antwort)).GetProperty("rolle").GetString());
    }

    [Fact]
    public async Task Me_liefert_email_null_wenn_das_Token_keine_Email_hat()
    {
        using var antwort = await ClientMit(new TokenDaten { Email = null, EmailVerifiziert = null }).GetAsync(MeUrl);
        var json = await JsonAsync(antwort);

        Assert.True(json.TryGetProperty("email", out var email));
        Assert.Equal(System.Text.Json.JsonValueKind.Null, email.ValueKind);
    }

    [Fact]
    public async Task Me_liefert_den_Anzeigenamen_als_name()
    {
        using var antwort = await ClientMit(new TokenDaten { Name = null, PreferredUsername = "nur.benutzername" }).GetAsync(MeUrl);

        Assert.Equal("nur.benutzername", (await JsonAsync(antwort)).GetProperty("name").GetString());
    }

    [Fact]
    public async Task Me_liefert_nach_Namensaenderung_den_neuen_Namen()
    {
        var daten = new TokenDaten { Name = "Alter Name" };
        using (await ClientMit(daten).GetAsync(MeUrl))
        {
        }

        using var antwort = await ClientMit(daten with { Name = "Neuer Name" }).GetAsync(MeUrl);

        Assert.Equal("Neuer Name", (await JsonAsync(antwort)).GetProperty("name").GetString());
    }

    // ---------- Fehler ----------

    [Fact]
    public async Task Me_ohne_Token_liefert_401()
    {
        using var antwort = await Anonym.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Unerwarteter_Fehler_im_Abgleich_liefert_500_ProblemDetails_ohne_Details()
    {
        using var client = Fixture.Factory
            .WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddScoped<IBenutzerRepository, WerfendesBenutzerRepository>()))
            .CreateClient();

        using var antwort = await client.GetAsync(MeUrl);
        var body = await antwort.Content.ReadAsStringAsync();

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.InternalServerError);
        Assert.DoesNotContain(GeheimeMeldung, body);
        Assert.DoesNotContain("   at ", body);
        Assert.DoesNotContain(Testbenutzer.AdminEmail, body);
    }

    private sealed class WerfendesBenutzerRepository : IBenutzerRepository
    {
        public Task<DomainBenutzer> AbgleichenAsync(BenutzerIdentitaet identitaet, Rolle? rolleBeiNeuanlage, DateTimeOffset jetzt, CancellationToken ct) =>
            throw new InvalidOperationException(GeheimeMeldung);
    }
}
