using Coin.Domain.Benutzer;

namespace Coin.UnitTests.Benutzer;

/// <summary>Feature anmeldung-keycloak, AK-13 und AK-17: Anzeigename-Fallback und Kürzung (ADR-0013).</summary>
public class BenutzerIdentitaetTests
{
    private const string Issuer = "https://idp.coin-test.invalid/realms/coin-test";

    private static BenutzerIdentitaet Erstellen(
        string? email = "person@coin-test.invalid",
        bool emailVerifiziert = true,
        string? name = "Test Person",
        string? preferredUsername = "person",
        string subject = "sub-1") =>
        BenutzerIdentitaet.Erstellen(Issuer, subject, email, emailVerifiziert, name, preferredUsername);

    [Fact]
    public void Uebernimmt_Issuer_und_Subject()
    {
        var identitaet = Erstellen(subject: "sub-42");

        Assert.Equal(Issuer, identitaet.Issuer);
        Assert.Equal("sub-42", identitaet.Subject);
    }

    [Fact]
    public void Uebernimmt_die_Email()
    {
        Assert.Equal("person@coin-test.invalid", Erstellen().Email);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Uebernimmt_email_verified(bool verifiziert)
    {
        Assert.Equal(verifiziert, Erstellen(emailVerifiziert: verifiziert).EmailVerifiziert);
    }

    [Fact]
    public void Ohne_Email_ist_die_Email_null()
    {
        Assert.Null(Erstellen(email: null).Email);
    }

    // ---------- Anzeigename ----------

    [Fact]
    public void Anzeigename_ist_der_Name()
    {
        Assert.Equal("Test Person", Erstellen().Anzeigename);
    }

    [Fact]
    public void Anzeigename_ist_ohne_Name_der_preferred_username()
    {
        Assert.Equal("person", Erstellen(name: null).Anzeigename);
    }

    [Fact]
    public void Anzeigename_ist_ohne_Name_und_preferred_username_die_Email()
    {
        Assert.Equal("person@coin-test.invalid", Erstellen(name: null, preferredUsername: null).Anzeigename);
    }

    [Fact]
    public void Anzeigename_ist_ohne_alle_Angaben_Unbekannt()
    {
        Assert.Equal("Unbekannt", Erstellen(email: null, name: null, preferredUsername: null).Anzeigename);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Leerer_Name_zaehlt_als_fehlend(string leer)
    {
        Assert.Equal("person", Erstellen(name: leer).Anzeigename);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Nur_leere_Angaben_fuehren_zu_Unbekannt(string leer)
    {
        Assert.Equal("Unbekannt", Erstellen(email: leer, name: leer, preferredUsername: leer).Anzeigename);
    }

    // ---------- Kürzung ----------

    [Fact]
    public void Anzeigename_ueber_200_Zeichen_wird_auf_die_ersten_200_gekuerzt()
    {
        var name = new string('a', 199) + "bcdef";

        Assert.Equal(name[..200], Erstellen(name: name).Anzeigename);
    }

    [Fact]
    public void Kuerzung_teilt_kein_Surrogatpaar_an_Position_199_und_200()
    {
        var name = new string('a', 199) + "😀" + "b"; // Emoji als Surrogatpaar an Index 199/200

        var anzeigename = Erstellen(name: name).Anzeigename;

        Assert.True(anzeigename.Length <= 200, $"Länge {anzeigename.Length}");
        Assert.False(char.IsHighSurrogate(anzeigename[^1]), "Kürzung endet mit einem halben Surrogatpaar");
        Assert.Equal(new string('a', 199), anzeigename);
    }

    [Fact]
    public void Kuerzung_ergibt_gueltiges_UTF16()
    {
        var name = new string('a', 199) + "😀😀";

        var anzeigename = Erstellen(name: name).Anzeigename;

        Assert.All(anzeigename.EnumerateRunes(), r => Assert.NotEqual(System.Text.Rune.ReplacementChar, r));
        Assert.True(System.Text.Encoding.UTF8.GetString(System.Text.Encoding.UTF8.GetBytes(anzeigename)) == anzeigename);
    }

    [Fact]
    public void Anzeigename_mit_genau_200_Zeichen_bleibt_unveraendert()
    {
        var name = new string('a', 200);

        Assert.Equal(name, Erstellen(name: name).Anzeigename);
    }

    [Fact]
    public void MaxAnzeigenameLaenge_ist_200()
    {
        Assert.Equal(200, BenutzerIdentitaet.MaxAnzeigenameLaenge);
    }

    [Fact]
    public void Preferred_username_ueber_200_Zeichen_wird_als_Anzeigename_gekuerzt()
    {
        Assert.Equal(200, Erstellen(name: null, preferredUsername: new string('p', 250)).Anzeigename.Length);
    }

    [Fact]
    public void Email_ueber_320_Zeichen_wird_null()
    {
        var email = new string('e', 321 - "@coin-test.invalid".Length) + "@coin-test.invalid";

        Assert.Null(Erstellen(email: email).Email);
    }

    [Fact]
    public void Email_mit_genau_320_Zeichen_bleibt_erhalten()
    {
        var email = new string('e', 320 - "@coin-test.invalid".Length) + "@coin-test.invalid";

        Assert.Equal(email, Erstellen(email: email).Email);
    }

    [Fact]
    public void MaxEmailLaenge_ist_320()
    {
        Assert.Equal(320, BenutzerIdentitaet.MaxEmailLaenge);
    }
}
