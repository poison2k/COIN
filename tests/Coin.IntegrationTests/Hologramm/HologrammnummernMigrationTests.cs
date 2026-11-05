using Coin.Infrastructure.Persistenz;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;

namespace Coin.IntegrationTests.Hologramm;

/// <summary>
/// Feature hologrammnummer, AK-3 und AK-4 (ADR-0033): Die Migration <c>Hologrammnummern</c> legt
/// <c>ausgabe_hologramm</c>, <c>hologramm_audit</c> und <c>pruefung_audit</c> samt Triggern und Indizes an; bestehende
/// Ausgaben (aktiv und storniert) haben danach keine Hologrammnummer; <c>ausgabe</c> und die Funktion hinter
/// <c>trg_ausgabe_nur_storno</c> bleiben unverändert; <c>Down</c> entfernt alles wieder. Läuft in einer eigenen,
/// frisch angelegten Datenbank im selben Container (die gemeinsame Test-DB bleibt unberührt).
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class HologrammnummernMigrationTests(PostgresFixture fixture) : IAsyncLifetime
{
    /// <summary>Letzte Migration vor diesem Feature.</summary>
    private const string VorDemFeature = "20261026100926_Startseite";

    private static readonly string[] NeueTabellen = ["ausgabe_hologramm", "hologramm_audit", "pruefung_audit"];

    private readonly string _datenbank = $"coin_migration_{Guid.NewGuid():N}";

    private static readonly Guid Coin = Guid.Parse("01920000-0000-7000-8000-0000000001c1");
    private static readonly Guid Benutzer = Guid.Parse("01920000-0000-7000-8000-0000000001b1");
    private static readonly Guid AusgabeAktiv = Guid.Parse("01920000-0000-7000-8000-0000000001e1");
    private static readonly Guid AusgabeStorniert = Guid.Parse("01920000-0000-7000-8000-0000000001e2");

    private string ConnectionString => new NpgsqlConnectionStringBuilder(fixture.ConnectionString) { Database = _datenbank }.ConnectionString;

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

    private async Task AusfuehrenAsync(string sql)
    {
        await using var verbindung = new NpgsqlConnection(ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        await befehl.ExecuteNonQueryAsync();
    }

    private async Task<object?> WertAsync(string sql)
    {
        await using var verbindung = new NpgsqlConnection(ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        return await befehl.ExecuteScalarAsync();
    }

    /// <summary>Definition der Funktion hinter einem Trigger (<c>pg_get_functiondef</c>) oder <c>null</c>.</summary>
    private Task<object?> TriggerFunktionAsync(string trigger) =>
        WertAsync($"SELECT pg_get_functiondef(t.tgfoid) FROM pg_trigger t WHERE t.tgname = '{trigger}'");

    /// <summary>Migriert auf den neuesten Stand und stellt sicher, dass die Migration des Features dabei war.</summary>
    private async Task MitFeatureMigrierenAsync()
    {
        await MigrierenAsync();
        Assert.True(await AnzahlTabellenAsync(NeueTabellen) == 3, "Nach der Migration fehlen ausgabe_hologramm, hologramm_audit oder pruefung_audit.");
    }

    private async Task<long> AnzahlTabellenAsync(params string[] tabellen) =>
        (long)(await WertAsync(
            $"SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ({string.Join(", ", tabellen.Select(t => $"'{t}'"))})"))!;

    /// <summary>DB vor dem Feature mit einer aktiven und einer stornierten Ausgabe.</summary>
    private async Task AltbestandAnlegenAsync()
    {
        await MigrierenAsync(VorDemFeature);
        await AusfuehrenAsync(
            $"""
            INSERT INTO benutzer (id, issuer, subject, email, anzeigename, rolle, erstellt_am, aktualisiert_am, aktiv)
            VALUES ('{Benutzer}', 'https://idp.test.invalid', 'sub-migration-holo', 'migration-holo@coin-test.invalid', 'Test Migration',
                    'Administrator', now(), now(), true);
            INSERT INTO coin_typ (id, name, herausgeber, auflage, beschreibung, erstellt_am)
            VALUES ('{Coin}', 'Migration Coin Hologramm', 'Test Herausgeber', 5, NULL, now());
            INSERT INTO exemplar (coin_id, nummer) SELECT '{Coin}', n FROM generate_series(1, 5) AS n;
            INSERT INTO ausgabe (id, coin_id, exemplar_nummer, zertifikatsnummer, empfaenger_name, datum, gelegenheit, begruendung,
                                 ausgebende_stelle, erfasst_am, erfasst_von, storniert_am, storniert_von, storno_grund) VALUES
                ('{AusgabeStorniert}', '{Coin}', 1, (SELECT kennung FROM coin_typ WHERE id = '{Coin}') || '-0001', 'Test Empfaenger',
                 DATE '2026-10-01', 'G', 'B', 'S', now(), '{Benutzer}', now(), '{Benutzer}', 'Test'),
                ('{AusgabeAktiv}', '{Coin}', 1, (SELECT kennung FROM coin_typ WHERE id = '{Coin}') || '-0001', 'Test Empfaenger',
                 DATE '2026-10-01', 'G', 'B', 'S', now(), '{Benutzer}', NULL, NULL, NULL);
            """);
    }

    [Fact]
    public void Es_gibt_eine_Migration_Hologrammnummern_nach_Startseite()
    {
        using var db = Kontext();
        var migrationen = db.Database.GetMigrations().ToList();

        var index = migrationen.FindIndex(m => m.EndsWith("_Hologrammnummern", StringComparison.Ordinal));

        Assert.True(index >= 0, "Migration „Hologrammnummern“ fehlt.");
        Assert.True(index > migrationen.IndexOf(VorDemFeature), "Hologrammnummern muss nach Startseite kommen.");
    }

    [Fact]
    public async Task Up_legt_die_drei_Tabellen_an()
    {
        await AltbestandAnlegenAsync();

        await MigrierenAsync();

        Assert.Equal(3L, await AnzahlTabellenAsync(NeueTabellen));
    }

    [Fact]
    public async Task Bestehende_Ausgaben_haben_nach_der_Migration_keine_Hologrammnummer()
    {
        await AltbestandAnlegenAsync();

        await MigrierenAsync();

        Assert.Equal(0L, await WertAsync("SELECT count(*) FROM ausgabe_hologramm"));
    }

    [Fact]
    public async Task Bestehende_Ausgaben_bleiben_unveraendert()
    {
        await AltbestandAnlegenAsync();
        var vorher = await WertAsync("SELECT string_agg(a::text, '|' ORDER BY id) FROM ausgabe a");

        await MitFeatureMigrierenAsync();

        Assert.Equal(vorher, await WertAsync("SELECT string_agg(a::text, '|' ORDER BY id) FROM ausgabe a"));
    }

    [Fact]
    public async Task Migration_schreibt_kein_Audit()
    {
        await AltbestandAnlegenAsync();

        await MigrierenAsync();

        Assert.Equal(
            (0L, 0L),
            ((long)(await WertAsync("SELECT count(*) FROM hologramm_audit"))!, (long)(await WertAsync("SELECT count(*) FROM pruefung_audit"))!));
    }

    [Fact]
    public async Task Funktion_hinter_trg_ausgabe_nur_storno_bleibt_unveraendert()
    {
        await AltbestandAnlegenAsync();
        var vorher = await TriggerFunktionAsync("trg_ausgabe_nur_storno");
        Assert.NotNull(vorher);

        await MitFeatureMigrierenAsync();

        Assert.Equal(vorher, await TriggerFunktionAsync("trg_ausgabe_nur_storno"));
    }

    [Fact]
    public async Task Spalten_von_ausgabe_bleiben_unveraendert()
    {
        await AltbestandAnlegenAsync();
        const string sql = "SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_name = 'ausgabe'";
        var vorher = await WertAsync(sql);

        await MitFeatureMigrierenAsync();

        Assert.Equal(vorher, await WertAsync(sql));
    }

    [Theory]
    [InlineData("trg_ausgabe_hologramm_nur_abloesen")]
    [InlineData("trg_hologramm_audit_unveraenderlich")]
    [InlineData("trg_pruefung_audit_unveraenderlich")]
    public async Task Up_legt_den_Trigger_an(string trigger)
    {
        await AltbestandAnlegenAsync();

        await MigrierenAsync();

        Assert.NotNull(await TriggerFunktionAsync(trigger));
    }

    [Fact]
    public async Task Nach_der_Migration_laesst_sich_einer_bestehenden_stornierten_Ausgabe_keine_Zeile_unterschieben_ohne_den_Index()
    {
        await AltbestandAnlegenAsync();
        await MigrierenAsync();
        await AusfuehrenAsync(
            $"""
            INSERT INTO ausgabe_hologramm (id, ausgabe_id, nummer, gesetzt_am, gesetzt_von)
            VALUES (gen_random_uuid(), '{AusgabeStorniert}', 'AB1234', now(), '{Benutzer}')
            """);

        var fehler = await Record.ExceptionAsync(() => AusfuehrenAsync(
            $"""
            INSERT INTO ausgabe_hologramm (id, ausgabe_id, nummer, gesetzt_am, gesetzt_von)
            VALUES (gen_random_uuid(), '{AusgabeAktiv}', 'AB 12-34', now(), '{Benutzer}')
            """));

        Assert.Equal(PostgresErrorCodes.UniqueViolation, Assert.IsType<PostgresException>(fehler).SqlState);
    }

    [Fact]
    public async Task Down_entfernt_die_drei_Tabellen()
    {
        await AltbestandAnlegenAsync();
        await MitFeatureMigrierenAsync();

        await MigrierenAsync(VorDemFeature);

        Assert.Equal(0L, await AnzahlTabellenAsync(NeueTabellen));
    }

    [Theory]
    [InlineData("trg_ausgabe_hologramm_nur_abloesen")]
    [InlineData("trg_hologramm_audit_unveraenderlich")]
    [InlineData("trg_pruefung_audit_unveraenderlich")]
    public async Task Down_entfernt_den_Trigger(string trigger)
    {
        await AltbestandAnlegenAsync();
        await MitFeatureMigrierenAsync();
        Assert.NotNull(await TriggerFunktionAsync(trigger));

        await MigrierenAsync(VorDemFeature);

        Assert.Null(await TriggerFunktionAsync(trigger));
    }

    [Fact]
    public async Task Down_entfernt_auch_die_Trigger_Funktionen()
    {
        await AltbestandAnlegenAsync();
        var vorher = (long)(await WertAsync("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'"))!;
        await MitFeatureMigrierenAsync();

        await MigrierenAsync(VorDemFeature);

        Assert.Equal(vorher, await WertAsync("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'"));
    }

    [Fact]
    public async Task Down_laesst_ausgabe_und_ihren_Trigger_unveraendert()
    {
        await AltbestandAnlegenAsync();
        var vorher = await TriggerFunktionAsync("trg_ausgabe_nur_storno");
        await MitFeatureMigrierenAsync();

        await MigrierenAsync(VorDemFeature);

        Assert.Equal(vorher, await TriggerFunktionAsync("trg_ausgabe_nur_storno"));
        Assert.Equal(2L, await WertAsync("SELECT count(*) FROM ausgabe"));
    }

    [Fact]
    public async Task Up_nach_Down_gelingt_erneut()
    {
        await AltbestandAnlegenAsync();
        await MitFeatureMigrierenAsync();
        await MigrierenAsync(VorDemFeature);

        await MigrierenAsync();

        Assert.Equal(3L, await AnzahlTabellenAsync(NeueTabellen));
    }
}
