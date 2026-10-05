namespace Coin.Api.Authentifizierung;

/// <summary>
/// Konfiguration der Anmeldung aus der eigenen Sektion <c>Oidc</c> (ADR-0012, AK-6). Bewusst nicht
/// <c>Authentication:Schemes:Bearer</c>: Diese Sektion bindet das Framework automatisch, sie darf die Prüfung nicht
/// beeinflussen. Im Code steht kein Wert fest; fehlende oder unsichere Werte brechen den Start ab.
/// </summary>
public sealed record OidcOptionen
{
    public const string Abschnitt = "Oidc";
    public const string AuthoritySchluessel = $"{Abschnitt}:Authority";
    public const string AudienceSchluessel = $"{Abschnitt}:Audience";
    public const string ClientIdSchluessel = $"{Abschnitt}:ClientId";

    private OidcOptionen(string authority, string audience, string clientId, bool istLoopback)
    {
        Authority = authority;
        Audience = audience;
        ClientId = clientId;
        IstLoopback = istLoopback;
    }

    /// <summary>Issuer-URI ohne abschließenden Schrägstrich; wird exakt als gültiger Issuer verwendet.</summary>
    public string Authority { get; }

    public string Audience { get; }

    /// <summary>Erwarteter Wert des Claims <c>azp</c> (öffentlicher Client des Frontends).</summary>
    public string ClientId { get; }

    /// <summary>Authority auf localhost, 127.0.0.1 oder ::1: Metadaten dürfen per http geladen werden.</summary>
    public bool IstLoopback { get; }

    public string MetadataAddress => $"{Authority}/.well-known/openid-configuration";

    /// <summary>Liest und prüft die Sektion <c>Oidc</c>; wirft mit deutscher Meldung, die den Schlüssel nennt.</summary>
    public static OidcOptionen Lesen(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        var authority = Pflichtwert(configuration, AuthoritySchluessel);
        var audience = Pflichtwert(configuration, AudienceSchluessel);
        var clientId = Pflichtwert(configuration, ClientIdSchluessel);

        if (!Uri.TryCreate(authority, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp)
            || string.IsNullOrEmpty(uri.Host)
            || !string.IsNullOrEmpty(uri.UserInfo)
            || !string.IsNullOrEmpty(uri.Query)
            || !string.IsNullOrEmpty(uri.Fragment))
        {
            throw new InvalidOperationException(
                $"Die Einstellung '{AuthoritySchluessel}' muss eine absolute http- oder https-Adresse " +
                "ohne Benutzerangaben, Query und Fragment sein (Issuer des Identitätsanbieters).");
        }

        if (authority.TrimEnd('/').Length > Coin.Domain.Benutzer.BenutzerIdentitaet.MaxIssuerLaenge)
        {
            throw new InvalidOperationException(
                $"Die Einstellung '{AuthoritySchluessel}' ist länger als {Coin.Domain.Benutzer.BenutzerIdentitaet.MaxIssuerLaenge} Zeichen.");
        }

        var istLoopback = IstLoopbackHost(uri);
        if (uri.Scheme == Uri.UriSchemeHttp && !istLoopback)
        {
            throw new InvalidOperationException(
                $"Die Einstellung '{AuthoritySchluessel}' verlangt https. Unverschlüsseltes http ist nur für " +
                "localhost, 127.0.0.1 und ::1 erlaubt.");
        }

        return new OidcOptionen(authority.TrimEnd('/'), audience, clientId, istLoopback);
    }

    /// <summary>Nur genau localhost, 127.0.0.1 und ::1 (nicht Uri.IsLoopback, das ganz 127.0.0.0/8 erlaubt).</summary>
    private static bool IstLoopbackHost(Uri uri) =>
        uri.IdnHost.Equals("localhost", StringComparison.OrdinalIgnoreCase)
        || uri.IdnHost == "127.0.0.1"
        || uri.IdnHost == "::1"
        || uri.Host == "[::1]";

    private static string Pflichtwert(IConfiguration configuration, string schluessel)
    {
        var wert = configuration[schluessel]?.Trim();
        if (string.IsNullOrEmpty(wert))
        {
            throw new InvalidOperationException(
                $"Die Einstellung '{schluessel}' fehlt oder ist leer. Bitte in appsettings.<Umgebung>.json, " +
                $"per User-Secrets oder als Umgebungsvariable '{schluessel.Replace(":", "__", StringComparison.Ordinal)}' setzen.");
        }

        return wert;
    }
}
