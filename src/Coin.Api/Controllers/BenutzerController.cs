using Coin.Api.Authentifizierung;
using Coin.Api.Contracts;
using Coin.Api.Http;
using Coin.Domain.Benutzer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coin.Api.Controllers;

/// <summary>
/// Benutzerverwaltung (AK-11 bis AK-13): auflisten, Rolle zuweisen, Status setzen. Nur mit <c>users.manage</c>.
/// Die Aktionen bilden nur HTTP auf <see cref="BenutzerverwaltungService"/> ab; die Schutzregeln liegen in der Domain.
/// Antworten enthalten Personendaten und werden nicht zwischengespeichert.
/// </summary>
[ApiController]
[Route("api/benutzer")]
[Authorize(Policy = Berechtigungen.UsersManage)]
[KeinCache]
public sealed class BenutzerController(BenutzerverwaltungService service, IAktuellerBenutzer aktuellerBenutzer) : ControllerBase
{
    private const string KonfliktTitel = "Änderung nicht möglich";
    private const string DetailEigenesKonto =
        "Sie können sich nicht selbst die Administratorrolle entziehen oder Ihr eigenes Konto deaktivieren.";
    private const string DetailLetzterAdministrator =
        "Der letzte aktive Administrator kann weder herabgestuft noch deaktiviert werden.";

    [HttpGet]
    public async Task<ActionResult<SeiteResponse<BenutzerEintragResponse>>> Auflisten(
        [FromQuery] BenutzerListeAnfrage anfrage, CancellationToken ct)
    {
        var ergebnis = await service.AuflistenAsync(anfrage.Suche, anfrage.Seite, anfrage.Groesse, ct);
        return ergebnis.IstErfolgreich
            ? Ok(SeiteResponse<BenutzerEintragResponse>.Aus(ergebnis.Wert!, BenutzerEintragResponse.Aus))
            : this.Validierungsfehler(ergebnis.Fehler);
    }

    [HttpPut("{id:guid}/rolle")]
    [Inhaltstyp("application/json")]
    public async Task<ActionResult<BenutzerEintragResponse>> RolleZuweisen(
        [FromRoute] Guid id, [FromBody] RolleZuweisenRequest request, CancellationToken ct)
    {
        if (!RolleText.TryParse(request.Rolle, out var rolle))
        {
            return this.Validierungsfehler(new Dictionary<string, string[]> { ["rolle"] = ["Bitte eine gültige Rolle wählen."] });
        }

        var akteur = await aktuellerBenutzer.LadenAsync(ct);
        return Abbilden(await service.RolleZuweisenAsync(akteur.Id, id, rolle, ct));
    }

    [HttpPut("{id:guid}/status")]
    [Inhaltstyp("application/json")]
    public async Task<ActionResult<BenutzerEintragResponse>> StatusSetzen(
        [FromRoute] Guid id, [FromBody] StatusSetzenRequest request, CancellationToken ct)
    {
        if (request.Aktiv is not { } aktiv)
        {
            return this.Validierungsfehler(new Dictionary<string, string[]> { ["aktiv"] = ["Bitte angeben, ob der Benutzer aktiv ist."] });
        }

        var akteur = await aktuellerBenutzer.LadenAsync(ct);
        return Abbilden(await service.StatusSetzenAsync(akteur.Id, id, aktiv, ct));
    }

    private ActionResult<BenutzerEintragResponse> Abbilden(AenderungErgebnis ergebnis) => ergebnis switch
    {
        AenderungErgebnis.Geaendert geaendert => Ok(BenutzerEintragResponse.Aus(geaendert.Benutzer)),
        AenderungErgebnis.Unveraendert unveraendert => Ok(BenutzerEintragResponse.Aus(unveraendert.Benutzer)),
        AenderungErgebnis.NichtGefunden => Problem(statusCode: StatusCodes.Status404NotFound, title: "Benutzer nicht gefunden"),
        // Akteur hat das Recht zwischen Autorisierung und Sperre verloren (ADR-0018 Punkt 1.3).
        AenderungErgebnis.AkteurNichtBerechtigt => this.ProblemMitCode(KeinZugriff.OhneBerechtigung(Berechtigungen.UsersManage)),
        AenderungErgebnis.EigenesKonto => this.ProblemMitCode(
            StatusCodes.Status409Conflict, KonfliktTitel, DetailEigenesKonto, "eigenes_konto"),
        AenderungErgebnis.LetzterAdministrator => this.ProblemMitCode(
            StatusCodes.Status409Conflict, KonfliktTitel, DetailLetzterAdministrator, "letzter_administrator"),
        _ => throw new InvalidOperationException("Unbekanntes Ergebnis der Benutzerverwaltung."),
    };
}
