using System.Net;
using System.Net.Http.Json;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Benutzer;

/// <summary>
/// Feature anmeldung-keycloak, AK-13 bis AK-17: Abgleich der Benutzer in der eigenen Datenbank
/// (Upsert auf (issuer, subject)), Bootstrap-Administratoren und Kürzung.
/// </summary>
public class BenutzerAbgleichTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private async Task<HttpResponseMessage> MeAsync(TokenDaten daten) => await ClientMit(daten).GetAsync(MeUrl);

    private async Task<string?> RolleAusMeAsync(TokenDaten daten)
    {
        using var antwort = await MeAsync(daten);
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        return (await JsonAsync(antwort)).GetProperty("rolle").GetString();
    }

    // ---------- AK-13: Erstaufruf legt an ----------

    [Fact]
    public async Task Erster_Aufruf_von_api_me_legt_genau_einen_Benutzer_an()
    {
        using var antwort = await MeAsync(new TokenDaten { Subject = "sub-erstaufruf" });

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        var zeile = Assert.Single(await BenutzerDb.AlleAsync());
        Assert.Equal("sub-erstaufruf", zeile.Subject);
    }

    [Fact]
    public async Task Angelegter_Benutzer_hat_Issuer_gleich_der_Authority()
    {
        using var _ = await MeAsync(new TokenDaten { Subject = "sub-issuer" });

        Assert.Equal(TestIdentitaetsanbieter.StandardAuthority, (await BenutzerDb.EinzigerAsync("sub-issuer")).Issuer);
    }

    [Fact]
    public async Task Erster_schreibender_Aufruf_legt_den_Benutzer_an_auch_wenn_er_403_bekommt()
    {
        var client = ClientMit(Testbenutzer.OhneRolle("sub-erst-schreibend"));

        using var antwort = await client.PostAsJsonAsync(CoinsUrl, GueltigerCoin());

        Assert.Equal(HttpStatusCode.Forbidden, antwort.StatusCode);
        Assert.Equal("sub-erst-schreibend", Assert.Single(await BenutzerDb.AlleAsync()).Subject);
    }

    [Fact]
    public async Task Erster_schreibender_Aufruf_des_Bootstrap_Admins_legt_ihn_an()
    {
        await LegeCoinAnAsync();

        var zeile = await BenutzerDb.EinzigerAsync(Testbenutzer.AdminSubject);
        Assert.Equal("Administrator", zeile.Rolle);
    }

    [Fact]
    public async Task Email_kommt_aus_dem_Claim_email()
    {
        using var _ = await MeAsync(new TokenDaten { Subject = "sub-email", Email = "erika.test@coin-test.invalid" });

        Assert.Equal("erika.test@coin-test.invalid", (await BenutzerDb.EinzigerAsync("sub-email")).Email);
    }

    [Fact]
    public async Task Ohne_Claim_email_ist_die_Email_null()
    {
        using var _ = await MeAsync(new TokenDaten { Subject = "sub-ohne-email", Email = null, EmailVerifiziert = null });

        Assert.Null((await BenutzerDb.EinzigerAsync("sub-ohne-email")).Email);
    }

    [Fact]
    public async Task Anzeigename_kommt_aus_dem_Claim_name()
    {
        using var _ = await MeAsync(new TokenDaten { Subject = "sub-name", Name = "Erika Test", PreferredUsername = "erika" });

        Assert.Equal("Erika Test", (await BenutzerDb.EinzigerAsync("sub-name")).Anzeigename);
    }

    [Fact]
    public async Task Anzeigename_faellt_ohne_name_auf_preferred_username_zurueck()
    {
        using var _ = await MeAsync(new TokenDaten { Subject = "sub-pu", Name = null, PreferredUsername = "erika.test" });

        Assert.Equal("erika.test", (await BenutzerDb.EinzigerAsync("sub-pu")).Anzeigename);
    }

    [Fact]
    public async Task Anzeigename_faellt_ohne_name_und_preferred_username_auf_die_Email_zurueck()
    {
        using var _ = await MeAsync(new TokenDaten { Subject = "sub-mail-name", Name = null, Email = "nur.mail@coin-test.invalid" });

        Assert.Equal("nur.mail@coin-test.invalid", (await BenutzerDb.EinzigerAsync("sub-mail-name")).Anzeigename);
    }

    [Fact]
    public async Task Anzeigename_ist_Unbekannt_ohne_name_preferred_username_und_email()
    {
        using var _ = await MeAsync(new TokenDaten { Subject = "sub-unbekannt", Name = null, Email = null, EmailVerifiziert = null });

        Assert.Equal("Unbekannt", (await BenutzerDb.EinzigerAsync("sub-unbekannt")).Anzeigename);
    }

    [Fact]
    public async Task Neuer_Benutzer_ohne_Bootstrap_hat_keine_Rolle()
    {
        using var _ = await MeAsync(Testbenutzer.OhneRolle("sub-neu"));

        Assert.Null((await BenutzerDb.EinzigerAsync("sub-neu")).Rolle);
    }

    [Fact]
    public async Task Erstellt_am_und_aktualisiert_am_sind_beim_Anlegen_gleich_und_aktuell()
    {
        var vorher = DateTimeOffset.UtcNow.AddSeconds(-5);

        using var _ = await MeAsync(new TokenDaten { Subject = "sub-zeit" });

        var zeile = await BenutzerDb.EinzigerAsync("sub-zeit");
        Assert.Equal(zeile.ErstelltAm, zeile.AktualisiertAm);
        Assert.InRange(zeile.ErstelltAm, vorher, DateTimeOffset.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task Id_ist_eine_neue_GUID_und_nicht_das_sub()
    {
        using var _ = await MeAsync(new TokenDaten { Subject = "sub-id" });

        var zeile = await BenutzerDb.EinzigerAsync("sub-id");
        Assert.NotEqual(Guid.Empty, zeile.Id);
        Assert.Equal(7, zeile.Id.Version);
    }

    // ---------- AK-14: weitere Aufrufe ----------

    [Fact]
    public async Task Zweiter_Aufruf_mit_demselben_sub_legt_keinen_neuen_Benutzer_an()
    {
        var daten = new TokenDaten { Subject = "sub-zweimal" };
        using (await MeAsync(daten))
        using (await MeAsync(daten))
        {
        }

        Assert.Single(await BenutzerDb.AlleAsync());
    }

    [Fact]
    public async Task Geaenderte_Email_wird_uebernommen()
    {
        var daten = new TokenDaten { Subject = "sub-mailwechsel", Email = "alt@coin-test.invalid" };
        using (await MeAsync(daten))
        using (await MeAsync(daten with { Email = "neu@coin-test.invalid" }))
        {
        }

        Assert.Equal("neu@coin-test.invalid", (await BenutzerDb.EinzigerAsync("sub-mailwechsel")).Email);
    }

    [Fact]
    public async Task Geaenderter_Name_wird_uebernommen()
    {
        var daten = new TokenDaten { Subject = "sub-namenswechsel", Name = "Alter Name" };
        using (await MeAsync(daten))
        using (await MeAsync(daten with { Name = "Neuer Name" }))
        {
        }

        Assert.Equal("Neuer Name", (await BenutzerDb.EinzigerAsync("sub-namenswechsel")).Anzeigename);
    }

    [Fact]
    public async Task Bei_Aenderung_wird_aktualisiert_am_neu_gesetzt_und_erstellt_am_bleibt()
    {
        var daten = new TokenDaten { Subject = "sub-aktualisiert", Name = "Alter Name" };
        using (await MeAsync(daten))
        {
        }

        var vorher = await BenutzerDb.EinzigerAsync("sub-aktualisiert");
        await Task.Delay(20);

        using (await MeAsync(daten with { Name = "Neuer Name" }))
        {
        }

        var nachher = await BenutzerDb.EinzigerAsync("sub-aktualisiert");
        Assert.Equal(vorher.ErstelltAm, nachher.ErstelltAm);
        Assert.True(nachher.AktualisiertAm > vorher.AktualisiertAm);
    }

    [Fact]
    public async Task Ohne_Aenderung_wird_nichts_geschrieben()
    {
        var daten = new TokenDaten { Subject = "sub-unveraendert" };
        using (await MeAsync(daten))
        {
        }

        var vorher = await BenutzerDb.EinzigerAsync("sub-unveraendert");
        await Task.Delay(20);

        using (await MeAsync(daten))
        {
        }

        var nachher = await BenutzerDb.EinzigerAsync("sub-unveraendert");
        Assert.Equal(vorher.AktualisiertAm, nachher.AktualisiertAm);
        Assert.Equal(vorher.Xmin, nachher.Xmin); // keine neue Zeilenversion = kein UPDATE
    }

    [Fact]
    public async Task Der_Abgleich_aendert_eine_vorhandene_Rolle_nicht()
    {
        var daten = new TokenDaten { Subject = "sub-rolle-bleibt", Name = "Alter Name" };
        using (await MeAsync(daten))
        {
        }

        await BenutzerDb.RolleSetzenAsync("sub-rolle-bleibt", "Betrachter");

        using (await MeAsync(daten with { Name = "Neuer Name", Email = "anders@coin-test.invalid" }))
        {
        }

        Assert.Equal("Betrachter", (await BenutzerDb.EinzigerAsync("sub-rolle-bleibt")).Rolle);
    }

    // ---------- AK-15: Nebenläufigkeit ----------

    [Fact]
    public async Task Zehn_parallele_Erstaufrufe_liefern_alle_200()
    {
        var client = ClientMit(new TokenDaten { Subject = "sub-parallel" });

        var antworten = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => client.GetAsync(MeUrl)));

        Assert.All(antworten, a => Assert.Equal(HttpStatusCode.OK, a.StatusCode));
        foreach (var antwort in antworten)
        {
            antwort.Dispose();
        }
    }

    [Fact]
    public async Task Zehn_parallele_Erstaufrufe_erzeugen_genau_einen_Datensatz()
    {
        var client = ClientMit(new TokenDaten { Subject = "sub-parallel-db" });

        var antworten = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => client.GetAsync(MeUrl)));
        foreach (var antwort in antworten)
        {
            antwort.Dispose();
        }

        Assert.Single(await BenutzerDb.AlleAsync());
    }

    [Fact]
    public async Task Zehn_parallele_Erstaufrufe_liefern_dieselbe_Benutzer_Id()
    {
        var client = ClientMit(new TokenDaten { Subject = "sub-parallel-id" });

        var antworten = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => client.GetAsync(MeUrl)));
        var ids = new HashSet<string?>();
        foreach (var antwort in antworten)
        {
            ids.Add((await JsonAsync(antwort)).GetProperty("id").GetString());
            antwort.Dispose();
        }

        Assert.Single(ids);
    }

    [Fact]
    public async Task Zehn_parallele_Erstaufrufe_des_Bootstrap_Admins_ergeben_einen_Administrator()
    {
        var antworten = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => Client.PostAsJsonAsync(CoinsUrl, GueltigerCoin($"Coin {Guid.NewGuid():N}"))));
        foreach (var antwort in antworten)
        {
            Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
            antwort.Dispose();
        }

        var zeile = Assert.Single(await BenutzerDb.AlleAsync());
        Assert.Equal("Administrator", zeile.Rolle);
    }

    // ---------- AK-16: Bootstrap ----------

    [Fact]
    public async Task Bootstrap_vergibt_Administrator_bei_verifizierter_Email_aus_der_Liste()
    {
        Assert.Equal("Administrator", await RolleAusMeAsync(Testbenutzer.Admin));
    }

    [Fact]
    public async Task Bootstrap_vergleicht_die_Email_ohne_Beachtung_der_Gross_Kleinschreibung()
    {
        var daten = Testbenutzer.Admin with { Subject = "sub-gross", Email = "ADMIN@Coin-Test.INVALID" };

        Assert.Equal("Administrator", await RolleAusMeAsync(daten));
    }

    [Fact]
    public async Task Bootstrap_trimmt_die_Eintraege_der_Liste()
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Einstellungen = new Dictionary<string, string?> { ["Bootstrap:AdminEmails:0"] = "  Zweit.Admin@Coin-Test.Invalid  " },
        });
        using var client = factory.ClientMitToken(Idp.ErzeugeToken(new TokenDaten { Subject = "sub-trim", Email = "zweit.admin@coin-test.invalid" }));

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal("Administrator", (await JsonAsync(antwort)).GetProperty("rolle").GetString());
    }

    [Fact]
    public async Task Bootstrap_beruecksichtigt_alle_Eintraege_der_Liste()
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Einstellungen = new Dictionary<string, string?> { ["Bootstrap:AdminEmails:1"] = "zweiter.admin@coin-test.invalid" },
        });
        using var client = factory.ClientMitToken(Idp.ErzeugeToken(new TokenDaten { Subject = "sub-zweiter", Email = "zweiter.admin@coin-test.invalid" }));

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal("Administrator", (await JsonAsync(antwort)).GetProperty("rolle").GetString());
    }

    [Fact]
    public async Task Kein_Bootstrap_bei_email_verified_false()
    {
        Assert.Equal("keine", await RolleAusMeAsync(Testbenutzer.Admin with { Subject = "sub-unverifiziert", EmailVerifiziert = false }));
    }

    [Fact]
    public async Task Kein_Bootstrap_ohne_Claim_email_verified()
    {
        Assert.Equal("keine", await RolleAusMeAsync(Testbenutzer.Admin with { Subject = "sub-ohne-verified", EmailVerifiziert = null }));
    }

    [Fact]
    public async Task Kein_Bootstrap_bei_email_verified_als_Zeichenkette()
    {
        var daten = Testbenutzer.Admin with
        {
            Subject = "sub-verified-text",
            EmailVerifiziert = null,
            Zusatz = new Dictionary<string, object?> { ["email_verified"] = "false" },
        };

        Assert.Equal("keine", await RolleAusMeAsync(daten));
    }

    [Fact]
    public async Task Kein_Bootstrap_fuer_eine_Email_die_nicht_in_der_Liste_steht()
    {
        Assert.Equal("keine", await RolleAusMeAsync(Testbenutzer.OhneRolle()));
    }

    [Fact]
    public async Task Kein_Bootstrap_fuer_eine_Email_die_den_Listeneintrag_nur_enthaelt()
    {
        var daten = Testbenutzer.Admin with { Subject = "sub-teilstring", Email = "x" + Testbenutzer.AdminEmail };

        Assert.Equal("keine", await RolleAusMeAsync(daten));
    }

    [Fact]
    public async Task Kein_Bootstrap_ohne_Liste()
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Einstellungen = new Dictionary<string, string?> { ["Bootstrap:AdminEmails:0"] = null },
        });
        using var client = factory.ClientMitToken(Idp.ErzeugeToken(Testbenutzer.Admin));

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal("keine", (await JsonAsync(antwort)).GetProperty("rolle").GetString());
    }

    [Fact]
    public async Task Leerer_Listeneintrag_macht_einen_Benutzer_ohne_Email_nicht_zum_Administrator()
    {
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Einstellungen = new Dictionary<string, string?> { ["Bootstrap:AdminEmails:0"] = "" },
        });
        using var client = factory.ClientMitToken(Idp.ErzeugeToken(new TokenDaten { Subject = "sub-leer", Email = null }));

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal("keine", (await JsonAsync(antwort)).GetProperty("rolle").GetString());
    }

    [Fact]
    public async Task Bootstrap_greift_nicht_fuer_bereits_vorhandene_Benutzer()
    {
        var daten = Testbenutzer.Admin with { Subject = "sub-spaeter-verifiziert", EmailVerifiziert = false };
        Assert.Equal("keine", await RolleAusMeAsync(daten));

        Assert.Equal("keine", await RolleAusMeAsync(daten with { EmailVerifiziert = true }));
    }

    [Fact]
    public async Task Bootstrap_greift_nicht_wenn_ein_vorhandener_Benutzer_die_Admin_Email_bekommt()
    {
        var daten = Testbenutzer.OhneRolle("sub-mail-zu-admin");
        Assert.Equal("keine", await RolleAusMeAsync(daten));

        Assert.Equal("keine", await RolleAusMeAsync(daten with { Email = Testbenutzer.AdminEmail, EmailVerifiziert = true }));
    }

    [Fact]
    public async Task Entfernen_aus_der_Liste_entzieht_die_Rolle_nicht()
    {
        Assert.Equal("Administrator", await RolleAusMeAsync(Testbenutzer.Admin));
        await using var ohneListe = Fixture.NeueFactory(new FactoryOptionen
        {
            Einstellungen = new Dictionary<string, string?> { ["Bootstrap:AdminEmails:0"] = null },
        });
        using var client = ohneListe.ClientMitToken(Idp.ErzeugeToken(Testbenutzer.Admin));

        using var antwort = await client.GetAsync(MeUrl);

        Assert.Equal("Administrator", (await JsonAsync(antwort)).GetProperty("rolle").GetString());
    }

    // ---------- AK-17: Kürzung ----------

    [Fact]
    public async Task Anzeigename_ueber_200_Zeichen_wird_auf_200_gekuerzt()
    {
        var name = new string('N', 250);

        using var antwort = await MeAsync(new TokenDaten { Subject = "sub-langer-name", Name = name });

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(name[..200], (await BenutzerDb.EinzigerAsync("sub-langer-name")).Anzeigename);
    }

    [Fact]
    public async Task Anzeigename_mit_genau_200_Zeichen_bleibt_unveraendert()
    {
        var name = new string('M', 200);

        using var _ = await MeAsync(new TokenDaten { Subject = "sub-200", Name = name });

        Assert.Equal(name, (await BenutzerDb.EinzigerAsync("sub-200")).Anzeigename);
    }

    [Fact]
    public async Task Email_ueber_320_Zeichen_wird_null_ohne_Fehler()
    {
        var email = new string('e', 330 - "@coin-test.invalid".Length) + "@coin-test.invalid";

        using var antwort = await MeAsync(new TokenDaten { Subject = "sub-lange-mail", Email = email });

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Null((await BenutzerDb.EinzigerAsync("sub-lange-mail")).Email);
    }

    [Fact]
    public async Task Email_mit_genau_320_Zeichen_bleibt_erhalten()
    {
        var email = new string('e', 320 - "@coin-test.invalid".Length) + "@coin-test.invalid";

        using var _ = await MeAsync(new TokenDaten { Subject = "sub-mail-320", Email = email });

        Assert.Equal(email, (await BenutzerDb.EinzigerAsync("sub-mail-320")).Email);
    }
}
