using Coin.IntegrationTests.Infrastruktur;
using Coin.IntegrationTests.Vorlagen;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Zertifikate;

/// <summary>
/// Testvorlagen für zertifikat-erzeugen (AK-9, AK-10, AK-13), im Speicher erzeugt: jeder Platzhalter des Katalogs an
/// jeder Stelle, an der ersetzt werden muss, je Stelle ein Absatz mit dem Präfix „Ort {Name}: “. Keine echten
/// Personendaten.
/// </summary>
public static class Zertifikatvorlagen
{
    /// <summary>Die 13 Platzhalter laut Katalog (Literale, unabhängig vom Produktivcode).</summary>
    public static readonly string[] Namen =
    [
        "Coin.Name", "Exemplar.Nummer", "Zertifikat.Nummer", "Empfaenger.Name", "Coin.Herausgeber", "Coin.Beschreibung",
        "Coin.Auflage", "Empfaenger.Dienstgrad", "Empfaenger.Dienststelle", "Ausgabe.Datum", "Ausgabe.Gelegenheit",
        "Ausgabe.Begruendung", "Ausgabe.AusgebendeStelle",
    ];

    /// <summary>Stellen, an denen ersetzt wird, mit dem Präfix des Story-Teils in <see cref="DocxLeser.Absatztexte"/>.</summary>
    public static readonly (string Ort, string Teil)[] Orte =
    [
        ("Fliesstext", "word/document.xml"),
        ("Tabelle", "word/document.xml"),
        ("Kopfzeile", "word/header"),
        ("Fusszeile", "word/footer"),
        ("Fussnote", "word/footnotes.xml"),
        ("Endnote", "word/endnotes.xml"),
        ("Textfeld", "word/document.xml"),
        ("Steuerelement", "word/document.xml"),
        ("Steuerelement im Absatz", "word/document.xml"),
        ("Hyperlink", "word/document.xml"),
        ("Feldergebnis", "word/document.xml"),
        ("Verteilt", "word/document.xml"),
    ];

    public const string Glossartext = "Glossar {{Coin.Name}}";

    public const string Feldanweisung = " QUOTE \"Anweisung Zx99\" ";

    public const string SdtAlias = "Alias {{Coin.Name}}";

    public const string SdtTag = "Tag {{Coin.Name}}";

    public const string OhnePlatzhalter = "Gerade Kopfzeile ohne Platzhalter";

    /// <summary>Text eines Absatzes mit allen 13 Platzhaltern.</summary>
    public static string AlleText(string ort) => $"Ort {ort}: " + string.Join(" | ", Namen.Select(n => $"{{{{{n}}}}}"));

    /// <summary>Erwarteter Text nach dem Ersetzen.</summary>
    public static string AlleErwartet(string ort, IReadOnlyDictionary<string, string> werte) =>
        $"Ort {ort}: " + string.Join(" | ", Namen.Select(n => werte[n]));

    /// <summary>Alle Platzhalter, jeder auf zwei Runs mit unterschiedlicher Formatierung verteilt.</summary>
    public static string VerteiltRuns(string ort)
    {
        var teile = new List<string> { Run($"Ort {ort}: ") };
        for (var i = 0; i < Namen.Length; i++)
        {
            var name = Namen[i];
            var mitte = name.Length / 2;
            teile.Add(Run("{{" + name[..mitte], "<w:b/>"));
            teile.Add("<w:proofErr w:type=\"spellStart\"/>");
            teile.Add(Run(name[mitte..] + "}}", "<w:i/>"));
            teile.Add("<w:proofErr w:type=\"spellEnd\"/>");
            if (i < Namen.Length - 1)
            {
                teile.Add(Run(" | "));
            }
        }

        return string.Concat(teile);
    }

    /// <summary>
    /// Vorlage mit jedem Platzhalter an jeder Stelle aus <see cref="Orte"/>, dazu eine Kopfzeile ohne Platzhalter,
    /// ein Glossar mit Platzhalter, Alias und Tag eines Steuerelements mit Platzhaltertext und eine Feldanweisung.
    /// </summary>
    public static DocxBauer JedeStelle()
    {
        var bauer = new DocxBauer();
        var hyperlink = bauer.DokumentBeziehung(RelHyperlink, "https://beispiel.invalid/zertifikat", istExtern: true);
        bauer.Absaetze(
            Text(AlleText("Fliesstext")),
            Testvorlagen.VerschachtelteTabelle(Text(AlleText("Tabelle"))),
            Testvorlagen.TextfeldAlternateContent(Text(AlleText("Textfeld"))),
            $"<w:sdt><w:sdtPr><w:alias w:val=\"{SdtAlias}\"/><w:tag w:val=\"{SdtTag}\"/><w:id w:val=\"31\"/></w:sdtPr><w:sdtContent>{Text(AlleText("Steuerelement"))}</w:sdtContent></w:sdt>",
            Testvorlagen.SdtImAbsatz(Run(AlleText("Steuerelement im Absatz"))),
            P($"<w:hyperlink r:id=\"{hyperlink}\">{Run(AlleText("Hyperlink"))}</w:hyperlink>"),
            Testvorlagen.Feldergebnis(Run(AlleText("Feldergebnis")), Feldanweisung),
            P(VerteiltRuns("Verteilt")));
        bauer.Kopfzeile("default", Text(AlleText("Kopfzeile")));
        bauer.Fusszeile("default", Text(AlleText("Fusszeile")));
        bauer.Kopfzeile("even", Text(OhnePlatzhalter));
        bauer.Fussnote(Text(AlleText("Fussnote")));
        bauer.Endnote(Text(AlleText("Endnote")));
        Testvorlagen.MitGlossar(Text(Glossartext), bauer);
        return bauer;
    }

    /// <summary>Gültige Vorlage mit den Pflichtplatzhaltern und weiteren Absätzen.</summary>
    public static DocxBauer MitAbsaetzen(params string[] absaetze) => Mit([.. PflichtAbsaetze, .. absaetze]);

    /// <summary>Gültige Vorlage mit genau <paramref name="anzahl"/> Platzhaltervorkommen.</summary>
    public static byte[] MitVorkommen(int anzahl) =>
        Mit([.. PflichtAbsaetze, .. Enumerable.Range(0, anzahl - PflichtAbsaetze.Length).Select(_ => Text("Wiederholt {{Coin.Name}}"))]).Bytes();
}
