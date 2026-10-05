using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Coin.IntegrationTests.Infrastruktur;

/// <summary>
/// Test-Identitätsanbieter ohne Keycloak (Entwurf anmeldung-keycloak, Abschnitt 6.1, AK-36):
/// eigener RSA-2048-Schlüssel pro Testlauf, Discovery und JWKS über einen <see cref="HttpMessageHandler"/>
/// (kein Netzwerk) und eine Token-Fabrik für gültige und absichtlich ungültige Tokens.
/// Die Prüfparameter der API bleiben unverändert (Produktionscode); ersetzt wird nur der Transport.
/// </summary>
public sealed class TestIdentitaetsanbieter
{
    public const string StandardAuthority = "https://idp.coin-test.invalid/realms/coin-test";
    public const string FremdAuthority = "https://fremd.coin-test.invalid/realms/fremd";

    /// <summary>Bewusst andere Werte als in Produktion/Dev (coin-api, coin-web): beweist, dass nichts im Code feststeht.</summary>
    public const string Audience = "coin-api-test";
    public const string ClientId = "coin-web-test";

    /// <summary>Ein Anbieter pro Testlauf, damit Tokens in allen Testhosts (auch nach „Neustart“) gültig sind.</summary>
    public static TestIdentitaetsanbieter Standard { get; } = new(StandardAuthority, "test-schluessel-1");

    /// <summary>Fremder Anbieter mit eigenem Schlüssel und eigenem Issuer (AK-8 a).</summary>
    public static TestIdentitaetsanbieter Fremd { get; } = new(FremdAuthority, "fremd-schluessel-1");

    /// <summary>
    /// „Netz“ des Testlaufs: liefert Discovery und JWKS beider Anbieter (Standard und Fremd), alles andere 404.
    /// So kann ein Test die API per Konfiguration auf die Fremd-Discovery zeigen lassen (AK-9).
    /// </summary>
    public static HttpMessageHandler Netz { get; } = new NetzHandler();

    private readonly RSA _rsa;

    public TestIdentitaetsanbieter(string authority, string kid)
    {
        Authority = authority;
        Kid = kid;
        _rsa = RSA.Create(2048);
        Handler = new MetadatenHandler(this);
    }

    public string Authority { get; }

    public string Kid { get; }

    public string MetadataAddress => $"{Authority}/.well-known/openid-configuration";

    public string JwksUri => $"{Authority}/protocol/openid-connect/certs";

    /// <summary>Liefert Discovery und JWKS dieses Anbieters; alles andere 404.</summary>
    public HttpMessageHandler Handler { get; }

    /// <summary>Öffentlicher Schlüssel als PEM (für den HS256-Schlüsselverwechslungsangriff).</summary>
    public byte[] OeffentlicherSchluesselPem => Encoding.ASCII.GetBytes(_rsa.ExportSubjectPublicKeyInfoPem());

    public string ErzeugeToken(TokenDaten daten)
    {
        var header = new Dictionary<string, object?> { ["alg"] = daten.Algorithmus };
        if (daten.Typ is not null)
        {
            header["typ"] = daten.Typ;
        }

        if (daten.Algorithmus == "RS256")
        {
            header["kid"] = Kid;
        }

        var jetzt = DateTimeOffset.UtcNow;
        var payload = new Dictionary<string, object?>
        {
            ["iat"] = jetzt.Add(daten.AusgestelltVersatz).ToUnixTimeSeconds(),
            ["exp"] = jetzt.Add(daten.AblaufIn).ToUnixTimeSeconds(),
            ["jti"] = Guid.NewGuid().ToString(),
        };
        if (daten.NichtVorIn is { } nichtVor)
        {
            payload["nbf"] = jetzt.Add(nichtVor).ToUnixTimeSeconds();
        }

        if (!daten.IssuerWeglassen)
        {
            payload["iss"] = daten.Issuer ?? Authority;
        }

        if (daten.Audience is not null)
        {
            payload["aud"] = daten.Audience;
        }

        SetzeOptional(payload, "sub", daten.Subject);
        SetzeOptional(payload, "azp", daten.Azp);
        SetzeOptional(payload, "email", daten.Email);
        SetzeOptional(payload, "email_verified", daten.EmailVerifiziert);
        SetzeOptional(payload, "name", daten.Name);
        SetzeOptional(payload, "preferred_username", daten.PreferredUsername);
        foreach (var (claim, wert) in daten.Zusatz)
        {
            payload[claim] = wert;
        }

        var kopfUndInhalt = $"{Base64Url(JsonSerializer.SerializeToUtf8Bytes(header))}.{Base64Url(JsonSerializer.SerializeToUtf8Bytes(payload))}";
        return $"{kopfUndInhalt}.{Signiere(kopfUndInhalt, daten)}";
    }

    private string Signiere(string kopfUndInhalt, TokenDaten daten)
    {
        var bytes = Encoding.ASCII.GetBytes(kopfUndInhalt);
        return daten.Algorithmus switch
        {
            "none" => string.Empty,
            "HS256" => Base64Url(HMACSHA256.HashData(daten.HmacSchluessel ?? OeffentlicherSchluesselPem, bytes)),
            _ => Base64Url(_rsa.SignData(bytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)),
        };
    }

    private static void SetzeOptional(Dictionary<string, object?> payload, string claim, object? wert)
    {
        if (wert is not null)
        {
            payload[claim] = wert;
        }
    }

    public static string Base64Url(byte[] daten) =>
        Convert.ToBase64String(daten).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static byte[] AusBase64Url(string text)
    {
        var s = text.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(s.PadRight(s.Length + ((4 - (s.Length % 4)) % 4), '='));
    }

    private string DiscoveryJson() => JsonSerializer.Serialize(new Dictionary<string, object>
    {
        ["issuer"] = Authority,
        ["authorization_endpoint"] = $"{Authority}/protocol/openid-connect/auth",
        ["token_endpoint"] = $"{Authority}/protocol/openid-connect/token",
        ["end_session_endpoint"] = $"{Authority}/protocol/openid-connect/logout",
        ["jwks_uri"] = JwksUri,
        ["response_types_supported"] = new[] { "code" },
        ["subject_types_supported"] = new[] { "public" },
        ["id_token_signing_alg_values_supported"] = new[] { "RS256" },
    });

    private string JwksJson()
    {
        var p = _rsa.ExportParameters(includePrivateParameters: false);
        return JsonSerializer.Serialize(new
        {
            keys = new[]
            {
                new { kty = "RSA", use = "sig", alg = "RS256", kid = Kid, n = Base64Url(p.Modulus!), e = Base64Url(p.Exponent!) },
            },
        });
    }

    /// <summary>Discovery- oder JWKS-Dokument dieses Anbieters für die URL, sonst <c>null</c>.</summary>
    private string? DokumentFuer(Uri? uri)
    {
        var url = uri?.GetLeftPart(UriPartial.Path);
        return url == MetadataAddress ? DiscoveryJson()
            : url == JwksUri ? JwksJson()
            : null;
    }

    private static HttpResponseMessage Antwort(string? json) => json is null
        ? new HttpResponseMessage(HttpStatusCode.NotFound)
        : new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private sealed class MetadatenHandler(TestIdentitaetsanbieter anbieter) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(Antwort(anbieter.DokumentFuer(request.RequestUri)));
    }

    private sealed class NetzHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(Antwort(Standard.DokumentFuer(request.RequestUri) ?? Fremd.DokumentFuer(request.RequestUri)));

        // Wird von allen Testhosts geteilt; ein HttpClient, der ihn umhüllt, darf ihn nicht entsorgen.
        protected override void Dispose(bool disposing)
        {
        }
    }
}

/// <summary>
/// Inhalt eines Test-Tokens. Standard: gültiges Access-Token (RS256, typ JWT, aud/azp der Testkonfiguration,
/// 1 h gültig) mit E-Mail, Name und email_verified=true. Über <c>with</c> lassen sich einzelne Teile verfälschen.
/// </summary>
public sealed record TokenDaten
{
    public string? Subject { get; init; } = $"sub-{Guid.NewGuid():N}";

    /// <summary><c>null</c> = Authority des signierenden Anbieters.</summary>
    public string? Issuer { get; init; }

    public bool IssuerWeglassen { get; init; }

    /// <summary>Zeichenkette, Array oder <c>null</c> (Claim fehlt).</summary>
    public object? Audience { get; init; } = TestIdentitaetsanbieter.Audience;

    public string? Azp { get; init; } = TestIdentitaetsanbieter.ClientId;

    public string? Typ { get; init; } = "JWT";

    /// <summary>RS256 (Standard), HS256 oder none.</summary>
    public string Algorithmus { get; init; } = "RS256";

    /// <summary>Nur für HS256; Standard ist der öffentliche RSA-Schlüssel als PEM (Schlüsselverwechslung).</summary>
    public byte[]? HmacSchluessel { get; init; }

    public string? Email { get; init; } = "person@coin-test.invalid";

    public bool? EmailVerifiziert { get; init; } = true;

    public string? Name { get; init; } = "Test Person";

    public string? PreferredUsername { get; init; }

    public TimeSpan AblaufIn { get; init; } = TimeSpan.FromHours(1);

    public TimeSpan? NichtVorIn { get; init; }

    public TimeSpan AusgestelltVersatz { get; init; } = TimeSpan.Zero;

    public IReadOnlyDictionary<string, object?> Zusatz { get; init; } = new Dictionary<string, object?>();
}

/// <summary>Synthetische Testbenutzer (keine echten Personendaten).</summary>
public static class Testbenutzer
{
    public const string AdminEmail = "admin@coin-test.invalid";
    public const string AdminName = "Test Administrator";
    public const string AdminSubject = "sub-bootstrap-admin";

    /// <summary>Bootstrap-Administrator laut Testkonfiguration (Bootstrap:AdminEmails:0).</summary>
    public static TokenDaten Admin { get; } = new()
    {
        Subject = AdminSubject,
        Email = AdminEmail,
        EmailVerifiziert = true,
        Name = AdminName,
    };

    /// <summary>Neuer Benutzer ohne Rolle (E-Mail steht nicht in der Bootstrap-Liste).</summary>
    public static TokenDaten OhneRolle(string? subject = null) => new()
    {
        Subject = subject ?? $"sub-ohne-rolle-{Guid.NewGuid():N}",
        Email = "ohne.rolle@coin-test.invalid",
        Name = "Test Ohne Rolle",
    };
}
