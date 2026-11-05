using System.Net;
using Coin.IntegrationTests.Hologramm;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Pruefung;

/// <summary>Testdaten einer Prüfung: Coin A mit aktiver und stornierter Ausgabe, Coin B ohne Ausgaben.</summary>
public sealed record PruefSzenario(
    Guid CoinA,
    string CoinAName,
    Guid CoinB,
    Guid AktivId,
    string AktivZertifikatsnummer,
    Guid StorniertId,
    string StorniertZertifikatsnummer);

/// <summary>
/// Gemeinsame Hilfen für die Prüfung (hologrammnummer AK-16 bis AK-21): Coin A mit der aktiven Ausgabe Nr. 12
/// („ab 12-34“ → „AB 12-34“) und der stornierten Ausgabe Nr. 3 („CD 56-78“), Coin B ohne Ausgaben. Alle Empfänger-,
/// Ausgabe- und Storno-Angaben sind eindeutige synthetische Testwerte für die Suche im Antworttext.
/// </summary>
public abstract class PruefungTestBasis(PostgresFixture fixture) : HologrammTestBasis(fixture)
{
    protected const string Name = "Test Empfaenger Pruefung Pv11";
    protected const string Dienstgrad = "Test Dienstgrad Pruefung Pv12";
    protected const string Dienststelle = "Test Dienststelle Pruefung Pv13";
    protected const string Gelegenheit = "Test Gelegenheit Pruefung Pv14";
    protected const string Begruendung = "Test Begruendung Pruefung Pv15";
    protected const string Stelle = "Test Stelle Pruefung Pv16";
    protected const string StornoGrund = "Test Stornogrund Pruefung Pv17";

    protected static readonly string[] Testwerte = [Name, Dienstgrad, Dienststelle, Gelegenheit, Begruendung, Stelle, StornoGrund];

    /// <summary>Schlüssel, die eine Antwort von <c>POST /api/pruefung</c> nie enthalten darf (AK-17).</summary>
    protected static readonly string[] VerboteneSchluesselOhneEmpfaenger =
        ["ausgabeId", "empfaenger", "gelegenheit", "begruendung", "ausgebendeStelle", "stornoGrund", "grund", "storno", "erfasstVon"];

    /// <summary>Schlüssel, die auch <c>…/mit-empfaenger</c> nie enthält (H7: kein Storno-Grund, kein Erfasser).</summary>
    protected static readonly string[] VerboteneSchluesselMitEmpfaenger = ["stornoGrund", "grund", "storno", "erfasstVon"];

    protected async Task<PruefSzenario> SzenarioAsync()
    {
        var coinAName = $"Test Coin Pruefung {Guid.NewGuid():N}"[..30];
        var coinA = await CoinMitAuflageAsync(20, coinAName);
        var coinB = await CoinMitAuflageAsync(20);

        var aktiv = GueltigeAusgabe(12, Name, Dienstgrad, Dienststelle, Datum, Gelegenheit, Begruendung, Stelle);
        aktiv["hologrammnummer"] = "ab 12-34";
        var storniert = GueltigeAusgabe(3, Name, Dienstgrad, Dienststelle, Datum, Gelegenheit, Begruendung, Stelle);
        storniert["hologrammnummer"] = "CD 56-78";

        var (aktivId, aktivNummer) = await ErfasseRohAsync(coinA, aktiv);
        var (storniertId, storniertNummer) = await ErfasseRohAsync(coinA, storniert);
        await StornierenAsync(coinA, storniertId, StornoGrund);

        return new PruefSzenario(coinA, coinAName, coinB, aktivId, aktivNummer, storniertId, storniertNummer);
    }

    private async Task<(Guid Id, string Zertifikatsnummer)> ErfasseRohAsync(Guid coinId, Dictionary<string, object?> body)
    {
        using var antwort = await PostAusgabeAsync(coinId, body);
        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"Erfassen: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        var json = await JsonAsync(antwort);
        return (json.GetProperty("id").GetGuid(), json.GetProperty("zertifikatsnummer").GetString()!);
    }

    /// <summary>Heute in Europe/Berlin als <c>JJJJ-MM-TT</c> (Storno-Datum).</summary>
    protected static string HeuteInBerlin()
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin");
        return TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zone).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
    }
}
