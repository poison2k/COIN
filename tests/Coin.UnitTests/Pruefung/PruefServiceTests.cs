using System.Reflection;
using Coin.Domain.Ausgaben;
using Coin.Domain.Pruefung;
using Coin.UnitTests.Zertifikate;
using Microsoft.Extensions.Time.Testing;

namespace Coin.UnitTests.Pruefung;

/// <summary>
/// Feature hologrammnummer, AK-16, AK-18, AK-20 und AK-21 (ADR-0034 Punkt 2, 3 und 5): <see cref="PruefService"/> mit
/// Fakes. Erwartete Verträge (Abschnitt 5.6):
/// <list type="bullet">
/// <item><c>new PruefService(IPruefRepository repository, TimeProvider zeit)</c> und
/// <c>Task&lt;PruefenErgebnis&gt; PruefenAsync(string? eingabe, Guid? coinId, bool mitEmpfaenger, Guid akteurId, CancellationToken ct)</c>.</item>
/// <item><c>PruefenErgebnis</c>: geschlossene Ergebnisart mit <c>Ungueltig(IReadOnlyDictionary&lt;string, string[]&gt; Fehler)</c>
/// und <c>Geprueft(PruefErgebnisArt Art, PruefTreffer? Treffer)</c>; <c>PruefErgebnisArt</c> = <c>Gueltig</c>,
/// <c>Storniert</c>, <c>FalscherCoin</c>, <c>NichtGefunden</c>.</item>
/// <item><c>IPruefRepository.TrefferAsync(string normalform, bool mitEmpfaenger, ct)</c> → <c>PruefTreffer?</c> (eine Abfrage)
/// und <c>IPruefRepository.AuditSchreibenAsync(eintrag, ct)</c>. Der Audit-Eintrag wird über seine Eigenschaften
/// <c>AkteurId</c>, <c>Zeitpunkt</c>, <c>Nummer</c>, <c>CoinIdGewaehlt</c>, <c>Ergebnis</c>, <c>AusgabeId</c>,
/// <c>MitEmpfaenger</c> gelesen.</item>
/// <item><c>PruefTreffer</c> (ohne Personendaten) mit <c>AusgabeId</c>, <c>CoinId</c>, <c>CoinName</c>, <c>ExemplarNummer</c>,
/// <c>Zertifikatsnummer</c>, <c>Hologrammnummer</c>, <c>Datum</c> und <c>StorniertAm</c> (<c>null</c> = aktiv);
/// <c>PruefTrefferMitEmpfaenger</c> zusätzlich mit den Angaben der Ausgabe. Beide werden per Reflexion nach
/// Parameternamen erzeugt, damit die Reihenfolge frei bleibt.</item>
/// </list>
/// </summary>
public class PruefServiceTests
{
    private static readonly DateTimeOffset Start = new(2026, 11, 3, 10, 0, 0, TimeSpan.Zero);
    private static readonly Guid CoinA = Guid.Parse("01920000-0000-7000-8000-0000000000ca");
    private static readonly Guid CoinB = Guid.Parse("01920000-0000-7000-8000-0000000000cb");
    private static readonly Guid AusgabeId = Guid.Parse("01920000-0000-7000-8000-0000000000ea");
    private static readonly Guid Akteur = Guid.Parse("01920000-0000-7000-8000-0000000000aa");
    private static readonly TimeSpan Mindestdauer = TimeSpan.FromMilliseconds(250);

    private const string MeldungLeer = "Bitte eine Hologrammnummer eingeben.";
    private const string MeldungZeichen =
        "Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.";

    /// <summary>Fake des Repositorys mit Mitschnitt; optional rückt das Lesen die Zeit vor (langsame Abfrage).</summary>
    private sealed class FakeRepository
    {
        public object? Treffer { get; set; }

        public bool AuditScheitert { get; set; }

        public TimeSpan Lesedauer { get; set; }

        public List<(string Normalform, bool MitEmpfaenger)> Abfragen { get; } = [];

        public List<object> Audits { get; } = [];

        public List<string> Aufrufe { get; } = [];

        public IPruefRepository Erzeugen(FakeTimeProvider zeit) => FakeProxy.Erzeugen<IPruefRepository>((methode, args) =>
        {
            Aufrufe.Add(methode.Name);
            switch (methode.Name)
            {
                case "TrefferAsync":
                    Abfragen.Add(((string)args![0]!, args.OfType<bool>().Single()));
                    if (Lesedauer > TimeSpan.Zero)
                    {
                        zeit.Advance(Lesedauer);
                    }

                    return Treffer;
                case "AuditSchreibenAsync":
                    if (AuditScheitert)
                    {
                        throw new InvalidOperationException("Testfehler: Audit kann nicht geschrieben werden.");
                    }

                    Audits.Add(args![0]!);
                    return null;
                default:
                    return null;
            }
        });
    }

    private sealed record Lauf(FakeTimeProvider Zeit, FakeRepository Repository, Task<PruefenErgebnis> Aufgabe);

    private static Lauf Starte(
        object? treffer, string? eingabe = "AB1234", Guid? coinId = null, bool mitEmpfaenger = false, FakeRepository? repository = null)
    {
        var zeit = new FakeTimeProvider(Start);
        var repo = repository ?? new FakeRepository();
        repo.Treffer = treffer;
        var service = new PruefService(repo.Erzeugen(zeit), zeit);
        var aufgabe = service.PruefenAsync(
            eingabe: eingabe, coinId: coinId, mitEmpfaenger: mitEmpfaenger, akteurId: Akteur, ct: CancellationToken.None);
        return new Lauf(zeit, repo, aufgabe);
    }

    /// <summary>Startet die Prüfung, lässt die Mindestdauer verstreichen und liefert das Ergebnis.</summary>
    private static async Task<(PruefenErgebnis Ergebnis, FakeRepository Repository)> PruefeAsync(
        object? treffer, string? eingabe = "AB1234", Guid? coinId = null, bool mitEmpfaenger = false)
    {
        var lauf = Starte(treffer, eingabe, coinId, mitEmpfaenger);
        lauf.Zeit.Advance(Mindestdauer);
        return (await lauf.Aufgabe.WaitAsync(TimeSpan.FromSeconds(10)), lauf.Repository);
    }

    private static PruefenErgebnis.Geprueft Geprueft(PruefenErgebnis ergebnis) => Assert.IsType<PruefenErgebnis.Geprueft>(ergebnis);

    // ---------- Treffer erzeugen (per Reflexion nach Parameternamen) ----------

    private static readonly AusgabeAngaben Angaben = new(
        "Test Empfaenger Pruefung", "Test Dienstgrad", "Test Dienststelle", new DateOnly(2026, 10, 1), "Test Gelegenheit",
        "Test Begruendung", "Test Stelle");

    private static object Treffer(Guid? coinId = null, bool storniert = false, bool mitEmpfaenger = false)
    {
        var storniertAm = storniert ? Start.AddDays(-1) : (DateTimeOffset?)null;
        var werte = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["ausgabeId"] = AusgabeId, ["coinId"] = coinId ?? CoinA, ["coinName"] = "Test Coin Pruefung", ["exemplarNummer"] = 12,
            ["zertifikatsnummer"] = "C0042-0012", ["hologrammnummer"] = "AB 12-34", ["datum"] = new DateOnly(2026, 10, 1),
            ["storniertAm"] = storniertAm, ["storniert"] = storniert, ["angaben"] = Angaben,
            ["empfaengerName"] = Angaben.EmpfaengerName, ["empfaengerDienstgrad"] = Angaben.EmpfaengerDienstgrad,
            ["empfaengerDienststelle"] = Angaben.EmpfaengerDienststelle, ["gelegenheit"] = Angaben.Gelegenheit,
            ["begruendung"] = Angaben.Begruendung, ["ausgebendeStelle"] = Angaben.AusgebendeStelle,
        };
        return Konstruieren(mitEmpfaenger ? typeof(PruefTrefferMitEmpfaenger) : typeof(PruefTreffer), werte);
    }

    private static object Konstruieren(Type typ, IReadOnlyDictionary<string, object?> werte)
    {
        var konstruktor = typ.GetConstructors()
            .Where(k => !(k.GetParameters() is [{ } einziger] && einziger.ParameterType == typ))
            .OrderByDescending(k => k.GetParameters().Length)
            .First();
        var argumente = konstruktor.GetParameters().Select(p => Wert(p, werte)).ToArray();
        return konstruktor.Invoke(argumente);
    }

    private static object? Wert(ParameterInfo p, IReadOnlyDictionary<string, object?> werte)
    {
        var ziel = Nullable.GetUnderlyingType(p.ParameterType) ?? p.ParameterType;
        if (ziel == typeof(PruefTreffer))
        {
            return Konstruieren(typeof(PruefTreffer), werte);
        }

        if (!werte.TryGetValue(p.Name!, out var wert))
        {
            return p.HasDefaultValue ? p.DefaultValue
                : p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType)
                : throw new Xunit.Sdk.XunitException($"Kein Testwert für Parameter {p.Name} ({p.ParameterType.Name}).");
        }

        return wert switch
        {
            DateTimeOffset zeitpunkt when ziel == typeof(DateOnly) => DateOnly.FromDateTime(zeitpunkt.UtcDateTime),
            DateTimeOffset zeitpunkt when ziel == typeof(DateTime) => zeitpunkt.UtcDateTime,
            _ => wert,
        };
    }

    private static object? Eigenschaft(object objekt, string name) =>
        (objekt.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase)
            ?? throw new Xunit.Sdk.XunitException($"{objekt.GetType().Name}.{name} fehlt.")).GetValue(objekt);

    // ---------- AK-16: Ergebnis in fester Reihenfolge ----------

    [Fact]
    public async Task Ohne_Treffer_ist_das_Ergebnis_nichtGefunden()
    {
        var (ergebnis, _) = await PruefeAsync(null);

        Assert.Equal(PruefErgebnisArt.NichtGefunden, Geprueft(ergebnis).Art);
    }

    [Fact]
    public async Task NichtGefunden_hat_keinen_Treffer()
    {
        var (ergebnis, _) = await PruefeAsync(null, coinId: CoinA);

        Assert.Null(Geprueft(ergebnis).Treffer);
    }

    [Fact]
    public async Task Treffer_ohne_gewaehlten_Coin_ist_gueltig_mit_Treffer()
    {
        var treffer = Treffer();

        var (ergebnis, _) = await PruefeAsync(treffer);

        Assert.Equal((PruefErgebnisArt.Gueltig, treffer), (Geprueft(ergebnis).Art, (object?)Geprueft(ergebnis).Treffer));
    }

    [Fact]
    public async Task Treffer_mit_passendem_Coin_ist_gueltig()
    {
        var (ergebnis, _) = await PruefeAsync(Treffer(), coinId: CoinA);

        Assert.Equal(PruefErgebnisArt.Gueltig, Geprueft(ergebnis).Art);
    }

    [Fact]
    public async Task Treffer_mit_anderem_Coin_ist_falscherCoin()
    {
        var (ergebnis, _) = await PruefeAsync(Treffer(), coinId: CoinB);

        Assert.Equal(PruefErgebnisArt.FalscherCoin, Geprueft(ergebnis).Art);
    }

    [Fact]
    public async Task FalscherCoin_hat_keinen_Treffer()
    {
        var (ergebnis, _) = await PruefeAsync(Treffer(), coinId: CoinB);

        Assert.Null(Geprueft(ergebnis).Treffer);
    }

    [Fact]
    public async Task Unbekannter_Coin_gilt_wie_ein_anderer_Coin()
    {
        var (ergebnis, _) = await PruefeAsync(Treffer(), coinId: Guid.NewGuid());

        Assert.Equal(PruefErgebnisArt.FalscherCoin, Geprueft(ergebnis).Art);
    }

    [Fact]
    public async Task Stornierte_Ausgabe_ist_storniert_mit_Treffer()
    {
        var treffer = Treffer(storniert: true);

        var (ergebnis, _) = await PruefeAsync(treffer);

        Assert.Equal((PruefErgebnisArt.Storniert, treffer), (Geprueft(ergebnis).Art, (object?)Geprueft(ergebnis).Treffer));
    }

    [Fact]
    public async Task Stornierte_Ausgabe_mit_passendem_Coin_ist_storniert()
    {
        var (ergebnis, _) = await PruefeAsync(Treffer(storniert: true), coinId: CoinA);

        Assert.Equal(PruefErgebnisArt.Storniert, Geprueft(ergebnis).Art);
    }

    [Fact]
    public async Task FalscherCoin_geht_der_Storno_Pruefung_vor()
    {
        var (ergebnis, _) = await PruefeAsync(Treffer(storniert: true), coinId: CoinB);

        Assert.Equal(PruefErgebnisArt.FalscherCoin, Geprueft(ergebnis).Art);
    }

    [Fact]
    public async Task Gesucht_wird_mit_der_Normalform_der_Eingabe()
    {
        var (_, repository) = await PruefeAsync(null, eingabe: "ab 12-34");

        Assert.Equal("AB1234", Assert.Single(repository.Abfragen).Normalform);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task MitEmpfaenger_wird_an_die_Abfrage_durchgereicht(bool mitEmpfaenger)
    {
        var (_, repository) = await PruefeAsync(null, mitEmpfaenger: mitEmpfaenger);

        Assert.Equal(mitEmpfaenger, Assert.Single(repository.Abfragen).MitEmpfaenger);
    }

    [Fact]
    public async Task Treffer_mit_Empfaenger_wird_unveraendert_weitergegeben()
    {
        var treffer = Treffer(mitEmpfaenger: true);

        var (ergebnis, _) = await PruefeAsync(treffer, mitEmpfaenger: true);

        Assert.Same(treffer, Geprueft(ergebnis).Treffer);
    }

    // ---------- AK-21: Eingabefehler ----------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Leere_Eingabe_meldet_Bitte_eine_Hologrammnummer_eingeben(string? eingabe)
    {
        var lauf = Starte(null, eingabe);

        var ergebnis = Assert.IsType<PruefenErgebnis.Ungueltig>(await lauf.Aufgabe.WaitAsync(TimeSpan.FromSeconds(10)));

        Assert.Equal([MeldungLeer], ergebnis.Fehler["hologrammnummer"]);
    }

    [Fact]
    public async Task Ungueltige_Eingabe_meldet_den_Zeichenfehler()
    {
        var lauf = Starte(null, "AB/1");

        var ergebnis = Assert.IsType<PruefenErgebnis.Ungueltig>(await lauf.Aufgabe.WaitAsync(TimeSpan.FromSeconds(10)));

        Assert.Equal([MeldungZeichen], ergebnis.Fehler["hologrammnummer"]);
    }

    [Fact]
    public void Ungueltige_Eingabe_antwortet_ohne_Mindestdauer()
    {
        var lauf = Starte(null, "AB/1");

        Assert.True(lauf.Aufgabe.IsCompleted, "400 darf nicht auf die Mindestdauer warten (AK-21).");
    }

    [Fact]
    public void Ungueltige_Eingabe_liest_nicht_und_schreibt_kein_Audit()
    {
        var lauf = Starte(Treffer(), "AB/1");

        Assert.Empty(lauf.Repository.Aufrufe);
    }

    // ---------- AK-18: genau ein Lesezugriff und ein Audit-Insert, Mindestdauer ----------

    public static TheoryData<string, bool> AlleFaelle()
    {
        var daten = new TheoryData<string, bool>();
        foreach (var fall in new[] { "gueltig", "storniert", "falscherCoin", "nichtGefunden" })
        {
            daten.Add(fall, false);
            daten.Add(fall, true);
        }

        return daten;
    }

    private static Lauf StarteFall(string fall, bool mitEmpfaenger, FakeRepository? repository = null) => fall switch
    {
        "gueltig" => Starte(Treffer(mitEmpfaenger: mitEmpfaenger), coinId: CoinA, mitEmpfaenger: mitEmpfaenger, repository: repository),
        "storniert" => Starte(Treffer(storniert: true, mitEmpfaenger: mitEmpfaenger), mitEmpfaenger: mitEmpfaenger, repository: repository),
        "falscherCoin" => Starte(Treffer(mitEmpfaenger: mitEmpfaenger), coinId: CoinB, mitEmpfaenger: mitEmpfaenger, repository: repository),
        _ => Starte(null, coinId: CoinA, mitEmpfaenger: mitEmpfaenger, repository: repository),
    };

    [Theory]
    [MemberData(nameof(AlleFaelle))]
    public async Task Jeder_Fall_liest_genau_einmal_und_schreibt_genau_ein_Audit(string fall, bool mitEmpfaenger)
    {
        var lauf = StarteFall(fall, mitEmpfaenger);
        lauf.Zeit.Advance(Mindestdauer);
        await lauf.Aufgabe.WaitAsync(TimeSpan.FromSeconds(10));

        Assert.Equal(["AuditSchreibenAsync", "TrefferAsync"], lauf.Repository.Aufrufe.Order(StringComparer.Ordinal));
    }

    [Theory]
    [MemberData(nameof(AlleFaelle))]
    public void Jeder_Fall_ist_vor_Ablauf_der_Mindestdauer_nicht_fertig(string fall, bool mitEmpfaenger)
    {
        var lauf = StarteFall(fall, mitEmpfaenger);

        lauf.Zeit.Advance(Mindestdauer - TimeSpan.FromMilliseconds(1));

        Assert.False(lauf.Aufgabe.IsCompleted, $"{fall}: Antwort vor Ablauf von 250 ms.");
    }

    [Theory]
    [MemberData(nameof(AlleFaelle))]
    public async Task Jeder_Fall_ist_nach_Ablauf_der_Mindestdauer_fertig(string fall, bool mitEmpfaenger)
    {
        var lauf = StarteFall(fall, mitEmpfaenger);

        lauf.Zeit.Advance(Mindestdauer);

        Assert.IsType<PruefenErgebnis.Geprueft>(await lauf.Aufgabe.WaitAsync(TimeSpan.FromSeconds(10)));
    }

    [Fact]
    public async Task Eine_Abfrage_laenger_als_250_ms_verlaengert_die_Antwort_nicht_weiter()
    {
        var lauf = Starte(Treffer(), repository: new FakeRepository { Lesedauer = TimeSpan.FromMilliseconds(300) });

        Assert.IsType<PruefenErgebnis.Geprueft>(await lauf.Aufgabe.WaitAsync(TimeSpan.FromSeconds(10)));
    }

    [Fact]
    public async Task Die_Mindestdauer_zaehlt_ab_Beginn_inklusive_der_Abfrage()
    {
        var lauf = Starte(Treffer(), repository: new FakeRepository { Lesedauer = TimeSpan.FromMilliseconds(200) });

        Assert.False(lauf.Aufgabe.IsCompleted, "Nach 200 ms Abfrage fehlen noch 50 ms.");
        lauf.Zeit.Advance(TimeSpan.FromMilliseconds(50));
        Assert.IsType<PruefenErgebnis.Geprueft>(await lauf.Aufgabe.WaitAsync(TimeSpan.FromSeconds(10)));
    }

    // ---------- AK-20: Inhalt des Prüf-Audits ----------

    private static async Task<object> AuditAsync(string fall, bool mitEmpfaenger = false)
    {
        var lauf = StarteFall(fall, mitEmpfaenger);
        lauf.Zeit.Advance(Mindestdauer);
        await lauf.Aufgabe.WaitAsync(TimeSpan.FromSeconds(10));
        return Assert.Single(lauf.Repository.Audits);
    }

    [Theory]
    [InlineData("gueltig", "Gueltig")]
    [InlineData("storniert", "Storniert")]
    [InlineData("falscherCoin", "FalscherCoin")]
    [InlineData("nichtGefunden", "NichtGefunden")]
    public async Task Audit_enthaelt_die_Ergebnisart(string fall, string erwartet)
    {
        var audit = await AuditAsync(fall);

        Assert.Equal(erwartet, Eigenschaft(audit, "Ergebnis")?.ToString());
    }

    [Theory]
    [InlineData("gueltig")]
    [InlineData("storniert")]
    [InlineData("falscherCoin")]
    public async Task Audit_enthaelt_die_Ausgabe_ausser_bei_nichtGefunden(string fall)
    {
        var audit = await AuditAsync(fall);

        Assert.Equal(AusgabeId, Eigenschaft(audit, "AusgabeId"));
    }

    [Fact]
    public async Task Audit_bei_nichtGefunden_hat_keine_Ausgabe()
    {
        var audit = await AuditAsync("nichtGefunden");

        Assert.Null(Eigenschaft(audit, "AusgabeId"));
    }

    [Fact]
    public async Task Audit_enthaelt_die_Normalform_der_geprueften_Nummer()
    {
        var lauf = Starte(null, eingabe: "ab 12-34");
        lauf.Zeit.Advance(Mindestdauer);
        await lauf.Aufgabe.WaitAsync(TimeSpan.FromSeconds(10));

        Assert.Equal("AB1234", Eigenschaft(Assert.Single(lauf.Repository.Audits), "Nummer"));
    }

    [Fact]
    public async Task Audit_enthaelt_den_gewaehlten_Coin()
    {
        var audit = await AuditAsync("falscherCoin");

        Assert.Equal(CoinB, Eigenschaft(audit, "CoinIdGewaehlt"));
    }

    [Fact]
    public async Task Audit_ohne_gewaehlten_Coin_hat_keinen_Coin()
    {
        var audit = await AuditAsync("storniert");

        Assert.Null(Eigenschaft(audit, "CoinIdGewaehlt"));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Audit_vermerkt_ob_Empfaengerdaten_ausgeliefert_wurden(bool mitEmpfaenger)
    {
        var audit = await AuditAsync("gueltig", mitEmpfaenger);

        Assert.Equal(mitEmpfaenger, Eigenschaft(audit, "MitEmpfaenger"));
    }

    [Fact]
    public async Task Audit_enthaelt_Akteur_und_Zeitpunkt_aus_dem_TimeProvider()
    {
        var audit = await AuditAsync("gueltig");

        Assert.Equal((Akteur, (object?)Start), (Eigenschaft(audit, "AkteurId"), Eigenschaft(audit, "Zeitpunkt")));
    }

    [Fact]
    public async Task Scheitert_das_Audit_gibt_es_kein_Ergebnis()
    {
        var lauf = Starte(Treffer(), repository: new FakeRepository { AuditScheitert = true });
        lauf.Zeit.Advance(Mindestdauer);

        await Assert.ThrowsAnyAsync<Exception>(() => lauf.Aufgabe.WaitAsync(TimeSpan.FromSeconds(10)));
    }

    [Fact]
    public void Audit_Eintrag_hat_keine_Felder_fuer_Empfaengerdaten()
    {
        var audit = typeof(IPruefRepository).GetMethod("AuditSchreibenAsync")!.GetParameters()[0].ParameterType;

        // Einzige Ausnahme: das Flag MitEmpfaenger (Entwurf Abschnitt 6, ADR-0034 Punkt 5) – nur ein bool, keine Daten.
        Assert.DoesNotContain(VerboteneEigenschaften(audit, mitAngaben: true), n => n != "MitEmpfaenger");
    }

    [Fact]
    public void Audit_Flag_MitEmpfaenger_ist_ein_bool()
    {
        var audit = typeof(IPruefRepository).GetMethod("AuditSchreibenAsync")!.GetParameters()[0].ParameterType;

        Assert.Equal(typeof(bool), audit.GetProperty("MitEmpfaenger", BindingFlags.Public | BindingFlags.Instance)?.PropertyType);
    }

    // ---------- H7, ADR-0021/0034: Treffer ohne Personendaten, nie ein Storno-Grund ----------

    private static readonly string[] Personenfelder =
        ["Empfaenger", "Dienstgrad", "Dienststelle", "Gelegenheit", "Begruendung", "AusgebendeStelle", "Angaben"];

    private static IEnumerable<string> VerboteneEigenschaften(Type typ, bool mitAngaben) =>
        typ.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .Where(n => n.Contains("Grund", StringComparison.OrdinalIgnoreCase)
                || n.Contains("Erfasst", StringComparison.OrdinalIgnoreCase)
                || (mitAngaben && Personenfelder.Any(f => n.Contains(f, StringComparison.OrdinalIgnoreCase))));

    [Fact]
    public void PruefTreffer_hat_keine_Felder_fuer_Empfaengerdaten()
    {
        Assert.Empty(VerboteneEigenschaften(typeof(PruefTreffer), mitAngaben: true));
    }

    [Fact]
    public void PruefTreffer_mit_Empfaenger_hat_keinen_Storno_Grund_und_keinen_Erfasser()
    {
        Assert.Empty(VerboteneEigenschaften(typeof(PruefTrefferMitEmpfaenger), mitAngaben: false));
    }
}
