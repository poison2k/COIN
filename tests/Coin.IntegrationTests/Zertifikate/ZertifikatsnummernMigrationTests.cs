using System.Net;
using System.Security.Cryptography;
using Coin.Infrastructure.Persistenz;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;

namespace Coin.IntegrationTests.Zertifikate;

/// <summary>
/// Feature zertifikat-erzeugen, AK-6 und AK-32 (ADR-0027 Punkt 6): Die Migration <c>Zertifikatsnummern</c> vergibt
/// bestehenden Coins Kennungen nach <c>erstellt_am</c>, dann <c>id</c>, setzt die Sequenz auf den höchsten Wert und gibt
/// jeder bestehenden Ausgabe – auch stornierten – <c>&lt;Kennung&gt;-&lt;Exemplar&gt;</c>. Danach greifen
/// <c>NOT NULL</c>, Indizes und Trigger; Vorlagen und <c>vorlage_audit</c> bleiben unverändert. Läuft in einer eigenen,
/// frisch angelegten Datenbank im selben Container (die gemeinsame Test-DB bleibt unberührt).
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class ZertifikatsnummernMigrationTests(PostgresFixture fixture) : IAsyncLifetime
{
    /// <summary>Letzte Migration vor diesem Feature.</summary>
    private const string VorDemFeature = "20261009050539_Zertifikatsvorlagen";

    private readonly string _datenbank = $"coin_migration_{Guid.NewGuid():N}";

    private string ConnectionString => new NpgsqlConnectionStringBuilder(fixture.ConnectionString) { Database = _datenbank }.ConnectionString;

    // A ist älter als B, obwohl seine Id größer ist: Die Reihenfolge folgt erstellt_am, nicht der Id.
    private static readonly Guid CoinA = Guid.Parse("01920000-0000-7000-8000-0000000000f2");
    private static readonly Guid CoinB = Guid.Parse("01920000-0000-7000-8000-0000000000f1");
    private static readonly Guid Benutzer = Guid.Parse("01920000-0000-7000-8000-0000000000b9");
    private static readonly Guid AusgabeStorniert = Guid.Parse("01920000-0000-7000-8000-0000000000e1");
    private static readonly Guid AusgabeNeu = Guid.Parse("01920000-0000-7000-8000-0000000000e2");
    private static readonly Guid AusgabeFuenf = Guid.Parse("01920000-0000-7000-8000-0000000000e3");

    private const string Empfaenger = "Migration Empfaenger Mg71";

    public async Task InitializeAsync() => await AdminAusfuehrenAsync($"CREATE DATABASE {_datenbank}");

    public async Task DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();
        await AdminAusfuehrenAsync($"DROP DATABASE IF EXISTS {_datenbank} WITH (FORCE)");
    }

    private async Task AdminAusfuehrenAsync(string sql)
    {
        await using var verbindung = new NpgsqlConnection(fixture.ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        await befehl.ExecuteNonQueryAsync();
    }

    private CoinDbContext Kontext() => new(new DbContextOptionsBuilder<CoinDbContext>()
        .UseNpgsql(ConnectionString, npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history"))
        .UseSnakeCaseNamingConvention()
        .Options);

    private async Task MigrierenAsync(string? ziel = null)
    {
        await using var db = Kontext();
        await db.GetService<IMigrator>().MigrateAsync(ziel);
    }

    private async Task AusfuehrenAsync(string sql, params (string Name, object Wert)[] parameter)
    {
        await using var verbindung = new NpgsqlConnection(ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        foreach (var (name, wert) in parameter)
        {
            befehl.Parameters.AddWithValue(name, wert);
        }

        await befehl.ExecuteNonQueryAsync();
    }

    private async Task<Exception?> VersucheAsync(string sql)
    {
        try
        {
            await AusfuehrenAsync(sql);
            return null;
        }
        catch (Exception ex)
        {
            return ex;
        }
    }

    private async Task<object?> WertAsync(string sql)
    {
        await using var verbindung = new NpgsqlConnection(ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        return await befehl.ExecuteScalarAsync();
    }

    private static readonly byte[] Vorlage = DocxBauer.Mit([.. DocxBauer.PflichtAbsaetze, DocxBauer.Text("Vorlage vor der Migration Mg72")]).Bytes();

    /// <summary>
    /// DB vor dem Feature: Coin A (älter, Auflage 5) mit Exemplar 3 ausgegeben und storniert, Exemplar 3 erneut
    /// ausgegeben und Exemplar 5 aktiv; Coin B (jünger, Auflage 2) ohne Ausgaben; bei A eine aktive Vorlage mit Audit.
    /// </summary>
    private async Task AltbestandAnlegenAsync()
    {
        await MigrierenAsync(VorDemFeature);
        await AusfuehrenAsync(
            $"""
            INSERT INTO benutzer (id, issuer, subject, email, anzeigename, rolle, erstellt_am, aktualisiert_am, aktiv)
            VALUES ('{Benutzer}', 'https://idp.test.invalid', 'sub-migration', 'migration@coin-test.invalid', 'Test Migration',
                    'Administrator', now(), now(), true);
            INSERT INTO coin_typ (id, name, herausgeber, auflage, beschreibung, erstellt_am) VALUES
                ('{CoinA}', 'Migration Coin A', 'Test Herausgeber', 5, NULL, TIMESTAMPTZ '2026-10-01 08:00:00+00'),
                ('{CoinB}', 'Migration Coin B', 'Test Herausgeber', 2, NULL, TIMESTAMPTZ '2026-10-02 08:00:00+00');
            INSERT INTO exemplar (coin_id, nummer) SELECT '{CoinA}', n FROM generate_series(1, 5) AS n;
            INSERT INTO exemplar (coin_id, nummer) SELECT '{CoinB}', n FROM generate_series(1, 2) AS n;
            INSERT INTO ausgabe (id, coin_id, exemplar_nummer, empfaenger_name, datum, gelegenheit, begruendung, ausgebende_stelle,
                                 erfasst_am, erfasst_von, storniert_am, storniert_von, storno_grund) VALUES
                ('{AusgabeStorniert}', '{CoinA}', 3, '{Empfaenger}', DATE '2026-10-01', 'G', 'B', 'S', now(), '{Benutzer}', now(), '{Benutzer}', 'Test'),
                ('{AusgabeNeu}', '{CoinA}', 3, '{Empfaenger}', DATE '2026-10-01', 'G', 'B', 'S', now(), '{Benutzer}', NULL, NULL, NULL),
                ('{AusgabeFuenf}', '{CoinA}', 5, '{Empfaenger}', DATE '2026-10-01', 'G', 'B', 'S', now(), '{Benutzer}', NULL, NULL, NULL);
            INSERT INTO zertifikat_vorlage (id, coin_id, version, inhalt, groesse_bytes, sha256, hochgeladen_am, hochgeladen_von)
            VALUES (gen_random_uuid(), '{CoinA}', 1, @inhalt, @groesse, @sha, now(), '{Benutzer}');
            UPDATE coin_typ SET aktive_vorlage_version = 1 WHERE id = '{CoinA}';
            INSERT INTO vorlage_audit (id, zeitpunkt, akteur_id, coin_id, art, version, vorherige_version)
            VALUES (gen_random_uuid(), now(), '{Benutzer}', '{CoinA}', 'Hochgeladen', 1, NULL);
            """,
            ("inhalt", Vorlage), ("groesse", Vorlage.Length), ("sha", Convert.ToHexStringLower(SHA256.HashData(Vorlage))));
    }

    /// <summary>Abgelehnt durch Trigger oder Constraint, nicht wegen einer fehlenden Spalte oder Tabelle.</summary>
    private static void AssertAbgelehnt(Exception? fehler)
    {
        var postgres = Assert.IsType<PostgresException>(fehler);
        Assert.NotEqual(PostgresErrorCodes.UndefinedColumn, postgres.SqlState);
        Assert.NotEqual(PostgresErrorCodes.UndefinedTable, postgres.SqlState);
    }

    private async Task<string?> KennungAsync(Guid coinId) => (string?)await WertAsync($"SELECT kennung FROM coin_typ WHERE id = '{coinId}'");

    private async Task<string?> NummerAsync(Guid ausgabeId) => (string?)await WertAsync($"SELECT zertifikatsnummer FROM ausgabe WHERE id = '{ausgabeId}'");

    [Fact]
    public void Es_gibt_eine_Migration_Zertifikatsnummern_nach_Zertifikatsvorlagen()
    {
        using var db = Kontext();
        var migrationen = db.Database.GetMigrations().ToList();

        var neu = Assert.Single(migrationen, m => m.EndsWith("_Zertifikatsnummern", StringComparison.Ordinal));
        Assert.True(string.CompareOrdinal(neu, VorDemFeature) > 0, "Zertifikatsnummern muss nach Zertifikatsvorlagen liegen.");
    }

    [Fact]
    public async Task Altbestand_laesst_sich_vor_dem_Feature_anlegen()
    {
        // Selbsttest der Testdaten: läuft auch ohne die neue Migration.
        await AltbestandAnlegenAsync();

        Assert.Equal(3L, await WertAsync("SELECT count(*) FROM ausgabe"));
    }

    [Fact]
    public async Task Bestehende_Coins_erhalten_Kennungen_nach_Anlagezeitpunkt()
    {
        await AltbestandAnlegenAsync();

        await MigrierenAsync();

        Assert.Equal(("C0001", "C0002"), (await KennungAsync(CoinA), await KennungAsync(CoinB)));
    }

    [Fact]
    public async Task Bestehende_Ausgaben_auch_stornierte_erhalten_Kennung_und_Exemplar()
    {
        await AltbestandAnlegenAsync();

        await MigrierenAsync();

        Assert.Equal(
            ("C0001-0003", "C0001-0003", "C0001-0005"),
            (await NummerAsync(AusgabeStorniert), await NummerAsync(AusgabeNeu), await NummerAsync(AusgabeFuenf)));
    }

    [Fact]
    public async Task Nach_der_Migration_erhaelt_ein_neuer_Coin_die_folgende_Kennung()
    {
        await AltbestandAnlegenAsync();
        await MigrierenAsync();

        await AusfuehrenAsync("INSERT INTO coin_typ (id, name, herausgeber, erstellt_am) VALUES (gen_random_uuid(), 'Migration Coin C', 'H', now())");

        Assert.Equal("C0003", await WertAsync("SELECT kennung FROM coin_typ WHERE name = 'Migration Coin C'"));
    }

    [Fact]
    public async Task Nach_der_Migration_ist_die_Zertifikatsnummer_Pflicht()
    {
        await AltbestandAnlegenAsync();
        await MigrierenAsync();

        var fehler = await VersucheAsync(
            $"""
            INSERT INTO ausgabe (id, coin_id, exemplar_nummer, empfaenger_name, datum, gelegenheit, begruendung, ausgebende_stelle, erfasst_am, erfasst_von)
            VALUES (gen_random_uuid(), '{CoinB}', 1, 'Test', DATE '2026-10-01', 'G', 'B', 'S', now(), '{Benutzer}')
            """);

        Assert.Equal(PostgresErrorCodes.NotNullViolation, Assert.IsType<PostgresException>(fehler).SqlState);
    }

    [Fact]
    public async Task Nach_der_Migration_greift_der_Nummern_Index_fuer_aktive_Ausgaben()
    {
        await AltbestandAnlegenAsync();
        await MigrierenAsync();

        var fehler = await VersucheAsync(
            $"""
            INSERT INTO ausgabe (id, coin_id, exemplar_nummer, zertifikatsnummer, empfaenger_name, datum, gelegenheit, begruendung,
                                 ausgebende_stelle, erfasst_am, erfasst_von)
            VALUES (gen_random_uuid(), '{CoinA}', 1, 'C0001-0005', 'Test', DATE '2026-10-01', 'G', 'B', 'S', now(), '{Benutzer}')
            """);

        var postgres = Assert.IsType<PostgresException>(fehler);
        Assert.Equal((PostgresErrorCodes.UniqueViolation, "ux_ausgabe_zertifikatsnummer_aktiv"), (postgres.SqlState, postgres.ConstraintName));
    }

    [Fact]
    public async Task Nach_der_Migration_ist_die_Kennung_unveraenderlich()
    {
        await AltbestandAnlegenAsync();
        await MigrierenAsync();

        var fehler = await VersucheAsync($"UPDATE coin_typ SET kennung = 'C0099' WHERE id = '{CoinA}'");

        AssertAbgelehnt(fehler);
    }

    [Fact]
    public async Task Nach_der_Migration_ist_die_Zertifikatsnummer_unveraenderlich()
    {
        await AltbestandAnlegenAsync();
        await MigrierenAsync();

        var fehler = await VersucheAsync($"UPDATE ausgabe SET zertifikatsnummer = 'C0001-0099' WHERE id = '{AusgabeFuenf}'");

        AssertAbgelehnt(fehler);
    }

    [Fact]
    public async Task Nach_der_Migration_bleibt_das_Storno_per_SQL_moeglich()
    {
        await AltbestandAnlegenAsync();
        await MigrierenAsync();

        var fehler = await VersucheAsync(
            $"UPDATE ausgabe SET storniert_am = now(), storniert_von = '{Benutzer}', storno_grund = 'Test' WHERE id = '{AusgabeFuenf}'");

        Assert.Null(fehler);
    }

    [Fact]
    public async Task Migration_laesst_Vorlagen_und_Vorlagen_Audit_unveraendert()
    {
        await AltbestandAnlegenAsync();
        var vorher = await WertAsync("SELECT string_agg(sha256 || ':' || md5(inhalt), ',') FROM zertifikat_vorlage") + "|" +
            await WertAsync("SELECT string_agg(a::text, ',') FROM vorlage_audit a");

        await MigrierenAsync();

        var nachher = await WertAsync("SELECT string_agg(sha256 || ':' || md5(inhalt), ',') FROM zertifikat_vorlage") + "|" +
            await WertAsync("SELECT string_agg(a::text, ',') FROM vorlage_audit a");
        Assert.Equal(vorher, nachher);
    }

    [Fact]
    public async Task Migration_legt_eine_leere_Tabelle_zertifikat_audit_an()
    {
        await AltbestandAnlegenAsync();

        await MigrierenAsync();

        Assert.Equal(0L, await WertAsync("SELECT count(*) FROM zertifikat_audit"));
    }

    [Theory]
    [InlineData(9998, "C9999")]
    [InlineData(9999, "C10000")]
    [InlineData(0, "C0001")]
    public async Task Funktion_coin_kennung_neu_formatiert_den_naechsten_Sequenzwert(long gesetzt, string erwartet)
    {
        await MigrierenAsync();
        await AusfuehrenAsync(gesetzt == 0 ? "SELECT setval('coin_kennung_seq', 1, false)" : $"SELECT setval('coin_kennung_seq', {gesetzt}, true)");

        Assert.Equal(erwartet, await WertAsync("SELECT coin_kennung_neu()"));
    }

    [Fact]
    public async Task Down_entfernt_Kennung_Nummer_und_zertifikat_audit_und_laesst_Coins_und_Ausgaben_bestehen()
    {
        await AltbestandAnlegenAsync();
        await MigrierenAsync();

        await MigrierenAsync(VorDemFeature);

        Assert.Equal(0L, await WertAsync(
            """
            SELECT (SELECT count(*) FROM information_schema.columns WHERE (table_name, column_name) IN (('coin_typ', 'kennung'), ('ausgabe', 'zertifikatsnummer')))
                 + (SELECT count(*) FROM information_schema.tables WHERE table_name = 'zertifikat_audit')
            """));
        Assert.Equal(5L, await WertAsync("SELECT (SELECT count(*) FROM coin_typ) + (SELECT count(*) FROM ausgabe)"));
    }

    [Fact]
    public async Task Nach_Down_schuetzt_der_alte_Trigger_die_Ausgaben_weiter()
    {
        await AltbestandAnlegenAsync();
        await MigrierenAsync();
        await MigrierenAsync(VorDemFeature);

        var fehler = await VersucheAsync($"UPDATE ausgabe SET empfaenger_name = 'Geaendert' WHERE id = '{AusgabeFuenf}'");

        Assert.IsType<PostgresException>(fehler);
    }

    // ---------- AK-32: vor der Migration gespeicherte Vorlage → Zertifikat ----------

    [Fact]
    public async Task Vor_der_Migration_gespeicherte_Vorlage_ergibt_ein_Zertifikat()
    {
        await AltbestandAnlegenAsync();
        // Der Testhost migriert beim Start (Umgebung Testing) und arbeitet auf dieser Datenbank.
        await using var factory = new CoinApiFactory(ConnectionString);
        using var client = factory.CreateClient();
        using (var me = await client.GetAsync("/api/me"))
        {
            Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        }

        using var antwort = await client.GetAsync($"/api/coins/{CoinA}/ausgaben/{AusgabeFuenf}/zertifikat");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        var texte = DocxLeser.Absatztexte(await antwort.Content.ReadAsByteArrayAsync());
        Assert.Contains(texte, t => t.Contains("Vorlage vor der Migration Mg72", StringComparison.Ordinal));
        Assert.Contains(texte, t => t.Contains("C0001-0005", StringComparison.Ordinal));
        Assert.Contains(texte, t => t.Contains(Empfaenger, StringComparison.Ordinal));
    }
}
