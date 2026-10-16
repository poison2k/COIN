using System.Text;

namespace Coin.Infrastructure.Vorlagen;

/// <summary>
/// Linearer Vorlauf vor dem <see cref="System.Xml.XmlReader"/> (zertifikatsvorlagen AK-12, AK-13, Rev. 5 H2/H3,
/// ADR-0024 Punkt 1.4): dekodiert einen XML-Teil mit derselben Kodierungserkennung wie der <c>XmlReader</c> und findet
/// DOCTYPE-Deklarationen und Elemente mit zu vielen Attributen, ohne ein Start-Tag vollständig zu lesen. Der Vorlauf
/// entscheidet nur über diese beiden Befunde; Wohlgeformtheit prüft danach der <c>XmlReader</c>.
/// </summary>
internal static class XmlVorlauf
{
    private enum Ucs4
    {
        Be1234,
        Le4321,
        Ungewoehnlich2143,
        Ungewoehnlich3412,
    }

    /// <summary>
    /// Dekodiert wie der <c>XmlReader</c> (XML 1.0 Anhang F): Byte-Order-Mark oder die ersten Bytes von <c>&lt;</c>
    /// bestimmen UTF-8, UTF-16 (LE/BE) oder UCS-4 (alle vier Byte-Reihenfolgen); sonst gilt eine 8-Bit-Kodierung. Alle
    /// 8-Bit-Kodierungen, auf die eine <c>encoding</c>-Angabe den <c>XmlReader</c> umschalten kann (UTF-8, ASCII,
    /// ISO-8859-1), stimmen im ASCII-Bereich überein; für die Suche nach Markup genügt daher Latin-1.
    /// </summary>
    public static string Dekodieren(byte[] bytes)
    {
        ReadOnlySpan<byte> b = bytes;
        if (Beginnt(b, [0x00, 0x00, 0xFE, 0xFF]) || Beginnt(b, [0x00, 0x00, 0x00, 0x3C]))
        {
            return Ucs4Dekodieren(b, Ucs4.Be1234);
        }

        if (Beginnt(b, [0xFF, 0xFE, 0x00, 0x00]) || Beginnt(b, [0x3C, 0x00, 0x00, 0x00]))
        {
            return Ucs4Dekodieren(b, Ucs4.Le4321);
        }

        if (Beginnt(b, [0x00, 0x00, 0xFF, 0xFE]) || Beginnt(b, [0x00, 0x00, 0x3C, 0x00]))
        {
            return Ucs4Dekodieren(b, Ucs4.Ungewoehnlich2143);
        }

        if (Beginnt(b, [0xFE, 0xFF, 0x00, 0x00]) || Beginnt(b, [0x00, 0x3C, 0x00, 0x00]))
        {
            return Ucs4Dekodieren(b, Ucs4.Ungewoehnlich3412);
        }

        if (Beginnt(b, [0xFF, 0xFE]) || Beginnt(b, [0x3C, 0x00]))
        {
            return OhneBom(Encoding.Unicode.GetString(b));
        }

        if (Beginnt(b, [0xFE, 0xFF]) || Beginnt(b, [0x00, 0x3C]))
        {
            return OhneBom(Encoding.BigEndianUnicode.GetString(b));
        }

        if (Beginnt(b, [0xEF, 0xBB, 0xBF]))
        {
            b = b[3..];
        }

        return Encoding.Latin1.GetString(b);
    }

    private static bool Beginnt(ReadOnlySpan<byte> bytes, ReadOnlySpan<byte> anfang) => bytes.StartsWith(anfang);

    private static string OhneBom(string text) => text.Length > 0 && text[0] == '﻿' ? text[1..] : text;

    private static string Ucs4Dekodieren(ReadOnlySpan<byte> b, Ucs4 reihenfolge)
    {
        var text = new StringBuilder(b.Length / 4);
        for (var i = 0; i + 4 <= b.Length; i += 4)
        {
            var wert = reihenfolge switch
            {
                Ucs4.Be1234 => (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3],
                Ucs4.Le4321 => (b[i + 3] << 24) | (b[i + 2] << 16) | (b[i + 1] << 8) | b[i],
                Ucs4.Ungewoehnlich2143 => (b[i + 1] << 24) | (b[i] << 16) | (b[i + 3] << 8) | b[i + 2],
                _ => (b[i + 2] << 24) | (b[i + 3] << 16) | (b[i] << 8) | b[i + 1],
            };

            // Für die Suche nach Markup genügt der BMP-Bereich; alles andere wird zum Ersatzzeichen.
            text.Append(wert is (>= 0 and < 0xD800) or (> 0xDFFF and <= 0xFFFF) ? (char)wert : '�');
        }

        return OhneBom(text.ToString());
    }

    /// <summary>
    /// Durchläuft den Text einmal: <see cref="XmlStatus.Dtd"/> bei einer DOCTYPE-Deklaration,
    /// <see cref="XmlStatus.ZuVieleAttribute"/> beim ersten Element mit mehr als <paramref name="maxAttribute"/>
    /// Attributen (Namespace-Deklarationen zählen mit), sonst <c>null</c>. Kommentare, CDATA-Abschnitte und
    /// Verarbeitungsanweisungen werden übersprungen; bei unvollständigem Markup endet der Vorlauf ohne Befund.
    /// </summary>
    public static XmlStatus? Pruefen(string text, int maxAttribute)
    {
        var i = 0;
        while ((i = text.IndexOf('<', i)) >= 0)
        {
            var rest = text.AsSpan(i);
            int weiter;
            if (rest.StartsWith("<!--", StringComparison.Ordinal))
            {
                weiter = Hinter(text, "-->", i + 4);
            }
            else if (rest.StartsWith("<![CDATA[", StringComparison.Ordinal))
            {
                weiter = Hinter(text, "]]>", i + 9);
            }
            else if (rest.StartsWith("<!DOCTYPE", StringComparison.Ordinal))
            {
                return XmlStatus.Dtd;
            }
            else if (rest.StartsWith("<?", StringComparison.Ordinal))
            {
                weiter = Hinter(text, "?>", i + 2);
            }
            else if (rest.StartsWith("</", StringComparison.Ordinal) || rest.StartsWith("<!", StringComparison.Ordinal))
            {
                weiter = Hinter(text, ">", i + 2);
            }
            else
            {
                (weiter, var anzahl) = StartTag(text, i + 1, maxAttribute);
                if (anzahl > maxAttribute)
                {
                    return XmlStatus.ZuVieleAttribute;
                }
            }

            if (weiter < 0)
            {
                return null;
            }

            i = weiter;
        }

        return null;
    }

    private static int Hinter(string text, string ende, int ab)
    {
        var position = text.IndexOf(ende, ab, StringComparison.Ordinal);
        return position < 0 ? -1 : position + ende.Length;
    }

    /// <summary>
    /// Zählt die Attribute eines Start-Tags ab dem Elementnamen und bricht nach <paramref name="maxAttribute"/> + 1 ab.
    /// Liefert die Position hinter dem Tag (−1 bei unvollständigem Markup) und die Anzahl.
    /// </summary>
    private static (int Weiter, int Anzahl) StartTag(string text, int i, int maxAttribute)
    {
        i = Ueberspringen(text, i, z => !IstLeerraum(z) && z is not ('>' or '/'));
        var anzahl = 0;
        while (true)
        {
            i = Ueberspringen(text, i, IstLeerraum);
            if (i >= text.Length)
            {
                return (-1, anzahl);
            }

            if (text[i] is '>' or '/')
            {
                return (i + 1, anzahl);
            }

            // Attributname bis '=' oder Leerraum, dann '=' und ein Wert in Anführungszeichen.
            i = Ueberspringen(text, i, z => z != '=' && !IstLeerraum(z) && z is not ('>' or '/'));
            i = Ueberspringen(text, i, IstLeerraum);
            if (i >= text.Length || text[i] != '=')
            {
                return (-1, anzahl);
            }

            i = Ueberspringen(text, i + 1, IstLeerraum);
            if (i >= text.Length || text[i] is not ('"' or '\''))
            {
                return (-1, anzahl);
            }

            var ende = text.IndexOf(text[i], i + 1);
            if (ende < 0)
            {
                return (-1, anzahl);
            }

            i = ende + 1;
            if (++anzahl > maxAttribute)
            {
                return (i, anzahl);
            }
        }
    }

    private static int Ueberspringen(string text, int i, Func<char, bool> solange)
    {
        while (i < text.Length && solange(text[i]))
        {
            i++;
        }

        return i;
    }

    private static bool IstLeerraum(char zeichen) => zeichen is ' ' or '\t' or '\r' or '\n';
}
