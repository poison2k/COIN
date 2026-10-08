using Coin.Api.Authentifizierung;
using Coin.Api.Contracts;
using Coin.Api.Http;
using Coin.Domain.Ausgaben;
using Coin.Domain.Benutzer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coin.Api.Controllers;

/// <summary>
/// Ausgaben eines Coins (coin-ausgaben AK-6 bis AK-14): Historie lesen (<c>issues.read</c>), erfassen und stornieren
/// (<c>issues.write</c>). Antworten enthalten Personendaten und werden nicht zwischengespeichert. Keine Logik hier,
/// nur Abbildung auf <see cref="AusgabeService"/>.
/// </summary>
[ApiController]
[Route("api/coins/{id:guid}/ausgaben")]
[KeinCache]
public sealed class AusgabenController(AusgabeService service, IAktuellerBenutzer aktuellerBenutzer) : ControllerBase
{
    private const string KonfliktTitel = "Ausgabe nicht möglich";

    [HttpGet]
    [Authorize(Policy = Berechtigungen.IssuesRead)]
    public async Task<ActionResult<SeiteResponse<AusgabeResponse>>> Auflisten(
        [FromRoute] Guid id, [FromQuery] StatusSeiteAnfrage anfrage, CancellationToken ct)
    {
        return await service.HistorieAsync(id, anfrage.Status, anfrage.Seite, anfrage.Groesse, ct) switch
        {
            AbfrageErgebnis<Domain.Gemeinsam.Seite<AusgabeEintrag>>.Gefunden gefunden => Ok(AusgabeResponse.Seite(gefunden.Wert)),
            AbfrageErgebnis<Domain.Gemeinsam.Seite<AusgabeEintrag>>.Ungueltig ungueltig => this.Validierungsfehler(ungueltig.Fehler),
            AbfrageErgebnis<Domain.Gemeinsam.Seite<AusgabeEintrag>>.CoinNichtGefunden => CoinNichtGefunden(),
            _ => throw new InvalidOperationException("Unbekanntes Ergebnis der Historie."),
        };
    }

    [HttpPost]
    [Authorize(Policy = Berechtigungen.IssuesWrite)]
    [Inhaltstyp("application/json")]
    public async Task<ActionResult<AusgabeResponse>> Erfassen(
        [FromRoute] Guid id, [FromBody] AusgabeErfassenRequest request, CancellationToken ct)
    {
        var akteur = await aktuellerBenutzer.LadenAsync(ct);
        return await service.ErfassenAsync(id, request.ExemplarNummer, request.Eingabe(), akteur.Id, ct) switch
        {
            AusgabeErfassenErgebnis.Erfasst erfasst =>
                StatusCode(StatusCodes.Status201Created, AusgabeResponse.Aus(erfasst.Ausgabe)),
            AusgabeErfassenErgebnis.Ungueltig ungueltig => this.Validierungsfehler(ungueltig.Fehler),
            AusgabeErfassenErgebnis.CoinNichtGefunden => CoinNichtGefunden(),
            AusgabeErfassenErgebnis.AuflageUnbekannt => Konflikt(
                "auflage_unbekannt",
                "Für diesen Coin ist keine Auflage erfasst. Ausgaben sind erst nach dem Festlegen der Auflage möglich."),
            AusgabeErfassenErgebnis.ExemplarAusgegeben ausgegeben => Konflikt(
                "exemplar_ausgegeben", $"Exemplar Nr. {ausgegeben.Nummer} ist bereits ausgegeben."),
            AusgabeErfassenErgebnis.KeinExemplarFrei => Konflikt(
                "kein_exemplar_frei", "Alle Exemplare dieses Coins sind ausgegeben."),
            _ => throw new InvalidOperationException("Unbekanntes Ergebnis beim Erfassen."),
        };
    }

    [HttpPost("{ausgabeId:guid}/storno")]
    [Authorize(Policy = Berechtigungen.IssuesWrite)]
    [Inhaltstyp("application/json")]
    public async Task<ActionResult<AusgabeResponse>> Stornieren(
        [FromRoute] Guid id, [FromRoute] Guid ausgabeId, [FromBody] AusgabeStornierenRequest request, CancellationToken ct)
    {
        var akteur = await aktuellerBenutzer.LadenAsync(ct);
        return await service.StornierenAsync(id, ausgabeId, request.Grund, akteur.Id, ct) switch
        {
            AusgabeStornierenErgebnis.Storniert storniert => Ok(AusgabeResponse.Aus(storniert.Ausgabe)),
            AusgabeStornierenErgebnis.Ungueltig ungueltig => this.Validierungsfehler(ungueltig.Fehler),
            AusgabeStornierenErgebnis.NichtGefunden => Problem(
                statusCode: StatusCodes.Status404NotFound, title: "Ausgabe nicht gefunden"),
            AusgabeStornierenErgebnis.BereitsStorniert => this.ProblemMitCode(
                StatusCodes.Status409Conflict, "Storno nicht möglich", "Diese Ausgabe ist bereits storniert.", "bereits_storniert"),
            _ => throw new InvalidOperationException("Unbekanntes Ergebnis beim Stornieren."),
        };
    }

    private ObjectResult Konflikt(string code, string detail) =>
        this.ProblemMitCode(StatusCodes.Status409Conflict, KonfliktTitel, detail, code);

    private ObjectResult CoinNichtGefunden() =>
        Problem(statusCode: StatusCodes.Status404NotFound, title: "Coin nicht gefunden");
}
