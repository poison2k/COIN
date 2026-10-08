using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;

namespace Coin.Api.Http;

/// <summary>
/// Deutsche Titel für ProblemDetails ohne fachlichen Titel. ASP.NET Core setzt sonst englische Standardtitel,
/// z. B. „Not Found“ bei unbekannten Routen (<c>UseStatusCodePages</c>) oder „An error occurred while processing
/// your request.“ bei unbehandelten Ausnahmen im <c>UseExceptionHandler</c> (AK-19 coin-katalog).
/// Fachliche Titel (z. B. „Coin nicht gefunden“) bleiben unverändert.
/// </summary>
public static class ProblemTitel
{
    /// <summary>Titel jeder 500-Antwort ohne eigenen fachlichen Titel.</summary>
    public const string Serverfehler = "Ein unerwarteter Fehler ist aufgetreten.";

    private static readonly Dictionary<int, string> DeutscheTitel = new()
    {
        [StatusCodes.Status400BadRequest] = "Ungültige Anfrage",
        [StatusCodes.Status401Unauthorized] = "Nicht angemeldet",
        [StatusCodes.Status403Forbidden] = "Zugriff verweigert",
        [StatusCodes.Status404NotFound] = "Nicht gefunden",
        [StatusCodes.Status405MethodNotAllowed] = "Methode nicht erlaubt",
        [StatusCodes.Status406NotAcceptable] = "Nicht akzeptables Antwortformat",
        [StatusCodes.Status408RequestTimeout] = "Zeitüberschreitung der Anfrage",
        [StatusCodes.Status409Conflict] = "Konflikt",
        [StatusCodes.Status410Gone] = "Nicht mehr vorhanden",
        [StatusCodes.Status411LengthRequired] = "Längenangabe erforderlich",
        [StatusCodes.Status412PreconditionFailed] = "Vorbedingung nicht erfüllt",
        [StatusCodes.Status413PayloadTooLarge] = "Anfrage zu groß",
        [StatusCodes.Status414UriTooLong] = "Adresse zu lang",
        [StatusCodes.Status415UnsupportedMediaType] = "Nicht unterstützter Inhaltstyp",
        [StatusCodes.Status422UnprocessableEntity] = "Anfrage nicht verarbeitbar",
        [StatusCodes.Status426UpgradeRequired] = "Protokollwechsel erforderlich",
        [StatusCodes.Status428PreconditionRequired] = "Vorbedingung erforderlich",
        [StatusCodes.Status429TooManyRequests] = "Zu viele Anfragen",
        [StatusCodes.Status431RequestHeaderFieldsTooLarge] = "Kopfzeilen zu groß",
        [StatusCodes.Status500InternalServerError] = Serverfehler,
        [StatusCodes.Status501NotImplemented] = "Nicht umgesetzt",
        [StatusCodes.Status502BadGateway] = "Fehlerhafte Antwort eines vorgelagerten Dienstes",
        [StatusCodes.Status503ServiceUnavailable] = "Dienst nicht verfügbar",
        [StatusCodes.Status504GatewayTimeout] = "Zeitüberschreitung eines vorgelagerten Dienstes",
    };

    /// <summary>
    /// Englische Standardtitel, die ASP.NET Core selbst vergibt (<c>ProblemDetailsDefaults</c>, Reason-Phrases,
    /// Exception-Handler). Nur diese werden ersetzt; alles andere gilt als fachlicher Titel.
    /// </summary>
    private static readonly HashSet<string> EnglischeStandardtitel = new(StringComparer.Ordinal)
    {
        "An error occurred while processing your request.",
        "One or more validation errors occurred.",
        "Bad Request",
        "Unauthorized",
        "Forbidden",
        "Not Found",
        "Method Not Allowed",
        "Not Acceptable",
        "Request Timeout",
        "Conflict",
        "Gone",
        "Precondition Failed",
        "Unsupported Media Type",
        "Unprocessable Entity",
        "Upgrade Required",
        "Internal Server Error",
        "Bad Gateway",
        "Service Unavailable",
        "Gateway Timeout",
    };

    /// <summary>Für <c>ProblemDetailsOptions.CustomizeProblemDetails</c>.</summary>
    public static void Setzen(ProblemDetailsContext kontext)
    {
        ArgumentNullException.ThrowIfNull(kontext);

        var problem = kontext.ProblemDetails;
        var status = problem.Status ?? kontext.HttpContext.Response.StatusCode;
        if (!IstStandardtitel(problem.Title, status))
        {
            return;
        }

        problem.Title = DeutscheTitel.TryGetValue(status, out var titel)
            ? titel
            : status >= StatusCodes.Status500InternalServerError ? Serverfehler : "Fehlerhafte Anfrage";
    }

    private static bool IstStandardtitel(string? titel, int status)
    {
        if (status < StatusCodes.Status400BadRequest)
        {
            return false;
        }

        return string.IsNullOrEmpty(titel)
            || EnglischeStandardtitel.Contains(titel)
            || string.Equals(titel, ReasonPhrases.GetReasonPhrase(status), StringComparison.Ordinal);
    }
}
