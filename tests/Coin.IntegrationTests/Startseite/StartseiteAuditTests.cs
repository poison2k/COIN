using System.Net;
using Coin.IntegrationTests.Infrastruktur;
using Coin.Testdaten;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-18 und Abschnitt 4.3 (ADR-0030 Punkt 7): Jede gespeicherte Änderung schreibt in derselben
/// Transaktion je Änderung eine Zeile in <c>startseite_audit</c> mit Version, Akteur, Zeitpunkt und Art. Texte nur als
/// „geändert“, Logos mit SHA-256. <c>UPDATE</c>/<c>DELETE</c> scheitern am Trigger; abgelehnte Requests schreiben nichts;
/// es gibt keinen Lese-Endpunkt.
/// </summary>
public class StartseiteAuditTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    private const string Standardfolge = "kopf,infotext,kennzahlen,neueste,meistausgegeben";

    [Fact]
    public async Task Beispiel_aus_AK_18_schreibt_genau_vier_Zeilen()
    {
        var logo = LogoBilder.Png(10, 10);
        var k = Mit(StandardKonfiguration(), k =>
        {
            k["kennzahlen"]!["aktiv"] = false;
            Reihenfolge(k, "kopf", "kennzahlen", "infotext", "neueste", "meistausgegeben");
            k["infotext"]!["text"] = "Neuer Infotext";
            Kopf(k)["logoBereitsteller"] = new System.Text.Json.Nodes.JsonObject { ["alternativtext"] = "Wappen" };
        });

        await SpeichernAsync(k, new LogoTeil("logoBereitsteller", logo));

        // AK-18 legt keine Reihenfolge innerhalb eines Vorgangs fest (gleicher Zeitpunkt, kein Lese-Endpunkt):
        // Vergleich daher nach Art sortiert, aber vollständig (genau diese vier Zeilen, keine weiteren).
        var audit = await StartseiteDb.AuditAsync();
        Assert.Equal(
            [
                ("BlockAusgeschaltet", "kennzahlen", null, null),
                ("InfotextGeaendert", null, null, null),
                ("LogoHochgeladen", "bereitsteller", null, Sha256(logo)),
                ("ReihenfolgeGeaendert", null, Standardfolge, "kopf,kennzahlen,infotext,neueste,meistausgegeben"),
            ],
            audit.Select(a => (a.Art, a.Ziel, a.Alt, a.Neu)).OrderBy(z => z.Art, StringComparer.Ordinal));
    }

    [Fact]
    public async Task Alle_Zeilen_eines_Vorgangs_tragen_dessen_Version_und_den_Akteur()
    {
        var adminId = await AdminIdAsync();
        await SpeichernAsync(Mit(StandardKonfiguration(), k =>
        {
            k["kennzahlen"]!["aktiv"] = false;
            k["neueste"]!["anzahl"] = 8;
        }));

        var audit = await StartseiteDb.AuditAsync();

        Assert.Equal(2, audit.Count);
        Assert.All(audit, a => Assert.Equal((1, adminId), (a.Version, a.AkteurId)));
    }

    [Fact]
    public async Task Zeitpunkt_ist_der_Zeitpunkt_des_Speicherns()
    {
        var vorher = DateTimeOffset.UtcNow.AddMinutes(-1);

        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));

        var zeile = Assert.Single(await StartseiteDb.AuditAsync());
        Assert.InRange(zeile.Zeitpunkt, vorher, DateTimeOffset.UtcNow.AddMinutes(1));
    }

    [Fact]
    public async Task Zweiter_Vorgang_schreibt_Zeilen_mit_Version_2()
    {
        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));

        await SpeichernAsync(Mit(StandardKonfiguration(1), k =>
        {
            k["kennzahlen"]!["aktiv"] = false;
            k["meistausgegeben"]!["anzahl"] = 10;
        }));

        var audit = (await StartseiteDb.AuditAsync()).OrderBy(a => a.Version).ToList();
        Assert.Equal([(1, "BlockAusgeschaltet"), (2, "AnzahlGeaendert")], audit.Select(a => (a.Version, a.Art)));
        Assert.Equal(("meistausgegeben", "5", "10"), (audit[1].Ziel, audit[1].Alt, audit[1].Neu));
    }

    [Fact]
    public async Task Ersetzen_Entfernen_und_Alternativtext_aendern_werden_protokolliert()
    {
        var alt = LogoBilder.Png(10, 10);
        var neu = LogoBilder.Png(20, 20);
        await LogoHochladenAsync("software", alt, "Software alt");
        await SpeichernAsync(MitKopf(1, alttextSoftware: "Software alt"), new LogoTeil("logoSoftware", neu));
        await SpeichernAsync(MitKopf(2, alttextSoftware: "Software neu"));
        await SpeichernAsync(MitKopf(3));

        var audit = (await StartseiteDb.AuditAsync()).Where(a => a.Art.StartsWith("Logo", StringComparison.Ordinal) || a.Art == "AlternativtextGeaendert");

        Assert.Equal(
            [
                (1, "LogoHochgeladen", "software", (string?)null, Sha256(alt)),
                (2, "LogoErsetzt", "software", Sha256(alt), Sha256(neu)),
                (3, "AlternativtextGeaendert", "software", null, null),
                (4, "LogoEntfernt", "software", Sha256(neu), null),
            ],
            audit.Select(a => (a.Version, a.Art, a.Ziel, a.Alt, a.Neu)).OrderBy(z => z.Version));
    }

    [Fact]
    public async Task Gleiches_Logo_erneut_hochgeladen_gilt_als_unveraendert()
    {
        var logo = LogoBilder.Png(10, 10);
        await LogoHochladenAsync("bereitsteller", logo);
        var vorher = (await StartseiteDb.AuditAsync()).Count;

        var antwort = await SpeichernAsync(MitKopf(1, alttextBereitsteller: "Wappen Test"), new LogoTeil("logoBereitsteller", logo));

        Assert.Equal(vorher, (await StartseiteDb.AuditAsync()).Count);
        Assert.Equal(1, antwort.GetProperty("version").GetInt32());
    }

    [Fact]
    public async Task Audit_enthaelt_keine_Titel_Untertitel_Infotext_oder_Alternativtext_Inhalte()
    {
        var logo = LogoBilder.Png(10, 10);
        var k = Mit(MitKopf(titel: "Titel-Audit-3307", untertitel: "Untertitel-Audit-3307", alttextBereitsteller: "Alttext-Audit-3307"), k =>
            k["infotext"]!["text"] = "Infotext-Audit-3307");
        await SpeichernAsync(k, new LogoTeil("logoBereitsteller", logo, "dateiname-audit-3307.png"));
        await SpeichernAsync(Mit(k, k =>
        {
            k["version"] = 1;
            Kopf(k)["titel"] = "Titel2-Audit-3307";
            Kopf(k)["logoBereitsteller"] = new System.Text.Json.Nodes.JsonObject { ["alternativtext"] = "Alttext2-Audit-3307" };
        }));

        var text = await StartseiteDb.AuditAlsTextAsync();

        Assert.NotEmpty(text);
        Assert.DoesNotContain("Audit-3307", text);
        Assert.DoesNotContain("audit-3307", text);
    }

    [Fact]
    public async Task Abgelehnter_Request_schreibt_kein_Audit()
    {
        using var antwort = await PutKonfigurationAsync(
            Mit(MitKopf(alttextBereitsteller: "Wappen"), k => k["kennzahlen"]!["aktiv"] = false),
            new LogoTeil("logoBereitsteller", LogoBilder.Svg()));

        Assert.Equal(HttpStatusCode.BadRequest, antwort.StatusCode);
        Assert.Empty(await StartseiteDb.AuditAsync());
    }

    [Fact]
    public async Task Update_auf_startseite_audit_scheitert_am_Trigger()
    {
        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));

        var fehler = await StartseiteDb.RohAusfuehrenAsync("UPDATE startseite_audit SET art = 'BlockEingeschaltet'");

        Assert.Equal(Npgsql.PostgresErrorCodes.RaiseException, Assert.IsType<Npgsql.PostgresException>(fehler).SqlState);
        Assert.Equal("BlockAusgeschaltet", Assert.Single(await StartseiteDb.AuditAsync()).Art);
    }

    [Fact]
    public async Task Delete_auf_startseite_audit_scheitert_am_Trigger()
    {
        await SpeichernAsync(Mit(StandardKonfiguration(), k => k["kennzahlen"]!["aktiv"] = false));

        var fehler = await StartseiteDb.RohAusfuehrenAsync("DELETE FROM startseite_audit");

        Assert.Equal(Npgsql.PostgresErrorCodes.RaiseException, Assert.IsType<Npgsql.PostgresException>(fehler).SqlState);
        Assert.Single(await StartseiteDb.AuditAsync());
    }

    [Fact]
    public async Task Trigger_trg_startseite_audit_unveraenderlich_existiert()
    {
        Assert.True(await StartseiteDb.TriggerExistiertAsync("trg_startseite_audit_unveraenderlich"));
    }

    [Fact]
    public async Task Check_Constraint_lehnt_eine_unbekannte_Art_ab()
    {
        var adminId = await AdminIdAsync();

        var fehler = await StartseiteDb.RohAusfuehrenAsync(
            $"INSERT INTO startseite_audit (id, zeitpunkt, akteur_id, version, art) VALUES (gen_random_uuid(), now(), '{adminId}', 1, 'Unbekannt')");

        Assert.Equal(Npgsql.PostgresErrorCodes.CheckViolation, Assert.IsType<Npgsql.PostgresException>(fehler).SqlState);
    }

    [Fact]
    public async Task Check_Constraint_lehnt_Inhalt_bei_TitelGeaendert_ab()
    {
        var adminId = await AdminIdAsync();

        var fehler = await StartseiteDb.RohAusfuehrenAsync(
            $"INSERT INTO startseite_audit (id, zeitpunkt, akteur_id, version, art, neu) VALUES (gen_random_uuid(), now(), '{adminId}', 1, 'TitelGeaendert', 'Inhalt')");

        Assert.Equal(Npgsql.PostgresErrorCodes.CheckViolation, Assert.IsType<Npgsql.PostgresException>(fehler).SqlState);
    }

    [Fact]
    public async Task Audit_schlaegt_fehl_dann_wird_nichts_gespeichert()
    {
        // Transaktion (ADR-0030 Punkt 4): Scheitert das Audit, bleiben Konfiguration und Logos unverändert.
        Assert.Null(await StartseiteDb.RohAusfuehrenAsync(
            """
            CREATE OR REPLACE FUNCTION test_startseite_audit_scheitert() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'Testfehler Audit'; END $$;
            CREATE TRIGGER test_startseite_audit_scheitert BEFORE INSERT ON startseite_audit
              FOR EACH ROW EXECUTE FUNCTION test_startseite_audit_scheitert();
            """));
        try
        {
            using var antwort = await PutKonfigurationAsync(
                Mit(MitKopf(alttextBereitsteller: "Wappen"), k => k["kennzahlen"]!["aktiv"] = false),
                new LogoTeil("logoBereitsteller", LogoBilder.Png(10, 10)));

            Assert.Equal(HttpStatusCode.InternalServerError, antwort.StatusCode);
            Assert.Equal(0, await StartseiteDb.AnzahlKonfigurationenAsync());
            Assert.Empty(await StartseiteDb.LogosAsync());
        }
        finally
        {
            await StartseiteDb.RohAusfuehrenAsync(
                "DROP TRIGGER IF EXISTS test_startseite_audit_scheitert ON startseite_audit; DROP FUNCTION IF EXISTS test_startseite_audit_scheitert();");
        }
    }

    [Fact]
    public async Task Es_gibt_keinen_Lese_Endpunkt_fuer_das_Audit_der_Startseite()
    {
        foreach (var url in new[] { "/api/startseite/audit", "/api/startseite/konfiguration/audit" })
        {
            using var antwort = await Client.GetAsync(url);
            Assert.True(antwort.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed, $"{url}: {(int)antwort.StatusCode}");
        }
    }
}
