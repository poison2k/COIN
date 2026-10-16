using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen, AK-7 bis AK-15 (ADR-0024 Punkt 1 und 2): <c>POST …/zertifikatsvorlage/versionen</c>
/// prüft die Datei als nicht vertrauenswürdig. Jede Ablehnung nennt die wörtliche Meldung unter <c>errors.datei</c>,
/// speichert nichts und schreibt kein Audit.
/// </summary>
public class VorlagenPruefungTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string DtdArt = "Dokumenttypdefinitionen (DTD)";
    private const string ActiveXArt = "ActiveX-Steuerelemente";
    private const string OleArt = "eingebettete Objekte";
    private const string ExternArt = "Verknüpfungen auf externe Inhalte";
    private const string AltChunkArt = "importierte Fremdinhalte";
    private const string FeldArt = "Felder mit externen Verknüpfungen oder DDE";

    // ---------- AK-15: verteilte Platzhalter werden akzeptiert (Pflichttest Runs) ----------

    public static TheoryData<string> AkzeptierteStellen =>
    [
        "Hauptteil", "Kopfzeile Standard", "Kopfzeile erste Seite", "Kopfzeile gerade Seiten", "Fusszeile Standard",
        "Fusszeile erste Seite", "Fusszeile gerade Seiten", "Fussnote", "Endnote", "Tabelle", "verschachtelte Tabelle",
        "Textfeld AlternateContent", "Textfeld VML", "Inhaltssteuerelement Block", "Inhaltssteuerelement im Absatz",
        "Hyperlink", "Smarttag", "Feldergebnis", "einfaches Feld",
    ];

    private static byte[] MitCoinNameAn(string stelle) => stelle switch
    {
        "Hauptteil" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.GeteilterCoinName).Bytes(),
        "Kopfzeile Standard" => Testvorlagen.OhneCoinName().Kopfzeile("default", Testvorlagen.GeteilterCoinName).Bytes(),
        "Kopfzeile erste Seite" => Testvorlagen.OhneCoinName().Kopfzeile("first", Testvorlagen.GeteilterCoinName).Bytes(),
        "Kopfzeile gerade Seiten" => Testvorlagen.OhneCoinName().Kopfzeile("even", Testvorlagen.GeteilterCoinName).Bytes(),
        "Fusszeile Standard" => Testvorlagen.OhneCoinName().Fusszeile("default", Testvorlagen.GeteilterCoinName).Bytes(),
        "Fusszeile erste Seite" => Testvorlagen.OhneCoinName().Fusszeile("first", Testvorlagen.GeteilterCoinName).Bytes(),
        "Fusszeile gerade Seiten" => Testvorlagen.OhneCoinName().Fusszeile("even", Testvorlagen.GeteilterCoinName).Bytes(),
        "Fussnote" => Testvorlagen.OhneCoinName().Fussnote(Testvorlagen.GeteilterCoinName).Bytes(),
        "Endnote" => Testvorlagen.OhneCoinName().Endnote(Testvorlagen.GeteilterCoinName).Bytes(),
        "Tabelle" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.Tabelle(Testvorlagen.GeteilterCoinName), "<w:p/>").Bytes(),
        "verschachtelte Tabelle" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.VerschachtelteTabelle(Testvorlagen.GeteilterCoinName), "<w:p/>").Bytes(),
        "Textfeld AlternateContent" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.TextfeldAlternateContent(Testvorlagen.GeteilterCoinName)).Bytes(),
        "Textfeld VML" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.TextfeldVml(Testvorlagen.GeteilterCoinName)).Bytes(),
        "Inhaltssteuerelement Block" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.SdtBlock(Testvorlagen.GeteilterCoinName)).Bytes(),
        "Inhaltssteuerelement im Absatz" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.SdtImAbsatz(Testvorlagen.GeteilterCoinNameRuns)).Bytes(),
        "Hyperlink" => Testvorlagen.MitHyperlink().Bytes(),
        "Smarttag" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.SmartTag(Testvorlagen.GeteilterCoinNameRuns)).Bytes(),
        "Feldergebnis" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.Feldergebnis(Testvorlagen.GeteilterCoinNameRuns)).Bytes(),
        "einfaches Feld" => Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.EinfachesFeld(" QUOTE x ", Testvorlagen.GeteilterCoinNameRuns)).Bytes(),
        _ => throw new ArgumentOutOfRangeException(nameof(stelle), stelle, null),
    };

    [Theory]
    [MemberData(nameof(AkzeptierteStellen))]
    public async Task Auf_drei_Runs_verteilter_Coin_Name_wird_akzeptiert(string stelle)
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, MitCoinNameAn(stelle));

        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"{stelle}: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
    }

    [Fact]
    public async Task Verteilter_Coin_Name_mit_Formatwechsel_proofErr_und_Lesezeichen_im_Hauptteil_ergibt_Version_1()
    {
        var coinId = await CoinAsync();

        var status = await LadeVorlageHochAsync(coinId, MitCoinNameAn("Hauptteil"));

        Assert.Equal(1, status.GetProperty("aktiveVersion").GetInt32());
    }

    [Fact]
    public async Task Alle_Pflichtplatzhalter_verteilt_auf_Kopfzeile_Fusszeile_Tabelle_und_Textfeld_werden_akzeptiert()
    {
        var coinId = await CoinAsync();
        string Geteilt(string a, string b) => P(Run(a, "<w:b/>"), "<w:proofErr w:type=\"gramStart\"/>", Run(b, "<w:i/>"));
        var datei = new DocxBauer()
            .Kopfzeile("default", Geteilt("{{Coin.", "Name}}"))
            .Fusszeile("default", Geteilt("{{Zertifikat.Nu", "mmer}}"))
            .Absaetze(
                Testvorlagen.VerschachtelteTabelle(Geteilt("{{Exem", "plar.Nummer}}")),
                Testvorlagen.TextfeldAlternateContent(Geteilt("{{Empfaenger", ".Name}}")))
            .Bytes();

        using var antwort = await PostVersionAsync(coinId, datei);

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Hyperlink_mit_externem_Ziel_ist_zulaessig()
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, Testvorlagen.MitHyperlink().Bytes());

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Eingebettetes_Bild_ist_zulaessig()
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, Testvorlagen.MitBild().Bytes());

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task HYPERLINK_Feld_ist_kein_LINK_Feld_und_zulaessig()
    {
        var coinId = await CoinAsync();
        var datei = Gueltig().Absaetze(Testvorlagen.FeldMitAnweisung(" HYPERLINK \"https://beispiel.invalid/\" ")).Bytes();

        using var antwort = await PostVersionAsync(coinId, datei);

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Leerer_Kommentar_Teil_ohne_Kommentar_ist_zulaessig()
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, Testvorlagen.MitKommentarTeil(mitKommentar: false).Bytes());

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Genau_1000_Eintraege_sind_zulaessig()
    {
        var coinId = await CoinAsync();
        var datei = Testvorlagen.MitEintraegen(1000);
        Assert.Equal(1000, DocxLeser.Eintraege(datei).Count);

        using var antwort = await PostVersionAsync(coinId, datei);

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Eintrag_mit_genau_1_MiB_Nullen_ist_trotz_hoher_Kompression_zulaessig()
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, Testvorlagen.MitNullen(Testvorlagen.MiB));

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    // ---------- AK-15: Platzhaltermeldungen ----------

    [Fact]
    public async Task Auf_Runs_verteilter_Tippfehler_wird_als_unbekannt_erkannt()
    {
        var coinId = await CoinAsync();
        var datei = Mit(PflichtAbsaetze[0], PflichtAbsaetze[1], PflichtAbsaetze[2],
            P(Run("an "), Run("{{Empfaenger.", "<w:b/>"), "<w:proofErr w:type=\"spellStart\"/>", Run("Nam}}"), "<w:proofErr w:type=\"spellEnd\"/>")).Bytes();

        Assert.Equal(
            ["Es fehlen Pflichtplatzhalter: {{Empfaenger.Name}}.", "Unbekannte Platzhalter: {{Empfaenger.Nam}}." + UnbekanntHinweis],
            await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task Fehlender_Pflichtplatzhalter_wird_gemeldet()
    {
        var coinId = await CoinAsync();
        var datei = Mit(PflichtAbsaetze[0], PflichtAbsaetze[1], PflichtAbsaetze[3]).Bytes();

        Assert.Equal(["Es fehlen Pflichtplatzhalter: {{Zertifikat.Nummer}}."], await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task Leeres_Dokument_meldet_alle_vier_Pflichtplatzhalter()
    {
        var coinId = await CoinAsync();

        Assert.Equal(
            ["Es fehlen Pflichtplatzhalter: {{Coin.Name}}, {{Exemplar.Nummer}}, {{Zertifikat.Nummer}}, {{Empfaenger.Name}}."],
            await AbgelehntAsync(coinId, Mit(Text("Nur Text")).Bytes()));
    }

    [Theory]
    [InlineData("{{Empfaenger.Nam}}")]
    [InlineData("{{ Coin.Name }}")]
    [InlineData("{{coin.name}}")]
    public async Task Unbekannter_Platzhalter_wird_gemeldet(string platzhalter)
    {
        var coinId = await CoinAsync();
        var datei = Gueltig().Absaetze(Text($"Zusatz {platzhalter}")).Bytes();

        Assert.Equal([$"Unbekannte Platzhalter: {platzhalter}." + UnbekanntHinweis], await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task Unvollstaendiger_Platzhalter_wird_gemeldet()
    {
        var coinId = await CoinAsync();
        var datei = Gueltig().Absaetze(Text("{{Coin.Name"), Text("Exemplar.Nummer}}")).Bytes();

        Assert.Equal(["Unvollständige Platzhalter: „{{Coin.Name“, „Exemplar.Nummer}}“."], await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task Platzhalter_ueber_zwei_Absaetze_ist_unvollstaendig()
    {
        var coinId = await CoinAsync();
        var datei = Testvorlagen.OhneCoinName().Absaetze(Text("{{Coin."), Text("Name}}")).Bytes();

        Assert.Equal(
            ["Es fehlen Pflichtplatzhalter: {{Coin.Name}}.", "Unvollständige Platzhalter: „{{Coin.“, „Name}}“."],
            await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task Zeilenumbruch_im_Platzhalter_trennt_ihn()
    {
        var coinId = await CoinAsync();
        var datei = Testvorlagen.OhneCoinName().Absaetze(P(Run("{{Coin."), "<w:r><w:br/></w:r>", Run("Name}}"))).Bytes();

        Assert.Contains("Es fehlen Pflichtplatzhalter: {{Coin.Name}}.", await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task Mehrere_Platzhaltermeldungen_erscheinen_gemeinsam_in_fester_Reihenfolge()
    {
        var coinId = await CoinAsync();
        var datei = Mit(Text("{{Exemplar.Nummer}} {{Zertifikat.Nummer}}"), Text("{{Empfaenger.Nam}}"), Text("{{Coin.Name")).Bytes();

        Assert.Equal(
            [
                "Es fehlen Pflichtplatzhalter: {{Coin.Name}}, {{Empfaenger.Name}}.",
                "Unbekannte Platzhalter: {{Empfaenger.Nam}}." + UnbekanntHinweis,
                "Unvollständige Platzhalter: „{{Coin.Name“.",
            ],
            await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task Platzhalter_in_einer_Feldanweisung_zaehlt_nicht()
    {
        var coinId = await CoinAsync();
        var datei = Testvorlagen.OhneCoinName().Absaetze(Testvorlagen.FeldMitAnweisung(" QUOTE \"{{Coin.Name}}\" ")).Bytes();

        Assert.Equal(["Es fehlen Pflichtplatzhalter: {{Coin.Name}}."], await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task Platzhalter_im_Glossar_zaehlt_nicht()
    {
        var coinId = await CoinAsync();
        var datei = Testvorlagen.MitGlossar(Text("{{Coin.Name}}"), Testvorlagen.OhneCoinName()).Bytes();

        Assert.Equal(["Es fehlen Pflichtplatzhalter: {{Coin.Name}}."], await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task Unbekannter_Platzhalter_im_Glossar_wird_nicht_gemeldet()
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, Testvorlagen.MitGlossar(Text("{{Unbekannt.Baustein}}")).Bytes());

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    [Fact]
    public async Task Unbekannter_Platzhalter_in_der_Kopfzeile_wird_gemeldet()
    {
        var coinId = await CoinAsync();
        var datei = Gueltig().Kopfzeile("default", Text("{{Kopf.Zeile}}")).Bytes();

        Assert.Equal(["Unbekannte Platzhalter: {{Kopf.Zeile}}." + UnbekanntHinweis], await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task Unbekannter_Platzhalter_in_der_Fussnote_wird_gemeldet()
    {
        var coinId = await CoinAsync();
        var datei = Gueltig().Fussnote(Text("{{Fuss.Note}}")).Bytes();

        Assert.Equal(["Unbekannte Platzhalter: {{Fuss.Note}}." + UnbekanntHinweis], await AbgelehntAsync(coinId, datei));
    }

    // ---------- AK-10, AK-11: Dateityp und Makros ----------

    public static TheoryData<string> KeinDocxFaelle =>
    [
        "PNG", "PDF", "Text", "XLSX", "PPTX", "DOTX", "ZIP ohne Content_Types", "Hauptteil fehlt", "beschaedigtes ZIP",
        "doppelte Eintragsnamen", "leeres ZIP",
    ];

    private static byte[] KeinDocxDatei(string art) => art switch
    {
        "PNG" => Testbilder.Png(2048),
        "PDF" => Testvorlagen.Pdf(),
        "Text" => Testvorlagen.Textdatei(),
        "XLSX" => Testvorlagen.MitHauptTyp("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"),
        "PPTX" => Testvorlagen.MitHauptTyp("application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"),
        "DOTX" => Testvorlagen.MitHauptTyp(VorlageHauptteilTyp),
        "ZIP ohne Content_Types" => new DocxBauer { OhneContentTypes = true }.Absaetze(PflichtAbsaetze).Bytes(),
        "Hauptteil fehlt" => new DocxBauer { OhneHauptteil = true }.Bytes(),
        "beschaedigtes ZIP" => Testvorlagen.Beschaedigt(),
        "doppelte Eintragsnamen" => Testvorlagen.DoppelteEintraege(),
        "leeres ZIP" => Testvorlagen.LeeresZip(),
        _ => throw new ArgumentOutOfRangeException(nameof(art), art, null),
    };

    [Theory]
    [MemberData(nameof(KeinDocxFaelle))]
    public async Task Umbenannte_oder_kaputte_Datei_ist_kein_Word_Dokument(string art)
    {
        var coinId = await CoinAsync();

        Assert.Equal([KeinDocx], await AbgelehntAsync(coinId, KeinDocxDatei(art)));
    }

    [Fact]
    public async Task OLE_Verbunddatei_wird_als_altes_oder_kennwortgeschuetztes_Word_Dokument_gemeldet()
    {
        var coinId = await CoinAsync();

        Assert.Equal([AltesWord], await AbgelehntAsync(coinId, Testvorlagen.OleVerbund()));
    }

    public static TheoryData<string> MakroFaelle =>
    [
        "docm mit vbaProject", "docm-Typ ohne vbaProject", "eingeschmuggeltes word/vbaProject.bin",
        "eingeschmuggeltes vbaProject.bin an anderer Stelle", "Teil vom Typ vbaProject", "Teil vom Typ vbaData",
        "Beziehung vom Typ vbaProject",
    ];

    private static byte[] MakroDatei(string art) => art switch
    {
        "docm mit vbaProject" => Testvorlagen.Docm(),
        "docm-Typ ohne vbaProject" => Testvorlagen.MitHauptTyp(MakroHauptteilTyp),
        "eingeschmuggeltes word/vbaProject.bin" => Testvorlagen.EingeschmuggeltesVbaProjekt(),
        "eingeschmuggeltes vbaProject.bin an anderer Stelle" => Testvorlagen.EingeschmuggeltesVbaProjekt("docProps/vbaProject.bin"),
        "Teil vom Typ vbaProject" => Testvorlagen.VbaProjektPerContentType(),
        "Teil vom Typ vbaData" => Testvorlagen.VbaDaten(),
        "Beziehung vom Typ vbaProject" => Testvorlagen.VbaBeziehung(),
        _ => throw new ArgumentOutOfRangeException(nameof(art), art, null),
    };

    [Theory]
    [MemberData(nameof(MakroFaelle))]
    public async Task Makros_werden_abgelehnt(string art)
    {
        var coinId = await CoinAsync();

        Assert.Equal([Makros], await AbgelehntAsync(coinId, MakroDatei(art)));
    }

    [Fact]
    public async Task Typ_wird_am_Inhalt_nicht_an_Endung_oder_Content_Type_erkannt()
    {
        var coinId = await CoinAsync();
        var inhalt = new ByteArrayContent(Testvorlagen.Pdf());
        inhalt.Headers.ContentType = MediaTypeHeaderValue.Parse(DocxContentType);

        using var antwort = await Client.PostAsync(VersionenUrl(coinId), new MultipartFormDataContent { { inhalt, "datei", "vorlage.docx" } });

        Assert.Equal([KeinDocx], await DateiFehlerAsync(antwort));
    }

    [Fact]
    public async Task Gueltiges_DOCX_mit_falscher_Endung_und_Content_Type_wird_angenommen()
    {
        var coinId = await CoinAsync();
        var inhalt = new ByteArrayContent(Gueltig().Bytes());
        inhalt.Headers.ContentType = MediaTypeHeaderValue.Parse("image/png");

        using var antwort = await Client.PostAsync(VersionenUrl(coinId), new MultipartFormDataContent { { inhalt, "datei", "bild.png" } });

        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
    }

    // ---------- AK-12: Zip-Bomben ----------

    public static TheoryData<string> ZipBombenFaelle =>
        ["100 MiB Nullen", "1001 Eintraege", "Verhaeltnis ueber 100 zu 1", "insgesamt ueber 50 MiB", "Eintrag ueber 20 MiB"];

    private static byte[] ZipBombe(string art) => art switch
    {
        "100 MiB Nullen" => Testvorlagen.MitNullen(100 * Testvorlagen.MiB),
        "1001 Eintraege" => Testvorlagen.MitEintraegen(1001),
        "Verhaeltnis ueber 100 zu 1" => Testvorlagen.MitNullen(2 * Testvorlagen.MiB),
        "insgesamt ueber 50 MiB" => Testvorlagen.MitNullen(Testvorlagen.MiB, anzahl: 55),
        "Eintrag ueber 20 MiB" => Testvorlagen.GrosserEintragMitMaessigerKompression(),
        _ => throw new ArgumentOutOfRangeException(nameof(art), art, null),
    };

    [Theory]
    [MemberData(nameof(ZipBombenFaelle))]
    public async Task Zip_Bombe_wird_abgelehnt(string art)
    {
        var coinId = await CoinAsync();

        Assert.Equal([ZuGrossEntpackt], await AbgelehntAsync(coinId, ZipBombe(art)));
    }

    [Fact]
    public void Testdatei_fuer_Eintrag_ueber_20_MiB_hat_ein_Verhaeltnis_unter_100_zu_1()
    {
        // Absicherung des Testfalls: Er soll die 20-MiB-Grenze prüfen, nicht die Verhältnisgrenze.
        var datei = Testvorlagen.GrosserEintragMitMaessigerKompression();

        using var zip = new System.IO.Compression.ZipArchive(new MemoryStream(datei));
        var eintrag = zip.GetEntry("word/media/gross.bin")!;

        Assert.True(eintrag.Length > 20 * Testvorlagen.MiB);
        Assert.True(eintrag.Length / eintrag.CompressedLength < 100, $"Verhältnis {eintrag.Length / eintrag.CompressedLength}");
        Assert.True(datei.Length < FuenfMiB);
    }

    [Fact]
    public async Task Zip_Bombe_mit_gefaelschter_Groessenangabe_wird_an_den_entpackten_Bytes_erkannt()
    {
        var coinId = await CoinAsync();
        var datei = Testvorlagen.MitNullen(30 * Testvorlagen.MiB);
        FaelscheUnkomprimierteGroessen(datei, "word/media/fuellung0.bin", 1000);

        Assert.Equal([ZuGrossEntpackt], await AbgelehntAsync(coinId, datei));
    }

    /// <summary>Setzt die unkomprimierte Größe eines Eintrags im lokalen Header und im Zentralverzeichnis auf einen falschen Wert.</summary>
    private static void FaelscheUnkomprimierteGroessen(byte[] zip, string name, uint falsch)
    {
        var nameBytes = Encoding.ASCII.GetBytes(name);
        for (var i = 0; i < zip.Length - 46; i++)
        {
            var lokal = zip[i] == 0x50 && zip[i + 1] == 0x4B && zip[i + 2] == 0x03 && zip[i + 3] == 0x04;
            var zentral = zip[i] == 0x50 && zip[i + 1] == 0x4B && zip[i + 2] == 0x01 && zip[i + 3] == 0x02;
            if (lokal && zip.AsSpan(i + 30, nameBytes.Length).SequenceEqual(nameBytes))
            {
                BitConverter.GetBytes(falsch).CopyTo(zip, i + 22);
            }
            else if (zentral && zip.AsSpan(i + 46, Math.Min(nameBytes.Length, zip.Length - i - 46)).SequenceEqual(nameBytes))
            {
                BitConverter.GetBytes(falsch).CopyTo(zip, i + 24);
            }
        }
    }

    // ---------- AK-13: unzulässige Inhalte ----------

    [Fact]
    public async Task XXE_mit_externer_Entitaet_wird_als_DTD_abgelehnt()
    {
        var coinId = await CoinAsync();

        Assert.Equal([Unzulaessig(DtdArt)], await AbgelehntAsync(coinId, Testvorlagen.Xxe()));
    }

    [Fact]
    public async Task Billion_Laughs_wird_als_DTD_abgelehnt()
    {
        var coinId = await CoinAsync();

        Assert.Equal([Unzulaessig(DtdArt)], await AbgelehntAsync(coinId, Testvorlagen.BillionLaughs()));
    }

    [Fact]
    public async Task DTD_in_einem_Nicht_Word_Teil_wird_abgelehnt()
    {
        var coinId = await CoinAsync();

        Assert.Equal([Unzulaessig(DtdArt)], await AbgelehntAsync(coinId, Testvorlagen.DtdInKernEigenschaften()));
    }

    [Fact]
    public async Task XXE_Antwort_enthaelt_keinen_Dateiinhalt_des_Servers()
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, Testvorlagen.Xxe());
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.DoesNotContain("[fonts]", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("win.ini", text, StringComparison.OrdinalIgnoreCase);
    }

    public static TheoryData<string, string> UnzulaessigeFaelle => new()
    {
        { "ActiveX", ActiveXArt },
        { "OLE-Objekt", OleArt },
        { "eingebettetes Paket", OleArt },
        { "attachedTemplate", ExternArt },
        { "externes Bild", ExternArt },
        // AK-13 (Rev. 4, W2): subDocument ist immer ein eingebettetes Objekt, extern zusätzlich eine externe Verknüpfung.
        { "subDocument", $"{OleArt}, {ExternArt}" },
        { "frame", ExternArt },
        { "altChunk", AltChunkArt },
    };

    private static byte[] UnzulaessigeDatei(string art) => art switch
    {
        "ActiveX" => Testvorlagen.MitActiveX().Bytes(),
        "OLE-Objekt" => Testvorlagen.MitOleObjekt().Bytes(),
        "eingebettetes Paket" => Testvorlagen.MitEingebettetemPaket().Bytes(),
        "attachedTemplate" => Testvorlagen.MitAttachedTemplate().Bytes(),
        "externes Bild" => Testvorlagen.MitExternerBeziehung(RelImage, "https://beispiel.invalid/bild.png").Bytes(),
        "subDocument" => Testvorlagen.MitExternerBeziehung(RelBasis + "/subDocument", "file:///C:/Teil.docx").Bytes(),
        "frame" => Testvorlagen.MitExternerBeziehung(RelBasis + "/frame", "https://beispiel.invalid/rahmen.htm").Bytes(),
        "altChunk" => Testvorlagen.MitAltChunk().Bytes(),
        _ => throw new ArgumentOutOfRangeException(nameof(art), art, null),
    };

    [Theory]
    [MemberData(nameof(UnzulaessigeFaelle))]
    public async Task Unzulaessiger_Inhalt_wird_mit_seiner_Art_gemeldet(string art, string meldungsArt)
    {
        var coinId = await CoinAsync();

        Assert.Equal([Unzulaessig(meldungsArt)], await AbgelehntAsync(coinId, UnzulaessigeDatei(art)));
    }

    [Theory]
    [InlineData(" DDE excel \"C:\\\\x.xls\" \"R1C1\" ")]
    [InlineData(" DDEAUTO excel \"C:\\\\x.xls\" \"R1C1\" ")]
    [InlineData(" INCLUDETEXT \"C:\\\\x.docx\" ")]
    [InlineData(" INCLUDEPICTURE \"https://beispiel.invalid/b.png\" ")]
    [InlineData(" LINK Excel.Sheet.8 \"C:\\\\x.xls\" \"\" ")]
    [InlineData(" IMPORT \"C:\\\\x.png\" ")]
    [InlineData(" DATABASE \\d \"C:\\\\x.mdb\" ")]
    [InlineData(" ddeauto excel \"C:\\\\x.xls\" \"R1C1\" ")]
    public async Task Feldanweisung_mit_externer_Verknuepfung_oder_DDE_wird_abgelehnt(string anweisung)
    {
        var coinId = await CoinAsync();
        var datei = Gueltig().Absaetze(Testvorlagen.FeldMitAnweisung(anweisung)).Bytes();

        Assert.Equal([Unzulaessig(FeldArt)], await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task Einfaches_Feld_mit_DDEAUTO_wird_abgelehnt()
    {
        var coinId = await CoinAsync();
        var datei = Gueltig().Absaetze(Testvorlagen.EinfachesFeld(" DDEAUTO excel x R1C1 ", Run("Ergebnis"))).Bytes();

        Assert.Equal([Unzulaessig(FeldArt)], await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task DDE_Feld_in_der_Kopfzeile_wird_abgelehnt()
    {
        var coinId = await CoinAsync();
        var datei = Gueltig().Kopfzeile("default", Testvorlagen.FeldMitAnweisung(" INCLUDETEXT \"C:\\\\x.docx\" ")).Bytes();

        Assert.Equal([Unzulaessig(FeldArt)], await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task Mehrere_unzulaessige_Arten_stehen_in_einer_Meldung_in_fester_Reihenfolge()
    {
        var coinId = await CoinAsync();
        var bauer = Gueltig().Absaetze(Testvorlagen.FeldMitAnweisung(" DDEAUTO excel x R1C1 "));
        Testvorlagen.MitAltChunk(bauer);
        Testvorlagen.MitExternerBeziehung(RelImage, "https://beispiel.invalid/bild.png", bauer);
        Testvorlagen.MitOleObjekt(bauer);
        Testvorlagen.MitActiveX(bauer);

        Assert.Equal(
            [Unzulaessig(ActiveXArt, OleArt, ExternArt, AltChunkArt, FeldArt)],
            await AbgelehntAsync(coinId, bauer.Bytes()));
    }

    [Fact]
    public async Task Jede_unzulaessige_Art_wird_nur_einmal_genannt()
    {
        var coinId = await CoinAsync();
        var bauer = Testvorlagen.MitExternerBeziehung(RelImage, "https://beispiel.invalid/a.png");
        Testvorlagen.MitExternerBeziehung(RelImage, "https://beispiel.invalid/b.png", bauer);

        Assert.Equal([Unzulaessig(ExternArt)], await AbgelehntAsync(coinId, bauer.Bytes()));
    }

    // ---------- AK-14: nachverfolgte Änderungen und Kommentare ----------

    public static TheoryData<string> AenderungsFaelle => ["w:ins", "w:del", "w:moveFrom", "w:moveTo", "w:ins in der Kopfzeile"];

    private static byte[] AenderungsDatei(string art) => art switch
    {
        "w:ins" => Gueltig().Absaetze(Testvorlagen.Eingefuegt()).Bytes(),
        "w:del" => Gueltig().Absaetze(Testvorlagen.Geloescht()).Bytes(),
        "w:moveFrom" => Gueltig().Absaetze(Testvorlagen.Weggeschoben()).Bytes(),
        "w:moveTo" => Gueltig().Absaetze(Testvorlagen.Hingeschoben()).Bytes(),
        "w:ins in der Kopfzeile" => Gueltig().Kopfzeile("default", Testvorlagen.Eingefuegt()).Bytes(),
        _ => throw new ArgumentOutOfRangeException(nameof(art), art, null),
    };

    [Theory]
    [MemberData(nameof(AenderungsFaelle))]
    public async Task Nachverfolgte_Aenderungen_werden_abgelehnt(string art)
    {
        var coinId = await CoinAsync();

        Assert.Equal([NachverfolgteAenderungen], await AbgelehntAsync(coinId, AenderungsDatei(art)));
    }

    [Fact]
    public async Task Kommentar_Teil_mit_Kommentar_wird_abgelehnt()
    {
        var coinId = await CoinAsync();

        Assert.Equal([Kommentare], await AbgelehntAsync(coinId, Testvorlagen.MitKommentarTeil().Bytes()));
    }

    [Fact]
    public async Task Kommentar_Verweise_im_Dokument_werden_abgelehnt()
    {
        var coinId = await CoinAsync();

        Assert.Equal([Kommentare], await AbgelehntAsync(coinId, Gueltig().Absaetze(Testvorlagen.KommentarVerweis()).Bytes()));
    }

    [Fact]
    public async Task Nur_commentRangeStart_wird_abgelehnt()
    {
        var coinId = await CoinAsync();
        var datei = Gueltig().Absaetze(P("<w:commentRangeStart w:id=\"5\"/>", Run("Text"))).Bytes();

        Assert.Equal([Kommentare], await AbgelehntAsync(coinId, datei));
    }

    [Fact]
    public async Task Nachverfolgte_Aenderungen_und_Kommentare_werden_gemeinsam_gemeldet()
    {
        var coinId = await CoinAsync();
        var bauer = Testvorlagen.MitKommentarTeil(basis: Gueltig().Absaetze(Testvorlagen.Eingefuegt(), Testvorlagen.KommentarVerweis()));

        Assert.Equal([NachverfolgteAenderungen, Kommentare], await AbgelehntAsync(coinId, bauer.Bytes()));
    }

    [Fact]
    public async Task Platzhalterpruefung_entfaellt_bei_nachverfolgten_Aenderungen()
    {
        var coinId = await CoinAsync();
        var datei = Mit(Testvorlagen.Eingefuegt(), Text("{{Unbekannt.Feld}}")).Bytes();

        Assert.Equal([NachverfolgteAenderungen], await AbgelehntAsync(coinId, datei));
    }

    // ---------- AK-9: Größe ----------

    [Fact]
    public async Task Leere_Datei_liefert_400_Die_Datei_ist_leer()
    {
        var coinId = await CoinAsync();

        Assert.Equal(["Die Datei ist leer."], await AbgelehntAsync(coinId, []));
    }

    [Fact]
    public async Task Genau_5_MiB_werden_angenommen_und_gespeichert()
    {
        var coinId = await CoinAsync();
        var datei = Testvorlagen.MitGenauerGroesse(FuenfMiB);

        var status = await LadeVorlageHochAsync(coinId, datei);

        Assert.Equal(1, status.GetProperty("aktiveVersion").GetInt32());
        Assert.Single(await VorlageDb.VersionenAsync(coinId));
    }

    [Fact]
    public async Task Fuenf_MiB_plus_ein_Byte_liefert_413_Vorlage_zu_gross()
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, new byte[FuenfMiB + 1]);

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.RequestEntityTooLarge);
        Assert.Equal("Vorlage zu groß", json.GetProperty("title").GetString());
        Assert.Equal("Die Vorlage darf höchstens 5 MB groß sein.", json.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Zu_grosse_Datei_speichert_nichts()
    {
        var coinId = await CoinAsync();
        var vorher = await SpeicherZustandAsync(coinId);

        using var antwort = await PostVersionAsync(coinId, new byte[FuenfMiB + 1]);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, antwort.StatusCode);

        Assert.Equal(vorher, await SpeicherZustandAsync(coinId));
    }

    // ---------- AK-7, AK-8: Formular, Reihenfolge ----------

    [Fact]
    public async Task Ohne_Feld_datei_liefert_400_mit_Fehler_fuer_datei()
    {
        var coinId = await CoinAsync();

        using var antwort = await Client.PostAsync(VersionenUrl(coinId), Multipart(Gueltig().Bytes(), feld: "vorlage"));

        Assert.Equal(["datei"], await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task Zwei_Dateien_liefern_400_mit_Fehler_fuer_datei()
    {
        var coinId = await CoinAsync();
        var inhalt = new MultipartFormDataContent
        {
            { new ByteArrayContent(Gueltig().Bytes()), "datei", "eins.docx" },
            { new ByteArrayContent(Gueltig().Bytes()), "datei", "zwei.docx" },
        };

        using var antwort = await Client.PostAsync(VersionenUrl(coinId), inhalt);

        Assert.Equal(["datei"], await AssertValidierungsfehlerAsync(antwort));
    }

    [Fact]
    public async Task JSON_statt_multipart_liefert_415()
    {
        var coinId = await CoinAsync();

        using var antwort = await Client.PostAsync(VersionenUrl(coinId), new StringContent("{}", Encoding.UTF8, "application/json"));

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.UnsupportedMediaType);
    }

    [Fact]
    public async Task Rohes_DOCX_statt_multipart_liefert_415()
    {
        var coinId = await CoinAsync();
        var inhalt = new ByteArrayContent(Gueltig().Bytes());
        inhalt.Headers.ContentType = MediaTypeHeaderValue.Parse(DocxContentType);

        using var antwort = await Client.PostAsync(VersionenUrl(coinId), inhalt);

        await AssertProblemDetailsAsync(antwort, HttpStatusCode.UnsupportedMediaType);
    }

    [Fact]
    public async Task Unbekannter_Coin_liefert_404_Coin_nicht_gefunden()
    {
        using var antwort = await PostVersionAsync(Guid.NewGuid(), Gueltig().Bytes());

        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Coin nicht gefunden", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Unbekannter_Coin_mit_ungueltigem_Inhalt_liefert_404_vor_400()
    {
        using var antwort = await PostVersionAsync(Guid.NewGuid(), Testvorlagen.Textdatei());

        Assert.Equal(HttpStatusCode.NotFound, antwort.StatusCode);
    }

    [Fact]
    public async Task Unbekannter_Coin_mit_zu_grosser_Datei_liefert_413_vor_404()
    {
        using var antwort = await PostVersionAsync(Guid.NewGuid(), new byte[FuenfMiB + 1]);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, antwort.StatusCode);
    }

    [Fact]
    public async Task Unbekannter_Coin_mit_JSON_liefert_415_vor_404()
    {
        using var antwort = await Client.PostAsync(VersionenUrl(Guid.NewGuid()), new StringContent("{}", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, antwort.StatusCode);
    }

    // ---------- AK-8: bei Fehlern wird nichts gespeichert, kein Audit ----------

    public static TheoryData<string> AblehnungsFaelle =>
        ["Text", "docm", "XXE", "ActiveX", "nachverfolgte Aenderung", "Kommentar", "fehlender Pflichtplatzhalter", "Zip-Bombe", "leer"];

    private static byte[] AblehnungsDatei(string art) => art switch
    {
        "Text" => Testvorlagen.Textdatei(),
        "docm" => Testvorlagen.Docm(),
        "XXE" => Testvorlagen.Xxe(),
        "ActiveX" => Testvorlagen.MitActiveX().Bytes(),
        "nachverfolgte Aenderung" => Gueltig().Absaetze(Testvorlagen.Eingefuegt()).Bytes(),
        "Kommentar" => Testvorlagen.MitKommentarTeil().Bytes(),
        "fehlender Pflichtplatzhalter" => Testvorlagen.OhneCoinName().Bytes(),
        "Zip-Bombe" => Testvorlagen.MitNullen(2 * Testvorlagen.MiB),
        "leer" => [],
        _ => throw new ArgumentOutOfRangeException(nameof(art), art, null),
    };

    [Theory]
    [MemberData(nameof(AblehnungsFaelle))]
    public async Task Abgelehnte_Datei_speichert_nichts_und_schreibt_kein_Audit(string art)
    {
        var coinId = await CoinAsync();
        var vorher = await SpeicherZustandAsync(coinId);

        using var antwort = await PostVersionAsync(coinId, AblehnungsDatei(art));
        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);

        Assert.Equal(vorher, await SpeicherZustandAsync(coinId));
    }

    [Theory]
    [MemberData(nameof(AblehnungsFaelle))]
    public async Task Abgelehnte_Datei_laesst_die_aktive_Vorlage_unveraendert(string art)
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);
        var aktivVorher = await LadeAsync(AktiveDateiUrl(coinId));

        using var antwort = await PostVersionAsync(coinId, AblehnungsDatei(art));
        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);

        Assert.Equal(1, (await StatusAsync(coinId)).GetProperty("aktiveVersion").GetInt32());
        Assert.Equal(aktivVorher, await LadeAsync(AktiveDateiUrl(coinId)));
    }

    // ---------- AK-7: Originalname und Content-Type werden nicht gespeichert ----------

    [Fact]
    public async Task Originaldateiname_wird_nirgends_gespeichert_oder_zurueckgegeben()
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, Gueltig().Bytes(), "geheimer-Name-Qy55.docx");
        var text = await antwort.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);

        Assert.DoesNotContain("Qy55", text, StringComparison.Ordinal);
        Assert.DoesNotContain("Qy55", await VorlageDb.AuditAlsTextAsync(), StringComparison.Ordinal);
        Assert.DoesNotContain("Qy55", (await StatusAsync(coinId)).ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Tabelle_zertifikat_vorlage_hat_keine_Spalte_fuer_Dateiname_oder_Content_Type()
    {
        Assert.Equal(
            ["coin_id", "groesse_bytes", "hochgeladen_am", "hochgeladen_von", "id", "inhalt", "sha256", "version"],
            await VorlageDb.SpaltenAsync("zertifikat_vorlage"));
    }
}
