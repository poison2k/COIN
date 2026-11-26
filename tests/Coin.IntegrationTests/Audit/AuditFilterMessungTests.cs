using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Text;
using Coin.Infrastructure.Persistenz;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit.Abstractions;

namespace Coin.IntegrationTests.Audit;

/// <summary>
/// Feature nacharbeiten-audit-filter, Abschnitt 4.3 und AK-11 (ADR-0045 Punkt 6): Lastmessung der Filter von
/// <c>GET /api/audit</c> mit 20 Benutzern und 6.000 Audit-Zeilen. Läuft in einer eigenen, frisch angelegten Datenbank
/// im vorhandenen Testcontainer (Muster <c>StartseiteMigrationTests</c>), weil sich Audit-Zeilen nicht löschen lassen.
/// Die Collection der Integrationstests läuft ohne Parallelisierung; es gibt keinen Browserlauf.
/// Schwelle im Test grob: Median ≤ 500 ms je Anfrage und <c>gesamt</c> wie erwartet. Die Index-Schwelle von 100 ms
/// prüft der Developer anhand der Ausgabe (Median, p95, gesamt, gemessene SQL-Befehle und EXPLAIN).
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class AuditFilterMessungTests(PostgresFixture fixture, ITestOutputHelper ausgabe) : IAsyncLifetime
{
    private const int Aufwaermlaeufe = 3;
    private const int Messlaeufe = 20;
    private const int AnzahlZeilen = 6000;
    private const int AnzahlBenutzer = 20;
    private static readonly TimeSpan MedianGrenze = TimeSpan.FromMilliseconds(500);

    private readonly string _datenbank = $"coin_messung_{Guid.NewGuid():N}";

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

    private async Task MigrierenAsync()
    {
        await using var db = new CoinDbContext(new DbContextOptionsBuilder<CoinDbContext>()
            .UseNpgsql(ConnectionString, npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history"))
            .UseSnakeCaseNamingConvention()
            .Options);
        await db.Database.MigrateAsync();
    }

    private async Task<NpgsqlConnection> VerbindungAsync()
    {
        var verbindung = new NpgsqlConnection(ConnectionString);
        await verbindung.OpenAsync();
        return verbindung;
    }

    /// <summary>20 Benutzer und 6.000 Zeilen per je einem INSERT … SELECT generate_series (Abschnitt 4.3).</summary>
    private async Task TestdatenAsync()
    {
        await using var verbindung = await VerbindungAsync();
        await using var befehl = new NpgsqlCommand(
            $"""
            INSERT INTO benutzer (id, issuer, subject, email, anzeigename, rolle, aktiv, erstellt_am, aktualisiert_am)
            SELECT ('00000000-0000-7000-8000-' || lpad(n::text, 12, '0'))::uuid, 'https://messung.invalid', 'sub-messung-' || n,
                   'messung' || n || '@coin-test.invalid', 'Test Messung ' || n, NULL, true, now(), now()
            FROM generate_series(1, {AnzahlBenutzer}) AS n;

            INSERT INTO benutzer_audit (id, zeitpunkt, akteur_id, benutzer_id, art, alt, neu)
            SELECT gen_random_uuid(),
                   timestamptz '2025-01-01T00:00:00Z' + (i - 1) * ((timestamptz '2026-12-31T23:59:59Z' - timestamptz '2025-01-01T00:00:00Z') / {AnzahlZeilen}),
                   NULL,
                   ('00000000-0000-7000-8000-' || lpad((((i / 2) % {AnzahlBenutzer}) + 1)::text, 12, '0'))::uuid,
                   CASE WHEN i % 2 = 0 THEN 'Rolle' ELSE 'Status' END,
                   CASE WHEN i % 2 = 0 THEN 'keine' ELSE 'aktiv' END,
                   CASE WHEN i % 2 = 0 THEN 'Betrachter' ELSE 'deaktiviert' END
            FROM generate_series(1, {AnzahlZeilen}) AS i;
            ANALYZE benutzer; ANALYZE benutzer_audit;
            """,
            verbindung);
        await befehl.ExecuteNonQueryAsync();
    }

    private static Guid MessBenutzer(int n) => Guid.Parse($"00000000-0000-7000-8000-{n:D12}");

    private sealed record Anfrage(string Name, string Query, string Bedingung);

    /// <summary>Die fünf Anfragen aus 4.3. <c>Bedingung</c> ist das SQL-Orakel für <c>gesamt</c> (Tagesgrenzen Berlin).</summary>
    private static Anfrage[] Anfragen()
    {
        var benutzer = MessBenutzer(7);
        return
        [
            new("ohne Filter", "", "true"),
            new("Zeitraum 30 Tage", "?von=2026-03-01&bis=2026-03-30", Zeitraum("2026-03-01", "2026-03-30")),
            new("Zeitraum 366 Tage", "?von=2025-06-01&bis=2026-06-01", Zeitraum("2025-06-01", "2026-06-01")),
            new("aktion=Status", "?aktion=Status", "art = 'Status'"),
            new(
                "Zeitraum 90 Tage + aktion=Rolle + benutzerId",
                $"?von=2026-01-01&bis=2026-03-31&aktion=Rolle&benutzerId={benutzer}",
                $"{Zeitraum("2026-01-01", "2026-03-31")} AND art = 'Rolle' AND benutzer_id = '{benutzer}'"),
        ];
    }

    private static string Zeitraum(string von, string bis) =>
        $"zeitpunkt >= (date '{von}')::timestamp AT TIME ZONE 'Europe/Berlin' "
        + $"AND zeitpunkt < (date '{bis}' + 1)::timestamp AT TIME ZONE 'Europe/Berlin'";

    private async Task<long> ErwartetesGesamtAsync(string bedingung)
    {
        await using var verbindung = await VerbindungAsync();
        await using var befehl = new NpgsqlCommand($"SELECT count(*) FROM benutzer_audit WHERE {bedingung}", verbindung);
        return (long)(await befehl.ExecuteScalarAsync())!;
    }

    private async Task<string> ExplainAsync(string sql)
    {
        await using var verbindung = await VerbindungAsync();
        await using var befehl = new NpgsqlCommand($"EXPLAIN (ANALYZE, BUFFERS) {sql}", verbindung);
        await using var leser = await befehl.ExecuteReaderAsync();
        var plan = new StringBuilder();
        while (await leser.ReadAsync())
        {
            plan.AppendLine(leser.GetString(0));
        }

        return plan.ToString();
    }

    private static double Perzentil(IReadOnlyList<double> sortiert, double p) =>
        sortiert[Math.Clamp((int)Math.Ceiling(p * sortiert.Count) - 1, 0, sortiert.Count - 1)];

    private static double Median(IReadOnlyList<double> sortiert) =>
        sortiert.Count % 2 == 1
            ? sortiert[sortiert.Count / 2]
            : (sortiert[(sortiert.Count / 2) - 1] + sortiert[sortiert.Count / 2]) / 2;

    [Fact]
    [Trait("Kategorie", "Langsam")]
    public async Task Filter_mit_6000_Eintraegen_antworten_im_Median_hoechstens_500_ms_mit_richtigem_gesamt()
    {
        await MigrierenAsync();
        await using var factory = new CoinApiFactory(ConnectionString);
        using var admin = factory.CreateClient();
        using (var me = await admin.GetAsync("/api/me"))
        {
            Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        }

        await TestdatenAsync();

        var befunde = new List<string>();
        foreach (var anfrage in Anfragen())
        {
            var url = $"/api/audit{anfrage.Query}";
            long gesamt = -1;
            for (var i = 0; i < Aufwaermlaeufe; i++)
            {
                using var antwort = await admin.GetAsync(url);
                Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"{anfrage.Name}: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
            }

            var dauern = new List<double>();
            for (var i = 0; i < Messlaeufe; i++)
            {
                var uhr = Stopwatch.StartNew();
                using var antwort = await admin.GetAsync(url);
                var text = await antwort.Content.ReadAsStringAsync();
                uhr.Stop();
                dauern.Add(uhr.Elapsed.TotalMilliseconds);
                using var json = System.Text.Json.JsonDocument.Parse(text);
                gesamt = json.RootElement.GetProperty("gesamt").GetInt64();
            }

            dauern.Sort();
            var median = Median(dauern);
            var p95 = Perzentil(dauern, 0.95);
            var erwartet = await ErwartetesGesamtAsync(anfrage.Bedingung);
            ausgabe.WriteLine(string.Create(
                CultureInfo.InvariantCulture,
                $"{anfrage.Name}: Median {median:F1} ms, p95 {p95:F1} ms, gesamt {gesamt} (erwartet {erwartet})"));

            if (gesamt != erwartet)
            {
                befunde.Add($"{anfrage.Name}: gesamt {gesamt}, erwartet {erwartet}");
            }

            if (median > MedianGrenze.TotalMilliseconds)
            {
                befunde.Add(string.Create(CultureInfo.InvariantCulture, $"{anfrage.Name}: Median {median:F1} ms > {MedianGrenze.TotalMilliseconds} ms"));
            }
        }

        await PlaeneAusgebenAsync(admin);

        Assert.Empty(befunde);
    }

    /// <summary>
    /// Gibt die SQL-Befehle der Kombinationsanfrage (über die ActivitySource „Npgsql“) und den Plan der beiden
    /// Kombinationsabfragen (Zählung und Seite) per <c>EXPLAIN (ANALYZE, BUFFERS)</c> mit eingesetzten Werten aus.
    /// </summary>
    private async Task PlaeneAusgebenAsync(HttpClient admin)
    {
        var kombination = Anfragen()[^1];
        using (var zaehler = new SqlBefehlsZaehler())
        {
            using (await admin.GetAsync($"/api/audit{kombination.Query}"))
            {
            }

            foreach (var befehl in zaehler.Befehle.Where(b => b.TrimStart().StartsWith("SELECT", StringComparison.OrdinalIgnoreCase)
                && b.Contains("benutzer_audit", StringComparison.OrdinalIgnoreCase)))
            {
                ausgabe.WriteLine("--- SQL der Kombinationsanfrage (EF) ---");
                ausgabe.WriteLine(befehl);
            }
        }

        ausgabe.WriteLine("--- EXPLAIN Zählung (Kombination) ---");
        ausgabe.WriteLine(await ExplainAsync($"SELECT count(*) FROM benutzer_audit WHERE {kombination.Bedingung}"));
        ausgabe.WriteLine("--- EXPLAIN Seite (Kombination) ---");
        ausgabe.WriteLine(await ExplainAsync(
            $"""
            SELECT a.id, a.zeitpunkt, a.akteur_id, k.anzeigename, a.benutzer_id, b.anzeigename, a.art, a.alt, a.neu
            FROM benutzer_audit a
            LEFT JOIN benutzer k ON k.id = a.akteur_id
            JOIN benutzer b ON b.id = a.benutzer_id
            WHERE {kombination.Bedingung.Replace("zeitpunkt", "a.zeitpunkt", StringComparison.Ordinal).Replace("art =", "a.art =", StringComparison.Ordinal).Replace("benutzer_id", "a.benutzer_id", StringComparison.Ordinal)}
            ORDER BY a.zeitpunkt DESC, a.id DESC
            LIMIT 25 OFFSET 0
            """));
        ausgabe.WriteLine("--- EXPLAIN Zählung (Zeitraum 366 Tage) ---");
        ausgabe.WriteLine(await ExplainAsync($"SELECT count(*) FROM benutzer_audit WHERE {Anfragen()[2].Bedingung}"));
    }
}
