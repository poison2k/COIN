using System.Text.RegularExpressions;
using Coin.Api.Authentifizierung;
using Coin.Api.Http;
using Coin.Domain.Benutzer;
using Coin.Domain.Zertifikate;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coin.Api.Controllers;

/// <summary>
/// Zertifikat einer Ausgabe herunterladen (zertifikat-erzeugen AK-7, AK-18 bis AK-20; ADR-0028, ADR-0029). Verlangt
/// <see cref="Berechtigungen.IssuesWrite"/>, wird nicht zwischengespeichert, hat keinen Request-Body. Keine Logik hier,
/// nur Abbildung auf <see cref="ZertifikatService"/>.
/// </summary>
[ApiController]
[KeinCache]
public sealed partial class ZertifikateController(ZertifikatService service, IAktuellerBenutzer aktuellerBenutzer) : ControllerBase
{
    private const string KonfliktTitel = "Zertifikat nicht möglich";

    [GeneratedRegex("^C[0-9]{4,}-[0-9]{4,7}$")]
    private static partial Regex NummernMuster();

    [HttpGet("api/coins/{id:guid}/ausgaben/{ausgabeId:guid}/zertifikat")]
    [Authorize(Policy = Berechtigungen.IssuesWrite)]
    public async Task<IActionResult> Herunterladen([FromRoute] Guid id, [FromRoute] Guid ausgabeId, CancellationToken ct)
    {
        var akteur = await aktuellerBenutzer.LadenAsync(ct);
        return await service.HerunterladenAsync(id, ausgabeId, akteur.Id, ct) switch
        {
            ZertifikatHerunterladenErgebnis.Datei datei => this.Docx(datei.Inhalt, Dateiname(datei.Zertifikatsnummer)),
            ZertifikatHerunterladenErgebnis.NichtGefunden => Problem(
                statusCode: StatusCodes.Status404NotFound, title: "Ausgabe nicht gefunden"),
            ZertifikatHerunterladenErgebnis.Storniert => this.ProblemMitCode(
                StatusCodes.Status409Conflict,
                KonfliktTitel,
                "Für eine stornierte Ausgabe kann kein Zertifikat heruntergeladen werden.",
                "ausgabe_storniert"),
            ZertifikatHerunterladenErgebnis.ZuVielePlatzhalter => this.ProblemMitCode(
                StatusCodes.Status409Conflict,
                KonfliktTitel,
                $"Die aktive Vorlage enthält mehr als {PlatzhalterErsetzung.MaxVorkommen} Platzhalter. Bitte eine angepasste Vorlage hochladen.",
                "vorlage_zu_viele_platzhalter"),
            ZertifikatHerunterladenErgebnis.Fehlgeschlagen => this.ProblemMitCode(
                StatusCodes.Status500InternalServerError,
                KonfliktTitel,
                "Das Zertifikat konnte nicht erzeugt werden. Bitte später erneut versuchen.",
                "zertifikat_fehler"),
            _ => throw new InvalidOperationException("Unbekanntes Ergebnis beim Zertifikat-Download."),
        };
    }

    /// <summary><c>Zertifikat_C0042-0012.docx</c>; nur ASCII aus der gespeicherten Nummer, sonst <c>Zertifikat.docx</c>.</summary>
    private static string Dateiname(string nummer) =>
        NummernMuster().IsMatch(nummer) ? $"Zertifikat_{nummer}.docx" : "Zertifikat.docx";
}
