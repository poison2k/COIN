using Coin.Domain.Benutzer;

namespace Coin.UnitTests.Benutzer;

/// <summary>Feature anmeldung-keycloak, AK-16: Bootstrap-Regel (nur verifizierte E-Mail aus der Liste).</summary>
public class BootstrapAdminsTests
{
    private const string AdminEmail = "admin@coin-test.invalid";

    private static BenutzerIdentitaet Identitaet(string? email, bool verifiziert = true) =>
        BenutzerIdentitaet.Erstellen("https://idp.coin-test.invalid/realms/coin-test", "sub-1", email, verifiziert, "Test Person", null);

    [Fact]
    public void Verifizierte_Email_aus_der_Liste_bekommt_Administrator()
    {
        var bootstrap = new BootstrapAdmins([AdminEmail]);

        Assert.Equal(Rolle.Administrator, bootstrap.RolleBeiNeuanlage(Identitaet(AdminEmail)));
    }

    [Fact]
    public void Nicht_verifizierte_Email_aus_der_Liste_bekommt_keine_Rolle()
    {
        var bootstrap = new BootstrapAdmins([AdminEmail]);

        Assert.Null(bootstrap.RolleBeiNeuanlage(Identitaet(AdminEmail, verifiziert: false)));
    }

    [Fact]
    public void Email_ausserhalb_der_Liste_bekommt_keine_Rolle()
    {
        var bootstrap = new BootstrapAdmins([AdminEmail]);

        Assert.Null(bootstrap.RolleBeiNeuanlage(Identitaet("andere@coin-test.invalid")));
    }

    [Theory]
    [InlineData("ADMIN@COIN-TEST.INVALID")]
    [InlineData("Admin@Coin-Test.Invalid")]
    public void Vergleich_ignoriert_Gross_und_Kleinschreibung_der_Email(string email)
    {
        var bootstrap = new BootstrapAdmins([AdminEmail]);

        Assert.Equal(Rolle.Administrator, bootstrap.RolleBeiNeuanlage(Identitaet(email)));
    }

    [Fact]
    public void Vergleich_ignoriert_Gross_und_Kleinschreibung_der_Liste()
    {
        var bootstrap = new BootstrapAdmins(["ADMIN@Coin-Test.Invalid"]);

        Assert.Equal(Rolle.Administrator, bootstrap.RolleBeiNeuanlage(Identitaet(AdminEmail)));
    }

    [Fact]
    public void Listeneintraege_werden_getrimmt()
    {
        var bootstrap = new BootstrapAdmins(["  admin@coin-test.invalid \t"]);

        Assert.Equal(Rolle.Administrator, bootstrap.RolleBeiNeuanlage(Identitaet(AdminEmail)));
    }

    [Fact]
    public void Email_aus_dem_Token_wird_fuer_den_Vergleich_getrimmt()
    {
        var bootstrap = new BootstrapAdmins([AdminEmail]);

        Assert.Equal(Rolle.Administrator, bootstrap.RolleBeiNeuanlage(Identitaet("  admin@coin-test.invalid ")));
    }

    [Fact]
    public void Leere_Liste_vergibt_keine_Rolle()
    {
        var bootstrap = new BootstrapAdmins([]);

        Assert.Null(bootstrap.RolleBeiNeuanlage(Identitaet(AdminEmail)));
    }

    [Fact]
    public void Fehlende_Liste_vergibt_keine_Rolle()
    {
        var bootstrap = new BootstrapAdmins(null);

        Assert.Null(bootstrap.RolleBeiNeuanlage(Identitaet(AdminEmail)));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Leerer_Listeneintrag_vergibt_keine_Rolle_an_Benutzer_ohne_Email(string eintrag)
    {
        var bootstrap = new BootstrapAdmins([eintrag]);

        Assert.Null(bootstrap.RolleBeiNeuanlage(Identitaet(null)));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Leerer_Listeneintrag_vergibt_keine_Rolle_an_Benutzer_mit_leerer_Email(string leer)
    {
        var bootstrap = new BootstrapAdmins([leer]);

        Assert.Null(bootstrap.RolleBeiNeuanlage(Identitaet(leer)));
    }

    [Fact]
    public void Benutzer_ohne_Email_bekommt_keine_Rolle()
    {
        var bootstrap = new BootstrapAdmins([AdminEmail]);

        Assert.Null(bootstrap.RolleBeiNeuanlage(Identitaet(null)));
    }

    [Theory]
    [InlineData("xadmin@coin-test.invalid")]
    [InlineData("admin@coin-test")]
    [InlineData("admin@coin-test.invalid.boese.example")]
    public void Teilstring_oder_Erweiterung_einer_Listen_Email_reicht_nicht(string email)
    {
        var bootstrap = new BootstrapAdmins([AdminEmail]);

        Assert.Null(bootstrap.RolleBeiNeuanlage(Identitaet(email)));
    }

    [Fact]
    public void Mehrere_Listeneintraege_werden_alle_beruecksichtigt()
    {
        var bootstrap = new BootstrapAdmins([AdminEmail, "zweiter@coin-test.invalid"]);

        Assert.Equal(Rolle.Administrator, bootstrap.RolleBeiNeuanlage(Identitaet("zweiter@coin-test.invalid")));
    }
}
