using Coin.Domain.Benutzer;
using DomainBenutzer = Coin.Domain.Benutzer.Benutzer;

namespace Coin.UnitTests.Benutzer;

/// <summary>
/// Feature rollen-benutzerverwaltung, AK-1 (ersetzt RollenTests aus anmeldung-keycloak): feste Berechtigungen und
/// Rechtematrix im Domain-Code (ADR-0016). Jede Zelle der Matrix aus Entwurf 5.1 wird einzeln geprüft.
/// </summary>
public class RechtematrixTests
{
    private const string CoinsRead = "coins.read";
    private const string CoinsWrite = "coins.write";
    private const string UsersManage = "users.manage";
    private const string AuditRead = "audit.read";

    private static readonly DateTimeOffset Zeit = new(2026, 10, 5, 9, 0, 0, TimeSpan.Zero);

    private static DomainBenutzer Benutzer(Rolle? rolle, bool aktiv) =>
        new(Guid.CreateVersion7(), "iss", "sub-1", "person@coin-test.invalid", "Test Person", rolle, Zeit, Zeit, Aktiv: aktiv);

    // ---------- Rollen (unverändert aus RollenTests) ----------

    [Fact]
    public void Enum_Rolle_hat_genau_Administrator_Sachbearbeiter_und_Betrachter()
    {
        Assert.Equal(["Administrator", "Betrachter", "Sachbearbeiter"], Enum.GetNames<Rolle>().Order(StringComparer.Ordinal));
    }

    // ---------- Berechtigungen ----------

    [Fact]
    public void Berechtigungen_Alle_enthaelt_genau_die_vier_Berechtigungen()
    {
        Assert.Equal([AuditRead, CoinsRead, CoinsWrite, UsersManage], Berechtigungen.Alle.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void Berechtigungen_Alle_enthaelt_keine_Duplikate()
    {
        Assert.Equal(Berechtigungen.Alle.Count(), Berechtigungen.Alle.Distinct(StringComparer.Ordinal).Count());
    }

    [Theory]
    [InlineData(nameof(Berechtigungen.CoinsRead), CoinsRead)]
    [InlineData(nameof(Berechtigungen.CoinsWrite), CoinsWrite)]
    [InlineData(nameof(Berechtigungen.UsersManage), UsersManage)]
    [InlineData(nameof(Berechtigungen.AuditRead), AuditRead)]
    public void Konstante_hat_den_festgelegten_Wert(string konstante, string wert)
    {
        var feld = typeof(Berechtigungen).GetField(konstante);

        Assert.NotNull(feld);
        Assert.Equal(wert, feld!.GetValue(null));
    }

    // ---------- Rechtematrix: jede Zelle ----------

    public static TheoryData<Rolle?, string, bool> Zellen => new()
    {
        { Rolle.Administrator, CoinsRead, true },
        { Rolle.Administrator, CoinsWrite, true },
        { Rolle.Administrator, UsersManage, true },
        { Rolle.Administrator, AuditRead, true },
        { Rolle.Sachbearbeiter, CoinsRead, true },
        { Rolle.Sachbearbeiter, CoinsWrite, true },
        { Rolle.Sachbearbeiter, UsersManage, false },
        { Rolle.Sachbearbeiter, AuditRead, false },
        { Rolle.Betrachter, CoinsRead, true },
        { Rolle.Betrachter, CoinsWrite, false },
        { Rolle.Betrachter, UsersManage, false },
        { Rolle.Betrachter, AuditRead, false },
        { null, CoinsRead, false },
        { null, CoinsWrite, false },
        { null, UsersManage, false },
        { null, AuditRead, false },
    };

    [Theory]
    [MemberData(nameof(Zellen))]
    public void Von_liefert_die_Zelle_der_Matrix(Rolle? rolle, string berechtigung, bool erwartet)
    {
        Assert.Equal(erwartet, Rechtematrix.Von(rolle).Contains(berechtigung));
    }

    [Fact]
    public void Von_liefert_fuer_keine_Rolle_die_leere_Menge()
    {
        Assert.Empty(Rechtematrix.Von(null));
    }

    [Theory]
    [InlineData(Rolle.Administrator, 4)]
    [InlineData(Rolle.Sachbearbeiter, 2)]
    [InlineData(Rolle.Betrachter, 1)]
    public void Von_liefert_keine_weiteren_Berechtigungen(Rolle rolle, int anzahl)
    {
        Assert.Equal(anzahl, Rechtematrix.Von(rolle).Count);
    }

    [Theory]
    [InlineData(Rolle.Administrator)]
    [InlineData(Rolle.Sachbearbeiter)]
    [InlineData(Rolle.Betrachter)]
    public void Von_liefert_nur_Berechtigungen_aus_Alle(Rolle rolle)
    {
        Assert.All(Rechtematrix.Von(rolle), b => Assert.Contains(b, Berechtigungen.Alle));
    }

    [Fact]
    public void Coins_write_haben_genau_Administrator_und_Sachbearbeiter()
    {
        // Ersetzt Katalog_schreiben_duerfen_genau_Administrator_und_Sachbearbeiter (Rollen.DuerfenKatalogSchreiben entfällt, AK-3).
        var mitSchreibrecht = Enum.GetValues<Rolle>().Where(r => Rechtematrix.Von(r).Contains(CoinsWrite)).Order();

        Assert.Equal([Rolle.Administrator, Rolle.Sachbearbeiter], mitSchreibrecht);
    }

    [Fact]
    public void Von_liefert_eine_unveraenderliche_Menge()
    {
        var menge = Rechtematrix.Von(Rolle.Betrachter);

        Assert.False(menge is ISet<string> { IsReadOnly: false }, "Die Matrix darf von außen nicht veränderbar sein.");
    }

    // ---------- Rechtematrix.Hat: Deaktiviert hat keine Berechtigung ----------

    [Theory]
    [MemberData(nameof(Zellen))]
    public void Hat_entspricht_fuer_aktive_Benutzer_der_Matrix(Rolle? rolle, string berechtigung, bool erwartet)
    {
        Assert.Equal(erwartet, Rechtematrix.Hat(Benutzer(rolle, aktiv: true), berechtigung));
    }

    [Theory]
    [InlineData(CoinsRead)]
    [InlineData(CoinsWrite)]
    [InlineData(UsersManage)]
    [InlineData(AuditRead)]
    public void Hat_liefert_fuer_einen_deaktivierten_Administrator_false(string berechtigung)
    {
        Assert.False(Rechtematrix.Hat(Benutzer(Rolle.Administrator, aktiv: false), berechtigung));
    }

    [Theory]
    [InlineData(Rolle.Sachbearbeiter)]
    [InlineData(Rolle.Betrachter)]
    public void Hat_liefert_fuer_deaktivierte_Benutzer_mit_Rolle_nie_coins_read(Rolle rolle)
    {
        Assert.False(Rechtematrix.Hat(Benutzer(rolle, aktiv: false), CoinsRead));
    }

    [Fact]
    public void Hat_liefert_fuer_eine_unbekannte_Berechtigung_false()
    {
        Assert.False(Rechtematrix.Hat(Benutzer(Rolle.Administrator, aktiv: true), "coins.delete"));
    }

    [Fact]
    public void Hat_unterscheidet_Gross_und_Kleinschreibung()
    {
        Assert.False(Rechtematrix.Hat(Benutzer(Rolle.Administrator, aktiv: true), "Coins.Write"));
    }

    [Fact]
    public void Neue_Benutzer_sind_standardmaessig_aktiv()
    {
        var benutzer = new DomainBenutzer(Guid.CreateVersion7(), "iss", "sub-1", null, "Test Person", null, Zeit, Zeit);

        Assert.True(benutzer.Aktiv);
    }
}
