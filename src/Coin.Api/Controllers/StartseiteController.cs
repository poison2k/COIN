using Coin.Api.Authentifizierung;
using Coin.Api.Contracts;
using Coin.Api.Http;
using Coin.Domain.Benutzer;
using Coin.Domain.Katalog;
using Coin.Domain.Startseite;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace Coin.Api.Controllers;

/// <summary>
/// Startseite (Feature startseite Abschnitt 5, ADR-0030 bis ADR-0032). Kopfbereich und Logos sind öffentlich und
/// tokenunabhängig (<c>[AllowAnonymous]</c>, Begründung ADR-0032 Punkt 1 und 2), die übrigen Blöcke verlangen
/// <see cref="Berechtigungen.CoinsRead"/>, die Konfiguration <see cref="Berechtigungen.StartpageManage"/>. Keine Logik
/// hier, nur Abbildung auf <see cref="StartseiteService"/>.
/// </summary>
[ApiController]
[Route("api/startseite")]
public sealed class StartseiteController(StartseiteService service, IAktuellerBenutzer aktuellerBenutzer) : ControllerBase
{
    /// <summary>Wie beim Motivbild: Kestrel-Grenze über der eigenen Grenze, damit die Aktion selbst mit 413 antwortet.</summary>
    private const long KestrelUploadLimitBytes = 32L * 1024 * 1024;

    private const string KonfigurationsTeil = "konfiguration";

    /// <summary>Höchstgröße des JSON-Teils (ADR-0030 Punkt 4).</summary>
    private const int MaxKonfigurationBytes = 64 * 1024;

    private static readonly FormularTeil[] Teile =
    [
        new(KonfigurationsTeil, IstDatei: false, MaxKonfigurationBytes),
        new(LogoPlatz.Bereitsteller.Feld(), IstDatei: true, LogoPruefung.MaxGroesseBytes),
        new(LogoPlatz.Software.Feld(), IstDatei: true, LogoPruefung.MaxGroesseBytes),
    ];

    [HttpGet]
    [Authorize(Policy = Berechtigungen.CoinsRead)]
    [KeinCache]
    public async Task<ActionResult<StartseiteResponse>> Startseite(CancellationToken ct) =>
        Ok(StartseiteResponse.Aus(await service.StartseiteAsync(ct)));

    /// <summary>Öffentlicher Kopfbereich (AK-37): kein Benutzerabgleich, gleiche Antwort für jedes Token.</summary>
    [HttpGet("kopf")]
    [AllowAnonymous]
    [KeinCache]
    public async Task<IActionResult> Kopf(CancellationToken ct) => Ok(KopfResponse.Aus(await service.KopfAsync(ct)));

    /// <summary>Öffentliches Logo (AK-12): gehärtete Auslieferung, Caching nach ADR-0032 Punkt 3.</summary>
    [HttpGet("logos/{platz}")]
    [AllowAnonymous]
    public async Task<IActionResult> Logo([FromRoute] string platz, [FromQuery(Name = "v")] string? version, CancellationToken ct)
    {
        if (await service.LogoAsync(platz, ct) is not { } logo)
        {
            return Problem(statusCode: StatusCodes.Status404NotFound, title: "Logo nicht gefunden");
        }

        var name = StartseiteNamen.PlatzAus(platz)!.Value.Name();
        var aktuell = logo.Sha256.Length >= StartseiteLogo.VersionsLaenge
            && string.Equals(version, logo.Sha256[..StartseiteLogo.VersionsLaenge], StringComparison.Ordinal);

        // Schutz gegen Interpretation als HTML/Skript (Polyglot-Dateien, ADR-0031 Punkt 4).
        var headers = Response.Headers;
        headers[HeaderNames.XContentTypeOptions] = "nosniff";
        headers[HeaderNames.ContentSecurityPolicy] = "default-src 'none'; sandbox";
        headers[HeaderNames.CacheControl] = aktuell ? "private, max-age=31536000, immutable" : "no-cache";
        headers[HeaderNames.ContentDisposition] = $"inline; filename=\"logo-{name}.{logo.Format.Dateiendung()}\"";

        // FileContentResult beantwortet passendes If-None-Match mit 304 ohne Body.
        return File(logo.Inhalt, logo.Format.ContentType(), lastModified: null, entityTag: new EntityTagHeaderValue($"\"{logo.Sha256}\""));
    }

    [HttpGet("konfiguration")]
    [Authorize(Policy = Berechtigungen.StartpageManage)]
    [KeinCache]
    public async Task<ActionResult<KonfigurationResponse>> Konfiguration(CancellationToken ct) =>
        Ok(KonfigurationResponse.Aus(await service.KonfigurationAsync(ct)));

    /// <summary>Speichert die Konfiguration als Ganzes (5.4) mit Prüfreihenfolge nach 5.1.</summary>
    [HttpPut("konfiguration")]
    [Authorize(Policy = Berechtigungen.StartpageManage)]
    [Inhaltstyp("multipart/form-data")]
    [RequestSizeLimit(KestrelUploadLimitBytes)]
    [FormularBindungDeaktivieren]
    [KeinCache]
    public async Task<ActionResult<KonfigurationResponse>> Speichern(CancellationToken ct)
    {
        MultipartFormularErgebnis.Formular formular;
        switch (await MultipartFormularLeser.LesenAsync(Request, Teile, ct))
        {
            case MultipartFormularErgebnis.Formular gelesen:
                formular = gelesen;
                break;
            case MultipartFormularErgebnis.ZuGross zuGross:
                return ZuGross(zuGross.Feld);
            case MultipartFormularErgebnis.Ungueltig ungueltig:
                return Fehler(MultipartFormularLeser.FeldAnfrage, ungueltig.Meldung);
            default:
                throw new InvalidOperationException("Unbekanntes Ergebnis beim Lesen des Formulars.");
        }

        if (formular.Teil(KonfigurationsTeil) is not { } json)
        {
            return Fehler(KonfigurationsTeil, "Die Konfiguration fehlt.");
        }

        if (KonfigurationsLeser.Lesen(json, formular.Teil(LogoPlatz.Bereitsteller.Feld()), formular.Teil(LogoPlatz.Software.Feld()))
            is not { } anfrage)
        {
            return Fehler(KonfigurationsTeil, "Die Konfiguration ist kein gültiges JSON.");
        }

        var akteur = await aktuellerBenutzer.LadenAsync(ct);
        return await service.SpeichernAsync(anfrage, akteur.Id, ct) switch
        {
            StartseiteSpeichernErgebnis.Gespeichert => Ok(KonfigurationResponse.Aus(await service.KonfigurationAsync(ct))),
            StartseiteSpeichernErgebnis.Ungueltig ungueltig => this.Validierungsfehler(ungueltig.Fehler),
            StartseiteSpeichernErgebnis.Konflikt => this.ProblemMitCode(
                StatusCodes.Status409Conflict,
                "Speichern nicht möglich",
                "Die Startseite wurde inzwischen geändert. Bitte die Seite neu laden.",
                "startseite_geaendert"),
            _ => throw new InvalidOperationException("Unbekanntes Ergebnis beim Speichern der Startseite."),
        };
    }

    private ActionResult Fehler(string feld, string meldung) =>
        this.Validierungsfehler(new Dictionary<string, string[]> { [feld] = [meldung] });

    private ObjectResult ZuGross(string feld)
    {
        var detail = feld == KonfigurationsTeil
            ? "Die Konfiguration ist zu groß."
            : StartseiteNamen.AllePlaetze.Where(p => p.Feld() == feld).Select(p => $"Das Logo {p.Genitiv()} darf höchstens 2 MB groß sein.")
                .FirstOrDefault() ?? "Die Anfrage ist zu groß. Logos dürfen höchstens 2 MB groß sein.";
        var problem = new ProblemDetails { Status = StatusCodes.Status413PayloadTooLarge, Title = "Datei zu groß", Detail = detail };
        problem.Extensions["code"] = "datei_zu_gross";
        problem.Extensions["feld"] = feld;
        return this.ProblemMitCode(problem);
    }
}
