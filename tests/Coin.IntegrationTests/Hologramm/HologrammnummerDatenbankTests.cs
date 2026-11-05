using System.Net;
using Coin.IntegrationTests.Infrastruktur;
using Npgsql;

namespace Coin.IntegrationTests.Hologramm;

/// <summary>
/// Feature hologrammnummer, AK-2 und AK-3 (ADR-0033 Punkt 1 und 2), Abschnitt 4.2 und 6: Tabelle
/// <c>ausgabe_hologramm</c> direkt per SQL – generierte Spalte <c>nummer_normalisiert</c>, Checks, die partiellen
/// Indizes <c>ux_ausgabe_hologramm_aktuell</c> und <c>ux_ausgabe_hologramm_nummer</c> (nur nicht abgelöste Zeilen) und
/// der Trigger <c>trg_ausgabe_hologramm_nur_abloesen</c>; dazu die Trigger und Checks der beiden Audit-Tabellen.
/// Die Testvektoren werden einmal direkt in die Tabelle und einmal über die API gespeichert, damit Domain und
/// Datenbank zur selben Normalform kommen.
/// </summary>
public class HologrammnummerDatenbankTests(PostgresFixture fixture) : HologrammTestBasis(fixture)
{
    private sealed record Kontext(Guid AdminId, Guid CoinA, Guid AusgabeA, Guid CoinB, Guid AusgabeB);

    /// <summary>Zwei Coins mit je einer aktiven Ausgabe ohne Hologrammnummer.</summary>
    private async Task<Kontext> VorbereitenAsync()
    {
        var adminId = await AdminIdAsync();
        var coinA = await CoinMitAuflageAsync(10);
        var coinB = await CoinMitAuflageAsync(10);
        var a = (await ErfasseAsync(coinA)).GetProperty("id").GetGuid();
        var b = (await ErfasseAsync(coinB)).GetProperty("id").GetGuid();
        return new Kontext(adminId, coinA, a, coinB, b);
    }

    private static string SqlState(Exception? fehler) => Assert.IsType<PostgresException>(fehler).SqlState;

    /// <summary>Abgelehnt durch Trigger oder Constraint, nicht wegen einer fehlenden Spalte oder Tabelle.</summary>
    private static void AssertAbgelehnt(Exception? fehler)
    {
        var postgres = Assert.IsType<PostgresException>(fehler);
        Assert.NotEqual(PostgresErrorCodes.UndefinedColumn, postgres.SqlState);
        Assert.NotEqual(PostgresErrorCodes.UndefinedTable, postgres.SqlState);
    }

    // ---------- AK-2: Tabelle und Spalten ----------

    [Fact]
    public async Task Tabelle_ausgabe_hologramm_hat_die_Spalten_aus_Abschnitt_6()
    {
        Assert.Equal(
            ["abgeloest_am", "ausgabe_id", "gesetzt_am", "gesetzt_von", "id", "nummer", "nummer_normalisiert"],
            await HologrammDb.SpaltenAsync("ausgabe_hologramm"));
    }

    [Fact]
    public async Task Tabelle_ausgabe_hat_keine_Spalte_fuer_die_Hologrammnummer()
    {
        Assert.DoesNotContain(await AusgabeDb.SpaltenAsync("ausgabe"), s => s.Contains("hologramm", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Spalte_nummer_normalisiert_ist_generiert()
    {
        var art = await HologrammDb.WertAsync(
            "SELECT is_generated FROM information_schema.columns WHERE table_name = 'ausgabe_hologramm' AND column_name = 'nummer_normalisiert'");

        Assert.Equal("ALWAYS", art);
    }

    [Theory]
    [InlineData("ux_ausgabe_hologramm_aktuell")]
    [InlineData("ux_ausgabe_hologramm_nummer")]
    [InlineData("ix_ausgabe_hologramm_ausgabe")]
    public async Task Index_ist_vorhanden(string index)
    {
        Assert.Equal(1L, await HologrammDb.WertAsync($"SELECT count(*) FROM pg_indexes WHERE tablename = 'ausgabe_hologramm' AND indexname = '{index}'"));
    }

    [Theory]
    [InlineData("ux_ausgabe_hologramm_aktuell")]
    [InlineData("ux_ausgabe_hologramm_nummer")]
    public async Task Eindeutige_Indizes_gelten_nur_fuer_nicht_abgeloeste_Zeilen(string index)
    {
        var definition = (string?)await HologrammDb.WertAsync($"SELECT indexdef FROM pg_indexes WHERE indexname = '{index}'");

        Assert.NotNull(definition);
        Assert.Contains("UNIQUE", definition, StringComparison.Ordinal);
        Assert.Contains("WHERE (abgeloest_am IS NULL)", definition, StringComparison.Ordinal);
    }

    // ---------- AK-2: Eindeutigkeit ----------

    [Fact]
    public async Task Gleiche_Normalform_in_anderer_Schreibweise_bei_einem_anderen_Coin_verletzt_den_Index()
    {
        var k = await VorbereitenAsync();
        await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId);

        var fehler = await HologrammDb.VersucheEinfuegenAsync(k.AusgabeB, "AB 12-34", k.AdminId);

        Assert.Equal(PostgresErrorCodes.UniqueViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Verletzung_betrifft_den_Index_ux_ausgabe_hologramm_nummer()
    {
        var k = await VorbereitenAsync();
        await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId);

        var fehler = Assert.IsType<PostgresException>(await HologrammDb.VersucheEinfuegenAsync(k.AusgabeB, "AB 12-34", k.AdminId));

        Assert.Equal("ux_ausgabe_hologramm_nummer", fehler.ConstraintName);
    }

    [Fact]
    public async Task Abgeloeste_Zeile_sperrt_ihre_Nummer_nicht()
    {
        var k = await VorbereitenAsync();
        await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId, abgeloest: true);

        Assert.Null(await HologrammDb.VersucheEinfuegenAsync(k.AusgabeB, "AB1234", k.AdminId));
    }

    [Fact]
    public async Task Zweite_nicht_abgeloeste_Zeile_derselben_Ausgabe_verletzt_den_Index()
    {
        var k = await VorbereitenAsync();
        await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId);

        var fehler = Assert.IsType<PostgresException>(await HologrammDb.VersucheEinfuegenAsync(k.AusgabeA, "CD5678", k.AdminId));

        Assert.Equal((PostgresErrorCodes.UniqueViolation, "ux_ausgabe_hologramm_aktuell"), (fehler.SqlState, fehler.ConstraintName));
    }

    [Fact]
    public async Task Nach_dem_Abloesen_darf_dieselbe_Ausgabe_eine_neue_Zeile_erhalten()
    {
        var k = await VorbereitenAsync();
        var alt = await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1243", k.AdminId);
        Assert.Null(await HologrammDb.RohAusfuehrenAsync($"UPDATE ausgabe_hologramm SET abgeloest_am = now() WHERE id = '{alt}'"));

        Assert.Null(await HologrammDb.VersucheEinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId));
    }

    [Fact]
    public async Task Ausgabe_muss_existieren()
    {
        var k = await VorbereitenAsync();

        var fehler = await HologrammDb.VersucheEinfuegenAsync(Guid.NewGuid(), "AB1234", k.AdminId);

        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Gesetzt_von_muss_ein_Benutzer_sein()
    {
        var k = await VorbereitenAsync();

        var fehler = await HologrammDb.VersucheEinfuegenAsync(k.AusgabeA, "AB1234", Guid.NewGuid());

        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Fremdschluessel_auf_ausgabe_ist_RESTRICT()
    {
        var k = await VorbereitenAsync();
        await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId);

        // Der Trigger auf ausgabe verhindert DELETE ohnehin; der Fremdschlüssel ist RESTRICT (Abschnitt 6).
        var regel = await HologrammDb.WertAsync(
            """
            SELECT rc.delete_rule FROM information_schema.referential_constraints rc
            JOIN information_schema.key_column_usage k ON k.constraint_name = rc.constraint_name
            WHERE k.table_name = 'ausgabe_hologramm' AND k.column_name = 'ausgabe_id'
            """);
        Assert.Equal("RESTRICT", regel);
    }

    // ---------- AK-2: Checks ----------

    [Theory]
    [InlineData("ab12")]
    [InlineData("AB/1")]
    [InlineData(" AB")]
    [InlineData("AB ")]
    [InlineData("A  B")]
    [InlineData("")]
    [InlineData("AB_1")]
    [InlineData("Ä1")]
    public async Task Ungueltige_Anzeigeform_verletzt_den_Check(string nummer)
    {
        var k = await VorbereitenAsync();

        var fehler = await HologrammDb.VersucheEinfuegenAsync(k.AusgabeA, nummer, k.AdminId);

        Assert.Equal(PostgresErrorCodes.CheckViolation, SqlState(fehler));
    }

    [Theory]
    [InlineData("- -")]
    [InlineData("--")]
    public async Task Anzeigeform_nur_aus_Trennzeichen_verletzt_den_Check_der_Normalform(string nummer)
    {
        var k = await VorbereitenAsync();

        var fehler = await HologrammDb.VersucheEinfuegenAsync(k.AusgabeA, nummer, k.AdminId);

        Assert.Equal(PostgresErrorCodes.CheckViolation, SqlState(fehler));
    }

    [Fact]
    public async Task Anzeigeform_mit_41_Zeichen_wird_abgelehnt()
    {
        var k = await VorbereitenAsync();

        AssertAbgelehnt(await HologrammDb.VersucheEinfuegenAsync(k.AusgabeA, new string('A', 41), k.AdminId));
    }

    [Fact]
    public async Task Normalform_laesst_sich_nicht_direkt_setzen()
    {
        var k = await VorbereitenAsync();

        var fehler = await HologrammDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO ausgabe_hologramm (id, ausgabe_id, nummer, nummer_normalisiert, gesetzt_am, gesetzt_von)
            VALUES (gen_random_uuid(), '{k.AusgabeA}', 'AB1234', 'XY9999', now(), '{k.AdminId}')
            """);

        AssertAbgelehnt(fehler);
    }

    [Fact]
    public async Task Normalform_laesst_sich_nicht_per_UPDATE_setzen()
    {
        var k = await VorbereitenAsync();
        var id = await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId);

        AssertAbgelehnt(await HologrammDb.RohAusfuehrenAsync($"UPDATE ausgabe_hologramm SET nummer_normalisiert = 'XY9999' WHERE id = '{id}'"));
    }

    // ---------- Abschnitt 4.2: Vektoren gegen die generierte Spalte ----------

    public static TheoryData<string, string> AnzeigeUndNormalform => new()
    {
        { "AB 12-34", "AB1234" },
        { "AB1234", "AB1234" },
        { "AB- 12 34", "AB1234" },
        { "AB 12 34", "AB1234" },
        { "AB-12", "AB12" },
        { new string('A', 40), new string('A', 40) },
        { string.Concat(Enumerable.Repeat("A-", 20)), new string('A', 20) },
    };

    [Theory]
    [MemberData(nameof(AnzeigeUndNormalform))]
    public async Task Datenbank_leitet_aus_der_Anzeigeform_die_Normalform_ab(string anzeige, string normalform)
    {
        var k = await VorbereitenAsync();

        await HologrammDb.EinfuegenAsync(k.AusgabeA, anzeige, k.AdminId);

        Assert.Equal(normalform, Assert.Single(await HologrammDb.ZeilenAsync(k.AusgabeA)).NummerNormalisiert);
    }

    public static TheoryData<string, string, string> GueltigeVektoren => new()
    {
        { "ab 12-34", "AB 12-34", "AB1234" },
        { "AB1234", "AB1234", "AB1234" },
        { "  AB– 12  34 ", "AB- 12 34", "AB1234" },
        { "ＡＢ１２３４", "AB1234", "AB1234" },
        { "AB​12­34", "AB1234", "AB1234" },
        { "ab\t12\n34", "AB 12 34", "AB1234" },
        { "AB−12", "AB-12", "AB12" },
        { new string('A', 40), new string('A', 40), new string('A', 40) },
        { string.Concat(Enumerable.Repeat("A-", 20)), string.Concat(Enumerable.Repeat("A-", 20)), new string('A', 20) },
    };

    [Theory]
    [MemberData(nameof(GueltigeVektoren))]
    public async Task Vektor_ueber_die_API_ergibt_in_der_Datenbank_Anzeigeform_und_Normalform(string eingabe, string anzeige, string normalform)
    {
        var coinId = await CoinMitAuflageAsync(5);

        var ausgabe = await ErfasseMitNummerAsync(coinId, eingabe);

        var zeile = Assert.Single(await HologrammDb.ZeilenAsync(ausgabe.AusgabeId));
        Assert.Equal((anzeige, normalform), (zeile.Nummer, zeile.NummerNormalisiert));
    }

    // ---------- AK-3: Trigger trg_ausgabe_hologramm_nur_abloesen ----------

    [Fact]
    public async Task Trigger_ist_vorhanden()
    {
        Assert.Equal(1L, await HologrammDb.WertAsync(
            "SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_ausgabe_hologramm_nur_abloesen' AND tgrelid = 'ausgabe_hologramm'::regclass"));
    }

    [Fact]
    public async Task Delete_wird_abgelehnt()
    {
        var k = await VorbereitenAsync();
        var id = await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId);

        AssertAbgelehnt(await HologrammDb.RohAusfuehrenAsync($"DELETE FROM ausgabe_hologramm WHERE id = '{id}'"));
        Assert.Single(await HologrammDb.ZeilenAsync(k.AusgabeA));
    }

    public static TheoryData<string> GeschuetzteAenderungen => new()
    {
        "nummer = 'CD5678'",
        "ausgabe_id = '{B}'",
        "gesetzt_am = now() - interval '1 day'",
        "gesetzt_von = '{U}'",
    };

    [Theory]
    [MemberData(nameof(GeschuetzteAenderungen))]
    public async Task Update_einer_geschuetzten_Spalte_wird_abgelehnt(string zuweisung)
    {
        var k = await VorbereitenAsync();
        var zweiter = await KontoAsync("Administrator");
        var id = await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId);
        var sql = zuweisung.Replace("{B}", k.AusgabeB.ToString(), StringComparison.Ordinal).Replace("{U}", zweiter.Id.ToString(), StringComparison.Ordinal);

        AssertAbgelehnt(await HologrammDb.RohAusfuehrenAsync($"UPDATE ausgabe_hologramm SET {sql} WHERE id = '{id}'"));
    }

    [Fact]
    public async Task Abloesen_von_NULL_auf_einen_Zeitpunkt_gelingt()
    {
        var k = await VorbereitenAsync();
        var id = await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId);

        Assert.Null(await HologrammDb.RohAusfuehrenAsync($"UPDATE ausgabe_hologramm SET abgeloest_am = now() WHERE id = '{id}'"));
        Assert.NotNull(Assert.Single(await HologrammDb.ZeilenAsync(k.AusgabeA)).AbgeloestAm);
    }

    [Fact]
    public async Task Zweites_Abloesen_wird_abgelehnt()
    {
        var k = await VorbereitenAsync();
        var id = await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId, abgeloest: true);

        AssertAbgelehnt(await HologrammDb.RohAusfuehrenAsync($"UPDATE ausgabe_hologramm SET abgeloest_am = now() + interval '1 hour' WHERE id = '{id}'"));
    }

    [Fact]
    public async Task Zuruecksetzen_des_Abloesens_wird_abgelehnt()
    {
        var k = await VorbereitenAsync();
        var id = await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId, abgeloest: true);

        AssertAbgelehnt(await HologrammDb.RohAusfuehrenAsync($"UPDATE ausgabe_hologramm SET abgeloest_am = NULL WHERE id = '{id}'"));
    }

    [Fact]
    public async Task Abloesen_zusammen_mit_einer_anderen_Spalte_wird_abgelehnt()
    {
        var k = await VorbereitenAsync();
        var id = await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId);

        AssertAbgelehnt(await HologrammDb.RohAusfuehrenAsync($"UPDATE ausgabe_hologramm SET abgeloest_am = now(), nummer = 'CD5678' WHERE id = '{id}'"));
    }

    [Fact]
    public async Task Abgeloeste_Zeile_bleibt_als_Historie_stehen()
    {
        var k = await VorbereitenAsync();
        await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1243", k.AdminId, abgeloest: true);
        await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId);

        Assert.Equal(["AB1243", "AB1234"], (await HologrammDb.ZeilenAsync(k.AusgabeA)).Select(z => z.Nummer));
    }

    [Fact]
    public async Task Storno_der_Ausgabe_aendert_ihre_Hologrammzeile_nicht()
    {
        var k = await VorbereitenAsync();
        await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId);
        var vorher = Assert.Single(await HologrammDb.ZeilenAsync(k.AusgabeA));

        await StornierenAsync(k.CoinA, k.AusgabeA);

        Assert.Equal(vorher, Assert.Single(await HologrammDb.ZeilenAsync(k.AusgabeA)));
    }

    [Fact]
    public async Task Trigger_auf_ausgabe_erlaubt_weiterhin_nur_das_Storno()
    {
        var k = await VorbereitenAsync();

        AssertAbgelehnt(await AusgabeDb.RohAusfuehrenAsync($"UPDATE ausgabe SET empfaenger_name = 'Test Geaendert' WHERE id = '{k.AusgabeA}'"));
    }

    // ---------- AK-15, AK-20: Audit-Tabellen ----------

    [Theory]
    [InlineData("hologramm_audit", "trg_hologramm_audit_unveraenderlich")]
    [InlineData("pruefung_audit", "trg_pruefung_audit_unveraenderlich")]
    public async Task Audit_Tabelle_hat_ihren_Trigger(string tabelle, string trigger)
    {
        Assert.Equal(1L, await HologrammDb.WertAsync(
            $"SELECT count(*) FROM pg_trigger WHERE tgname = '{trigger}' AND tgrelid = '{tabelle}'::regclass"));
    }

    [Fact]
    public async Task Tabelle_hologramm_audit_hat_die_Spalten_aus_Abschnitt_6()
    {
        Assert.Equal(
            ["akteur_id", "art", "ausgabe_id", "coin_id", "grund", "id", "nummer_alt", "nummer_neu", "zeitpunkt"],
            await HologrammDb.SpaltenAsync("hologramm_audit"));
    }

    [Fact]
    public async Task Tabelle_pruefung_audit_hat_die_Spalten_aus_Abschnitt_6()
    {
        Assert.Equal(
            ["akteur_id", "ausgabe_id", "coin_id_gewaehlt", "ergebnis", "id", "mit_empfaenger", "nummer", "zeitpunkt"],
            await HologrammDb.SpaltenAsync("pruefung_audit"));
    }

    private async Task<Guid> HologrammAuditEinfuegenAsync(Kontext k, string art = "Gesetzt", string? alt = null, string? grund = null)
    {
        var id = Guid.CreateVersion7();
        var fehler = await HologrammDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO hologramm_audit (id, zeitpunkt, akteur_id, ausgabe_id, coin_id, art, nummer_alt, nummer_neu, grund)
            VALUES ('{id}', now(), '{k.AdminId}', '{k.AusgabeA}', '{k.CoinA}', '{art}', {Sql(alt)}, 'AB1234', {Sql(grund)})
            """);
        if (fehler is not null)
        {
            throw fehler;
        }

        return id;
    }

    private async Task<Guid> PruefAuditEinfuegenAsync(Kontext k, string ergebnis = "Gueltig", bool mitAusgabe = true)
    {
        var id = Guid.CreateVersion7();
        var fehler = await HologrammDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO pruefung_audit (id, zeitpunkt, akteur_id, nummer, coin_id_gewaehlt, ergebnis, ausgabe_id, mit_empfaenger)
            VALUES ('{id}', now(), '{k.AdminId}', 'AB1234', NULL, '{ergebnis}', {(mitAusgabe ? $"'{k.AusgabeA}'" : "NULL")}, false)
            """);
        if (fehler is not null)
        {
            throw fehler;
        }

        return id;
    }

    private static string Sql(string? wert) => wert is null ? "NULL" : $"'{wert}'";

    [Theory]
    [InlineData("UPDATE hologramm_audit SET grund = 'Test' WHERE id = '{id}'")]
    [InlineData("DELETE FROM hologramm_audit WHERE id = '{id}'")]
    public async Task Hologramm_Audit_ist_unveraenderlich(string sql)
    {
        var k = await VorbereitenAsync();
        var id = await HologrammAuditEinfuegenAsync(k);

        AssertAbgelehnt(await HologrammDb.RohAusfuehrenAsync(sql.Replace("{id}", id.ToString(), StringComparison.Ordinal)));
    }

    [Theory]
    [InlineData("UPDATE pruefung_audit SET ergebnis = 'NichtGefunden', ausgabe_id = NULL WHERE id = '{id}'")]
    [InlineData("DELETE FROM pruefung_audit WHERE id = '{id}'")]
    public async Task Pruef_Audit_ist_unveraenderlich(string sql)
    {
        var k = await VorbereitenAsync();
        var id = await PruefAuditEinfuegenAsync(k);

        AssertAbgelehnt(await HologrammDb.RohAusfuehrenAsync(sql.Replace("{id}", id.ToString(), StringComparison.Ordinal)));
    }

    [Theory]
    [InlineData("Gesetzt", "AB1243", null)]
    [InlineData("Gesetzt", null, "Test Grund")]
    [InlineData("Geaendert", null, "Test Grund")]
    [InlineData("Geaendert", "AB1243", null)]
    [InlineData("Entfernt", null, null)]
    public async Task Hologramm_Audit_Check_lehnt_unpassende_Kombinationen_ab(string art, string? alt, string? grund)
    {
        var k = await VorbereitenAsync();

        var fehler = await Record.ExceptionAsync(() => HologrammAuditEinfuegenAsync(k, art, alt, grund));

        Assert.Equal(PostgresErrorCodes.CheckViolation, SqlState(fehler));
    }

    [Theory]
    [InlineData("Gesetzt", null, null)]
    [InlineData("Geaendert", "AB1243", "Test Grund")]
    public async Task Hologramm_Audit_Check_erlaubt_Gesetzt_und_Geaendert(string art, string? alt, string? grund)
    {
        var k = await VorbereitenAsync();

        Assert.Null(await Record.ExceptionAsync(() => HologrammAuditEinfuegenAsync(k, art, alt, grund)));
    }

    [Theory]
    [InlineData("NichtGefunden", true)]
    [InlineData("Gueltig", false)]
    [InlineData("Storniert", false)]
    [InlineData("FalscherCoin", false)]
    [InlineData("Unbekannt", true)]
    public async Task Pruef_Audit_Check_lehnt_unpassende_Kombinationen_ab(string ergebnis, bool mitAusgabe)
    {
        var k = await VorbereitenAsync();

        var fehler = await Record.ExceptionAsync(() => PruefAuditEinfuegenAsync(k, ergebnis, mitAusgabe));

        Assert.Equal(PostgresErrorCodes.CheckViolation, SqlState(fehler));
    }

    [Theory]
    [InlineData("NichtGefunden", false)]
    [InlineData("Gueltig", true)]
    [InlineData("Storniert", true)]
    [InlineData("FalscherCoin", true)]
    public async Task Pruef_Audit_Check_erlaubt_die_vier_Ergebnisse(string ergebnis, bool mitAusgabe)
    {
        var k = await VorbereitenAsync();

        Assert.Null(await Record.ExceptionAsync(() => PruefAuditEinfuegenAsync(k, ergebnis, mitAusgabe)));
    }

    [Fact]
    public async Task Pruef_Audit_hat_keinen_Fremdschluessel_auf_den_gewaehlten_Coin()
    {
        var k = await VorbereitenAsync();
        var id = Guid.CreateVersion7();

        var fehler = await HologrammDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO pruefung_audit (id, zeitpunkt, akteur_id, nummer, coin_id_gewaehlt, ergebnis, ausgabe_id, mit_empfaenger)
            VALUES ('{id}', now(), '{k.AdminId}', 'AB1234', '{Guid.NewGuid()}', 'NichtGefunden', NULL, false)
            """);

        Assert.Null(fehler);
    }

    [Theory]
    [InlineData("hologramm_audit")]
    [InlineData("pruefung_audit")]
    public async Task Audit_Tabelle_hat_keine_Spalte_fuer_Empfaengerdaten(string tabelle)
    {
        var spalten = await HologrammDb.SpaltenAsync(tabelle);

        Assert.NotEmpty(spalten);
        // Einzige Ausnahme: das Flag mit_empfaenger in pruefung_audit (Entwurf Abschnitt 6, ADR-0034 Punkt 5),
        // Typ boolean geprüft in Pruef_Audit_Spalte_mit_empfaenger_ist_boolean.
        var erlaubt = tabelle == "pruefung_audit" ? "mit_empfaenger" : null;
        Assert.DoesNotContain(spalten, s => s != erlaubt && (s.Contains("empfaenger", StringComparison.Ordinal) || s.Contains("name", StringComparison.Ordinal)
            || s.Contains("dienst", StringComparison.Ordinal) || s.Contains("gelegenheit", StringComparison.Ordinal)
            || s.Contains("begruendung", StringComparison.Ordinal) || s.Contains("stelle", StringComparison.Ordinal)));
    }

    [Fact]
    public async Task Pruef_Audit_Spalte_mit_empfaenger_ist_boolean()
    {
        Assert.Equal("boolean", await HologrammDb.WertAsync(
            "SELECT data_type FROM information_schema.columns WHERE table_name = 'pruefung_audit' AND column_name = 'mit_empfaenger'"));
    }

    // ---------- Abschnitt 6: TRUNCATE der Testdatenbank ----------

    [Fact]
    public async Task Leeren_der_Testdatenbank_leert_auch_die_neuen_Tabellen()
    {
        var k = await VorbereitenAsync();
        await HologrammDb.EinfuegenAsync(k.AusgabeA, "AB1234", k.AdminId);
        await HologrammAuditEinfuegenAsync(k);
        await PruefAuditEinfuegenAsync(k);

        await Fixture.DatenbankLeerenAsync();

        Assert.Equal(
            (0L, 0L, 0L),
            ((long)(await HologrammDb.WertAsync("SELECT count(*) FROM ausgabe_hologramm"))!,
                (long)(await HologrammDb.WertAsync("SELECT count(*) FROM hologramm_audit"))!,
                (long)(await HologrammDb.WertAsync("SELECT count(*) FROM pruefung_audit"))!));
    }

    [Fact]
    public async Task Erfassen_ohne_Nummer_legt_keine_Zeile_an()
    {
        var coinId = await CoinMitAuflageAsync(5);
        var id = (await ErfasseAsync(coinId)).GetProperty("id").GetGuid();

        using var antwort = await Client.GetAsync(AusgabeUrl(coinId, id));

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Empty(await HologrammDb.ZeilenAsync(id));
    }
}
