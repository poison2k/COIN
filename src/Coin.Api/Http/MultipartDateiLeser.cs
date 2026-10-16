using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;

namespace Coin.Api.Http;

/// <summary>Ergebnis von <see cref="MultipartDateiLeser.LesenAsync"/>.</summary>
public abstract record MultipartDateiErgebnis
{
    private MultipartDateiErgebnis()
    {
    }

    /// <summary>Genau eine Datei im erwarteten Feld; Inhalt höchstens so groß wie die übergebene Dateigrenze.</summary>
    public sealed record Datei(byte[] Inhalt) : MultipartDateiErgebnis;

    /// <summary>Datei oder Request größer als erlaubt (413).</summary>
    public sealed record ZuGross : MultipartDateiErgebnis;

    /// <summary>Formular fehlerhaft, abgeschnitten, ohne/mit mehreren Dateien oder über Struktur-Limits (400).</summary>
    public sealed record Ungueltig(string Meldung) : MultipartDateiErgebnis;
}

/// <summary>
/// Liest genau eine Datei aus einem multipart/form-data-Request, ohne <c>ReadFormAsync</c>.
/// Alle Limits werden hier selbst kontrolliert und als typisiertes Ergebnis gemeldet (AK-23, AK-25):
/// <list type="bullet">
/// <item>Request-Body höchstens <see cref="MaxRequestBytes"/> gelesen, danach <see cref="MultipartDateiErgebnis.ZuGross"/>.</item>
/// <item>Datei höchstens so groß wie die übergebene Dateigrenze (Bild, Vorlage), sonst <see cref="MultipartDateiErgebnis.ZuGross"/>.</item>
/// <item>Höchstens <see cref="MaxAbschnitte"/> Formularabschnitte, sonst <see cref="MultipartDateiErgebnis.Ungueltig"/>.</item>
/// </list>
/// Der Leser hört beim Überschreiten auf zu lesen; den ungelesenen Rest verwirft Kestrel nach der Antwort
/// begrenzt (Request-Limit der Aktion und Drain-Timeout), sodass der Client die 413-Antwort erhält.
/// </summary>
public static class MultipartDateiLeser
{
    /// <summary>Obergrenze der gelesenen Request-Bytes: Datei plus Overhead für Boundaries und Header.</summary>
    public const int MaxRequestBytes = 6 * 1024 * 1024;

    /// <summary>Höchstzahl der Formularabschnitte (auch Nicht-Datei-Felder).</summary>
    public const int MaxAbschnitte = 16;

    private const int MaxBoundaryLaenge = 70; // RFC 2046

    public static async Task<MultipartDateiErgebnis> LesenAsync(
        HttpRequest request, string feldname, int maxDateiBytes, CancellationToken ct)
    {
        if (request.ContentLength > MaxRequestBytes)
        {
            return new MultipartDateiErgebnis.ZuGross();
        }

        if (!MediaTypeHeaderValue.TryParse(request.ContentType, out var contentType)
            || HeaderUtilities.RemoveQuotes(contentType.Boundary).Value is not { Length: > 0 and <= MaxBoundaryLaenge } boundary)
        {
            return new MultipartDateiErgebnis.Ungueltig("Die Anfrage ist kein gültiges multipart/form-data.");
        }

        var body = new BegrenzterLeseStream(request.Body, MaxRequestBytes);
        try
        {
            return await LesenAsync(new MultipartReader(boundary, body), feldname, maxDateiBytes, ct);
        }
        catch (RequestZuGrossException)
        {
            return new MultipartDateiErgebnis.ZuGross();
        }
        catch (BadHttpRequestException ex) when (ex.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            return new MultipartDateiErgebnis.ZuGross();
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException && !request.HttpContext.RequestAborted.IsCancellationRequested)
        {
            // Abgeschnittener oder fehlerhafter Body (auch BadHttpRequestException, z. B. kaputtes Chunking).
            // Bei echtem Client-Abbruch wird die Ausnahme weitergereicht.
            return new MultipartDateiErgebnis.Ungueltig("Die Anfrage konnte nicht gelesen werden.");
        }
    }

    private static async Task<MultipartDateiErgebnis> LesenAsync(
        MultipartReader reader, string feldname, int maxDateiBytes, CancellationToken ct)
    {
        byte[]? inhalt = null;
        var anzahlDateien = 0;
        var anzahlAbschnitte = 0;

        while (await reader.ReadNextSectionAsync(ct) is { } abschnitt)
        {
            if (++anzahlAbschnitte > MaxAbschnitte)
            {
                return new MultipartDateiErgebnis.Ungueltig("Die Anfrage enthält zu viele Formularfelder.");
            }

            var disposition = abschnitt.GetContentDispositionHeader();
            var istGesuchteDatei = disposition is not null
                && disposition.IsFileDisposition()
                && string.Equals(HeaderUtilities.RemoveQuotes(disposition.Name).Value, feldname, StringComparison.Ordinal);

            if (!istGesuchteDatei)
            {
                // Andere Felder werden ignoriert; ihr Inhalt zählt aber zur Request-Grenze.
                await abschnitt.Body.CopyToAsync(Stream.Null, ct);
                continue;
            }

            if (++anzahlDateien > 1)
            {
                return new MultipartDateiErgebnis.Ungueltig("Bitte genau eine Datei im Feld „datei“ senden.");
            }

            inhalt = await DateiLesenAsync(abschnitt.Body, maxDateiBytes, ct);
            if (inhalt is null)
            {
                return new MultipartDateiErgebnis.ZuGross();
            }
        }

        return inhalt is null
            ? new MultipartDateiErgebnis.Ungueltig("Bitte genau eine Datei im Feld „datei“ senden.")
            : new MultipartDateiErgebnis.Datei(inhalt);
    }

    /// <summary>Liest die Datei; <c>null</c>, sobald sie größer als <paramref name="maxDateiBytes"/> ist.</summary>
    private static async Task<byte[]?> DateiLesenAsync(Stream quelle, int maxDateiBytes, CancellationToken ct)
    {
        using var ziel = new MemoryStream();
        var puffer = new byte[81_920];
        int gelesen;
        while ((gelesen = await quelle.ReadAsync(puffer, ct)) > 0)
        {
            if (ziel.Length + gelesen > maxDateiBytes)
            {
                return null;
            }

            ziel.Write(puffer, 0, gelesen);
        }

        return ziel.ToArray();
    }

    private sealed class RequestZuGrossException : Exception;

    /// <summary>Lese-Stream, der nach <c>maxBytes</c> gelesenen Bytes mit <see cref="RequestZuGrossException"/> abbricht.</summary>
    private sealed class BegrenzterLeseStream(Stream inner, long maxBytes) : Stream
    {
        private long _gelesen;

        public override bool CanRead => true;

        public override bool CanSeek => false;

        public override bool CanWrite => false;

        public override long Length => throw new NotSupportedException();

        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override int Read(byte[] buffer, int offset, int count) =>
            Zaehlen(inner.Read(buffer, offset, (int)Math.Min(count, Rest())));

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
            Zaehlen(await inner.ReadAsync(buffer[..(int)Math.Min(buffer.Length, Rest())], cancellationToken));

        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
            ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

        public override void Flush()
        {
        }

        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

        public override void SetLength(long value) => throw new NotSupportedException();

        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        /// <summary>Ein Byte mehr als erlaubt anfordern, um eine Überschreitung zu erkennen.</summary>
        private long Rest() => Math.Max(1, maxBytes - _gelesen + 1);

        private int Zaehlen(int gelesen)
        {
            _gelesen += gelesen;
            if (_gelesen > maxBytes)
            {
                throw new RequestZuGrossException();
            }

            return gelesen;
        }
    }
}
