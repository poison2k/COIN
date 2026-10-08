using Coin.Api.Contracts;
using Coin.Api.Http;
using Coin.Domain.Ausgaben;
using Coin.Domain.Benutzer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coin.Api.Controllers;

/// <summary>
/// Exemplare und Auflage eines Coins (coin-ausgaben AK-3, AK-17): Kennzahlen und Status lesen (<c>coins.read</c>,
/// ADR-0021) und die Auflage ändern (<c>coins.write</c>, F3). Antworten werden nicht zwischengespeichert.
/// </summary>
[ApiController]
[Route("api/coins/{id:guid}")]
[KeinCache]
public sealed class ExemplareController(AusgabeService service) : ControllerBase
{
    [HttpGet("exemplare")]
    [Authorize(Policy = Berechtigungen.CoinsRead)]
    public async Task<ActionResult<ExemplareResponse>> Auflisten(
        [FromRoute] Guid id, [FromQuery] StatusSeiteAnfrage anfrage, CancellationToken ct)
    {
        return await service.ExemplareAsync(id, anfrage.Status, anfrage.Seite, anfrage.Groesse, ct) switch
        {
            AbfrageErgebnis<ExemplarUebersicht>.Gefunden gefunden => Ok(ExemplareResponse.Aus(gefunden.Wert)),
            AbfrageErgebnis<ExemplarUebersicht>.Ungueltig ungueltig => this.Validierungsfehler(ungueltig.Fehler),
            AbfrageErgebnis<ExemplarUebersicht>.CoinNichtGefunden => CoinNichtGefunden(),
            _ => throw new InvalidOperationException("Unbekanntes Ergebnis der Exemplare."),
        };
    }

    [HttpPut("auflage")]
    [Authorize(Policy = Berechtigungen.CoinsWrite)]
    [Inhaltstyp("application/json")]
    public async Task<ActionResult<CoinResponse>> AuflageAendern(
        [FromRoute] Guid id, [FromBody] AuflageAendernRequest request, CancellationToken ct)
    {
        return await service.AuflageAendernAsync(id, request.Auflage, ct) switch
        {
            AuflageAendernErgebnis.Geaendert geaendert => Ok(CoinResponse.Aus(geaendert.Coin)),
            AuflageAendernErgebnis.Ungueltig ungueltig => this.Validierungsfehler(ungueltig.Fehler),
            AuflageAendernErgebnis.CoinNichtGefunden => CoinNichtGefunden(),
            AuflageAendernErgebnis.ZuKlein zuKlein => this.ProblemMitCode(
                StatusCodes.Status409Conflict,
                "Änderung nicht möglich",
                $"Die Auflage kann nicht unter {zuKlein.HoechsteAusgegebeneNummer} gesenkt werden, " +
                $"weil Exemplar Nr. {zuKlein.HoechsteAusgegebeneNummer} ausgegeben wurde.",
                "auflage_zu_klein"),
            _ => throw new InvalidOperationException("Unbekanntes Ergebnis beim Ändern der Auflage."),
        };
    }

    private ObjectResult CoinNichtGefunden() =>
        Problem(statusCode: StatusCodes.Status404NotFound, title: "Coin nicht gefunden");
}
