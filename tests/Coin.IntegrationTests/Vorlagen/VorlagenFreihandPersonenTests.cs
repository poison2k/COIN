using System.Net;
using Coin.IntegrationTests.Infrastruktur;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 8, AK-10 „Namespace-Positivliste“ Punkt 10 (QA-Review 6, Befund 1, Entscheidung O1,
/// F10, Annahmen A33/A34): Freihand-Elemente in erlaubten Namespaces (<c>w:contentPart</c>, <c>w14:contentPart</c>,
/// <c>a14:contentPart</c>, <c>o:ink</c>) und Personenlisten (<c>w15:people</c>, <c>w15:person</c>,
/// <c>w15:presenceInfo</c>) außerhalb des Personen-Teils ergeben genau die Erweiterungsmeldung, unabhängig vom Ort.
/// Der Personen-Teil selbst (<c>…people+xml</c>) wird weiter angenommen und bei der Bereinigung entfernt (AK-16).
/// </summary>
public class VorlagenFreihandPersonenTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private const string W15 = "http://schemas.microsoft.com/office/word/2012/wordml";
    private const string A14 = "http://schemas.microsoft.com/office/drawing/2010/main";
    private const string PeopleTyp = "application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml";

    /// <summary>Eindeutige Testwerte (keine echten Personen).</summary>
    private const string Person = "Personenliste Pl81";
    private const string PersonKennung = "pl82@example.invalid";

    private static string XmlKopf => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";

    private static string Personenliste =>
        $"<w15:people xmlns:w15=\"{W15}\"><w15:person w15:author=\"{Person}\">" +
        $"<w15:presenceInfo w15:providerId=\"AD\" w15:userId=\"{PersonKennung}\"/></w15:person></w15:people>";

    private async Task<string[]> AbgelehntOhneSpeichernAsync(byte[] datei)
    {
        var coinId = await CoinAsync();
        var vorher = await SpeicherZustandAsync(coinId);

        var meldungen = await AbgelehntAsync(coinId, datei);

        Assert.Equal(vorher, await SpeicherZustandAsync(coinId));
        return meldungen;
    }

    private async Task<Guid> AngenommenAsync(byte[] datei)
    {
        var coinId = await CoinAsync();

        using var antwort = await PostVersionAsync(coinId, datei);

        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"{(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return coinId;
    }

    // ---------- Freihand (O1) ----------

    public static TheoryData<string> FreihandFaelle =>
    [
        "w:contentPart im Absatz",
        "w14:contentPart im Absatz",
        "a14:contentPart in a:graphicData",
        "o:ink in w:pict",
    ];

    /// <summary>Freihand-Fall; Verweise zeigen auf einen vorhandenen PNG-Teil, damit keine andere Regel greift.</summary>
    private static byte[] Freihand(string fall, bool mitFreihand = true)
    {
        var bauer = Gueltig();
        var rid = bauer.DokumentTeil("media/image1.png", "image/png", RelImage, Testbilder.Png(64));
        var block = fall switch
        {
            "w:contentPart im Absatz" => P(Run("Text"), mitFreihand ? $"<w:contentPart r:id=\"{rid}\"/>" : string.Empty),
            "w14:contentPart im Absatz" => P(Run("Text"), mitFreihand ? $"<w14:contentPart r:id=\"{rid}\"/>" : string.Empty),
            "a14:contentPart in a:graphicData" => P(
                "<w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"952500\" cy=\"952500\"/>" +
                "<wp:docPr id=\"61\" name=\"Freihand 61\"/><a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\">" +
                (mitFreihand
                    ? $"<a14:contentPart xmlns:a14=\"{A14}\" r:id=\"{rid}\"/>"
                    : $"<pic:pic><pic:nvPicPr><pic:cNvPr id=\"61\" name=\"Bild 61\"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed=\"{rid}\"/></pic:blipFill><pic:spPr/></pic:pic>") +
                "</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"),
            "o:ink in w:pict" => P(
                "<w:r><w:pict><v:shape id=\"Freihand1\" style=\"width:20pt;height:20pt\">" +
                (mitFreihand ? "<o:ink i=\"AHAHHgICdAIA\" annotation=\"t\"/>" : string.Empty) +
                "</v:shape></w:pict></w:r>"),
            _ => throw new ArgumentOutOfRangeException(nameof(fall), fall, null),
        };

        return bauer.Absaetze(block).Bytes();
    }

    [Theory]
    [MemberData(nameof(FreihandFaelle))]
    public async Task Freihand_Element_in_erlaubtem_Namespace_ergibt_die_Erweiterungsmeldung(string fall)
    {
        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(Freihand(fall)));
    }

    [Theory]
    [MemberData(nameof(FreihandFaelle))]
    public async Task Gegenprobe_dieselbe_Datei_ohne_Freihand_Element_wird_angenommen(string fall)
    {
        await AngenommenAsync(Freihand(fall, mitFreihand: false));
    }

    [Theory]
    [MemberData(nameof(FreihandFaelle))]
    public void Gegenprobe_Freihand_Testdatei_verwendet_nur_erlaubte_Namespaces(string fall)
    {
        var nichtErlaubt = DocxLeser.VerwendeteNamespaces(Freihand(fall))
            .Where(e => !Coin.Domain.Vorlagen.WordNamespaces.IstErlaubt(e[(e.IndexOf(": ", StringComparison.Ordinal) + 2)..]));

        Assert.Empty(nichtErlaubt);
    }

    [Fact]
    public async Task Freihand_Element_in_der_Kopfzeile_ergibt_die_Erweiterungsmeldung()
    {
        var bauer = Gueltig().Kopfzeile("default", P(Run("Kopf"), "<w:contentPart r:id=\"rIdKopfBild\"/>"));
        bauer.Beziehung("word/header1.xml", RelImage, "media/image1.png", id: "rIdKopfBild");
        bauer.Teil("word/media/image1.png", null, Testbilder.Png(64));

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    // ---------- Personenlisten ----------

    public static TheoryData<string> PersonenFaelle =>
    [
        "w15:people im Hauptteil",
        "w15:people in settings.xml",
        "w15:people in verwaistem application/xml-Teil",
        "nur w15:presenceInfo im Hauptteil",
        "nur w15:person im Hauptteil",
    ];

    private static byte[] MitPersonen(string fall) => fall switch
    {
        "w15:people im Hauptteil" => Gueltig().Absaetze(Personenliste).Bytes(),
        "w15:people in settings.xml" => Gueltig().Einstellungen("<w:zoom w:percent=\"100\"/>" + Personenliste).Bytes(),
        "w15:people in verwaistem application/xml-Teil" => Gueltig().Teil("word/waise.xml", "application/xml", XmlKopf + Personenliste).Bytes(),
        "nur w15:presenceInfo im Hauptteil" => Gueltig().Absaetze(
            P(Run("Text"), $"<w15:presenceInfo xmlns:w15=\"{W15}\" w15:providerId=\"AD\" w15:userId=\"{PersonKennung}\"/>")).Bytes(),
        "nur w15:person im Hauptteil" => Gueltig().Absaetze(
            P(Run("Text"), $"<w15:person xmlns:w15=\"{W15}\" w15:author=\"{Person}\"/>")).Bytes(),
        _ => throw new ArgumentOutOfRangeException(nameof(fall), fall, null),
    };

    [Theory]
    [MemberData(nameof(PersonenFaelle))]
    public async Task Personenliste_ausserhalb_des_Personen_Teils_ergibt_die_Erweiterungsmeldung(string fall)
    {
        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(MitPersonen(fall)));
    }

    [Fact]
    public async Task Personen_Teil_mit_Content_Type_people_wird_angenommen_und_im_Download_entfernt()
    {
        var bauer = Gueltig();
        bauer.DokumentTeil("people.xml", PeopleTyp, RelPeople, XmlKopf + Personenliste);

        var coinId = await AngenommenAsync(bauer.Bytes());
        var download = await LadeAsync(AktiveDateiUrl(coinId));

        Assert.DoesNotContain("word/people.xml", DocxLeser.Eintraege(download).Keys);
        Assert.DoesNotContain(Person, DocxLeser.AllesAlsText(download), StringComparison.Ordinal);
        Assert.DoesNotContain(PersonKennung, DocxLeser.AllesAlsText(download), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Personen_Teil_und_Personenliste_im_Hauptteil_ergeben_die_Erweiterungsmeldung()
    {
        var bauer = Gueltig().Absaetze(Personenliste);
        bauer.DokumentTeil("people.xml", PeopleTyp, RelPeople, XmlKopf + Personenliste);

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }

    [Fact]
    public async Task Personenliste_und_Kommentar_im_selben_Teil_ergeben_nur_die_Erweiterungsmeldung()
    {
        var bauer = Gueltig().Absaetze(Personenliste, Testvorlagen.KommentarVerweis());
        Testvorlagen.MitKommentarTeil(basis: bauer);

        Assert.Equal([Erweiterungen], await AbgelehntOhneSpeichernAsync(bauer.Bytes()));
    }
}
