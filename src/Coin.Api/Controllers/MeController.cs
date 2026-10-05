using Coin.Api.Authentifizierung;
using Coin.Api.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace Coin.Api.Controllers;

/// <summary>Der angemeldete Benutzer (AK-20). Nur angemeldet, keine Rolle nötig; gleicht den Benutzer ab (AK-13).</summary>
[ApiController]
[Route("api/me")]
[Authorize]
public sealed class MeController(IAktuellerBenutzer aktuellerBenutzer) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<MeResponse>> Abrufen(CancellationToken ct)
    {
        var benutzer = await aktuellerBenutzer.LadenAsync(ct);
        Response.Headers[HeaderNames.CacheControl] = "no-store";
        return Ok(MeResponse.Aus(benutzer));
    }
}
