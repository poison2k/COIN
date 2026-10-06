using Coin.Domain.Benutzer;
using DomainBenutzer = Coin.Domain.Benutzer.Benutzer;

namespace Coin.UnitTests.Benutzer;

/// <summary>
/// Feature rollen-benutzerverwaltung, AK-15, AK-16, AK-18 und ADR-0018 Punkt 1: reine Prüfung
/// <c>Schutzregeln.Pruefen(akteur, ziel, aenderung, anzahlAktiverAdmins)</c> in dieser Reihenfolge:
/// NichtGefunden → Unveraendert → AkteurNichtBerechtigt → EigenesKonto → LetzterAdministrator → Erlaubt.
/// </summary>
public class SchutzregelnTests
{
    private static readonly DateTimeOffset Zeit = new(2026, 10, 5, 9, 0, 0, TimeSpan.Zero);

    private static DomainBenutzer Person(Rolle? rolle, bool aktiv = true) =>
        new(Guid.CreateVersion7(), "iss", $"sub-{Guid.NewGuid():N}", null, "Test Person", rolle, Zeit, Zeit, Aktiv: aktiv);

    private static readonly DomainBenutzer AktiverAdmin = Person(Rolle.Administrator);

    private static Aenderung RolleAuf(Rolle? rolle) => new Aenderung.RolleSetzen(rolle);

    private static Aenderung Status(bool aktiv) => new Aenderung.StatusSetzen(aktiv);

    // ---------- 1. NichtGefunden ----------

    [Fact]
    public void Ziel_fehlt_ergibt_NichtGefunden()
    {
        Assert.Equal(Schutzpruefung.NichtGefunden, Schutzregeln.Pruefen(AktiverAdmin, null, RolleAuf(Rolle.Betrachter), 2));
    }

    [Fact]
    public void NichtGefunden_geht_einem_unberechtigten_Akteur_vor()
    {
        Assert.Equal(Schutzpruefung.NichtGefunden, Schutzregeln.Pruefen(Person(Rolle.Betrachter), null, Status(false), 2));
    }

    // ---------- 2. Unveraendert ----------

    [Theory]
    [InlineData(Rolle.Administrator)]
    [InlineData(Rolle.Sachbearbeiter)]
    [InlineData(Rolle.Betrachter)]
    [InlineData(null)]
    public void Gleiche_Rolle_ergibt_Unveraendert(Rolle? rolle)
    {
        Assert.Equal(Schutzpruefung.Unveraendert, Schutzregeln.Pruefen(AktiverAdmin, Person(rolle), RolleAuf(rolle), 2));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Gleicher_Status_ergibt_Unveraendert(bool aktiv)
    {
        Assert.Equal(Schutzpruefung.Unveraendert, Schutzregeln.Pruefen(AktiverAdmin, Person(Rolle.Betrachter, aktiv), Status(aktiv), 2));
    }

    [Fact]
    public void Eigene_Adminrolle_erneut_setzen_ergibt_Unveraendert_statt_EigenesKonto()
    {
        Assert.Equal(Schutzpruefung.Unveraendert, Schutzregeln.Pruefen(AktiverAdmin, AktiverAdmin, RolleAuf(Rolle.Administrator), 1));
    }

    [Fact]
    public void Eigenes_Konto_aktiv_setzen_ergibt_Unveraendert()
    {
        Assert.Equal(Schutzpruefung.Unveraendert, Schutzregeln.Pruefen(AktiverAdmin, AktiverAdmin, Status(true), 1));
    }

    // ---------- 3. AkteurNichtBerechtigt ----------

    [Fact]
    public void Fehlender_Akteur_ergibt_AkteurNichtBerechtigt()
    {
        Assert.Equal(Schutzpruefung.AkteurNichtBerechtigt, Schutzregeln.Pruefen(null, Person(null), RolleAuf(Rolle.Betrachter), 1));
    }

    [Theory]
    [InlineData(Rolle.Sachbearbeiter)]
    [InlineData(Rolle.Betrachter)]
    [InlineData(null)]
    public void Akteur_ohne_Adminrolle_ergibt_AkteurNichtBerechtigt(Rolle? rolle)
    {
        Assert.Equal(Schutzpruefung.AkteurNichtBerechtigt, Schutzregeln.Pruefen(Person(rolle), Person(null), RolleAuf(Rolle.Betrachter), 1));
    }

    [Fact]
    public void Deaktivierter_Administrator_als_Akteur_ergibt_AkteurNichtBerechtigt()
    {
        Assert.Equal(
            Schutzpruefung.AkteurNichtBerechtigt,
            Schutzregeln.Pruefen(Person(Rolle.Administrator, aktiv: false), Person(null), RolleAuf(Rolle.Betrachter), 1));
    }

    [Fact]
    public void AkteurNichtBerechtigt_geht_EigenesKonto_vor()
    {
        var ehemaligerAdmin = Person(Rolle.Sachbearbeiter);

        Assert.Equal(Schutzpruefung.AkteurNichtBerechtigt, Schutzregeln.Pruefen(ehemaligerAdmin, ehemaligerAdmin, RolleAuf(Rolle.Betrachter), 1));
    }

    // ---------- 4. EigenesKonto (AK-16) ----------

    [Theory]
    [InlineData(Rolle.Sachbearbeiter)]
    [InlineData(Rolle.Betrachter)]
    [InlineData(null)]
    public void Eigene_Adminrolle_entziehen_ergibt_EigenesKonto(Rolle? neu)
    {
        Assert.Equal(Schutzpruefung.EigenesKonto, Schutzregeln.Pruefen(AktiverAdmin, AktiverAdmin, RolleAuf(neu), 5));
    }

    [Fact]
    public void Eigenes_Konto_deaktivieren_ergibt_EigenesKonto()
    {
        Assert.Equal(Schutzpruefung.EigenesKonto, Schutzregeln.Pruefen(AktiverAdmin, AktiverAdmin, Status(false), 5));
    }

    [Fact]
    public void EigenesKonto_geht_LetzterAdministrator_vor()
    {
        Assert.Equal(Schutzpruefung.EigenesKonto, Schutzregeln.Pruefen(AktiverAdmin, AktiverAdmin, Status(false), 1));
    }

    [Fact]
    public void EigenesKonto_vergleicht_die_Id_und_nicht_die_Objektidentitaet()
    {
        var kopie = AktiverAdmin with { Anzeigename = "Anderer Name" };

        Assert.Equal(Schutzpruefung.EigenesKonto, Schutzregeln.Pruefen(AktiverAdmin, kopie, RolleAuf(Rolle.Betrachter), 3));
    }

    // ---------- 5. LetzterAdministrator (AK-15) ----------

    [Theory]
    [InlineData(Rolle.Sachbearbeiter)]
    [InlineData(Rolle.Betrachter)]
    [InlineData(null)]
    public void Letzten_aktiven_Administrator_herabstufen_ergibt_LetzterAdministrator(Rolle? neu)
    {
        Assert.Equal(Schutzpruefung.LetzterAdministrator, Schutzregeln.Pruefen(AktiverAdmin, Person(Rolle.Administrator), RolleAuf(neu), 1));
    }

    [Fact]
    public void Letzten_aktiven_Administrator_deaktivieren_ergibt_LetzterAdministrator()
    {
        Assert.Equal(Schutzpruefung.LetzterAdministrator, Schutzregeln.Pruefen(AktiverAdmin, Person(Rolle.Administrator), Status(false), 1));
    }

    [Fact]
    public void Ohne_aktive_Administratoren_wird_ein_aktiver_Administrator_ebenfalls_geschuetzt()
    {
        Assert.Equal(Schutzpruefung.LetzterAdministrator, Schutzregeln.Pruefen(AktiverAdmin, Person(Rolle.Administrator), Status(false), 0));
    }

    // ---------- Erlaubt (AK-18) ----------

    [Theory]
    [InlineData(Rolle.Sachbearbeiter)]
    [InlineData(Rolle.Betrachter)]
    [InlineData(null)]
    public void Anderen_Administrator_herabstufen_ist_erlaubt_wenn_zwei_aktive_bleiben(Rolle? neu)
    {
        Assert.Equal(Schutzpruefung.Erlaubt, Schutzregeln.Pruefen(AktiverAdmin, Person(Rolle.Administrator), RolleAuf(neu), 2));
    }

    [Fact]
    public void Anderen_Administrator_deaktivieren_ist_erlaubt_wenn_zwei_aktive_bleiben()
    {
        Assert.Equal(Schutzpruefung.Erlaubt, Schutzregeln.Pruefen(AktiverAdmin, Person(Rolle.Administrator), Status(false), 2));
    }

    [Fact]
    public void Deaktivierten_Administrator_herabstufen_ist_auch_bei_einem_aktiven_Admin_erlaubt()
    {
        // Ein deaktivierter Administrator zählt nicht als aktiv (AK-15).
        Assert.Equal(Schutzpruefung.Erlaubt, Schutzregeln.Pruefen(AktiverAdmin, Person(Rolle.Administrator, aktiv: false), RolleAuf(Rolle.Betrachter), 1));
    }

    [Fact]
    public void Deaktivierten_Administrator_reaktivieren_ist_erlaubt()
    {
        Assert.Equal(Schutzpruefung.Erlaubt, Schutzregeln.Pruefen(AktiverAdmin, Person(Rolle.Administrator, aktiv: false), Status(true), 1));
    }

    [Theory]
    [InlineData(null, Rolle.Betrachter)]
    [InlineData(Rolle.Betrachter, Rolle.Sachbearbeiter)]
    [InlineData(Rolle.Sachbearbeiter, Rolle.Administrator)]
    [InlineData(Rolle.Sachbearbeiter, null)]
    public void Rollenwechsel_eines_Nicht_Administrators_ist_auch_bei_einem_Admin_erlaubt(Rolle? alt, Rolle? neu)
    {
        Assert.Equal(Schutzpruefung.Erlaubt, Schutzregeln.Pruefen(AktiverAdmin, Person(alt), RolleAuf(neu), 1));
    }

    [Theory]
    [InlineData(Rolle.Sachbearbeiter)]
    [InlineData(Rolle.Betrachter)]
    [InlineData(null)]
    public void Nicht_Administrator_deaktivieren_ist_auch_bei_einem_Admin_erlaubt(Rolle? rolle)
    {
        Assert.Equal(Schutzpruefung.Erlaubt, Schutzregeln.Pruefen(AktiverAdmin, Person(rolle), Status(false), 1));
    }

    [Fact]
    public void Deaktivierten_Benutzer_reaktivieren_ist_erlaubt()
    {
        Assert.Equal(Schutzpruefung.Erlaubt, Schutzregeln.Pruefen(AktiverAdmin, Person(Rolle.Betrachter, aktiv: false), Status(true), 1));
    }
}
