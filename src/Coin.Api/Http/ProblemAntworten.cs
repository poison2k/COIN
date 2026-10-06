using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace Coin.Api.Http;

/// <summary>ProblemDetails-Antworten für Controller (ADR-0002), auch mit maschinenlesbarem <c>code</c>.</summary>
public static class ProblemAntworten
{
    /// <summary>400 ValidationProblem mit deutschen Meldungen je Feld (camelCase).</summary>
    public static ActionResult Validierungsfehler(this ControllerBase controller, IReadOnlyDictionary<string, string[]> fehler)
    {
        ArgumentNullException.ThrowIfNull(controller);
        ArgumentNullException.ThrowIfNull(fehler);

        // Eigenes Dictionary: ModelState vergleicht Schlüssel ohne Groß-/Kleinschreibung und behielte die Schreibweise
        // der Bindung (z. B. „Seite“ aus dem Query-Modell) statt des camelCase-Feldnamens.
        var modelState = new ModelStateDictionary();
        foreach (var (feld, meldungen) in fehler)
        {
            foreach (var meldung in meldungen)
            {
                modelState.AddModelError(feld, meldung);
            }
        }

        return controller.ValidationProblem(title: "Eingaben ungültig", modelStateDictionary: modelState);
    }

    /// <summary>ProblemDetails mit der Erweiterung <c>code</c>.</summary>
    public static ObjectResult ProblemMitCode(this ControllerBase controller, ProblemDetails problem)
    {
        ArgumentNullException.ThrowIfNull(controller);
        ArgumentNullException.ThrowIfNull(problem);

        var status = problem.Status ?? StatusCodes.Status500InternalServerError;
        var details = controller.ProblemDetailsFactory.CreateProblemDetails(
            controller.HttpContext, status, problem.Title, problem.Type, problem.Detail, problem.Instance);
        foreach (var (schluessel, wert) in problem.Extensions)
        {
            details.Extensions[schluessel] = wert;
        }

        return new ObjectResult(details) { StatusCode = status };
    }

    /// <summary>ProblemDetails mit Status, Titel, Detail und <c>code</c>.</summary>
    public static ObjectResult ProblemMitCode(this ControllerBase controller, int status, string titel, string detail, string code)
    {
        var problem = new ProblemDetails { Status = status, Title = titel, Detail = detail };
        problem.Extensions["code"] = code;
        return controller.ProblemMitCode(problem);
    }
}
