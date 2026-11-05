using System.Reflection;
using Coin.Domain.Ausgaben;
using Coin.Domain.Katalog;
using Coin.UnitTests.Zertifikate;
using Microsoft.Extensions.Time.Testing;

namespace Coin.UnitTests.Ausgaben;

/// <summary>
/// Feature hologrammnummer, AK-5 bis AK-8, AK-10 und AK-11 (ADR-0033 Punkt 5): <see cref="AusgabeService"/> mit Fakes.
/// Erwartete Verträge (Abschnitt 5.6):
/// <list type="bullet">
/// <item><c>ErfassenAsync(coinId, exemplarNummer, eingabe, string? hologrammnummer, akteurId, ct)</c> – Fehler der Nummer
/// gemeinsam mit <c>AusgabeAngaben.Pruefen</c>, Ergebnis <c>AusgabeErfassenErgebnis.HologrammnummerVergeben</c>.</item>
/// <item><c>HologrammnummerAendernAsync(coinId, ausgabeId, string? nummer, string? grund, string? bisherige, akteurId, ct)</c>
/// mit <c>HologrammnummerAendernErgebnis.Geaendert(AusgabeEintrag) | Unveraendert(AusgabeEintrag) | Ungueltig(Fehler) |
/// NichtGefunden | Storniert | VeraltetGelesen | Vergeben</c>.</item>
/// <item><c>ICoinSperre.HologrammLadenAsync(Guid ausgabeId, ct)</c> → <c>Hologrammnummer?</c> (aktuelle Zuordnung) und
/// <c>ICoinSperre.HologrammSetzenAsync(…)</c> → <c>bool</c> (Ablösen der bisherigen + Insert + Audit; <c>false</c> bei
/// <c>23505</c>). Die Argumente von <c>HologrammSetzenAsync</c> prüft der Test nur über ihre Typen: die Ausgabe-Id, die
/// neue (und bei Korrektur die bisherige) <see cref="Hologrammnummer"/> und den Grund als <c>string</c>.</item>
/// </list>
/// Die Sperre ist ein Proxy, damit der Test von weiteren Mitgliedern (z. B. einer Vorabprüfung „Vergeben“) unabhängig
/// bleibt: unbekannte Methoden liefern den Standardwert, Methoden mit „Vergeben“ im Namen den Zustand
/// <see cref="Szenario.Vergeben"/>.
/// </summary>
public class AusgabeServiceHologrammTests
{
    private static readonly Guid CoinId = Guid.Parse("01920000-0000-7000-8000-0000000000c7");
    private static readonly Guid AusgabeId = Guid.Parse("01920000-0000-7000-8000-0000000000e7");
    private static readonly Guid Akteur = Guid.Parse("01920000-0000-7000-8000-0000000000a7");
    private static readonly DateTimeOffset Jetzt = new(2026, 11, 3, 9, 0, 0, TimeSpan.Zero);

    private const string MeldungLeer = "Bitte eine Hologrammnummer eingeben.";
    private const string MeldungZeichen =
        "Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.";
    private const string MeldungGrundFehlt = "Bitte einen Grund für die Korrektur angeben.";
    private const string MeldungGrundZuLang = "Der Grund darf höchstens 500 Zeichen lang sein.";

    private static readonly AusgabeAngabenEingabe Eingabe = new(
        "Max Beispiel", "Hauptmann", "Beispielbataillon 1", new DateOnly(2026, 10, 1), "Truppenbesuch",
        "Herausragende Leistung", "Kommandeur Beispielbataillon 1");

    private static AusgabeAngaben Angaben() => AusgabeAngaben.Pruefen(
        "Max Beispiel", null, null, new DateOnly(2026, 10, 1), "Truppenbesuch", "Herausragende Leistung",
        "Kommandeur Beispielbataillon 1", Jetzt).Wert!;

    private static Hologrammnummer Nummer(string eingabe) =>
        Assert.IsType<HologrammnummerPruefung.Gueltig>(Hologrammnummer.Pruefen(eingabe)).Nummer;

    /// <summary>Zustand der Fakes und Mitschnitt der Aufrufe.</summary>
    private sealed class Szenario
    {
        public bool CoinVorhanden { get; set; } = true;

        public int? Auflage { get; set; } = 10;

        public int? NaechsteFreie { get; set; } = 1;

        public bool ExemplarAusgegeben { get; set; }

        /// <summary>Simuliert „Nummer vergeben“: Vorabprüfungen liefern <c>true</c>, <c>HologrammSetzenAsync</c> <c>false</c>.</summary>
        public bool Vergeben { get; set; }

        /// <summary>Ausgabe, die <c>AusgabeLadenAsync</c> unter der Sperre liefert (<c>null</c> = unbekannt).</summary>
        public Ausgabe? Geladen { get; set; }

        /// <summary>Aktuelle Nummer der Ausgabe laut <c>HologrammLadenAsync</c>.</summary>
        public Hologrammnummer? Aktuell { get; set; }

        public Ausgabe? Gespeichert { get; set; }

        public List<(string Methode, object?[] Argumente)> Aufrufe { get; } = [];

        public int Anzahl(string methode) => Aufrufe.Count(a => a.Methode == methode);

        public object?[] Argumente(string methode) => Assert.Single(Aufrufe, a => a.Methode == methode).Argumente;
    }

    private static AusgabeService Service(Szenario s)
    {
        var sperre = FakeProxy.Erzeugen<ICoinSperre>((methode, args) =>
        {
            s.Aufrufe.Add((methode.Name, args ?? []));
            return methode.Name switch
            {
                "get_Auflage" => s.Auflage,
                "get_Kennung" => "C0042",
                nameof(ICoinSperre.NaechsteFreieNummerAsync) => s.NaechsteFreie,
                nameof(ICoinSperre.IstAusgegebenAsync) => s.ExemplarAusgegeben,
                nameof(ICoinSperre.AusgabeHinzufuegenAsync) => (s.Gespeichert = (Ausgabe)args![0]!) is not null,
                nameof(ICoinSperre.AusgabeLadenAsync) => s.Geladen,
                "HologrammLadenAsync" => s.Aktuell,
                "HologrammSetzenAsync" => !s.Vergeben,
                _ when methode.Name.Contains("Vergeben", StringComparison.Ordinal) && methode.ReturnType == typeof(Task<bool>) => s.Vergeben,
                _ => null,
            };
        });
        var repository = FakeProxy.Erzeugen<IAusgabeRepository>((methode, args) =>
        {
            s.Aufrufe.Add((methode.Name, args ?? []));
            return methode.Name switch
            {
                nameof(IAusgabeRepository.SperrenAsync) => s.CoinVorhanden ? sperre : null,
                nameof(IAusgabeRepository.FindenAsync) => Eintrag(s),
                _ => null,
            };
        });
        var katalog = FakeProxy.Erzeugen<ICoinKatalogRepository>((_, _) => null);
        return new AusgabeService(repository, katalog, new FakeTimeProvider(Jetzt));
    }

    /// <summary>Lesesicht zur gespeicherten bzw. geladenen Ausgabe (Konstruktor per Reflexion, er wächst um die Nummer).</summary>
    private static AusgabeEintrag? Eintrag(Szenario s)
    {
        var ausgabe = s.Gespeichert ?? s.Geladen;
        if (ausgabe is null)
        {
            return null;
        }

        return (AusgabeEintrag)ZertifikatDomain.Konstruieren(typeof(AusgabeEintrag), new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["id"] = ausgabe.Id, ["exemplarNummer"] = ausgabe.ExemplarNummer, ["zertifikatsnummer"] = "C0042-0001",
            ["angaben"] = ausgabe.Angaben, ["erfasstAm"] = ausgabe.ErfasstAm, ["erfasstVon"] = new Akteur(Akteur, "Test Erfasser"),
            ["storno"] = null, ["hologrammnummer"] = "AB 12-34",
        });
    }

    private static Ausgabe GespeicherteAusgabe(bool storniert = false) => Ausgabe.Wiederherstellen(
        AusgabeId, CoinId, 1, "C0042-0001", Angaben(), Akteur, Jetzt.AddDays(-1),
        storniert ? new Storno(Jetzt.AddHours(-1), Akteur, "Test Storno") : null);

    private static Task<AusgabeErfassenErgebnis> ErfassenAsync(Szenario s, string? hologrammnummer, int? exemplarNummer = null) =>
        Service(s).ErfassenAsync(
            coinId: CoinId, exemplarNummer: exemplarNummer, eingabe: Eingabe, hologrammnummer: hologrammnummer, akteurId: Akteur,
            ct: CancellationToken.None);

    private static Task<HologrammnummerAendernErgebnis> AendernAsync(Szenario s, string? nummer, string? grund = null, string? bisherige = null) =>
        Service(s).HologrammnummerAendernAsync(
            coinId: CoinId, ausgabeId: AusgabeId, nummer: nummer, grund: grund, bisherige: bisherige, akteurId: Akteur,
            ct: CancellationToken.None);

    private static Hologrammnummer[] Nummern(object?[] argumente) => [.. argumente.OfType<Hologrammnummer>()];

    /// <summary>Alle Text-Argumente ungleich <c>null</c>.</summary>
    private static string[] Texte(object?[] argumente) => [.. argumente.OfType<string>()];

    private static string[] Feldfehler(IReadOnlyDictionary<string, string[]> fehler, string feld)
    {
        Assert.True(fehler.TryGetValue(feld, out var meldungen), $"Kein Fehler für „{feld}“.");
        return meldungen;
    }

    // =====================================================================================================
    // Erfassen (AK-5 bis AK-8)
    // =====================================================================================================

    [Fact]
    public async Task Erfassen_ohne_Nummer_setzt_keine_Hologrammnummer()
    {
        var s = new Szenario();

        Assert.IsType<AusgabeErfassenErgebnis.Erfasst>(await ErfassenAsync(s, null));
        Assert.Equal(0, s.Anzahl("HologrammSetzenAsync"));
    }

    [Fact]
    public async Task Erfassen_mit_nur_Leerraum_setzt_keine_Hologrammnummer()
    {
        var s = new Szenario();

        Assert.IsType<AusgabeErfassenErgebnis.Erfasst>(await ErfassenAsync(s, "   "));
        Assert.Equal(0, s.Anzahl("HologrammSetzenAsync"));
    }

    [Fact]
    public async Task Erfassen_mit_Nummer_setzt_die_normalisierte_Nummer_fuer_die_neue_Ausgabe()
    {
        var s = new Szenario();

        await ErfassenAsync(s, "ab 12-34");

        var argumente = s.Argumente("HologrammSetzenAsync");
        Assert.Equal([new Hologrammnummer("AB 12-34", "AB1234")], Nummern(argumente));
        Assert.Contains(s.Gespeichert!.Id, argumente.OfType<Guid>());
    }

    [Fact]
    public async Task Erfassen_mit_Nummer_uebergibt_keinen_Grund()
    {
        var s = new Szenario();

        await ErfassenAsync(s, "ab 12-34");

        Assert.Empty(Texte(s.Argumente("HologrammSetzenAsync")));
    }

    [Fact]
    public async Task Erfassen_setzt_die_Nummer_nach_dem_Speichern_der_Ausgabe_und_vor_dem_Abschliessen()
    {
        var s = new Szenario();

        await ErfassenAsync(s, "ab 12-34");

        var reihenfolge = s.Aufrufe.Select(a => a.Methode)
            .Where(m => m is nameof(ICoinSperre.AusgabeHinzufuegenAsync) or "HologrammSetzenAsync" or nameof(ICoinSperre.AbschliessenAsync))
            .ToList();
        Assert.Equal([nameof(ICoinSperre.AusgabeHinzufuegenAsync), "HologrammSetzenAsync", nameof(ICoinSperre.AbschliessenAsync)], reihenfolge);
    }

    [Fact]
    public async Task Erfassen_mit_ungueltiger_Nummer_meldet_den_Fehler_am_Feld_hologrammnummer()
    {
        var ergebnis = Assert.IsType<AusgabeErfassenErgebnis.Ungueltig>(await ErfassenAsync(new Szenario(), "AB/1"));

        Assert.Equal([MeldungZeichen], Feldfehler(ergebnis.Fehler, "hologrammnummer"));
    }

    [Fact]
    public async Task Erfassen_meldet_Nummernfehler_gemeinsam_mit_den_anderen_Feldfehlern()
    {
        var service = Service(new Szenario());

        var ergebnis = await service.ErfassenAsync(
            coinId: CoinId, exemplarNummer: null, eingabe: Eingabe with { EmpfaengerName = " ", Begruendung = null },
            hologrammnummer: "AB/1", akteurId: Akteur, ct: CancellationToken.None);

        var fehler = Assert.IsType<AusgabeErfassenErgebnis.Ungueltig>(ergebnis).Fehler;
        Assert.Equal(["begruendung", "empfaengerName", "hologrammnummer"], fehler.Keys.Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Erfassen_mit_ungueltiger_Nummer_sperrt_den_Coin_nicht()
    {
        var s = new Szenario();

        await ErfassenAsync(s, "AB/1");

        Assert.Equal(0, s.Anzahl(nameof(IAusgabeRepository.SperrenAsync)));
    }

    [Fact]
    public async Task Erfassen_ungueltige_Nummer_geht_dem_unbekannten_Coin_vor()
    {
        var s = new Szenario { CoinVorhanden = false };

        Assert.IsType<AusgabeErfassenErgebnis.Ungueltig>(await ErfassenAsync(s, "AB/1"));
    }

    [Fact]
    public async Task Erfassen_unbekannter_Coin_geht_der_vergebenen_Nummer_vor()
    {
        var s = new Szenario { CoinVorhanden = false, Vergeben = true };

        Assert.IsType<AusgabeErfassenErgebnis.CoinNichtGefunden>(await ErfassenAsync(s, "AB1234"));
    }

    [Fact]
    public async Task Erfassen_unbekannte_Auflage_geht_der_vergebenen_Nummer_vor()
    {
        var s = new Szenario { Auflage = null, Vergeben = true };

        Assert.IsType<AusgabeErfassenErgebnis.AuflageUnbekannt>(await ErfassenAsync(s, "AB1234"));
    }

    [Fact]
    public async Task Erfassen_Exemplar_ausserhalb_der_Auflage_geht_der_vergebenen_Nummer_vor()
    {
        var s = new Szenario { Vergeben = true };

        var ergebnis = Assert.IsType<AusgabeErfassenErgebnis.Ungueltig>(await ErfassenAsync(s, "AB1234", exemplarNummer: 99));

        Assert.Equal(["exemplarNummer"], ergebnis.Fehler.Keys);
    }

    [Fact]
    public async Task Erfassen_ausgegebenes_Exemplar_geht_der_vergebenen_Nummer_vor()
    {
        var s = new Szenario { ExemplarAusgegeben = true, Vergeben = true };

        Assert.IsType<AusgabeErfassenErgebnis.ExemplarAusgegeben>(await ErfassenAsync(s, "AB1234", exemplarNummer: 3));
    }

    [Fact]
    public async Task Erfassen_ohne_freies_Exemplar_geht_der_vergebenen_Nummer_vor()
    {
        var s = new Szenario { NaechsteFreie = null, Vergeben = true };

        Assert.IsType<AusgabeErfassenErgebnis.KeinExemplarFrei>(await ErfassenAsync(s, "AB1234"));
    }

    [Fact]
    public async Task Erfassen_mit_vergebener_Nummer_liefert_HologrammnummerVergeben()
    {
        var s = new Szenario { Vergeben = true };

        Assert.IsType<AusgabeErfassenErgebnis.HologrammnummerVergeben>(await ErfassenAsync(s, "ab 12-34"));
    }

    [Fact]
    public async Task Erfassen_mit_vergebener_Nummer_schliesst_die_Transaktion_nicht_ab()
    {
        var s = new Szenario { Vergeben = true };

        await ErfassenAsync(s, "ab 12-34");

        Assert.Equal(0, s.Anzahl(nameof(ICoinSperre.AbschliessenAsync)));
    }

    [Fact]
    public async Task HologrammnummerVergeben_hat_keine_Felder_mit_Coin_Ausgabe_oder_Empfaenger()
    {
        var eigenschaften = typeof(AusgabeErfassenErgebnis.HologrammnummerVergeben)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(p => p.Name != "EqualityContract");

        Assert.Empty(eigenschaften);
    }

    // =====================================================================================================
    // Ergänzen und Korrigieren (AK-10, AK-11)
    // =====================================================================================================

    [Fact]
    public async Task Ergaenzen_ohne_bisherige_Nummer_liefert_Geaendert()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe() };

        Assert.IsType<HologrammnummerAendernErgebnis.Geaendert>(await AendernAsync(s, "ab 12-34"));
    }

    [Fact]
    public async Task Ergaenzen_setzt_genau_die_neue_Nummer_ohne_bisherige()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe() };

        await AendernAsync(s, "ab 12-34");

        var argumente = s.Argumente("HologrammSetzenAsync");
        Assert.Equal([new Hologrammnummer("AB 12-34", "AB1234")], Nummern(argumente));
        Assert.Contains(AusgabeId, argumente.OfType<Guid>());
    }

    [Fact]
    public async Task Ergaenzen_ignoriert_einen_mitgesendeten_Grund()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe() };

        Assert.IsType<HologrammnummerAendernErgebnis.Geaendert>(await AendernAsync(s, "AB1234", grund: "Test Grund Ergaenzen"));
        Assert.Empty(Texte(s.Argumente("HologrammSetzenAsync")));
    }

    [Fact]
    public async Task Ergaenzen_schliesst_die_Transaktion_ab()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe() };

        await AendernAsync(s, "AB1234");

        Assert.Equal(1, s.Anzahl(nameof(ICoinSperre.AbschliessenAsync)));
    }

    [Fact]
    public async Task Geaendert_enthaelt_die_Ausgabe_in_der_Lesesicht()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe() };

        var ergebnis = Assert.IsType<HologrammnummerAendernErgebnis.Geaendert>(await AendernAsync(s, "AB1234"));

        Assert.Equal(AusgabeId, ergebnis.Ausgabe.Id);
    }

    [Fact]
    public async Task Ergaenzen_mit_leerer_bisheriger_gilt_als_keine_bisherige()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe() };

        Assert.IsType<HologrammnummerAendernErgebnis.Geaendert>(await AendernAsync(s, "AB1234", bisherige: ""));
    }

    [Fact]
    public async Task Ergaenzen_mit_bisheriger_obwohl_keine_Nummer_besteht_liefert_VeraltetGelesen()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe() };

        Assert.IsType<HologrammnummerAendernErgebnis.VeraltetGelesen>(await AendernAsync(s, "AB1234", bisherige: "AB1243"));
    }

    [Fact]
    public async Task Korrektur_mit_Grund_liefert_Geaendert()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1243") };

        Assert.IsType<HologrammnummerAendernErgebnis.Geaendert>(await AendernAsync(s, "AB1234", "Tippfehler", "AB 12-43"));
    }

    [Fact]
    public async Task Korrektur_uebergibt_bisherige_und_neue_Nummer()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1243") };

        await AendernAsync(s, "ab 12-34", "Tippfehler", "AB 12-43");

        var nummern = Nummern(s.Argumente("HologrammSetzenAsync"));
        Assert.Equal(
            ["AB1234", "AB1243"],
            nummern.Select(n => n.Normalform).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Korrektur_uebergibt_den_getrimmten_Grund()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1243") };

        await AendernAsync(s, "AB1234", "  Tippfehler bei der Erfassung  ", "AB1243");

        Assert.Contains("Tippfehler bei der Erfassung", Texte(s.Argumente("HologrammSetzenAsync")));
    }

    [Fact]
    public async Task Korrektur_findet_die_bisherige_in_anderer_Schreibweise()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB 12-43") };

        Assert.IsType<HologrammnummerAendernErgebnis.Geaendert>(await AendernAsync(s, "AB1234", "Tippfehler", "ab1243"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Korrektur_ohne_Grund_meldet_den_Fehler_am_Feld_grund(string? grund)
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1243") };

        var ergebnis = Assert.IsType<HologrammnummerAendernErgebnis.Ungueltig>(await AendernAsync(s, "AB1234", grund, "AB1243"));

        Assert.Equal([MeldungGrundFehlt], Feldfehler(ergebnis.Fehler, "grund"));
    }

    [Fact]
    public async Task Korrektur_ohne_Grund_schreibt_nichts()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1243") };

        await AendernAsync(s, "AB1234", null, "AB1243");

        Assert.Equal(0, s.Anzahl("HologrammSetzenAsync"));
    }

    [Fact]
    public async Task Grund_mit_mehr_als_500_Zeichen_meldet_den_Fehler_am_Feld_grund()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1243") };

        var ergebnis = Assert.IsType<HologrammnummerAendernErgebnis.Ungueltig>(
            await AendernAsync(s, "AB1234", new string('x', 501), "AB1243"));

        Assert.Equal([MeldungGrundZuLang], Feldfehler(ergebnis.Fehler, "grund"));
    }

    [Fact]
    public async Task Grund_mit_500_Zeichen_nach_dem_Trimmen_ist_erlaubt()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1243") };

        Assert.IsType<HologrammnummerAendernErgebnis.Geaendert>(
            await AendernAsync(s, "AB1234", "  " + new string('x', 500) + "  ", "AB1243"));
    }

    [Fact]
    public async Task Zu_langer_Grund_geht_dem_unbekannten_Coin_vor()
    {
        var s = new Szenario { CoinVorhanden = false };

        var ergebnis = Assert.IsType<HologrammnummerAendernErgebnis.Ungueltig>(await AendernAsync(s, "AB1234", new string('x', 501)));

        Assert.Equal(["grund"], ergebnis.Fehler.Keys);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Leere_Nummer_meldet_Bitte_eine_Hologrammnummer_eingeben(string? nummer)
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1243") };

        var ergebnis = Assert.IsType<HologrammnummerAendernErgebnis.Ungueltig>(await AendernAsync(s, nummer, "Grund", "AB1243"));

        Assert.Equal([MeldungLeer], Feldfehler(ergebnis.Fehler, "hologrammnummer"));
    }

    [Fact]
    public async Task Ungueltige_Nummer_meldet_den_Zeichenfehler()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe() };

        var ergebnis = Assert.IsType<HologrammnummerAendernErgebnis.Ungueltig>(await AendernAsync(s, "AB/1"));

        Assert.Equal([MeldungZeichen], Feldfehler(ergebnis.Fehler, "hologrammnummer"));
    }

    [Fact]
    public async Task Ungueltige_Nummer_sperrt_den_Coin_nicht()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe() };

        await AendernAsync(s, "");

        Assert.Equal(0, s.Anzahl(nameof(IAusgabeRepository.SperrenAsync)));
    }

    [Fact]
    public async Task Unbekannter_Coin_liefert_NichtGefunden()
    {
        var s = new Szenario { CoinVorhanden = false };

        Assert.IsType<HologrammnummerAendernErgebnis.NichtGefunden>(await AendernAsync(s, "AB1234"));
    }

    [Fact]
    public async Task Unbekannte_Ausgabe_liefert_NichtGefunden()
    {
        var s = new Szenario { Geladen = null };

        Assert.IsType<HologrammnummerAendernErgebnis.NichtGefunden>(await AendernAsync(s, "AB1234"));
    }

    [Fact]
    public async Task Stornierte_Ausgabe_liefert_Storniert()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(storniert: true), Aktuell = Nummer("AB1243") };

        Assert.IsType<HologrammnummerAendernErgebnis.Storniert>(await AendernAsync(s, "AB1234", "Tippfehler", "AB1243"));
    }

    [Fact]
    public async Task Stornierte_Ausgabe_ohne_Nummer_liefert_beim_Ergaenzen_Storniert()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(storniert: true) };

        Assert.IsType<HologrammnummerAendernErgebnis.Storniert>(await AendernAsync(s, "AB1234"));
    }

    [Fact]
    public async Task Stornierte_Ausgabe_schreibt_nichts()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(storniert: true), Aktuell = Nummer("AB1243") };

        await AendernAsync(s, "AB1234", "Tippfehler", "AB1243");

        Assert.Equal((0, 0), (s.Anzahl("HologrammSetzenAsync"), s.Anzahl(nameof(ICoinSperre.AbschliessenAsync))));
    }

    [Fact]
    public async Task Storniert_geht_der_abweichenden_bisherigen_vor()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(storniert: true), Aktuell = Nummer("AB1243") };

        Assert.IsType<HologrammnummerAendernErgebnis.Storniert>(await AendernAsync(s, "AB1234", "Tippfehler", "AB9999"));
    }

    [Fact]
    public async Task Abweichende_bisherige_liefert_VeraltetGelesen()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1243") };

        Assert.IsType<HologrammnummerAendernErgebnis.VeraltetGelesen>(await AendernAsync(s, "AB1234", "Tippfehler", "AB9999"));
    }

    [Fact]
    public async Task Fehlende_bisherige_bei_vorhandener_Nummer_liefert_VeraltetGelesen()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1243") };

        Assert.IsType<HologrammnummerAendernErgebnis.VeraltetGelesen>(await AendernAsync(s, "AB1234", "Tippfehler", null));
    }

    [Fact]
    public async Task VeraltetGelesen_schreibt_nichts()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1243") };

        await AendernAsync(s, "AB1234", "Tippfehler", "AB9999");

        Assert.Equal(0, s.Anzahl("HologrammSetzenAsync"));
    }

    [Fact]
    public async Task VeraltetGelesen_geht_unveraendert_vor()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1234") };

        Assert.IsType<HologrammnummerAendernErgebnis.VeraltetGelesen>(await AendernAsync(s, "AB1234", null, "AB9999"));
    }

    [Fact]
    public async Task Gleiche_Normalform_in_anderer_Schreibweise_liefert_Unveraendert()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB 12-34") };

        Assert.IsType<HologrammnummerAendernErgebnis.Unveraendert>(await AendernAsync(s, "ab1234", null, "AB 12-34"));
    }

    [Fact]
    public async Task Unveraendert_schreibt_nichts_und_schliesst_nichts_ab()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB 12-34") };

        await AendernAsync(s, "ab1234", null, "AB 12-34");

        Assert.Equal((0, 0), (s.Anzahl("HologrammSetzenAsync"), s.Anzahl(nameof(ICoinSperre.AbschliessenAsync))));
    }

    [Fact]
    public async Task Unveraendert_geht_dem_fehlenden_Grund_vor()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1234") };

        Assert.IsType<HologrammnummerAendernErgebnis.Unveraendert>(await AendernAsync(s, "AB 12-34", "", "AB1234"));
    }

    [Fact]
    public async Task Vergebene_Nummer_liefert_Vergeben()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Vergeben = true };

        Assert.IsType<HologrammnummerAendernErgebnis.Vergeben>(await AendernAsync(s, "AB1234"));
    }

    [Fact]
    public async Task Vergebene_Nummer_schliesst_die_Transaktion_nicht_ab()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Vergeben = true };

        await AendernAsync(s, "AB1234");

        Assert.Equal(0, s.Anzahl(nameof(ICoinSperre.AbschliessenAsync)));
    }

    [Fact]
    public async Task Fehlender_Grund_bei_Korrektur_geht_der_vergebenen_Nummer_vor()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe(), Aktuell = Nummer("AB1243"), Vergeben = true };

        var ergebnis = Assert.IsType<HologrammnummerAendernErgebnis.Ungueltig>(await AendernAsync(s, "AB1234", null, "AB1243"));

        Assert.Equal(["grund"], ergebnis.Fehler.Keys);
    }

    [Fact]
    public async Task Aendern_laedt_die_Ausgabe_unter_der_Sperre_des_angegebenen_Coins()
    {
        var s = new Szenario { Geladen = GespeicherteAusgabe() };

        await AendernAsync(s, "AB1234");

        Assert.Equal(CoinId, Assert.IsType<Guid>(s.Argumente(nameof(IAusgabeRepository.SperrenAsync))[0]));
        Assert.Equal(AusgabeId, Assert.IsType<Guid>(s.Argumente(nameof(ICoinSperre.AusgabeLadenAsync))[0]));
    }
}
