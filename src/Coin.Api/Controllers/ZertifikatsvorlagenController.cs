using Coin.Api.Authentifizierung;
using Coin.Api.Contracts;
using Coin.Api.Http;
using Coin.Domain.Benutzer;
using Coin.Domain.Vorlagen;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace Coin.Api.Controllers;

/// <summary>
/// Zertifikatsvorlagen (zertifikatsvorlagen Abschnitt 5.1, ADR-0022 bis ADR-0024): Standardvorlage, Status, Downloads,
/// Upload und Zurücksetzen. Alle Aktionen verlangen <see cref="Berechtigungen.CoinsWrite"/> und werden nicht
/// zwischengespeichert. Keine Logik hier, nur Abbildung auf <see cref="ZertifikatsvorlageService"/>.
/// </summary>
[ApiController]
[KeinCache]
[Authorize(Policy = Berechtigungen.CoinsWrite)]
public sealed class ZertifikatsvorlagenController(ZertifikatsvorlageService service, IAktuellerBenutzer aktuellerBenutzer) : ControllerBase
{
    /// <summary>Wie beim Motivbild: Kestrel-Grenze über der eigenen Grenze, damit die Aktion selbst mit 413 antwortet.</summary>
    private const long KestrelUploadLimitBytes = 32L * 1024 * 1024;

    private const string DocxContentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private const string DateiFeld = "datei";
    private const string CoinRoute = "/api/coins/{id:guid}/zertifikatsvorlage";

    [HttpGet("/api/zertifikatsvorlagen/standard")]
    public IActionResult Standard() => Download(service.Standardvorlage(), "zertifikatsvorlage-standard.docx");

    [HttpGet(CoinRoute)]
    public async Task<ActionResult<VorlagenStatusResponse>> Status([FromRoute] Guid id, CancellationToken ct)
    {
        var status = await service.StatusAsync(id, ct);
        return status is null ? CoinNichtGefunden() : Ok(VorlagenStatusResponse.Aus(status));
    }

    [HttpGet(CoinRoute + "/datei")]
    public async Task<IActionResult> AktiveDatei([FromRoute] Guid id, CancellationToken ct) =>
        Datei(id, await service.AktiveDateiAsync(id, ct));

    [HttpGet(CoinRoute + "/versionen/{version:int}/datei")]
    public async Task<IActionResult> VersionDatei([FromRoute] Guid id, [FromRoute] int version, CancellationToken ct) =>
        Datei(id, await service.VersionDateiAsync(id, version, ct));

    [HttpPost(CoinRoute + "/versionen")]
    [Inhaltstyp("multipart/form-data")]
    [RequestSizeLimit(KestrelUploadLimitBytes)]
    [FormularBindungDeaktivieren]
    public async Task<ActionResult<VorlagenStatusResponse>> Hochladen([FromRoute] Guid id, CancellationToken ct)
    {
        byte[] inhalt;
        switch (await MultipartDateiLeser.LesenAsync(Request, DateiFeld, VorlagenAufbereitung.MaxGroesseBytes, ct))
        {
            case MultipartDateiErgebnis.Datei datei:
                inhalt = datei.Inhalt;
                break;
            case MultipartDateiErgebnis.ZuGross:
                return VorlageZuGross();
            case MultipartDateiErgebnis.Ungueltig ungueltig:
                return DateiFehler(ungueltig.Meldung);
            default:
                throw new InvalidOperationException("Unbekanntes Ergebnis beim Lesen des Formulars.");
        }

        var akteur = await aktuellerBenutzer.LadenAsync(ct);
        return await service.HochladenAsync(id, inhalt, akteur.Id, ct) switch
        {
            // Bewusst ohne Location: Die Version hat keinen eigenen Lese-Endpunkt außer dem Download.
            VorlageHochladenErgebnis.Gespeichert gespeichert =>
                StatusCode(StatusCodes.Status201Created, VorlagenStatusResponse.Aus(gespeichert.Status)),
            VorlageHochladenErgebnis.CoinNichtGefunden => CoinNichtGefunden(),
            VorlageHochladenErgebnis.Leer => DateiFehler("Die Datei ist leer."),
            VorlageHochladenErgebnis.ZuGross => VorlageZuGross(),
            VorlageHochladenErgebnis.Abgelehnt abgelehnt => DateiFehler([.. abgelehnt.Meldungen]),
            _ => throw new InvalidOperationException("Unbekanntes Ergebnis beim Upload der Vorlage."),
        };
    }

    /// <summary>Ohne Body und ohne <c>[Inhaltstyp]</c>: ein mitgesendeter Body wird nicht gelesen (ADR-0023 Punkt 6).</summary>
    [HttpPost(CoinRoute + "/zuruecksetzen")]
    public async Task<ActionResult<VorlagenStatusResponse>> Zuruecksetzen([FromRoute] Guid id, CancellationToken ct)
    {
        var akteur = await aktuellerBenutzer.LadenAsync(ct);
        var status = await service.ZuruecksetzenAsync(id, akteur.Id, ct);
        return status is null ? CoinNichtGefunden() : Ok(VorlagenStatusResponse.Aus(status));
    }

    private IActionResult Datei(Guid coinId, VorlageDateiErgebnis ergebnis) => ergebnis switch
    {
        VorlageDateiErgebnis.Datei datei => Download(
            datei.Inhalt,
            datei.Version is { } version ? $"zertifikatsvorlage-{coinId}-v{version}.docx" : $"zertifikatsvorlage-{coinId}-standard.docx"),
        VorlageDateiErgebnis.CoinNichtGefunden => CoinNichtGefunden(),
        VorlageDateiErgebnis.VorlageNichtGefunden => Problem(statusCode: StatusCodes.Status404NotFound, title: "Vorlage nicht gefunden"),
        _ => throw new InvalidOperationException("Unbekanntes Ergebnis beim Download."),
    };

    /// <summary>Download-Härtung (AK-6, ADR-0024 Punkt 4): nie inline, kein Sniffing, Sandbox; Name nur aus ASCII ohne Eingaben.</summary>
    private FileContentResult Download(byte[] inhalt, string dateiname)
    {
        var headers = Response.Headers;
        headers[HeaderNames.XContentTypeOptions] = "nosniff";
        headers[HeaderNames.ContentSecurityPolicy] = "default-src 'none'; sandbox";
        headers[HeaderNames.ContentDisposition] = $"attachment; filename=\"{dateiname}\"";
        return File(inhalt, DocxContentType);
    }

    private ActionResult DateiFehler(params string[] meldungen) =>
        this.Validierungsfehler(new Dictionary<string, string[]> { [DateiFeld] = meldungen });

    private ObjectResult VorlageZuGross() => Problem(
        statusCode: StatusCodes.Status413PayloadTooLarge,
        title: "Vorlage zu groß",
        detail: "Die Vorlage darf höchstens 5 MB groß sein.");

    private ObjectResult CoinNichtGefunden() =>
        Problem(statusCode: StatusCodes.Status404NotFound, title: "Coin nicht gefunden");
}
