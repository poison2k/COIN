using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;

namespace Coin.Api.Http;

/// <summary>Ein erlaubter Teil eines Formulars: Name, ob er eine Datei ist, und seine Größengrenze.</summary>
public sealed record FormularTeil(string Name, bool IstDatei, int MaxBytes);

/// <summary>Ergebnis von <see cref="MultipartFormularLeser.LesenAsync"/>.</summary>
public abstract record MultipartFormularErgebnis
{
    private MultipartFormularErgebnis()
    {
    }

    /// <summary>Gelesene Teile (jeder höchstens einmal); fehlende Teile fehlen im Wörterbuch.</summary>
    public sealed record Formular(IReadOnlyDictionary<string, byte[]> Teile) : MultipartFormularErgebnis
    {
        public byte[]? Teil(string name) => Teile.TryGetValue(name, out var inhalt) ? inhalt : null;

        public override string ToString() => nameof(Formular);
    }

    /// <summary>Request oder Teil größer als erlaubt (413); <see cref="Feld"/> = Teil oder <c>anfrage</c>.</summary>
    public sealed record ZuGross(string Feld) : MultipartFormularErgebnis;

    /// <summary>Formular fehlerhaft, abgeschnitten, mit unbekannten oder doppelten Teilen (400 <c>anfrage</c>).</summary>
    public sealed record Ungueltig(string Meldung) : MultipartFormularErgebnis;
}

/// <summary>
/// Liest ein multipart/form-data-Formular mit festen Teilen ohne <c>ReadFormAsync</c> (Feature startseite, ADR-0030
/// Punkt 4; Verallgemeinerung von <see cref="MultipartDateiLeser"/>). Grenzen: Request höchstens
/// <see cref="MaxRequestBytes"/>, je Teil die eigene Grenze, höchstens <see cref="MaxAbschnitte"/> Abschnitte. Unbekannte
/// oder doppelte Teile werden bis zum Ende mitgezählt (die Größengrenze greift zuerst) und dann abgelehnt. Inhalte,
/// Dateinamen und Ausnahmetexte werden nie protokolliert oder zurückgegeben.
/// </summary>
public static class MultipartFormularLeser
{
    public const int MaxRequestBytes = 6 * 1024 * 1024;

    public const int MaxAbschnitte = 16;

    public const string FeldAnfrage = "anfrage";

    public const string MeldungKeinMultipart = "Die Anfrage ist kein gültiges multipart/form-data.";
    public const string MeldungUnbekannteFelder = "Die Anfrage enthält unbekannte oder doppelte Formularfelder.";
    public const string MeldungNichtLesbar = "Die Anfrage konnte nicht gelesen werden.";

    private const int MaxBoundaryLaenge = 70; // RFC 2046

    public static async Task<MultipartFormularErgebnis> LesenAsync(
        HttpRequest request, IReadOnlyList<FormularTeil> erlaubt, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(erlaubt);

        if (request.ContentLength > MaxRequestBytes)
        {
            return new MultipartFormularErgebnis.ZuGross(FeldAnfrage);
        }

        if (!MediaTypeHeaderValue.TryParse(request.ContentType, out var contentType)
            || HeaderUtilities.RemoveQuotes(contentType.Boundary).Value is not { Length: > 0 and <= MaxBoundaryLaenge } boundary)
        {
            return new MultipartFormularErgebnis.Ungueltig(MeldungKeinMultipart);
        }

        var body = new BegrenzterLeseStream(request.Body, MaxRequestBytes);
        try
        {
            return await LesenAsync(new MultipartReader(boundary, body), erlaubt, ct);
        }
        catch (RequestZuGrossException)
        {
            return new MultipartFormularErgebnis.ZuGross(FeldAnfrage);
        }
        catch (BadHttpRequestException ex) when (ex.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            return new MultipartFormularErgebnis.ZuGross(FeldAnfrage);
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException && !request.HttpContext.RequestAborted.IsCancellationRequested)
        {
            // Abgeschnittener oder fehlerhafter Body (auch BadHttpRequestException, z. B. kaputtes Chunking).
            return new MultipartFormularErgebnis.Ungueltig(MeldungNichtLesbar);
        }
    }

    private static async Task<MultipartFormularErgebnis> LesenAsync(
        MultipartReader reader, IReadOnlyList<FormularTeil> erlaubt, CancellationToken ct)
    {
        var teile = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        var unzulaessig = false;
        var anzahl = 0;

        while (await reader.ReadNextSectionAsync(ct) is { } abschnitt)
        {
            if (++anzahl > MaxAbschnitte)
            {
                return new MultipartFormularErgebnis.Ungueltig(MeldungUnbekannteFelder);
            }

            var disposition = abschnitt.GetContentDispositionHeader();
            var name = disposition is null ? null : HeaderUtilities.RemoveQuotes(disposition.Name).Value;
            var teil = erlaubt.FirstOrDefault(t => string.Equals(t.Name, name, StringComparison.Ordinal));
            var passt = disposition is not null
                && disposition.DispositionType.Equals("form-data", StringComparison.OrdinalIgnoreCase)
                && teil is not null
                && disposition.IsFileDisposition() == teil.IstDatei
                && !teile.ContainsKey(teil.Name);

            if (!passt || unzulaessig)
            {
                // Weiterlesen, damit die Grenze des Requests vor dem Formfehler greift; der Inhalt wird verworfen.
                unzulaessig = true;
                await abschnitt.Body.CopyToAsync(Stream.Null, ct);
                continue;
            }

            var inhalt = await MultipartDateiLeser.DateiLesenAsync(abschnitt.Body, teil!.MaxBytes, ct);
            if (inhalt is null)
            {
                return new MultipartFormularErgebnis.ZuGross(teil.Name);
            }

            teile[teil.Name] = inhalt;
        }

        return unzulaessig
            ? new MultipartFormularErgebnis.Ungueltig(MeldungUnbekannteFelder)
            : new MultipartFormularErgebnis.Formular(teile);
    }
}
