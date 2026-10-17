using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace Coin.Api.Http;

/// <summary>
/// Gehärteter DOCX-Download (zertifikatsvorlagen AK-6, ADR-0024 Punkt 4; zertifikat-erzeugen AK-7): immer als Anhang,
/// kein Sniffing, CSP-Sandbox; der Dateiname besteht nur aus ASCII und enthält keine Eingaben. <c>Cache-Control:
/// no-store</c> setzt <see cref="KeinCacheAttribute"/> an der Aktion.
/// </summary>
public static class DateiDownload
{
    public const string DocxContentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    public static FileContentResult Docx(this ControllerBase controller, byte[] inhalt, string dateiname)
    {
        ArgumentNullException.ThrowIfNull(controller);
        ArgumentNullException.ThrowIfNull(inhalt);
        ArgumentNullException.ThrowIfNull(dateiname);
        if (dateiname.Length == 0 || dateiname.Any(z => z < ' ' || z > '~' || z is '"' or '\\' or '/'))
        {
            throw new ArgumentException("Der Dateiname muss aus druckbarem ASCII ohne Anführungszeichen bestehen.", nameof(dateiname));
        }

        var headers = controller.Response.Headers;
        headers[HeaderNames.XContentTypeOptions] = "nosniff";
        headers[HeaderNames.ContentSecurityPolicy] = "default-src 'none'; sandbox";
        headers[HeaderNames.ContentDisposition] = $"attachment; filename=\"{dateiname}\"";
        return controller.File(inhalt, DocxContentType);
    }
}
