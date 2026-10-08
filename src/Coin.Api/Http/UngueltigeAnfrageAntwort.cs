using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace Coin.Api.Http;

/// <summary>
/// 400-Antwort bei Bindungsfehlern (kaputtes JSON, falscher Typ, AK-14): deutscher Titel, camelCase-Feldnamen
/// statt JSON-Pfaden (<c>$.auflage</c> → <c>auflage</c>), keine technischen Meldungen und kein Schlüssel <c>request</c>.
/// </summary>
public static class UngueltigeAnfrageAntwort
{
    private const string AnfrageSchluessel = "anfrage";

    /// <summary>Name der <c>[FromBody]</c>-Parameter in allen Controllern.</summary>
    private const string BodyParameter = "request";

    public static IActionResult Erstellen(ActionContext context)
    {
        var bereinigt = new ModelStateDictionary();
        var syntaxfehler = context.ModelState.Values.Any(e => e.Errors.Any(f => IstSyntaxfehler(f.Exception)));
        foreach (var (schluessel, eintrag) in context.ModelState)
        {
            if (!syntaxfehler && eintrag.Errors.Count > 0 && Feldname(schluessel) is { } feld && !bereinigt.ContainsKey(feld))
            {
                bereinigt.AddModelError(feld, "Ungültiger Wert für dieses Feld.");
            }
        }

        if (bereinigt.Count == 0)
        {
            bereinigt.AddModelError(AnfrageSchluessel, "Die Anfrage enthält kein gültiges JSON.");
        }

        var problem = context.HttpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>()
            .CreateValidationProblemDetails(
                context.HttpContext, bereinigt, StatusCodes.Status400BadRequest, title: "Eingaben ungültig");

        return new BadRequestObjectResult(problem) { ContentTypes = { "application/problem+json" } };
    }

    /// <summary>
    /// Kein gültiges JSON (z. B. abgeschnitten): Der Leser scheitert, nicht die Umwandlung eines Werts. Dann gilt der
    /// Fehler der ganzen Anfrage (<c>errors.anfrage</c>), nicht dem Feld, an dem der Leser stand (coin-ausgaben AK-7).
    /// Umwandlungsfehler (Text statt Zahl, ungültiges Datum) tragen eine Nicht-JSON-Ausnahme als Ursache.
    /// </summary>
    private static bool IstSyntaxfehler(Exception? fehler) =>
        fehler is JsonException { InnerException: null or JsonException };

    /// <summary>
    /// <c>$.auflage</c> → <c>auflage</c>; Query-Parameter (<c>Seite</c>, <c>benutzerId</c>) → camelCase;
    /// JSON-Wurzel (<c>$</c>) und Body-Parametername (<c>request</c>) → <c>null</c>.
    /// </summary>
    private static string? Feldname(string schluessel)
    {
        if (!schluessel.StartsWith("$.", StringComparison.Ordinal))
        {
            return schluessel.Length > 0 && schluessel != BodyParameter && schluessel.All(char.IsAsciiLetterOrDigit)
                ? char.ToLowerInvariant(schluessel[0]) + schluessel[1..]
                : null;
        }

        var pfad = schluessel[2..];
        var ende = pfad.IndexOfAny(['.', '[']);
        var feld = ende >= 0 ? pfad[..ende] : pfad;
        return feld.Length == 0 ? null : char.ToLowerInvariant(feld[0]) + feld[1..];
    }
}
