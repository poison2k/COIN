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

    public static IActionResult Erstellen(ActionContext context)
    {
        var bereinigt = new ModelStateDictionary();
        foreach (var (schluessel, eintrag) in context.ModelState)
        {
            if (eintrag.Errors.Count > 0 && Feldname(schluessel) is { } feld && !bereinigt.ContainsKey(feld))
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
    /// <c>$.auflage</c> → <c>auflage</c>; JSON-Wurzel (<c>$</c>) und Parametername (<c>request</c>) → <c>null</c>.
    /// </summary>
    private static string? Feldname(string schluessel)
    {
        if (!schluessel.StartsWith("$.", StringComparison.Ordinal))
        {
            return null;
        }

        var pfad = schluessel[2..];
        var ende = pfad.IndexOfAny(['.', '[']);
        var feld = ende >= 0 ? pfad[..ende] : pfad;
        return feld.Length == 0 ? null : char.ToLowerInvariant(feld[0]) + feld[1..];
    }
}
