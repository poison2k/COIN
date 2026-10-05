using System.Net;
using System.Net.Http.Headers;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Coin.IntegrationTests.Anmeldung;

/// <summary>Feature anmeldung-keycloak, AK-9: Die Token-Prüfung ist fest im Code und nicht per Konfiguration abschaltbar.</summary>
public class NichtAbschaltbarTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    /// <summary>Versuche, die Prüfung über die vom Framework automatisch gebundene Sektion aufzuweichen.</summary>
    private static readonly Dictionary<string, string?> Aufweichversuche = new()
    {
        ["Authentication:Schemes:Bearer:ValidIssuers:0"] = TestIdentitaetsanbieter.FremdAuthority,
        ["Authentication:Schemes:Bearer:ValidAudiences:0"] = "fremde-api",
        ["Authentication:Schemes:Bearer:Authority"] = TestIdentitaetsanbieter.FremdAuthority,
        ["Authentication:Schemes:Bearer:MetadataAddress"] = TestIdentitaetsanbieter.Fremd.MetadataAddress,
        ["Authentication:Schemes:Bearer:RequireHttpsMetadata"] = "false",
        ["Authentication:Schemes:Bearer:TokenValidationParameters:ValidateIssuer"] = "false",
        ["Authentication:Schemes:Bearer:TokenValidationParameters:ValidateAudience"] = "false",
        ["Authentication:Schemes:Bearer:TokenValidationParameters:ValidateLifetime"] = "false",
        ["Authentication:Schemes:Bearer:TokenValidationParameters:ValidateIssuerSigningKey"] = "false",
        ["Authentication:Schemes:Bearer:TokenValidationParameters:RequireSignedTokens"] = "false",
    };

    private static JwtBearerOptions AufgeloesteOptionen(CoinApiFactory factory) =>
        factory.Services.GetRequiredService<IOptionsMonitor<JwtBearerOptions>>().Get(JwtBearerDefaults.AuthenticationScheme);

    // ---------- Aufgelöste Optionen in Testing ----------

    [Fact]
    public void Alle_vier_Validate_Schalter_sind_aktiv()
    {
        var p = AufgeloesteOptionen(Fixture.Factory).TokenValidationParameters;

        Assert.True(p.ValidateIssuer);
        Assert.True(p.ValidateAudience);
        Assert.True(p.ValidateLifetime);
        Assert.True(p.ValidateIssuerSigningKey);
    }

    [Fact]
    public void ValidIssuers_enthaelt_genau_die_Authority()
    {
        var p = AufgeloesteOptionen(Fixture.Factory).TokenValidationParameters;

        Assert.Equal([TestIdentitaetsanbieter.StandardAuthority], p.ValidIssuers);
    }

    [Fact]
    public void ValidAudiences_enthaelt_genau_die_Audience()
    {
        var p = AufgeloesteOptionen(Fixture.Factory).TokenValidationParameters;

        Assert.Equal([TestIdentitaetsanbieter.Audience], p.ValidAudiences);
    }

    [Fact]
    public void ValidAlgorithms_ist_genau_RS256()
    {
        var p = AufgeloesteOptionen(Fixture.Factory).TokenValidationParameters;

        Assert.Equal(["RS256"], p.ValidAlgorithms);
    }

    [Fact]
    public void ValidTypes_sind_genau_JWT_und_at_jwt()
    {
        var p = AufgeloesteOptionen(Fixture.Factory).TokenValidationParameters;

        Assert.Equal(["JWT", "at+jwt"], p.ValidTypes.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void Signierte_Tokens_und_Ablaufzeit_sind_Pflicht()
    {
        var p = AufgeloesteOptionen(Fixture.Factory).TokenValidationParameters;

        Assert.True(p.RequireSignedTokens);
        Assert.True(p.RequireExpirationTime);
    }

    [Fact]
    public void ClockSkew_betraegt_30_Sekunden()
    {
        var p = AufgeloesteOptionen(Fixture.Factory).TokenValidationParameters;

        Assert.Equal(TimeSpan.FromSeconds(30), p.ClockSkew);
    }

    [Fact]
    public void Rollen_Claim_zeigt_auf_einen_ungenutzten_Claim()
    {
        var p = AufgeloesteOptionen(Fixture.Factory).TokenValidationParameters;

        Assert.Equal("coin_ungenutzt", p.RoleClaimType);
    }

    [Fact]
    public void Claims_werden_nicht_umgemappt_und_Tokens_nicht_gespeichert()
    {
        var o = AufgeloesteOptionen(Fixture.Factory);

        Assert.False(o.MapInboundClaims);
        Assert.False(o.SaveToken);
    }

    [Fact]
    public void Fehlerdetails_werden_nicht_an_den_Client_gegeben()
    {
        Assert.False(AufgeloesteOptionen(Fixture.Factory).IncludeErrorDetails);
    }

    [Fact]
    public void Authority_und_HTTPS_Pflicht_kommen_aus_Oidc_Authority()
    {
        var o = AufgeloesteOptionen(Fixture.Factory);

        Assert.Equal(TestIdentitaetsanbieter.StandardAuthority, o.Authority?.TrimEnd('/'));
        Assert.True(o.RequireHttpsMetadata);
    }

    // ---------- Aufweichversuche über Authentication:Schemes:Bearer ----------

    [Fact]
    public void Aufweichversuche_aendern_die_aufgeloesten_Optionen_nicht()
    {
        using var factory = Fixture.NeueFactory(new FactoryOptionen { Einstellungen = Aufweichversuche });

        var o = AufgeloesteOptionen(factory);

        Assert.True(o.TokenValidationParameters.ValidateIssuer);
        Assert.True(o.TokenValidationParameters.ValidateAudience);
        Assert.True(o.TokenValidationParameters.ValidateLifetime);
        Assert.True(o.TokenValidationParameters.ValidateIssuerSigningKey);
        Assert.True(o.TokenValidationParameters.RequireSignedTokens);
        Assert.True(o.RequireHttpsMetadata);
        Assert.Equal([TestIdentitaetsanbieter.StandardAuthority], o.TokenValidationParameters.ValidIssuers);
        Assert.Equal([TestIdentitaetsanbieter.Audience], o.TokenValidationParameters.ValidAudiences);
    }

    public static TheoryData<string> AufweichFaelle => new()
    {
        "a_fremder_Issuer_mit_fremdem_Schluessel",
        "b_richtiger_Schluessel_aber_fremdes_iss",
        "c_ohne_aud",
        "c_falsche_aud",
    };

    [Theory]
    [MemberData(nameof(AufweichFaelle))]
    public async Task Trotz_Aufweichversuchen_bleiben_AK8_a_bis_c_bei_401(string fall)
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { Einstellungen = Aufweichversuche });
        using var client = factory.ClientMitToken(TokenPruefungTests.UngueltigeTokens[fall]());

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Trotz_Aufweichversuchen_wird_ein_Token_mit_der_fremden_Audience_abgelehnt()
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { Einstellungen = Aufweichversuche });
        using var client = factory.ClientMitToken(Idp.ErzeugeToken(new TokenDaten { Audience = "fremde-api" }));

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Trotz_auf_die_Fremd_Discovery_gesetzter_MetadataAddress_wird_ein_Token_des_Fremd_IdP_abgelehnt()
    {
        // Die Fremd-Discovery ist erreichbar (TestIdentitaetsanbieter.Netz); ohne festen ConfigurationManager
        // würden ihre Schlüssel und ihr Issuer übernommen.
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { Einstellungen = Aufweichversuche });
        var fremdToken = TestIdentitaetsanbieter.Fremd.ErzeugeToken(new TokenDaten());
        using var client = factory.ClientMitToken(fremdToken);

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.Unauthorized, antwort.StatusCode);
    }

    [Fact]
    public async Task Der_ConfigurationManager_laedt_die_Discovery_der_eigenen_Authority()
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { Einstellungen = Aufweichversuche });
        var o = AufgeloesteOptionen(factory);

        var konfiguration = await o.ConfigurationManager!.GetConfigurationAsync(CancellationToken.None);

        Assert.Equal(TestIdentitaetsanbieter.StandardAuthority, konfiguration.Issuer);
    }

    [Fact]
    public void Die_API_nutzt_den_konfigurierten_BackchannelHttpHandler_der_Optionen()
    {
        var o = AufgeloesteOptionen(Fixture.Factory);

        Assert.Same(TestIdentitaetsanbieter.Netz, o.BackchannelHttpHandler);
        Assert.NotNull(o.ConfigurationManager);
    }

    [Fact]
    public async Task Trotz_Aufweichversuchen_wird_ein_gueltiges_Token_weiter_akzeptiert()
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen { Einstellungen = Aufweichversuche });
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Idp.ErzeugeToken(new TokenDaten()));

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }
}
