using Coin.Domain;
using Coin.Domain.Benutzer;
using Coin.Domain.Gemeinsam;
using Microsoft.Extensions.Time.Testing;
using DomainBenutzer = Coin.Domain.Benutzer.Benutzer;

namespace Coin.UnitTests.Benutzer;

/// <summary>
/// Feature nacharbeiten-audit-filter, Abschnitt 4.1, AK-6 und AK-10 (ADR-0045 Punkte 1 und 2): Prüfung der Filter des
/// Änderungsprotokolls in der Domain. <c>BenutzerverwaltungService.AuditLesenAsync</c> bekommt die Rohwerte
/// (<c>von</c>, <c>bis</c>, <c>aktion</c> als Zeichenketten-Listen, damit „mehrfach angegeben“ erkennbar ist) und
/// liefert Feldfehler wie <c>Seitenabfrage</c> oder ruft das Repository mit einem <see cref="AuditFilter"/> auf.
/// Die Parameter werden per Namen übergeben; die Reihenfolge legt der Developer fest.
/// </summary>
public class AuditFilterTests
{
    private const string DatumMeldung = "Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.";
    private const string ReihenfolgeMeldung = "Das Datum „bis“ darf nicht vor dem Datum „von“ liegen.";
    private const string ZeitraumMeldung = "Der Zeitraum darf höchstens 366 Tage umfassen.";
    private const string AktionMeldung = "Unbekannte Aktion. Erlaubt sind: Rolle, Status.";

    private readonly FakeAuditRepository _repository = new();

    private BenutzerverwaltungService Service() =>
        new(_repository, new FakeTimeProvider(new DateTimeOffset(2026, 11, 16, 9, 0, 0, TimeSpan.Zero)));

    private Task<Ergebnis<Seite<AuditEintragAnsicht>>> LesenAsync(
        string[]? von = null,
        string[]? bis = null,
        string[]? aktion = null,
        Guid? benutzerId = null,
        int? seite = null,
        int? groesse = null) =>
        Service().AuditLesenAsync(
            von: von, bis: bis, aktion: aktion, benutzerId: benutzerId, seite: seite, groesse: groesse, ct: CancellationToken.None);

    private static string[] Werte(params string[] werte) => werte;

    private static DateTimeOffset Utc(int jahr, int monat, int tag, int stunde) =>
        new(jahr, monat, tag, stunde, 0, 0, TimeSpan.Zero);

    private async Task<AuditFilter> FilterAsync(
        string[]? von = null, string[]? bis = null, string[]? aktion = null, Guid? benutzerId = null)
    {
        var ergebnis = await LesenAsync(von, bis, aktion, benutzerId);
        Assert.True(ergebnis.IstErfolgreich, string.Join("; ", ergebnis.Fehler.Select(f => $"{f.Key}: {string.Join(", ", f.Value)}")));
        return Assert.Single(_repository.Aufrufe).Filter;
    }

    private async Task<IReadOnlyDictionary<string, string[]>> FehlerAsync(
        string[]? von = null, string[]? bis = null, string[]? aktion = null, int? seite = null)
    {
        var ergebnis = await LesenAsync(von, bis, aktion, seite: seite);
        Assert.False(ergebnis.IstErfolgreich, "Erwartet war ein Validierungsfehler.");
        return ergebnis.Fehler;
    }

    // ---------- ohne Filter (AK-1) ----------

    [Fact]
    public async Task Ohne_Filter_hat_der_Filter_weder_Zeitraum_noch_Arten_noch_Benutzer()
    {
        var filter = await FilterAsync();

        Assert.Null(filter.AbUtc);
        Assert.Null(filter.VorUtc);
        Assert.Empty(filter.Arten);
        Assert.Null(filter.BenutzerId);
    }

    [Fact]
    public async Task Ohne_Angaben_fragt_der_Service_Seite_1_mit_Groesse_25_ab()
    {
        await LesenAsync();

        var aufruf = Assert.Single(_repository.Aufrufe);
        Assert.Equal((1, 25), (aufruf.Seite, aufruf.Groesse));
    }

    [Fact]
    public async Task Seite_und_Groesse_werden_unveraendert_weitergegeben()
    {
        await LesenAsync(seite: 3, groesse: 10);

        var aufruf = Assert.Single(_repository.Aufrufe);
        Assert.Equal((3, 10), (aufruf.Seite, aufruf.Groesse));
    }

    [Fact]
    public async Task BenutzerId_wird_in_den_Filter_uebernommen()
    {
        var id = Guid.NewGuid();

        var filter = await FilterAsync(benutzerId: id);

        Assert.Equal(id, filter.BenutzerId);
    }

    // ---------- Tagesgrenzen (AK-2, AK-3) ----------

    [Fact]
    public async Task Von_wird_zum_Tagesbeginn_in_Berlin_als_UTC()
    {
        var filter = await FilterAsync(von: Werte("2026-01-15"));

        Assert.Equal(Utc(2026, 1, 14, 23), filter.AbUtc);
        Assert.Null(filter.VorUtc);
    }

    [Fact]
    public async Task Bis_wird_zum_Beginn_des_Folgetags_in_Berlin_als_UTC()
    {
        var filter = await FilterAsync(bis: Werte("2026-07-01"));

        Assert.Null(filter.AbUtc);
        Assert.Equal(Utc(2026, 7, 1, 22), filter.VorUtc);
    }

    [Fact]
    public async Task Der_Tag_der_Umstellung_auf_Sommerzeit_umfasst_23_Stunden()
    {
        var filter = await FilterAsync(von: Werte("2026-03-29"), bis: Werte("2026-03-29"));

        Assert.Equal(Utc(2026, 3, 28, 23), filter.AbUtc);
        Assert.Equal(Utc(2026, 3, 29, 22), filter.VorUtc);
    }

    [Fact]
    public async Task Der_Tag_der_Umstellung_auf_Winterzeit_umfasst_25_Stunden()
    {
        var filter = await FilterAsync(von: Werte("2026-10-25"), bis: Werte("2026-10-25"));

        Assert.Equal(Utc(2026, 10, 24, 22), filter.AbUtc);
        Assert.Equal(Utc(2026, 10, 25, 23), filter.VorUtc);
    }

    [Fact]
    public async Task Die_Zeitpunkte_des_Filters_sind_UTC()
    {
        var filter = await FilterAsync(von: Werte("2026-07-01"), bis: Werte("2026-07-01"));

        Assert.Equal(TimeSpan.Zero, filter.AbUtc!.Value.Offset);
        Assert.Equal(TimeSpan.Zero, filter.VorUtc!.Value.Offset);
    }

    [Fact]
    public async Task Von_gleich_bis_ist_gueltig()
    {
        var ergebnis = await LesenAsync(von: Werte("2026-10-01"), bis: Werte("2026-10-01"));

        Assert.True(ergebnis.IstErfolgreich);
    }

    [Theory]
    [InlineData("2000-01-01")]
    [InlineData("2999-12-31")]
    [InlineData("2028-02-29")]
    public async Task Datum_an_der_Bereichsgrenze_oder_im_Schaltjahr_ist_gueltig(string wert)
    {
        var ergebnis = await LesenAsync(von: Werte(wert));

        Assert.True(ergebnis.IstErfolgreich);
    }

    [Fact]
    public async Task Nur_von_unterliegt_keiner_Grenze_von_366_Tagen()
    {
        var filter = await FilterAsync(von: Werte("2000-01-01"));

        Assert.NotNull(filter.AbUtc);
    }

    [Fact]
    public async Task Nur_bis_unterliegt_keiner_Grenze_von_366_Tagen()
    {
        var filter = await FilterAsync(bis: Werte("2999-12-31"));

        Assert.NotNull(filter.VorUtc);
    }

    // ---------- leere Werte gelten als nicht angegeben (AK-6) ----------

    [Fact]
    public async Task Leeres_von_gilt_als_nicht_angegeben()
    {
        var filter = await FilterAsync(von: Werte(""));

        Assert.Null(filter.AbUtc);
    }

    [Fact]
    public async Task Leeres_bis_gilt_als_nicht_angegeben()
    {
        var filter = await FilterAsync(bis: Werte(""));

        Assert.Null(filter.VorUtc);
    }

    [Fact]
    public async Task Leere_Liste_fuer_von_bis_und_aktion_gilt_als_nicht_angegeben()
    {
        var filter = await FilterAsync(von: [], bis: [], aktion: []);

        Assert.Null(filter.AbUtc);
        Assert.Null(filter.VorUtc);
        Assert.Empty(filter.Arten);
    }

    // ---------- ungültiges Datum (AK-6) ----------

    [Theory]
    [InlineData("2026-13-01")]
    [InlineData("2026-02-30")]
    [InlineData("2027-02-29")]
    [InlineData("01.10.2026")]
    [InlineData("2026-1-5")]
    [InlineData("abc")]
    [InlineData("1999-12-31")]
    [InlineData("3000-01-01")]
    [InlineData("2026-10-01T00:00:00")]
    [InlineData("2026/10/01")]
    [InlineData("20261001")]
    [InlineData("+2026-10-01")]
    [InlineData("２０２６-10-01")]
    public async Task Ungueltiges_von_liefert_die_Datumsmeldung_am_Schluessel_von(string wert)
    {
        var fehler = await FehlerAsync(von: Werte(wert));

        Assert.Equal(["von"], fehler.Keys);
        Assert.Equal([DatumMeldung], fehler["von"]);
    }

    [Theory]
    [InlineData("2026-13-01")]
    [InlineData("2026-02-30")]
    [InlineData("01.10.2026")]
    [InlineData("2026-1-5")]
    [InlineData("abc")]
    [InlineData("1999-12-31")]
    [InlineData("3000-01-01")]
    public async Task Ungueltiges_bis_liefert_die_Datumsmeldung_am_Schluessel_bis(string wert)
    {
        var fehler = await FehlerAsync(bis: Werte(wert));

        Assert.Equal(["bis"], fehler.Keys);
        Assert.Equal([DatumMeldung], fehler["bis"]);
    }

    [Fact]
    public async Task Mehrfach_angegebenes_von_ist_ungueltig()
    {
        var fehler = await FehlerAsync(von: Werte("2026-10-01", "2026-10-02"));

        Assert.Equal([DatumMeldung], fehler["von"]);
    }

    [Fact]
    public async Task Mehrfach_angegebenes_von_mit_gleichem_Wert_ist_ungueltig()
    {
        var fehler = await FehlerAsync(von: Werte("2026-10-01", "2026-10-01"));

        Assert.Equal([DatumMeldung], fehler["von"]);
    }

    [Fact]
    public async Task Mehrfach_angegebenes_bis_ist_ungueltig()
    {
        var fehler = await FehlerAsync(bis: Werte("2026-10-01", "2026-10-02"));

        Assert.Equal([DatumMeldung], fehler["bis"]);
    }

    [Fact]
    public async Task Die_Datumsmeldung_wiederholt_den_Eingabewert_nicht()
    {
        var fehler = await FehlerAsync(von: Werte("eingabe<script>"));

        Assert.DoesNotContain(fehler["von"], m => m.Contains("eingabe", StringComparison.Ordinal));
    }

    // ---------- von > bis und 366 Tage (AK-6) ----------

    [Fact]
    public async Task Von_nach_bis_liefert_die_Reihenfolgemeldung_am_Schluessel_bis()
    {
        var fehler = await FehlerAsync(von: Werte("2026-10-02"), bis: Werte("2026-10-01"));

        Assert.Equal(["bis"], fehler.Keys);
        Assert.Equal([ReihenfolgeMeldung], fehler["bis"]);
    }

    [Fact]
    public async Task Genau_366_Tage_sind_gueltig()
    {
        var ergebnis = await LesenAsync(von: Werte("2026-01-01"), bis: Werte("2027-01-01"));

        Assert.True(ergebnis.IstErfolgreich);
    }

    [Fact]
    public async Task Genau_367_Tage_liefern_die_Zeitraummeldung_am_Schluessel_bis()
    {
        var fehler = await FehlerAsync(von: Werte("2026-01-01"), bis: Werte("2027-01-02"));

        Assert.Equal(["bis"], fehler.Keys);
        Assert.Equal([ZeitraumMeldung], fehler["bis"]);
    }

    [Fact]
    public async Task Ein_ganzes_Schaltjahr_mit_366_Tagen_ist_gueltig()
    {
        var ergebnis = await LesenAsync(von: Werte("2028-01-01"), bis: Werte("2028-12-31"));

        Assert.True(ergebnis.IstErfolgreich);
    }

    [Fact]
    public async Task Ein_Schaltjahr_plus_ein_Tag_ueberschreitet_366_Tage()
    {
        var fehler = await FehlerAsync(von: Werte("2028-01-01"), bis: Werte("2029-01-01"));

        Assert.Equal([ZeitraumMeldung], fehler["bis"]);
    }

    [Fact]
    public async Task Ist_ein_Datum_ungueltig_entfallen_Reihenfolge_und_Zeitraumpruefung()
    {
        var fehler = await FehlerAsync(von: Werte("abc"), bis: Werte("2026-10-01"));

        Assert.Equal(["von"], fehler.Keys);
    }

    // ---------- Aktion (AK-4, AK-6) ----------

    [Fact]
    public async Task Aktion_Rolle_filtert_nur_Rolle()
    {
        var filter = await FilterAsync(aktion: Werte("Rolle"));

        Assert.Equal([AuditArt.Rolle], filter.Arten.Order());
    }

    [Fact]
    public async Task Aktion_Status_filtert_nur_Status()
    {
        var filter = await FilterAsync(aktion: Werte("Status"));

        Assert.Equal([AuditArt.Status], filter.Arten.Order());
    }

    [Fact]
    public async Task Beide_Aktionen_filtern_beide_Arten()
    {
        var filter = await FilterAsync(aktion: Werte("Rolle", "Status"));

        Assert.Equal([AuditArt.Rolle, AuditArt.Status], filter.Arten.Order());
    }

    [Fact]
    public async Task Doppelte_Aktionen_zaehlen_einfach()
    {
        var filter = await FilterAsync(aktion: Werte("Status", "Status"));

        Assert.Equal([AuditArt.Status], filter.Arten.Order());
    }

    [Fact]
    public async Task Leere_Aktion_gilt_als_nicht_angegeben()
    {
        var filter = await FilterAsync(aktion: Werte(""));

        Assert.Empty(filter.Arten);
    }

    [Fact]
    public async Task Leere_Aktion_neben_einer_gueltigen_wird_ignoriert()
    {
        var filter = await FilterAsync(aktion: Werte("Rolle", ""));

        Assert.Equal([AuditArt.Rolle], filter.Arten.Order());
    }

    [Theory]
    [InlineData("rolle")]
    [InlineData("STATUS")]
    [InlineData("Unbekannt")]
    [InlineData("0")]
    [InlineData("1")]
    [InlineData("Rolle,Status")]
    [InlineData(" Rolle")]
    [InlineData("Rolle ")]
    public async Task Unbekannte_Aktion_liefert_die_Aktionsmeldung_am_Schluessel_aktion(string wert)
    {
        var fehler = await FehlerAsync(aktion: Werte(wert));

        Assert.Equal(["aktion"], fehler.Keys);
        Assert.Equal([AktionMeldung], fehler["aktion"]);
    }

    [Fact]
    public async Task Eine_unbekannte_Aktion_neben_einer_gueltigen_ist_ein_Fehler()
    {
        var fehler = await FehlerAsync(aktion: Werte("Rolle", "Unbekannt"));

        Assert.Equal([AktionMeldung], fehler["aktion"]);
    }

    [Fact]
    public async Task Die_Aktionsmeldung_nennt_die_Werte_aus_dem_Enum()
    {
        var fehler = await FehlerAsync(aktion: Werte("x"));

        Assert.Equal([$"Unbekannte Aktion. Erlaubt sind: {string.Join(", ", Enum.GetNames<AuditArt>())}."], fehler["aktion"]);
    }

    // ---------- Fehler gesammelt, Repository unberührt ----------

    [Fact]
    public async Task Mehrere_Fehler_kommen_gemeinsam()
    {
        var fehler = await FehlerAsync(von: Werte("abc"), bis: Werte("2026-13-01"), aktion: Werte("rolle"));

        Assert.Equal(["aktion", "bis", "von"], fehler.Keys.Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Filterfehler_und_Seitenfehler_kommen_gemeinsam()
    {
        var fehler = await FehlerAsync(von: Werte("abc"), seite: 0);

        Assert.Equal(["seite", "von"], fehler.Keys.Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Bei_Fehlern_wird_das_Repository_nicht_aufgerufen()
    {
        await LesenAsync(von: Werte("abc"));

        Assert.Empty(_repository.Aufrufe);
    }

    // ---------- Fake ----------

    private sealed record AuditAufruf(AuditFilter Filter, int Seite, int Groesse);

    private sealed class FakeAuditRepository : IBenutzerverwaltungRepository
    {
        public List<AuditAufruf> Aufrufe { get; } = [];

        public Task<T> InSperreAsync<T>(Func<IBenutzerverwaltungSitzung, Task<T>> aktion, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<Seite<DomainBenutzer>> SuchenAsync(string? suche, int seite, int groesse, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<Seite<AuditEintragAnsicht>> AuditSeiteAsync(AuditFilter filter, int seite, int groesse, CancellationToken ct)
        {
            Aufrufe.Add(new AuditAufruf(filter, seite, groesse));
            return Task.FromResult(new Seite<AuditEintragAnsicht>([], 0, seite, groesse));
        }
    }
}
