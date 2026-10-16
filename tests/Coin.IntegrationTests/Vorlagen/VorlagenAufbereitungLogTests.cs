using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Coin.Domain.Vorlagen;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen Rev. 3, AK-16 „Log (G3)“ und Abschnitt 8 (ADR-0024 Punkt 3 und 5): Scheitert die
/// Bereinigung (Ausnahme) oder die Nachprüfung der bereinigten Fassung (Befund, Größe, nicht bereinigter Zustand),
/// antwortet die API mit <c>400</c> „Die Datei konnte nicht verarbeitet werden …“, speichert nichts und schreibt genau
/// eine Warnung mit fester EventId und fester Meldung – ohne Ausnahmeobjekt, Ausnahmetext, Dateiinhalt oder Dateinamen.
/// Testhaken: <see cref="IDocxBereinigung"/> wird im Testhost per <c>FactoryOptionen.Dienste</c> ersetzt.
/// </summary>
public class VorlagenAufbereitungLogTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    public const string WarnungBereinigung = "Bereinigung einer Zertifikatsvorlage fehlgeschlagen.";
    public const string WarnungNachpruefung = "Nachprüfung einer bereinigten Zertifikatsvorlage fehlgeschlagen.";

    private const string NichtVerarbeitbar =
        "Die Datei konnte nicht verarbeitet werden. Bitte in Word erneut als Word-Dokument (.docx) speichern und erneut hochladen.";

    private const string Geheimnis = "Geheimer Dokumentinhalt Lg97";
    private const string Dateiname = "Logdatei-Lg98.docx";
    private const string Dokumenttext = "Logtext Lg99";
    private const string Autor = "Logautor Lg9a";

    /// <summary>Verhalten der ersetzten Bereinigung und die erwartete Warnung.</summary>
    public static TheoryData<string, string> Fehlerarten => new()
    {
        { "wirft", WarnungBereinigung },
        { "liefert ungueltige Datei", WarnungNachpruefung },
        { "liefert zu grosse Datei", WarnungNachpruefung },
        { "liefert leere Datei", WarnungNachpruefung },
        { "liefert unbereinigte Datei", WarnungNachpruefung },
    };

    private sealed class FakeBereinigung(string art) : IDocxBereinigung
    {
        public byte[] Bereinigen(byte[] inhalt) => art switch
        {
            "wirft" => throw new InvalidOperationException($"{Geheimnis} in word/document.xml"),
            "liefert ungueltige Datei" => Encoding.UTF8.GetBytes($"{Geheimnis} - kein ZIP"),
            "liefert zu grosse Datei" => new byte[FuenfMiB + 1],
            "liefert leere Datei" => [],
            // Gibt das Original unverändert zurück: der Autor bleibt stehen, die Nachprüfung muss das erkennen (Rev. 3).
            "liefert unbereinigte Datei" => inhalt,
            _ => throw new ArgumentOutOfRangeException(nameof(art), art, null),
        };
    }

    private sealed record Lauf(HttpStatusCode Status, string[] Meldungen, SammelLoggerProvider Logs, string ZustandVorher, string ZustandNachher);

    private static byte[] Upload() =>
        Gueltig().Absaetze(Text(Dokumenttext)).KernEigenschaften($"<dc:creator>{Autor}</dc:creator>").Bytes();

    private async Task<Lauf> HochladenMitAsync(string art, byte[]? datei = null)
    {
        var logs = new SammelLoggerProvider();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Logger = logs,
            Einstellungen = new Dictionary<string, string?>
            {
                ["Logging:LogLevel:Default"] = "Trace",
                ["Logging:LogLevel:Microsoft"] = "Trace",
                ["Logging:LogLevel:Microsoft.AspNetCore"] = "Trace",
            },
            Dienste = dienste => dienste.AddSingleton<IDocxBereinigung>(new FakeBereinigung(art)),
        });
        using var client = factory.CreateClient();
        using var coin = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin($"Coin Aufbereitung {Guid.NewGuid():N}"));
        var coinId = (await JsonAsync(coin)).GetProperty("id").GetGuid();
        var vorher = await SpeicherZustandAsync(coinId);

        var inhalt = new ByteArrayContent(datei ?? Upload());
        inhalt.Headers.ContentType = MediaTypeHeaderValue.Parse(DocxContentType);
        using var antwort = await client.PostAsync(VersionenUrl(coinId), new MultipartFormDataContent { { inhalt, "datei", Dateiname } });
        var meldungen = antwort.StatusCode == HttpStatusCode.BadRequest ? await DateiFehlerAsync(antwort) : [];
        return new Lauf(antwort.StatusCode, meldungen, logs, vorher, await SpeicherZustandAsync(coinId));
    }

    /// <summary>Warnungen und Fehler aus dem Anwendungscode (Kategorien <c>Coin.*</c>).</summary>
    private static List<LogEintrag> AnwendungsWarnungen(SammelLoggerProvider logs) =>
        logs.Strukturiert
            .Where(e => e.Level >= LogLevel.Warning && e.Kategorie.StartsWith("Coin", StringComparison.Ordinal))
            .ToList();

    [Fact]
    public void Testdatei_ist_eine_gueltige_Vorlage_mit_Autor()
    {
        Assert.Contains(Autor, DocxLeser.AllesAlsText(Upload()), StringComparison.Ordinal);
        Assert.Empty(DocxLeser.ValidatorFehler(Upload()));
    }

    [Theory]
    [MemberData(nameof(Fehlerarten))]
    public async Task Fehlgeschlagene_Bereinigung_oder_Nachpruefung_liefert_400_nicht_verarbeitbar(string art, string warnung)
    {
        _ = warnung;
        var lauf = await HochladenMitAsync(art);

        Assert.Equal(HttpStatusCode.BadRequest, lauf.Status);
        Assert.Equal([NichtVerarbeitbar], lauf.Meldungen);
    }

    [Theory]
    [MemberData(nameof(Fehlerarten))]
    public async Task Fehlgeschlagene_Bereinigung_oder_Nachpruefung_speichert_nichts(string art, string warnung)
    {
        _ = warnung;
        var lauf = await HochladenMitAsync(art);

        Assert.Equal(lauf.ZustandVorher, lauf.ZustandNachher);
    }

    [Theory]
    [MemberData(nameof(Fehlerarten))]
    public async Task Schreibt_genau_eine_Warnung_mit_fester_Meldung(string art, string warnung)
    {
        var lauf = await HochladenMitAsync(art);

        var eintrag = Assert.Single(AnwendungsWarnungen(lauf.Logs));
        Assert.Equal(LogLevel.Warning, eintrag.Level);
        Assert.Equal(warnung, eintrag.Nachricht);
    }

    [Theory]
    [MemberData(nameof(Fehlerarten))]
    public async Task Warnung_hat_eine_feste_EventId(string art, string warnung)
    {
        _ = warnung;
        var lauf = await HochladenMitAsync(art);

        var eintrag = Assert.Single(AnwendungsWarnungen(lauf.Logs));
        Assert.NotEqual(0, eintrag.EventId.Id);
    }

    [Fact]
    public async Task Beide_Warnungen_haben_verschiedene_feste_EventIds()
    {
        var bereinigung = Assert.Single(AnwendungsWarnungen((await HochladenMitAsync("wirft")).Logs));
        var nachpruefung = Assert.Single(AnwendungsWarnungen((await HochladenMitAsync("liefert ungueltige Datei")).Logs));
        var nochmal = Assert.Single(AnwendungsWarnungen((await HochladenMitAsync("wirft")).Logs));

        Assert.NotEqual(bereinigung.EventId.Id, nachpruefung.EventId.Id);
        Assert.Equal(bereinigung.EventId.Id, nochmal.EventId.Id);
    }

    [Theory]
    [MemberData(nameof(Fehlerarten))]
    public async Task Warnung_enthaelt_keine_Ausnahme_und_keine_strukturierten_Werte(string art, string warnung)
    {
        _ = warnung;
        var lauf = await HochladenMitAsync(art);

        var eintrag = Assert.Single(AnwendungsWarnungen(lauf.Logs));
        Assert.DoesNotContain("Exception", eintrag.Text, StringComparison.Ordinal);
        Assert.DoesNotContain(" at ", eintrag.Text, StringComparison.Ordinal);
        Assert.All(eintrag.Werte.Keys, k => Assert.Equal("{OriginalFormat}", k));
    }

    [Theory]
    [MemberData(nameof(Fehlerarten))]
    public async Task Logs_enthalten_weder_Ausnahmetext_noch_Dateiinhalt_noch_Dateinamen(string art, string warnung)
    {
        _ = warnung;
        var lauf = await HochladenMitAsync(art);

        Assert.DoesNotContain("Lg9", lauf.Logs.Gesamt, StringComparison.Ordinal);
        Assert.DoesNotContain("word/document.xml", lauf.Logs.Gesamt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Ablehnung_bei_der_ersten_Pruefung_schreibt_keine_Warnung()
    {
        // Nutzerfehler (unbekannter Platzhalter) ist kein Betriebsereignis; die Bereinigung wird gar nicht erreicht.
        var lauf = await HochladenMitAsync("wirft", Gueltig().Absaetze(Text("{{Unbekannt.Feld}}")).Bytes());

        Assert.Equal(HttpStatusCode.BadRequest, lauf.Status);
        Assert.Empty(AnwendungsWarnungen(lauf.Logs));
    }
}
