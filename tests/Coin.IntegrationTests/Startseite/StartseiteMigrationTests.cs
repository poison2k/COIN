using Coin.Infrastructure.Persistenz;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;

namespace Coin.IntegrationTests.Startseite;

/// <summary>
/// Feature startseite, AK-35 und Abschnitt 4 (Sonstiges: Migration Up/Down): Die Migration <c>Startseite</c> legt
/// <c>startseite_konfiguration</c>, <c>startseite_logo</c>, <c>startseite_audit</c> mit Trigger und den Index
/// <c>ix_coin_typ_erstellt</c> an; <c>Down</c> entfernt alles wieder. Läuft in einer eigenen, frisch angelegten Datenbank
/// im selben Container (die gemeinsame Test-DB bleibt unberührt).
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class StartseiteMigrationTests(PostgresFixture fixture) : IAsyncLifetime
{
    /// <summary>Letzte Migration vor diesem Feature.</summary>
    private const string VorDemFeature = "20261017001806_Zertifikatsnummern";

    private readonly string _datenbank = $"coin_migration_{Guid.NewGuid():N}";

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

    private async Task<long> AnzahlAsync(string sql)
    {
        await using var verbindung = new NpgsqlConnection(ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        return (long)(await befehl.ExecuteScalarAsync())!;
    }

    private Task<long> TabellenAsync() => AnzahlAsync(
        "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('startseite_konfiguration', 'startseite_logo', 'startseite_audit')");

    [Fact]
    public async Task Es_gibt_eine_Migration_namens_Startseite()
    {
        await using var db = Kontext();

        Assert.Contains(db.Database.GetMigrations(), m => m.EndsWith("_Startseite", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Up_legt_die_drei_Tabellen_an()
    {
        await MigrierenAsync();

        Assert.Equal(3, await TabellenAsync());
    }

    [Fact]
    public async Task Up_legt_den_Audit_Trigger_an()
    {
        await MigrierenAsync();

        Assert.Equal(1, await AnzahlAsync("SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_startseite_audit_unveraenderlich'"));
    }

    [Fact]
    public async Task Up_legt_den_Index_ix_coin_typ_erstellt_an()
    {
        await MigrierenAsync();

        Assert.Equal(1, await AnzahlAsync("SELECT count(*) FROM pg_indexes WHERE indexname = 'ix_coin_typ_erstellt'"));
    }

    [Fact]
    public async Task Down_entfernt_Tabellen_Trigger_Funktion_und_Index()
    {
        await MigrierenAsync();
        Assert.Equal(3, await TabellenAsync());

        await MigrierenAsync(VorDemFeature);

        Assert.Equal(0, await TabellenAsync());
        Assert.Equal(0, await AnzahlAsync("SELECT count(*) FROM pg_proc WHERE proname = 'startseite_audit_unveraenderlich'"));
        Assert.Equal(0, await AnzahlAsync("SELECT count(*) FROM pg_indexes WHERE indexname = 'ix_coin_typ_erstellt'"));
    }
}

/// <summary>
/// Feature startseite, Abschnitt 4.1/4.2: Checks der Tabellen (Werte an der API vorbei per SQL). Die Grenzen prüft die
/// Domain und zusätzlich die DB (ADR-0030 Punkt 1).
/// </summary>
public class StartseiteDatenbankTests(PostgresFixture fixture) : StartseiteTestBasis(fixture)
{
    /// <summary>Die Ausnahme ist eine Check-Verletzung (23514), nicht etwa „Tabelle fehlt“ (42P01).</summary>
    private static void AssertCheckVerletzt(Exception? fehler)
    {
        var postgres = Assert.IsType<PostgresException>(fehler);
        Assert.Equal(PostgresErrorCodes.CheckViolation, postgres.SqlState);
    }

    private async Task<Exception?> KonfigurationEinfuegenAsync(
        string id = "1",
        string reihenfolge = "ARRAY['kopf','infotext','kennzahlen','neueste','meistausgegeben']",
        string kopfAktiv = "false",
        string titel = "'C.O.I.N.'",
        string neuesteAnzahl = "6",
        string meistAnzahl = "5",
        string infotextAktiv = "true",
        string infotext = "'Text'")
    {
        var adminId = await AdminIdAsync();
        return await StartseiteDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO startseite_konfiguration (id, version, reihenfolge, kopf_aktiv, infotext_aktiv, kennzahlen_aktiv, neueste_aktiv,
                meistausgegeben_aktiv, kopf_titel, kopf_untertitel, infotext, neueste_anzahl, meistausgegeben_anzahl, geaendert_am, geaendert_von)
            VALUES ({id}, 1, {reihenfolge}, {kopfAktiv}, {infotextAktiv}, true, true, true, {titel}, '', {infotext}, {neuesteAnzahl}, {meistAnzahl},
                now(), '{adminId}')
            """);
    }

    [Fact]
    public async Task Gueltige_Zeile_laesst_sich_einfuegen()
    {
        Assert.Null(await KonfigurationEinfuegenAsync());
    }

    [Fact]
    public async Task Id_ungleich_1_wird_abgelehnt()
    {
        AssertCheckVerletzt(await KonfigurationEinfuegenAsync(id: "2"));
    }

    [Fact]
    public async Task Reihenfolge_mit_vier_Bloecken_wird_abgelehnt()
    {
        AssertCheckVerletzt(await KonfigurationEinfuegenAsync(reihenfolge: "ARRAY['kopf','infotext','kennzahlen','neueste']"));
    }

    [Fact]
    public async Task Reihenfolge_mit_doppeltem_Block_wird_abgelehnt()
    {
        AssertCheckVerletzt(await KonfigurationEinfuegenAsync(reihenfolge: "ARRAY['kopf','kopf','kennzahlen','neueste','meistausgegeben']"));
    }

    [Fact]
    public async Task Aktiver_Kopf_mit_leerem_Titel_wird_abgelehnt()
    {
        AssertCheckVerletzt(await KonfigurationEinfuegenAsync(kopfAktiv: "true", titel: "'  '"));
    }

    [Fact]
    public async Task Aktiver_Infotext_mit_leerem_Text_wird_abgelehnt()
    {
        AssertCheckVerletzt(await KonfigurationEinfuegenAsync(infotextAktiv: "true", infotext: "''"));
    }

    [Theory]
    [InlineData("2", "5")]
    [InlineData("13", "5")]
    [InlineData("6", "2")]
    [InlineData("6", "11")]
    public async Task Anzahl_ausserhalb_der_Grenzen_wird_abgelehnt(string neueste, string meist)
    {
        AssertCheckVerletzt(await KonfigurationEinfuegenAsync(neuesteAnzahl: neueste, meistAnzahl: meist));
    }

    [Fact]
    public async Task Logo_mit_unbekanntem_Platz_wird_abgelehnt()
    {
        var adminId = await AdminIdAsync();

        var fehler = await StartseiteDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO startseite_logo (platz, inhalt, format, groesse_bytes, breite, hoehe, sha256, alternativtext, hochgeladen_am, hochgeladen_von)
            VALUES ('unbekannt', '\x00'::bytea, 'png', 1, 1, 1, repeat('a', 64), 'Alt', now(), '{adminId}')
            """);

        AssertCheckVerletzt(fehler);
    }

    [Fact]
    public async Task Logo_mit_Breite_2049_wird_abgelehnt()
    {
        var adminId = await AdminIdAsync();

        var fehler = await StartseiteDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO startseite_logo (platz, inhalt, format, groesse_bytes, breite, hoehe, sha256, alternativtext, hochgeladen_am, hochgeladen_von)
            VALUES ('software', '\x00'::bytea, 'png', 1, 2049, 1, repeat('a', 64), 'Alt', now(), '{adminId}')
            """);

        AssertCheckVerletzt(fehler);
    }

    [Fact]
    public async Task Logo_mit_leerem_Alternativtext_wird_abgelehnt()
    {
        var adminId = await AdminIdAsync();

        var fehler = await StartseiteDb.RohAusfuehrenAsync(
            $"""
            INSERT INTO startseite_logo (platz, inhalt, format, groesse_bytes, breite, hoehe, sha256, alternativtext, hochgeladen_am, hochgeladen_von)
            VALUES ('software', '\x00'::bytea, 'png', 1, 1, 1, repeat('a', 64), '  ', now(), '{adminId}')
            """);

        AssertCheckVerletzt(fehler);
    }

    [Fact]
    public async Task Index_ix_coin_typ_erstellt_existiert_in_der_Testdatenbank()
    {
        Assert.True(await StartseiteDb.IndexExistiertAsync("ix_coin_typ_erstellt"));
    }
}
