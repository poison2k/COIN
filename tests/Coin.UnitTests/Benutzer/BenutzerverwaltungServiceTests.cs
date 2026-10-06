using Coin.Domain.Benutzer;
using Microsoft.Extensions.Time.Testing;
using DomainBenutzer = Coin.Domain.Benutzer.Benutzer;

namespace Coin.UnitTests.Benutzer;

/// <summary>
/// Feature rollen-benutzerverwaltung, AK-12, AK-13, AK-15 bis AK-19, ADR-0017/0018: BenutzerverwaltungService mit
/// Fake-Repository. Alles Lesen und Schreiben läuft innerhalb von <c>InSperreAsync</c>; der Akteur wird dort neu geladen.
/// </summary>
public class BenutzerverwaltungServiceTests
{
    private static readonly DateTimeOffset Startzeit = new(2026, 10, 5, 9, 15, 0, TimeSpan.Zero);

    private readonly FakeBenutzerverwaltungRepository _repository = new();
    private readonly FakeTimeProvider _zeit = new(Startzeit);

    private BenutzerverwaltungService Service() => new(_repository, _zeit);

    private DomainBenutzer Anlegen(Rolle? rolle, bool aktiv = true)
    {
        var benutzer = new DomainBenutzer(
            Guid.CreateVersion7(), "iss", $"sub-{Guid.NewGuid():N}", null, "Test Person", rolle, Startzeit, Startzeit, Aktiv: aktiv);
        _repository.Benutzer[benutzer.Id] = benutzer;
        return benutzer;
    }

    private DomainBenutzer Admin() => Anlegen(Rolle.Administrator);

    // ---------- Rolle zuweisen ----------

    [Fact]
    public async Task Rolle_zuweisen_liefert_Geaendert_mit_der_neuen_Rolle()
    {
        var akteur = Admin();
        var ziel = Anlegen(null);

        var ergebnis = await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Betrachter, CancellationToken.None);

        var geaendert = Assert.IsType<AenderungErgebnis.Geaendert>(ergebnis);
        Assert.Equal(Rolle.Betrachter, geaendert.Benutzer.Rolle);
        Assert.Equal(ziel.Id, geaendert.Benutzer.Id);
    }

    [Fact]
    public async Task Rolle_zuweisen_speichert_den_Benutzer_mit_der_neuen_Rolle()
    {
        var akteur = Admin();
        var ziel = Anlegen(null);

        await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Sachbearbeiter, CancellationToken.None);

        var (gespeichert, _) = Assert.Single(_repository.Gespeichert);
        Assert.Equal(ziel.Id, gespeichert.Id);
        Assert.Equal(Rolle.Sachbearbeiter, gespeichert.Rolle);
        Assert.True(gespeichert.Aktiv);
    }

    [Fact]
    public async Task Rolle_zuweisen_schreibt_genau_einen_Audit_Eintrag_mit_Akteur_Ziel_Art_Alt_und_Neu()
    {
        var akteur = Admin();
        var ziel = Anlegen(null);

        await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Betrachter, CancellationToken.None);

        var (_, eintrag) = Assert.Single(_repository.Gespeichert);
        Assert.Equal(akteur.Id, eintrag.AkteurId);
        Assert.Equal(ziel.Id, eintrag.BenutzerId);
        Assert.Equal(AuditArt.Rolle, eintrag.Art);
        Assert.Equal("keine", eintrag.Alt);
        Assert.Equal("Betrachter", eintrag.Neu);
    }

    [Fact]
    public async Task Rolle_entziehen_setzt_keine_Rolle_und_protokolliert_keine()
    {
        var akteur = Admin();
        var ziel = Anlegen(Rolle.Sachbearbeiter);

        var ergebnis = await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, null, CancellationToken.None);

        Assert.Null(Assert.IsType<AenderungErgebnis.Geaendert>(ergebnis).Benutzer.Rolle);
        var (_, eintrag) = Assert.Single(_repository.Gespeichert);
        Assert.Equal("Sachbearbeiter", eintrag.Alt);
        Assert.Equal("keine", eintrag.Neu);
    }

    [Fact]
    public async Task Gleiche_Rolle_liefert_Unveraendert_ohne_Speichern_und_ohne_Audit()
    {
        var akteur = Admin();
        var ziel = Anlegen(Rolle.Betrachter);

        var ergebnis = await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Betrachter, CancellationToken.None);

        Assert.Equal(ziel, Assert.IsType<AenderungErgebnis.Unveraendert>(ergebnis).Benutzer);
        Assert.Empty(_repository.Gespeichert);
    }

    [Fact]
    public async Task Unbekanntes_Ziel_liefert_NichtGefunden_ohne_Speichern()
    {
        var akteur = Admin();

        var ergebnis = await Service().RolleZuweisenAsync(akteur.Id, Guid.NewGuid(), Rolle.Betrachter, CancellationToken.None);

        Assert.IsType<AenderungErgebnis.NichtGefunden>(ergebnis);
        Assert.Empty(_repository.Gespeichert);
    }

    [Theory]
    [InlineData(Rolle.Sachbearbeiter, true)]
    [InlineData(Rolle.Betrachter, true)]
    [InlineData(null, true)]
    [InlineData(Rolle.Administrator, false)]
    public async Task Akteur_ohne_aktive_Adminrolle_liefert_AkteurNichtBerechtigt_ohne_Speichern(Rolle? rolle, bool aktiv)
    {
        var akteur = Anlegen(rolle, aktiv);
        Admin();
        var ziel = Anlegen(null);

        var ergebnis = await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Betrachter, CancellationToken.None);

        Assert.IsType<AenderungErgebnis.AkteurNichtBerechtigt>(ergebnis);
        Assert.Empty(_repository.Gespeichert);
    }

    [Theory]
    [InlineData(Rolle.Betrachter, true)]
    [InlineData(null, true)]
    [InlineData(Rolle.Administrator, false)]
    public async Task Unberechtigter_Akteur_mit_gleicher_Rolle_liefert_AkteurNichtBerechtigt_statt_Unveraendert(Rolle? rolle, bool aktiv)
    {
        // AK-39/ADR-0018 (geändert 2026-10-06): Die Akteur-Prüfung kommt vor Unveraendert, keine Zieldaten.
        var akteur = Anlegen(rolle, aktiv);
        Admin();
        var ziel = Anlegen(Rolle.Sachbearbeiter);

        var ergebnis = await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Sachbearbeiter, CancellationToken.None);

        Assert.IsType<AenderungErgebnis.AkteurNichtBerechtigt>(ergebnis);
        Assert.Empty(_repository.Gespeichert);
    }

    [Fact]
    public async Task Unberechtigter_Akteur_mit_unbekanntem_Ziel_liefert_AkteurNichtBerechtigt_statt_NichtGefunden()
    {
        var akteur = Anlegen(Rolle.Betrachter);
        Admin();

        var ergebnis = await Service().StatusSetzenAsync(akteur.Id, Guid.NewGuid(), false, CancellationToken.None);

        Assert.IsType<AenderungErgebnis.AkteurNichtBerechtigt>(ergebnis);
    }

    [Fact]
    public async Task Unbekannter_Akteur_liefert_AkteurNichtBerechtigt()
    {
        Admin();
        var ziel = Anlegen(null);

        var ergebnis = await Service().RolleZuweisenAsync(Guid.NewGuid(), ziel.Id, Rolle.Betrachter, CancellationToken.None);

        Assert.IsType<AenderungErgebnis.AkteurNichtBerechtigt>(ergebnis);
    }

    [Fact]
    public async Task Akteur_wird_innerhalb_der_Sperre_neu_geladen()
    {
        var akteur = Admin();
        var ziel = Anlegen(null);

        await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Betrachter, CancellationToken.None);

        Assert.Contains(akteur.Id, _repository.InSperreGeladen);
    }

    [Fact]
    public async Task Rollenentzug_waehrend_des_Wartens_auf_die_Sperre_liefert_AkteurNichtBerechtigt()
    {
        var akteur = Admin();
        Admin();
        var ziel = Anlegen(null);
        // Simuliert: Ein anderer Administrator stuft den Akteur herab, bevor dessen Änderung die Sperre erhält.
        _repository.VorDerSperre = () => _repository.Benutzer[akteur.Id] = akteur with { Rolle = Rolle.Betrachter };

        var ergebnis = await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Sachbearbeiter, CancellationToken.None);

        Assert.IsType<AenderungErgebnis.AkteurNichtBerechtigt>(ergebnis);
        Assert.Empty(_repository.Gespeichert);
    }

    [Fact]
    public async Task Eigene_Adminrolle_entziehen_liefert_EigenesKonto_auch_mit_weiteren_Admins()
    {
        var akteur = Admin();
        Admin();

        var ergebnis = await Service().RolleZuweisenAsync(akteur.Id, akteur.Id, Rolle.Sachbearbeiter, CancellationToken.None);

        Assert.IsType<AenderungErgebnis.EigenesKonto>(ergebnis);
        Assert.Empty(_repository.Gespeichert);
    }

    [Fact]
    public async Task Letzten_aktiven_Admin_herabstufen_liefert_LetzterAdministrator()
    {
        var akteur = Admin();
        var ziel = Admin();
        // Konsistente Daten lassen diesen Fall nicht zu (Akteur ist selbst aktiver Admin); die Zählung kommt aus der Sitzung.
        _repository.AnzahlAktiverAdminsUeberschreiben = 1;

        var ergebnis = await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Betrachter, CancellationToken.None);

        Assert.IsType<AenderungErgebnis.LetzterAdministrator>(ergebnis);
        Assert.Empty(_repository.Gespeichert);
    }

    [Fact]
    public async Task Anzahl_aktiver_Admins_wird_innerhalb_der_Sperre_gelesen()
    {
        var akteur = Admin();
        var ziel = Admin();

        await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Betrachter, CancellationToken.None);

        Assert.True(_repository.AnzahlInSperreGelesen > 0);
    }

    [Fact]
    public async Task Anderen_Admin_herabstufen_ist_erlaubt_wenn_ein_aktiver_Admin_bleibt()
    {
        var akteur = Admin();
        var ziel = Admin();

        var ergebnis = await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Betrachter, CancellationToken.None);

        Assert.IsType<AenderungErgebnis.Geaendert>(ergebnis);
    }

    [Fact]
    public async Task Jede_Aenderung_laeuft_in_genau_einer_Sperre()
    {
        var akteur = Admin();
        var ziel = Anlegen(null);

        await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Betrachter, CancellationToken.None);

        Assert.Equal(1, _repository.SperreAufrufe);
    }

    // ---------- Status setzen ----------

    [Fact]
    public async Task Deaktivieren_liefert_Geaendert_mit_aktiv_false()
    {
        var akteur = Admin();
        var ziel = Anlegen(Rolle.Betrachter);

        var ergebnis = await Service().StatusSetzenAsync(akteur.Id, ziel.Id, false, CancellationToken.None);

        Assert.False(Assert.IsType<AenderungErgebnis.Geaendert>(ergebnis).Benutzer.Aktiv);
    }

    [Fact]
    public async Task Deaktivieren_entzieht_keine_Rolle()
    {
        var akteur = Admin();
        var ziel = Anlegen(Rolle.Sachbearbeiter);

        await Service().StatusSetzenAsync(akteur.Id, ziel.Id, false, CancellationToken.None);

        var (gespeichert, _) = Assert.Single(_repository.Gespeichert);
        Assert.Equal(Rolle.Sachbearbeiter, gespeichert.Rolle);
        Assert.False(gespeichert.Aktiv);
    }

    [Fact]
    public async Task Deaktivieren_protokolliert_Status_aktiv_nach_deaktiviert()
    {
        var akteur = Admin();
        var ziel = Anlegen(Rolle.Betrachter);

        await Service().StatusSetzenAsync(akteur.Id, ziel.Id, false, CancellationToken.None);

        var (_, eintrag) = Assert.Single(_repository.Gespeichert);
        Assert.Equal(AuditArt.Status, eintrag.Art);
        Assert.Equal("aktiv", eintrag.Alt);
        Assert.Equal("deaktiviert", eintrag.Neu);
        Assert.Equal(akteur.Id, eintrag.AkteurId);
        Assert.Equal(ziel.Id, eintrag.BenutzerId);
    }

    [Fact]
    public async Task Reaktivieren_protokolliert_Status_deaktiviert_nach_aktiv()
    {
        var akteur = Admin();
        var ziel = Anlegen(Rolle.Administrator, aktiv: false);

        var ergebnis = await Service().StatusSetzenAsync(akteur.Id, ziel.Id, true, CancellationToken.None);

        var geaendert = Assert.IsType<AenderungErgebnis.Geaendert>(ergebnis);
        Assert.True(geaendert.Benutzer.Aktiv);
        Assert.Equal(Rolle.Administrator, geaendert.Benutzer.Rolle);
        var (_, eintrag) = Assert.Single(_repository.Gespeichert);
        Assert.Equal("deaktiviert", eintrag.Alt);
        Assert.Equal("aktiv", eintrag.Neu);
    }

    [Fact]
    public async Task Gleicher_Status_liefert_Unveraendert_ohne_Audit()
    {
        var akteur = Admin();
        var ziel = Anlegen(Rolle.Betrachter);

        var ergebnis = await Service().StatusSetzenAsync(akteur.Id, ziel.Id, true, CancellationToken.None);

        Assert.IsType<AenderungErgebnis.Unveraendert>(ergebnis);
        Assert.Empty(_repository.Gespeichert);
    }

    [Fact]
    public async Task Sich_selbst_deaktivieren_liefert_EigenesKonto()
    {
        var akteur = Admin();
        Admin();

        var ergebnis = await Service().StatusSetzenAsync(akteur.Id, akteur.Id, false, CancellationToken.None);

        Assert.IsType<AenderungErgebnis.EigenesKonto>(ergebnis);
        Assert.Empty(_repository.Gespeichert);
    }

    [Fact]
    public async Task Status_unbekanntes_Ziel_liefert_NichtGefunden()
    {
        var akteur = Admin();

        Assert.IsType<AenderungErgebnis.NichtGefunden>(
            await Service().StatusSetzenAsync(akteur.Id, Guid.NewGuid(), false, CancellationToken.None));
    }

    [Fact]
    public async Task Status_durch_Nicht_Admin_liefert_AkteurNichtBerechtigt()
    {
        var akteur = Anlegen(Rolle.Sachbearbeiter);
        var ziel = Anlegen(Rolle.Betrachter);

        Assert.IsType<AenderungErgebnis.AkteurNichtBerechtigt>(
            await Service().StatusSetzenAsync(akteur.Id, ziel.Id, false, CancellationToken.None));
        Assert.Empty(_repository.Gespeichert);
    }

    // ---------- Audit: Zeit und Id ----------

    [Fact]
    public async Task Audit_Zeitpunkt_kommt_aus_dem_TimeProvider()
    {
        var akteur = Admin();
        var ziel = Anlegen(null);
        _zeit.Advance(TimeSpan.FromMinutes(42));

        await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Betrachter, CancellationToken.None);

        Assert.Equal(Startzeit.AddMinutes(42), Assert.Single(_repository.Gespeichert).Eintrag.Zeitpunkt);
    }

    [Fact]
    public async Task Audit_Zeitpunkt_ist_auf_Mikrosekunden_gekuerzt()
    {
        var akteur = Admin();
        var ziel = Anlegen(null);
        _zeit.SetUtcNow(Startzeit.AddTicks(1_234_567));

        await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Betrachter, CancellationToken.None);

        Assert.Equal(Startzeit.AddTicks(1_234_560), Assert.Single(_repository.Gespeichert).Eintrag.Zeitpunkt);
    }

    [Fact]
    public async Task Audit_Zeitpunkt_ist_UTC()
    {
        var akteur = Admin();
        var ziel = Anlegen(null);

        await Service().StatusSetzenAsync(akteur.Id, ziel.Id, false, CancellationToken.None);

        Assert.Equal(TimeSpan.Zero, Assert.Single(_repository.Gespeichert).Eintrag.Zeitpunkt.Offset);
    }

    [Fact]
    public async Task Audit_Id_ist_eine_GUID_Version_7()
    {
        var akteur = Admin();
        var ziel = Anlegen(null);

        await Service().RolleZuweisenAsync(akteur.Id, ziel.Id, Rolle.Betrachter, CancellationToken.None);

        Assert.Equal(7, Assert.Single(_repository.Gespeichert).Eintrag.Id.Version);
    }

    // ---------- Wertdarstellung ----------

    [Theory]
    [InlineData(Rolle.Administrator, "Administrator")]
    [InlineData(Rolle.Sachbearbeiter, "Sachbearbeiter")]
    [InlineData(Rolle.Betrachter, "Betrachter")]
    [InlineData(null, "keine")]
    public void RolleWert_liefert_den_gespeicherten_Wert(Rolle? rolle, string erwartet)
    {
        Assert.Equal(erwartet, AuditEintrag.RolleWert(rolle));
    }

    [Theory]
    [InlineData(true, "aktiv")]
    [InlineData(false, "deaktiviert")]
    public void StatusWert_liefert_den_gespeicherten_Wert(bool aktiv, string erwartet)
    {
        Assert.Equal(erwartet, AuditEintrag.StatusWert(aktiv));
    }

    // ---------- Fake ----------

    private sealed class FakeBenutzerverwaltungRepository : IBenutzerverwaltungRepository
    {
        private bool _inSperre;

        public Dictionary<Guid, DomainBenutzer> Benutzer { get; } = [];

        public List<(DomainBenutzer Benutzer, AuditEintrag Eintrag)> Gespeichert { get; } = [];

        public List<Guid> InSperreGeladen { get; } = [];

        public int SperreAufrufe { get; private set; }

        public int AnzahlInSperreGelesen { get; private set; }

        public int? AnzahlAktiverAdminsUeberschreiben { get; set; }

        /// <summary>Läuft beim Betreten der Sperre, bevor die Aktion etwas liest (nebenläufige Änderung).</summary>
        public Action? VorDerSperre { get; set; }

        public async Task<T> InSperreAsync<T>(Func<IBenutzerverwaltungSitzung, Task<T>> aktion, CancellationToken ct)
        {
            SperreAufrufe++;
            VorDerSperre?.Invoke();
            _inSperre = true;
            try
            {
                return await aktion(new Sitzung(this));
            }
            finally
            {
                _inSperre = false;
            }
        }

        public Task<Seite<DomainBenutzer>> SuchenAsync(string? suche, int seite, int groesse, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<Seite<AuditEintragAnsicht>> AuditSeiteAsync(Guid? benutzerId, int seite, int groesse, CancellationToken ct) =>
            throw new NotSupportedException();

        private void PruefeSperre()
        {
            if (!_inSperre)
            {
                throw new InvalidOperationException("Zugriff außerhalb von InSperreAsync (ADR-0018).");
            }
        }

        private sealed class Sitzung(FakeBenutzerverwaltungRepository repo) : IBenutzerverwaltungSitzung
        {
            public Task<DomainBenutzer?> LadenAsync(Guid id, CancellationToken ct)
            {
                repo.PruefeSperre();
                repo.InSperreGeladen.Add(id);
                return Task.FromResult(repo.Benutzer.GetValueOrDefault(id));
            }

            public Task<int> AnzahlAktiverAdministratorenAsync(CancellationToken ct)
            {
                repo.PruefeSperre();
                repo.AnzahlInSperreGelesen++;
                return Task.FromResult(repo.AnzahlAktiverAdminsUeberschreiben
                    ?? repo.Benutzer.Values.Count(b => b is { Rolle: Rolle.Administrator, Aktiv: true }));
            }

            public Task SpeichernAsync(DomainBenutzer benutzer, AuditEintrag eintrag, CancellationToken ct)
            {
                repo.PruefeSperre();
                repo.Gespeichert.Add((benutzer, eintrag));
                repo.Benutzer[benutzer.Id] = benutzer;
                return Task.CompletedTask;
            }
        }
    }
}
