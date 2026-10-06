using Coin.Api.Contracts;
using Coin.Api.Http;
using Coin.Domain.Benutzer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coin.Api.Controllers;

/// <summary>
/// Audit-Log der Rollen- und Statusänderungen (AK-14, ADR-0017). Nur lesend, nur mit <c>audit.read</c>; keine E-Mails.
/// </summary>
[ApiController]
[Route("api/audit")]
[Authorize(Policy = Berechtigungen.AuditRead)]
[KeinCache]
public sealed class AuditController(BenutzerverwaltungService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<SeiteResponse<AuditEintragResponse>>> Lesen(
        [FromQuery] Guid? benutzerId, [FromQuery] int? seite, [FromQuery] int? groesse, CancellationToken ct)
    {
        var ergebnis = await service.AuditLesenAsync(benutzerId, seite, groesse, ct);
        return ergebnis.IstErfolgreich
            ? Ok(SeiteResponse<AuditEintragResponse>.Aus(ergebnis.Wert!, AuditEintragResponse.Aus))
            : this.Validierungsfehler(ergebnis.Fehler);
    }
}
