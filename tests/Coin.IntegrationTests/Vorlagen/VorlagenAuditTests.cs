using System.Net;
using Coin.IntegrationTests.Infrastruktur;
using Npgsql;
using static Coin.IntegrationTests.Infrastruktur.DocxBauer;

namespace Coin.IntegrationTests.Vorlagen;

/// <summary>
/// Feature zertifikatsvorlagen, AK-21 und Abschnitt 6 (ADR-0023 Punkt 1 bis 3 und 7): <c>vorlage_audit</c>,
/// Check-Constraints, Unveränderlichkeit per Trigger, Zeiger-FK und eindeutiger Index.
/// </summary>
public class VorlagenAuditTests(PostgresFixture fixture) : VorlagenTestBasis(fixture)
{
    private static string? SqlState(Exception? ex) => (ex as PostgresException)?.SqlState;

    // ---------- AK-21: Einträge je Art ----------

    [Fact]
    public async Task Erster_Upload_schreibt_Hochgeladen_mit_Version_1_ohne_vorherige()
    {
        var coinId = await CoinAsync();
        var konto = await KontoAsync("Sachbearbeiter");

        await LadeVorlageHochAsync(coinId, client: konto.Client);

        var eintrag = Assert.Single(await VorlageDb.AuditAsync());
        Assert.Equal(("Hochgeladen", (int?)1, (int?)null), (eintrag.Art, eintrag.Version, eintrag.VorherigeVersion));
        Assert.Equal((konto.Id, coinId), (eintrag.AkteurId, eintrag.CoinId));
    }

    [Fact]
    public async Task Zweiter_Upload_schreibt_Ersetzt_mit_vorheriger_Version()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);

        await LadeVorlageHochAsync(coinId);

        var eintrag = (await VorlageDb.AuditAsync())[^1];
        Assert.Equal(("Ersetzt", (int?)2, (int?)1), (eintrag.Art, eintrag.Version, eintrag.VorherigeVersion));
    }

    [Fact]
    public async Task Zuruecksetzen_schreibt_Zurueckgesetzt_ohne_Version_mit_vorheriger()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);
        await LadeVorlageHochAsync(coinId);
        var konto = await KontoAsync("Sachbearbeiter");

        using (var antwort = await PostZuruecksetzenAsync(konto.Client, coinId))
        {
            Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        }

        var eintrag = (await VorlageDb.AuditAsync())[^1];
        Assert.Equal(("Zurueckgesetzt", (int?)null, (int?)2), (eintrag.Art, eintrag.Version, eintrag.VorherigeVersion));
        Assert.Equal(konto.Id, eintrag.AkteurId);
    }

    [Fact]
    public async Task Upload_nach_dem_Zuruecksetzen_schreibt_Hochgeladen()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);
        using (await PostZuruecksetzenAsync(Client, coinId))
        {
        }

        await LadeVorlageHochAsync(coinId);

        var eintrag = (await VorlageDb.AuditAsync())[^1];
        Assert.Equal(("Hochgeladen", (int?)2, (int?)null), (eintrag.Art, eintrag.Version, eintrag.VorherigeVersion));
    }

    [Fact]
    public async Task Jede_wirksame_Aktion_schreibt_genau_einen_Eintrag()
    {
        var coinId = await CoinAsync();

        await LadeVorlageHochAsync(coinId);
        await LadeVorlageHochAsync(coinId);
        using (await PostZuruecksetzenAsync(Client, coinId))
        {
        }

        Assert.Equal(["Hochgeladen", "Ersetzt", "Zurueckgesetzt"], (await VorlageDb.AuditAsync()).Select(a => a.Art));
    }

    [Fact]
    public async Task Unwirksames_Zuruecksetzen_schreibt_keinen_Eintrag()
    {
        var coinId = await CoinAsync();

        using (var antwort = await PostZuruecksetzenAsync(Client, coinId))
        {
            Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        }

        Assert.Empty(await VorlageDb.AuditAsync());
    }

    [Fact]
    public async Task Zweites_Zuruecksetzen_schreibt_keinen_weiteren_Eintrag()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);
        using (await PostZuruecksetzenAsync(Client, coinId))
        {
        }

        using (await PostZuruecksetzenAsync(Client, coinId))
        {
        }

        Assert.Equal(1, (await VorlageDb.AuditAsync()).Count(a => a.Art == "Zurueckgesetzt"));
    }

    [Fact]
    public async Task Audit_Zeitpunkt_liegt_beim_Upload()
    {
        var coinId = await CoinAsync();
        var vorher = DateTimeOffset.UtcNow.AddMinutes(-1);

        await LadeVorlageHochAsync(coinId);

        Assert.InRange(Assert.Single(await VorlageDb.AuditAsync()).Zeitpunkt, vorher, DateTimeOffset.UtcNow.AddMinutes(1));
    }

    [Fact]
    public async Task Audit_enthaelt_weder_Dateinamen_noch_Dokumenttext()
    {
        var coinId = await CoinAsync();

        using (var antwort = await PostVersionAsync(coinId, Gueltig().Absaetze(Text("Auditprobe Qa78")).Bytes(), "datei-Qa77.docx"))
        {
            Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
        }

        var text = await VorlageDb.AuditAlsTextAsync();
        Assert.DoesNotContain("Qa77", text, StringComparison.Ordinal);
        Assert.DoesNotContain("Qa78", text, StringComparison.Ordinal);
        Assert.DoesNotContain("{{", text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Tabelle_vorlage_audit_hat_genau_die_Spalten_aus_dem_Entwurf()
    {
        Assert.Equal(
            ["akteur_id", "art", "coin_id", "id", "version", "vorherige_version", "zeitpunkt"],
            await VorlageDb.SpaltenAsync("vorlage_audit"));
    }

    [Fact]
    public async Task Vorlagen_Aktionen_erscheinen_nicht_im_Benutzer_Audit_Log()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);

        using var antwort = await Client.GetAsync(AuditUrl);
        var text = await antwort.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.DoesNotContain("Hochgeladen", text, StringComparison.Ordinal);
    }

    // ---------- AK-21: Check-Constraint ----------

    private async Task<(Guid CoinId, Guid AkteurId)> AuditKontextAsync()
    {
        var coinId = await CoinAsync();
        await LadeVorlageHochAsync(coinId);
        return (coinId, await AdminIdAsync());
    }

    private string AuditInsert(Guid coinId, Guid akteurId, string art, string version, string vorherige) =>
        $"""
        INSERT INTO vorlage_audit (id, zeitpunkt, akteur_id, coin_id, art, version, vorherige_version)
        VALUES (gen_random_uuid(), now(), '{akteurId}', '{coinId}', '{art}', {version}, {vorherige})
        """;

    [Theory]
    [InlineData("Hochgeladen", "1", "1")]
    [InlineData("Hochgeladen", "NULL", "NULL")]
    [InlineData("Ersetzt", "2", "NULL")]
    [InlineData("Ersetzt", "NULL", "1")]
    [InlineData("Zurueckgesetzt", "1", "1")]
    [InlineData("Zurueckgesetzt", "NULL", "NULL")]
    [InlineData("Geloescht", "1", "NULL")]
    public async Task Check_Constraint_verbietet_ungueltige_Kombinationen(string art, string version, string vorherige)
    {
        var (coinId, akteurId) = await AuditKontextAsync();

        var fehler = await VorlageDb.RohAusfuehrenAsync(AuditInsert(coinId, akteurId, art, version, vorherige));

        Assert.Equal(PostgresErrorCodes.CheckViolation, SqlState(fehler));
    }

    [Theory]
    [InlineData("Hochgeladen", "1", "NULL")]
    [InlineData("Ersetzt", "2", "1")]
    [InlineData("Zurueckgesetzt", "NULL", "2")]
    public async Task Check_Constraint_erlaubt_die_gueltigen_Kombinationen(string art, string version, string vorherige)
    {
        var (coinId, akteurId) = await AuditKontextAsync();

        Assert.Null(await VorlageDb.RohAusfuehrenAsync(AuditInsert(coinId, akteurId, art, version, vorherige)));
    }

    // ---------- AK-21: unveränderlich per Trigger ----------

    [Theory]
    [InlineData("UPDATE vorlage_audit SET art = 'Ersetzt', vorherige_version = 1")]
    [InlineData("UPDATE vorlage_audit SET zeitpunkt = now() - interval '1 day'")]
    [InlineData("DELETE FROM vorlage_audit")]
    public async Task Audit_Eintraege_lassen_sich_per_SQL_nicht_aendern_oder_loeschen(string sql)
    {
        await AuditKontextAsync();
        var vorher = await VorlageDb.AuditAlsTextAsync();

        var fehler = await VorlageDb.RohAusfuehrenAsync(sql);

        Assert.IsType<PostgresException>(fehler);
        Assert.Equal(vorher, await VorlageDb.AuditAlsTextAsync());
    }

    [Theory]
    [InlineData("UPDATE zertifikat_vorlage SET inhalt = '\\x00'::bytea")]
    [InlineData("UPDATE zertifikat_vorlage SET version = 7")]
    [InlineData("UPDATE zertifikat_vorlage SET hochgeladen_am = now() - interval '1 day'")]
    [InlineData("DELETE FROM zertifikat_vorlage")]
    public async Task Versionen_lassen_sich_per_SQL_nicht_aendern_oder_loeschen(string sql)
    {
        var (coinId, _) = await AuditKontextAsync();
        using (await PostZuruecksetzenAsync(Client, coinId))
        {
        }

        var vorher = Assert.Single(await VorlageDb.VersionenAsync(coinId));

        var fehler = await VorlageDb.RohAusfuehrenAsync(sql);

        Assert.IsType<PostgresException>(fehler);
        var nachher = Assert.Single(await VorlageDb.VersionenAsync(coinId));
        Assert.Equal((vorher.Version, vorher.Sha256, vorher.HochgeladenAm), (nachher.Version, nachher.Sha256, nachher.HochgeladenAm));
        Assert.Equal(vorher.Inhalt, nachher.Inhalt);
    }

    // ---------- Abschnitt 6: Index, Checks, Zeiger ----------

    [Fact]
    public async Task Eindeutiger_Index_verhindert_doppelte_Versionsnummer_je_Coin()
    {
        await AuditKontextAsync();

        var fehler = await VorlageDb.RohAusfuehrenAsync(
            """
            INSERT INTO zertifikat_vorlage (id, coin_id, version, inhalt, groesse_bytes, sha256, hochgeladen_am, hochgeladen_von)
            SELECT gen_random_uuid(), coin_id, version, inhalt, groesse_bytes, sha256, hochgeladen_am, hochgeladen_von
            FROM zertifikat_vorlage LIMIT 1
            """);

        Assert.Equal(PostgresErrorCodes.UniqueViolation, SqlState(fehler));
    }

    [Theory]
    [InlineData("0", "100")]
    [InlineData("2", "0")]
    [InlineData("2", "5242881")]
    public async Task Check_Constraints_fuer_Version_und_Groesse(string version, string groesse)
    {
        await AuditKontextAsync();

        var fehler = await VorlageDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO zertifikat_vorlage (id, coin_id, version, inhalt, groesse_bytes, sha256, hochgeladen_am, hochgeladen_von)
            SELECT gen_random_uuid(), coin_id, {version}, inhalt, {groesse}, sha256, hochgeladen_am, hochgeladen_von
            FROM zertifikat_vorlage LIMIT 1
            """);

        Assert.Equal(PostgresErrorCodes.CheckViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Zeiger_kann_nicht_auf_eine_Version_eines_anderen_Coins_zeigen()
    {
        await AuditKontextAsync();
        var andererCoin = await CoinAsync();

        var fehler = await VorlageDb.RohAusfuehrenAsync($"UPDATE coin_typ SET aktive_vorlage_version = 1 WHERE id = '{andererCoin}'");

        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Zeiger_steht_nach_dem_Upload_auf_der_neuen_Version()
    {
        var (coinId, _) = await AuditKontextAsync();

        Assert.Equal(1, await VorlageDb.AktiveVersionAsync(coinId));
    }

    [Fact]
    public async Task Coin_mit_Versionen_laesst_sich_nicht_loeschen()
    {
        var (coinId, _) = await AuditKontextAsync();

        var fehler = await VorlageDb.RohAusfuehrenAsync($"DELETE FROM coin_typ WHERE id = '{coinId}'");

        Assert.IsType<PostgresException>(fehler);
    }
}
