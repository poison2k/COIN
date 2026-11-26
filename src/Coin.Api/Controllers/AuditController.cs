using Coin.Api.Contracts;
using Coin.Api.Http;
using Coin.Domain.Benutzer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Coin.Api.Controllers;

/// <summary>
/// Audit-Log der Rollen- und Statusänderungen (AK-14, ADR-0017, ADR-0045). Nur lesend, nur mit <c>audit.read</c>;
/// keine E-Mails.
/// </summary>
[ApiController]
[Route("api/audit")]
[Authorize(Policy = Berechtigungen.AuditRead)]
[KeinCache]
public sealed class AuditController(BenutzerverwaltungService service) : ControllerBase
{
    /// <summary>
    /// Seite des Audit-Logs. <c>von</c>, <c>bis</c> und <c>aktion</c> werden als Zeichenketten gebunden, damit die
    /// Domain Format und Mehrfachangaben prüft (deutsche Meldungen, ADR-0045).
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<SeiteResponse<AuditEintragResponse>>> Lesen(
        [FromQuery] string[]? von,
        [FromQuery] string[]? bis,
        [FromQuery] string[]? aktion,
        [FromQuery] Guid? benutzerId,
        [FromQuery] int? seite,
        [FromQuery] int? groesse,
        CancellationToken ct)
    {
        var ergebnis = await service.AuditLesenAsync(
            von: von, bis: bis, aktion: aktion, benutzerId: benutzerId, seite: seite, groesse: groesse, ct: ct);
        return ergebnis.IstErfolgreich
            ? Ok(SeiteResponse<AuditEintragResponse>.Aus(ergebnis.Wert!, AuditEintragResponse.Aus))
            : this.Validierungsfehler(ergebnis.Fehler);
    }

    /// <summary>Aktionstypen für den Filter (nacharbeiten-audit-filter 4.2), in Enum-Reihenfolge.</summary>
    [HttpGet("aktionen")]
    public ActionResult<IReadOnlyList<AuditAktionResponse>> Aktionen() => Ok(AuditAktionResponse.Alle());
}
