using Coin.Api.Authentifizierung;
using Coin.Api.Contracts;
using Coin.Api.Http;
using Coin.Domain.Benutzer;
using Coin.Domain.Pruefung;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Coin.Api.Controllers;

/// <summary>
/// Prüfung einer Hologrammnummer (hologrammnummer AK-16 bis AK-21, ADR-0034): zwei Endpunkte mit je genau einer
/// Berechtigung und gleichem Request; nur <c>…/mit-empfaenger</c> liefert Empfängerdaten. Beide teilen die Policy
/// <see cref="Ratenbegrenzung.PolicyPruefung"/>. Keine Logik hier, nur Abbildung auf <see cref="PruefService"/>; keine
/// Log-Aufrufe mit Nummer, Coin oder Ergebnis.
/// </summary>
[ApiController]
[Route("api/pruefung")]
[KeinCache]
public sealed class PruefungController(PruefService service, IAktuellerBenutzer aktuellerBenutzer) : ControllerBase
{
    [HttpPost]
    [Authorize(Policy = Berechtigungen.CoinsRead)]
    [Inhaltstyp("application/json")]
    [EnableRateLimiting(Ratenbegrenzung.PolicyPruefung)]
    public async Task<ActionResult<PruefungResponse>> Pruefen([FromBody] PruefungRequest request, CancellationToken ct)
    {
        var akteur = await aktuellerBenutzer.LadenAsync(ct);
        return await service.PruefenAsync(request.Hologrammnummer, request.CoinId, mitEmpfaenger: false, akteur.Id, ct) switch
        {
            PruefenErgebnis.Geprueft geprueft => Ok(PruefungResponse.Aus(geprueft)),
            PruefenErgebnis.Ungueltig ungueltig => this.Validierungsfehler(ungueltig.Fehler),
            _ => throw new InvalidOperationException("Unbekanntes Ergebnis der Prüfung."),
        };
    }

    [HttpPost("mit-empfaenger")]
    [Authorize(Policy = Berechtigungen.IssuesRead)]
    [Inhaltstyp("application/json")]
    [EnableRateLimiting(Ratenbegrenzung.PolicyPruefung)]
    public async Task<ActionResult<PruefungMitEmpfaengerResponse>> PruefenMitEmpfaenger(
        [FromBody] PruefungRequest request, CancellationToken ct)
    {
        var akteur = await aktuellerBenutzer.LadenAsync(ct);
        return await service.PruefenAsync(request.Hologrammnummer, request.CoinId, mitEmpfaenger: true, akteur.Id, ct) switch
        {
            PruefenErgebnis.Geprueft geprueft => Ok(PruefungMitEmpfaengerResponse.Aus(geprueft)),
            PruefenErgebnis.Ungueltig ungueltig => this.Validierungsfehler(ungueltig.Fehler),
            _ => throw new InvalidOperationException("Unbekanntes Ergebnis der Prüfung."),
        };
    }
}
