using System.Text;

namespace Coin.Infrastructure.Vorlagen;

/// <summary>
/// Teilnamen-Normalform (zertifikatsvorlagen AK-10 H1, ADR-0024 Punkt 1.5): die einzige Stelle, an der Teilnamen für
/// Vergleiche aufbereitet werden – ZIP-Eintragsnamen, <c>PartName</c>-Werte und aufgelöste Beziehungsziele laufen durch
/// dieselbe Funktion. Jede <c>%XX</c>-Folge wird dekodiert, die Bytes als UTF-8 gelesen und kanonisch neu kodiert (große
/// Hex-Ziffern); verglichen wird danach ohne Groß-/Kleinschreibung (<see cref="Vergleich"/>). Intern werden Teilnamen ohne
/// führenden Schrägstrich geführt. Ungültige Namen ergeben <c>null</c> (→ „kein .docx“).
/// </summary>
internal static class Teilname
{
    /// <summary>Vergleich zweier Normalformen (reines ASCII, daher ordinal ohne Groß-/Kleinschreibung).</summary>
    public static readonly StringComparer Vergleich = StringComparer.OrdinalIgnoreCase;

    /// <summary>
    /// Zeichen, die in der Normalform nicht kodiert werden (außer ASCII-Buchstaben und -Ziffern). <c>[</c> und <c>]</c>
    /// bleiben ebenfalls unkodiert, damit <c>[Content_Types].xml</c> seine eigene Normalform ist; an der Gleichheit von
    /// Namen ändert das nichts, weil jede Schreibweise (roh oder kodiert) auf dieselbe Normalform abgebildet wird.
    /// </summary>
    private const string Unkodiert = "-._~!$&'()*+,;=@[]";

    private static readonly UTF8Encoding Streng = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

    /// <summary>
    /// Normalform eines Paketpfads (z. B. ZIP-Eintragsname <c>word/media/ä.png</c> → <c>word/media/%C3%A4.png</c>).
    /// <c>null</c> bei leerem Segment (auch führendem oder doppeltem Schrägstrich), <c>\</c>, ungültiger <c>%</c>-Folge,
    /// ungültigem UTF-8, kodiertem <c>/</c> oder <c>\</c>, <c>:</c> im dekodierten Namen (Rev. 7) und Segmenten, die
    /// <c>.</c> oder <c>..</c> ergeben.
    /// </summary>
    public static string? Normalisieren(string pfad)
    {
        var segmente = pfad.Split('/');
        var ergebnis = new string[segmente.Length];
        for (var i = 0; i < segmente.Length; i++)
        {
            if (Segment(segmente[i]) is not { } segment)
            {
                return null;
            }

            ergebnis[i] = segment;
        }

        return string.Join('/', ergebnis);
    }

    /// <summary>
    /// Normalform eines ZIP-Eintragsnamens; Verzeichniseinträge (Endung <c>/</c>) behalten den Schrägstrich am Ende.
    /// </summary>
    public static string? EintragNormalisieren(string name) =>
        name.EndsWith('/') ? (name.Length > 1 && Normalisieren(name[..^1]) is { } verzeichnis ? verzeichnis + "/" : null) : Normalisieren(name);

    /// <summary>
    /// Löst ein internes Beziehungsziel gegen den Ordner des Quellteils auf (Quelle „“ = Paketstamm; ein Ziel mit
    /// führendem <c>/</c> gilt ab Paketstamm), Segmente <c>.</c> und <c>..</c> zuerst, dann <see cref="Normalisieren"/>.
    /// <c>null</c> bei <c>..</c> über den Paketstamm hinaus, leerem Segment oder ungültiger Kodierung.
    /// </summary>
    public static string? Aufloesen(string quelle, string ziel)
    {
        var absolut = ziel.StartsWith('/');
        var segmente = new List<string>();
        if (!absolut && quelle.Length > 0)
        {
            segmente.AddRange(quelle.Split('/')[..^1]);
        }

        foreach (var teil in (absolut ? ziel[1..] : ziel).Split('/'))
        {
            switch (teil)
            {
                case "":
                    return null;
                case ".":
                    continue;
                case "..":
                    if (segmente.Count == 0)
                    {
                        return null;
                    }

                    segmente.RemoveAt(segmente.Count - 1);
                    continue;
                default:
                    segmente.Add(teil);
                    break;
            }
        }

        return segmente.Count == 0 ? null : Normalisieren(string.Join('/', segmente));
    }

    /// <summary>Normalform eines einzelnen Segments (auch für Endungen in <c>Default</c>-Einträgen).</summary>
    public static string? Segment(string segment)
    {
        if (segment.Length == 0 || segment.Contains('\\', StringComparison.Ordinal))
        {
            return null;
        }

        var bytes = new List<byte>(segment.Length);
        var i = 0;
        while (i < segment.Length)
        {
            if (segment[i] == '%')
            {
                if (i + 2 >= segment.Length || HexWert(segment[i + 1]) is not { } hoch || HexWert(segment[i + 2]) is not { } tief)
                {
                    return null;
                }

                var wert = (byte)((hoch << 4) | tief);
                if (wert is (byte)'/' or (byte)'\\')
                {
                    return null;
                }

                bytes.Add(wert);
                i += 3;
                continue;
            }

            var ende = segment.IndexOf('%', i);
            if (ende < 0)
            {
                ende = segment.Length;
            }

            try
            {
                bytes.AddRange(Streng.GetBytes(segment, i, ende - i));
            }
            catch (EncoderFallbackException)
            {
                return null;
            }

            i = ende;
        }

        // Rev. 7 (Hinweis a, A27): „:“ im dekodierten Namen (roh, %3A oder %3a) – Word öffnet solche Teile nicht, und
        // „:“ ist von einem Schema nicht sicher zu unterscheiden.
        if (bytes.Contains((byte)':'))
        {
            return null;
        }

        var roh = bytes.ToArray();
        try
        {
            if (Streng.GetString(roh) is "." or "..")
            {
                return null;
            }
        }
        catch (DecoderFallbackException)
        {
            return null;
        }

        var kanonisch = new StringBuilder(roh.Length);
        foreach (var b in roh)
        {
            if (char.IsAsciiLetterOrDigit((char)b) || (b < 0x80 && Unkodiert.Contains((char)b, StringComparison.Ordinal)))
            {
                kanonisch.Append((char)b);
            }
            else
            {
                kanonisch.Append('%').Append(b.ToString("X2", System.Globalization.CultureInfo.InvariantCulture));
            }
        }

        return kanonisch.ToString();
    }

    private static int? HexWert(char zeichen) => zeichen switch
    {
        >= '0' and <= '9' => zeichen - '0',
        >= 'A' and <= 'F' => zeichen - 'A' + 10,
        >= 'a' and <= 'f' => zeichen - 'a' + 10,
        _ => null,
    };
}
