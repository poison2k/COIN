using Coin.Api.Contracts;
using Coin.Api.Http;
using Coin.Domain.Katalog;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace Coin.Api.Controllers;

/// <summary>
/// Coin-Katalog. Aktionen bilden nur HTTP auf die Use Cases in <see cref="CoinKatalogService"/> ab (ADR-0001).
/// Pilot ohne Authentifizierung (ADR-0004); Policies werden später pro Aktion ergänzt.
/// </summary>
[ApiController]
[Route("api/coins")]
public sealed class CoinsController(CoinKatalogService service) : ControllerBase
{
    /// <summary>
    /// Hartes Request-Limit von Kestrel für den Bild-Upload. Bewusst über <see cref="MultipartDateiLeser.MaxRequestBytes"/>:
    /// Die Aktion lehnt selbst ab (413), Kestrel verwirft danach den ungelesenen Rest bis zu dieser Grenze
    /// (zeitlich begrenzt), statt die Verbindung ohne Antwort abzubrechen (AK-25).
    /// </summary>
    private const long KestrelUploadLimitBytes = 32L * 1024 * 1024;

    private const string DateiFeld = "datei";

    [HttpPost]
    [Consumes("application/json")]
    public async Task<ActionResult<CoinResponse>> Anlegen([FromBody] CoinAnlegenRequest request, CancellationToken ct)
    {
        var ergebnis = await service.AnlegenAsync(
            request.Name, request.Herausgeber, request.Auflage, request.Beschreibung, ct);

        return ergebnis switch
        {
            CoinAnlegenErgebnis.Angelegt angelegt =>
                CreatedAtAction(nameof(Finden), new { id = angelegt.Coin.Id }, CoinResponse.Aus(angelegt.Coin)),
            CoinAnlegenErgebnis.Ungueltig ungueltig => Validierungsfehler(ungueltig.Fehler),
            CoinAnlegenErgebnis.Duplikat => Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Coin existiert bereits",
                detail: "Ein Coin mit diesem Namen und Herausgeber existiert bereits."),
            _ => throw new InvalidOperationException("Unbekanntes Ergebnis beim Anlegen."),
        };
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CoinResponse>>> Auflisten(CancellationToken ct)
    {
        var coins = await service.AuflistenAsync(ct);
        return Ok(coins.Select(CoinResponse.Aus));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<CoinResponse>> Finden(Guid id, CancellationToken ct)
    {
        var coin = await service.FindenAsync(id, ct);
        return coin is null ? CoinNichtGefunden() : Ok(CoinResponse.Aus(coin));
    }

    [HttpPut("{id:guid}/bild")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(KestrelUploadLimitBytes)]
    [FormularBindungDeaktivieren]
    public async Task<ActionResult<CoinResponse>> BildHochladen([FromRoute] Guid id, CancellationToken ct)
    {
        byte[] inhalt;
        switch (await MultipartDateiLeser.LesenAsync(Request, DateiFeld, ct))
        {
            case MultipartDateiErgebnis.Datei datei:
                inhalt = datei.Inhalt;
                break;
            case MultipartDateiErgebnis.ZuGross:
                return BildZuGross();
            case MultipartDateiErgebnis.Ungueltig ungueltig:
                return DateiFehler(ungueltig.Meldung);
            default:
                throw new InvalidOperationException("Unbekanntes Ergebnis beim Lesen des Formulars.");
        }

        var ergebnis = await service.BildHochladenAsync(id, inhalt, ct);
        return ergebnis switch
        {
            BildHochladenErgebnis.Gespeichert gespeichert => Ok(CoinResponse.Aus(gespeichert.Coin)),
            BildHochladenErgebnis.CoinNichtGefunden => CoinNichtGefunden(),
            BildHochladenErgebnis.Leer => DateiFehler("Die Datei ist leer."),
            BildHochladenErgebnis.ZuGross => BildZuGross(),
            BildHochladenErgebnis.FormatNichtUnterstuetzt => Problem(
                statusCode: StatusCodes.Status415UnsupportedMediaType,
                title: "Bildformat nicht unterstützt",
                detail: "Nur JPEG, PNG oder WebP erlaubt."),
            _ => throw new InvalidOperationException("Unbekanntes Ergebnis beim Bild-Upload."),
        };
    }

    [HttpGet("{id:guid}/bild")]
    public async Task<IActionResult> BildAbrufen(Guid id, CancellationToken ct)
    {
        // Der Query-Parameter v dient nur dem Cache-Busting und wird ignoriert.
        var bild = await service.BildLadenAsync(id, ct);
        if (bild is null)
        {
            return Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Bild nicht gefunden",
                detail: "Für diesen Coin ist kein Motivbild vorhanden.");
        }

        // Schutz gegen Interpretation als HTML/Skript (Polyglot-Dateien), siehe Entwurf Abschnitt 8.
        var headers = Response.Headers;
        headers[HeaderNames.XContentTypeOptions] = "nosniff";
        headers[HeaderNames.ContentSecurityPolicy] = "default-src 'none'; sandbox";
        headers[HeaderNames.CacheControl] = "private, max-age=31536000, immutable";
        headers[HeaderNames.ContentDisposition] = $"inline; filename=\"coin-{id}.{bild.Format.Dateiendung()}\"";

        // FileContentResult beantwortet passendes If-None-Match mit 304 ohne Body.
        return File(
            bild.Inhalt,
            bild.Format.ContentType(),
            lastModified: null,
            entityTag: new EntityTagHeaderValue($"\"{bild.Sha256}\""));
    }

    private ActionResult Validierungsfehler(IReadOnlyDictionary<string, string[]> fehler)
    {
        foreach (var (feld, meldungen) in fehler)
        {
            foreach (var meldung in meldungen)
            {
                ModelState.AddModelError(feld, meldung);
            }
        }

        return ValidationProblem(title: "Eingaben ungültig", modelStateDictionary: ModelState);
    }

    private ActionResult DateiFehler(string meldung) =>
        Validierungsfehler(new Dictionary<string, string[]> { [DateiFeld] = [meldung] });

    private ObjectResult BildZuGross() => Problem(
        statusCode: StatusCodes.Status413PayloadTooLarge,
        title: "Bild zu groß",
        detail: "Das Bild darf höchstens 5 MB groß sein.");

    private ObjectResult CoinNichtGefunden() => Problem(
        statusCode: StatusCodes.Status404NotFound,
        title: "Coin nicht gefunden");
}
