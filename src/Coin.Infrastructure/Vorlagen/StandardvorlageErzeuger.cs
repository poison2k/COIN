using Coin.Domain.Vorlagen;
using Coin.Domain.Zertifikate;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace Coin.Infrastructure.Vorlagen;

/// <summary>
/// Erzeugt die Standardvorlage mit dem OpenXML SDK (zertifikatsvorlagen AK-2 bis AK-5, Abschnitt 4.2, ADR-0022): A4
/// hochkant, Ränder 2 cm, eine Schrift, Urkundentext mit allen Platzhaltern (je Platzhalter genau ein Run),
/// <c>{{Zertifikat.Nummer}}</c> in der Fußzeile und nach einem Seitenumbruch die Erläuterung mit einer Tabelle aus dem
/// <see cref="Platzhalterkatalog"/>. Metadatenfrei bis auf den Autor „C.O.I.N.“. Je Prozess einmal erzeugt. Die
/// Dienststelle steht in einem eigenen Absatz ohne Komma (zertifikat-erzeugen F8). Als <see cref="IStandardzertifikat"/>
/// liefert sie die Zertifikatsfassung ohne die Erläuterung (F7).
/// </summary>
internal sealed class StandardvorlageErzeuger : IStandardvorlage, IStandardzertifikat
{
    private const string Schrift = "Arial";

    /// <summary>2 cm in Twips (1 cm = 567 Twips).</summary>
    private const int Rand = 1134;

    private readonly Lazy<byte[]> _inhalt = new(() => Erzeugen(mitErlaeuterung: true));

    private readonly Lazy<byte[]> _zertifikatsfassung = new(() => Erzeugen(mitErlaeuterung: false));

    public byte[] Inhalt => _inhalt.Value;

    byte[] IStandardzertifikat.Inhalt => _zertifikatsfassung.Value;

    internal static byte[] Erzeugen() => Erzeugen(mitErlaeuterung: true);

    /// <summary>Standardvorlage; ohne <paramref name="mitErlaeuterung"/> die Zertifikatsfassung (F7).</summary>
    internal static byte[] Erzeugen(bool mitErlaeuterung)
    {
        using var puffer = new MemoryStream();
        using (var dokument = WordprocessingDocument.Create(puffer, WordprocessingDocumentType.Document))
        {
            DocxBereinigung.KernEigenschaftenSchreiben(dokument.AddCoreFilePropertiesPart());

            var haupt = dokument.AddMainDocumentPart();
            var stile = haupt.AddNewPart<StyleDefinitionsPart>();
            stile.Styles = Stile();

            var fusszeile = haupt.AddNewPart<FooterPart>();
            fusszeile.Footer = new Footer(
                Absatz(JustificationValues.Center, null, Lauf("Zertifikat Nr. "), Platzhalter("Zertifikat.Nummer")));

            haupt.Document = new Document(new Body(
                [.. Urkunde(), .. mitErlaeuterung ? Erlaeuterung() : [], Abschnitt(haupt.GetIdOfPart(fusszeile))]));
        }

        return puffer.ToArray();
    }

    private static IEnumerable<OpenXmlElement> Urkunde() =>
    [
        Absatz(JustificationValues.Center, "Title", Lauf("Echtheitszertifikat")),
        Absatz(JustificationValues.Center, null, Platzhalter("Coin.Name", fett: true, groesse: 32)),
        Absatz(JustificationValues.Center, null, Lauf("Herausgeber: "), Platzhalter("Coin.Herausgeber")),
        Absatz(JustificationValues.Center, null,
            Lauf("Exemplar Nr. "), Platzhalter("Exemplar.Nummer"), Lauf(" von "), Platzhalter("Coin.Auflage")),
        Absatz(JustificationValues.Center, null, Platzhalter("Coin.Beschreibung")),
        Absatz(JustificationValues.Left, null),
        Absatz(JustificationValues.Left, null, Lauf("Dieses Exemplar wurde verliehen an")),
        Absatz(JustificationValues.Left, null,
            Platzhalter("Empfaenger.Dienstgrad"), Lauf(" "), Platzhalter("Empfaenger.Name", fett: true)),
        Absatz(JustificationValues.Left, null, Platzhalter("Empfaenger.Dienststelle")),
        Absatz(JustificationValues.Left, null,
            Lauf("am "), Platzhalter("Ausgabe.Datum"), Lauf(" anlässlich "), Platzhalter("Ausgabe.Gelegenheit"), Lauf(".")),
        Absatz(JustificationValues.Left, null, Lauf("Begründung: "), Platzhalter("Ausgabe.Begruendung")),
        Absatz(JustificationValues.Left, null),
        Absatz(JustificationValues.Left, null),
        Absatz(JustificationValues.Left, null, Lauf("______________________________")),
        Absatz(JustificationValues.Left, null, Platzhalter("Ausgabe.AusgebendeStelle")),
        Absatz(JustificationValues.Left, null),
        Absatz(JustificationValues.Left, null, Lauf("Zertifikat Nr. "), Platzhalter("Zertifikat.Nummer")),
    ];

    private static IEnumerable<OpenXmlElement> Erlaeuterung()
    {
        var ueberschrift = Absatz(JustificationValues.Left, "Heading1", Lauf("Erläuterung der Platzhalter"));
        ueberschrift.ParagraphProperties!.PageBreakBefore = new PageBreakBefore();

        return
        [
            ueberschrift,
            Absatz(JustificationValues.Left, null,
                Lauf("Dieser Abschnitt dient nur zur Information und kann vor dem Druck gelöscht werden.")),
            Absatz(JustificationValues.Left, null, Lauf(
                "Die Platzhalter oben stehen in doppelten geschweiften Klammern und werden beim Ausstellen eines " +
                "Zertifikats durch die Werte ersetzt. Pflichtplatzhalter müssen in jeder hochgeladenen Vorlage enthalten " +
                "sein. Schreibweise und Groß-/Kleinschreibung nicht ändern, Platzhalter nicht in mehrere Absätze trennen. " +
                "Vor dem Hochladen alle Kommentare löschen und alle nachverfolgten Änderungen annehmen oder ablehnen.")),
            Tabelle(),
            Absatz(JustificationValues.Left, null),
        ];
    }

    /// <summary>Tabelle „Platzhalter | Bedeutung | Pflicht | Beispiel“; Namen ohne geschweifte Klammern (AK-4).</summary>
    private static Table Tabelle()
    {
        int[] breiten = [2900, 2900, 900, 2938];
        var rand = new TableBorders(
            new TopBorder { Val = BorderValues.Single, Size = 4, Space = 0, Color = "auto" },
            new LeftBorder { Val = BorderValues.Single, Size = 4, Space = 0, Color = "auto" },
            new BottomBorder { Val = BorderValues.Single, Size = 4, Space = 0, Color = "auto" },
            new RightBorder { Val = BorderValues.Single, Size = 4, Space = 0, Color = "auto" },
            new InsideHorizontalBorder { Val = BorderValues.Single, Size = 4, Space = 0, Color = "auto" },
            new InsideVerticalBorder { Val = BorderValues.Single, Size = 4, Space = 0, Color = "auto" });
        var tabelle = new Table(
            new TableProperties(new TableWidth { Width = "5000", Type = TableWidthUnitValues.Pct }, rand),
            new TableGrid(breiten.Select(b => new GridColumn { Width = b.ToString(System.Globalization.CultureInfo.InvariantCulture) })));

        tabelle.Append(Zeile(breiten, kopf: true, "Platzhalter", "Bedeutung", "Pflicht", "Beispiel"));
        foreach (var p in Platzhalterkatalog.Alle)
        {
            tabelle.Append(Zeile(breiten, kopf: false, p.Name, p.Bedeutung, p.Pflicht ? "ja" : "nein", p.Beispiel));
        }

        return tabelle;
    }

    private static TableRow Zeile(int[] breiten, bool kopf, params string[] zellen)
    {
        var zeile = new TableRow();
        if (kopf)
        {
            zeile.Append(new TableRowProperties(new TableHeader()));
        }

        for (var i = 0; i < zellen.Length; i++)
        {
            zeile.Append(new TableCell(
                new TableCellProperties(new TableCellWidth
                {
                    Width = breiten[i].ToString(System.Globalization.CultureInfo.InvariantCulture),
                    Type = TableWidthUnitValues.Dxa,
                }),
                Absatz(JustificationValues.Left, null, Lauf(zellen[i], fett: kopf))));
        }

        return zeile;
    }

    private static SectionProperties Abschnitt(string fusszeilenId) =>
        new(
            new FooterReference { Type = HeaderFooterValues.Default, Id = fusszeilenId },
            new PageSize { Width = 11906U, Height = 16838U },
            new PageMargin { Top = Rand, Right = (uint)Rand, Bottom = Rand, Left = (uint)Rand, Header = 567U, Footer = 567U, Gutter = 0U });

    private static Paragraph Absatz(JustificationValues ausrichtung, string? stil, params OpenXmlElement[] laeufe)
    {
        var eigenschaften = new ParagraphProperties();
        if (stil is not null)
        {
            eigenschaften.ParagraphStyleId = new ParagraphStyleId { Val = stil };
        }

        eigenschaften.Justification = new Justification { Val = ausrichtung };
        return new Paragraph([eigenschaften, .. laeufe]);
    }

    private static Run Lauf(string text, bool fett = false, int? groesse = null)
    {
        var lauf = new Run();
        if (fett || groesse is not null)
        {
            var eigenschaften = new RunProperties();
            if (fett)
            {
                eigenschaften.Bold = new Bold();
            }

            if (groesse is { } halbpunkte)
            {
                eigenschaften.FontSize = new FontSize { Val = halbpunkte.ToString(System.Globalization.CultureInfo.InvariantCulture) };
            }

            lauf.Append(eigenschaften);
        }

        lauf.Append(new Text(text) { Space = SpaceProcessingModeValues.Preserve });
        return lauf;
    }

    /// <summary>Ein Platzhalter aus dem Katalog in genau einem Run.</summary>
    private static Run Platzhalter(string name, bool fett = false, int? groesse = null)
    {
        var platzhalter = Platzhalterkatalog.Alle.Single(p => p.Name == name);
        return Lauf(platzhalter.Text, fett, groesse);
    }

    private static Styles Stile()
    {
        var schrift = new RunFonts { Ascii = Schrift, HighAnsi = Schrift, ComplexScript = Schrift, EastAsia = Schrift };
        var standard = new DocDefaults(
            new RunPropertiesDefault(new RunPropertiesBaseStyle(
                schrift,
                new FontSize { Val = "24" },
                new FontSizeComplexScript { Val = "24" },
                new Languages { Val = "de-DE" })),
            new ParagraphPropertiesDefault(new ParagraphPropertiesBaseStyle(
                new SpacingBetweenLines { After = "120", Line = "276", LineRule = LineSpacingRuleValues.Auto })));

        return new Styles(
            standard,
            new Style(new StyleName { Val = "Normal" }, new PrimaryStyle())
            {
                Type = StyleValues.Paragraph,
                StyleId = "Normal",
                Default = true,
            },
            new Style(
                new StyleName { Val = "Title" },
                new BasedOn { Val = "Normal" },
                new NextParagraphStyle { Val = "Normal" },
                new PrimaryStyle(),
                new StyleParagraphProperties(new SpacingBetweenLines { Before = "480", After = "360" }),
                new StyleRunProperties(new Bold(), new FontSize { Val = "56" }, new FontSizeComplexScript { Val = "56" }))
            {
                Type = StyleValues.Paragraph,
                StyleId = "Title",
            },
            new Style(
                new StyleName { Val = "heading 1" },
                new BasedOn { Val = "Normal" },
                new NextParagraphStyle { Val = "Normal" },
                new PrimaryStyle(),
                new StyleParagraphProperties(
                    new KeepNext(),
                    new SpacingBetweenLines { Before = "240", After = "120" },
                    new OutlineLevel { Val = 0 }),
                new StyleRunProperties(new Bold(), new FontSize { Val = "32" }, new FontSizeComplexScript { Val = "32" }))
            {
                Type = StyleValues.Paragraph,
                StyleId = "Heading1",
            });
    }
}
