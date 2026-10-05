using Coin.Domain.Benutzer;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Net.Http.Headers;

namespace Coin.Api.Authentifizierung;

/// <summary>
/// Anmeldung per JWT-Bearer gegen <c>Oidc:Authority</c> und Autorisierung (ADR-0012, ADR-0013).
/// Alle sicherheitsrelevanten Prüfparameter stehen fest im Code und werden per <c>PostConfigure</c> nach jeder
/// Konfigurationsbindung gesetzt; <c>Authentication:Schemes:Bearer</c> kann sie nicht aufweichen (AK-9).
/// </summary>
public static class AuthentifizierungRegistrierung
{
    public const string BootstrapAdminEmailsSchluessel = "Bootstrap:AdminEmails";

    /// <summary>Toleranz für <c>exp</c>/<c>nbf</c>.</summary>
    public static readonly TimeSpan ClockSkew = TimeSpan.FromSeconds(30);

    /// <summary>Rollen-Claim, der nie in Tokens vorkommt: Rollen aus dem Token werden ignoriert (AK-11).</summary>
    public const string UngenutzterRollenClaim = "coin_ungenutzt";

    private const string NichtAngemeldetTitel = "Nicht angemeldet";
    private const string NichtAngemeldetDetail = "Für diese Aktion ist eine Anmeldung erforderlich.";
    private const string KeinZugriffTitel = "Kein Zugriff";
    private const string KeinZugriffDetail = "Ihr Benutzerkonto ist nicht berechtigt, den Coin-Katalog zu ändern.";

    public static IServiceCollection AddAnmeldung(this IServiceCollection services)
    {
        // Werte erst aus der endgültigen Konfiguration lesen (z. B. im Testhost); geprüft wird beim Start (Program).
        services.AddSingleton(sp => OidcOptionen.Lesen(sp.GetRequiredService<IConfiguration>()));
        services.AddSingleton(sp => new BootstrapAdmins(
            sp.GetRequiredService<IConfiguration>().GetSection(BootstrapAdminEmailsSchluessel).Get<string[]>()));

        services.AddHttpContextAccessor();
        services.AddScoped<BenutzerAbgleichService>();
        services.AddScoped<IAktuellerBenutzer, AktuellerBenutzer>();
        services.AddScoped<IAuthorizationHandler, RolleAnforderungHandler>();
        services.AddSingleton<IAuthorizationMiddlewareResultHandler, AutorisierungsErgebnisBehandlung>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();

        // Nach AddJwtBearer registriert: läuft nach der Bindung von Authentication:Schemes:Bearer und nach dem
        // PostConfigure des Frameworks, überschreibt also alles, was Konfiguration dort gesetzt haben könnte.
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .PostConfigure<OidcOptionen>(Festlegen);

        services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
            .AddPolicy(Policies.KatalogSchreiben, policy => policy
                .RequireAuthenticatedUser()
                .AddRequirements(new RolleAnforderung(Rollen.DuerfenKatalogSchreiben)));

        return services;
    }

    private static void Festlegen(JwtBearerOptions o, OidcOptionen oidc)
    {
        o.Authority = oidc.Authority;
        o.MetadataAddress = oidc.MetadataAddress;
        o.Audience = oidc.Audience;
        o.RequireHttpsMetadata = !oidc.IstLoopback;
        o.MapInboundClaims = false;
        o.IncludeErrorDetails = false;
        o.SaveToken = false;
        o.RefreshOnIssuerKeyNotFound = true;
        o.UseSecurityTokenValidators = false;
        o.Challenge = JwtBearerDefaults.AuthenticationScheme;
        o.ClaimsIssuer = null;
        o.ForwardDefault = null;
        o.ForwardAuthenticate = null;
        o.ForwardChallenge = null;
        o.ForwardForbid = null;
        o.ForwardSignIn = null;
        o.ForwardSignOut = null;
        o.ForwardDefaultSelector = null;
        o.EventsType = null;

        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuers = [oidc.Authority],
            ValidAudiences = [oidc.Audience],
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            RequireSignedTokens = true,
            RequireExpirationTime = true,
            RequireAudience = true,
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
            ValidTypes = ["JWT", "at+jwt"],
            ClockSkew = ClockSkew,
            NameClaimType = BenutzerClaims.Name,
            RoleClaimType = UngenutzterRollenClaim,
        };

        // Schlüssel nur aus der Discovery/JWKS der eigenen Authority, nie aus einer statischen Konfiguration.
        o.Configuration = null;
        o.Backchannel ??= new HttpClient(o.BackchannelHttpHandler ?? new HttpClientHandler())
        {
            Timeout = o.BackchannelTimeout,
            MaxResponseContentBufferSize = 1024 * 1024 * 10,
        };
        o.ConfigurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
            oidc.MetadataAddress,
            new OpenIdConnectConfigurationRetriever(),
            new HttpDocumentRetriever(o.Backchannel) { RequireHttps = o.RequireHttpsMetadata })
        {
            RefreshInterval = o.RefreshInterval,
            AutomaticRefreshInterval = o.AutomaticRefreshInterval,
        };

        o.Events = new JwtBearerEvents
        {
            OnTokenValidated = context =>
            {
                var principal = context.Principal;
                var subject = principal?.FindFirst(BenutzerClaims.Subject)?.Value;
                if (string.IsNullOrWhiteSpace(subject) || subject.Length > BenutzerIdentitaet.MaxSubjectLaenge)
                {
                    context.Fail("Token ohne gültiges sub.");
                }
                else if (!string.Equals(principal!.FindFirst(BenutzerClaims.AuthorizedParty)?.Value, oidc.ClientId, StringComparison.Ordinal))
                {
                    context.Fail("Token für einen anderen Client (azp).");
                }

                return Task.CompletedTask;
            },
            OnChallenge = async context =>
            {
                context.HandleResponse();
                var response = context.Response;
                if (response.HasStarted)
                {
                    return;
                }

                response.StatusCode = StatusCodes.Status401Unauthorized;
                // Ohne error/error_description (IncludeErrorDetails=false), AK-7.
                response.Headers.Append(HeaderNames.WWWAuthenticate, JwtBearerDefaults.AuthenticationScheme);
                await ProblemSchreibenAsync(context.HttpContext, StatusCodes.Status401Unauthorized, NichtAngemeldetTitel, NichtAngemeldetDetail);
            },
            OnForbidden = async context =>
            {
                if (context.Response.HasStarted)
                {
                    return;
                }

                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await ProblemSchreibenAsync(context.HttpContext, StatusCodes.Status403Forbidden, KeinZugriffTitel, KeinZugriffDetail);
            },
        };
    }

    private static async Task ProblemSchreibenAsync(HttpContext httpContext, int status, string titel, string detail)
    {
        var dienst = httpContext.RequestServices.GetRequiredService<IProblemDetailsService>();
        await dienst.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = new ProblemDetails { Status = status, Title = titel, Detail = detail },
        });
    }
}
