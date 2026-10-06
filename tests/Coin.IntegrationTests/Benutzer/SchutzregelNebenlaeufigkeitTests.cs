using System.Net;
using Coin.IntegrationTests.Infrastruktur;
using Npgsql;

namespace Coin.IntegrationTests.Benutzer;

/// <summary>
/// Feature rollen-benutzerverwaltung, AK-17 und ADR-0018: Nebenläufigkeit der Schutzregeln.
/// Zwei aktive Administratoren A und B stufen sich gleichzeitig gegenseitig herab bzw. deaktivieren sich gegenseitig
/// (20 Durchläufe, DB-Reset je Durchlauf). Außerdem deterministisch: Änderungen laufen unter einer transaktionalen
/// Advisory-Sperre, und das Recht des Akteurs wird innerhalb der Sperre erneut geprüft.
/// </summary>
public class SchutzregelNebenlaeufigkeitTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const int Durchlaeufe = 20;

    /// <summary>Eigener Schlüssel des Tests (nicht der der Anwendung), um ein INSERT ins Audit anzuhalten.</summary>
    private const long TestBremse = 7_770_001;

    private static readonly TimeSpan Wartezeit = TimeSpan.FromSeconds(20);

    private async Task<(Guid AId, TestKonto B)> ZweiAdminsAsync()
    {
        var aId = await AdminIdAsync();
        var b = await ZweiterAdminAsync();
        return (aId, b);
    }

    private static async Task<string?> CodeAsync(HttpResponseMessage antwort)
    {
        var text = await antwort.Content.ReadAsStringAsync();
        if (string.IsNullOrEmpty(text))
        {
            return null;
        }

        using var dokument = System.Text.Json.JsonDocument.Parse(text);
        return dokument.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    [Theory]
    [InlineData("Rolle")]
    [InlineData("Status")]
    public async Task Gegenseitiges_Herabstufen_laesst_immer_genau_einen_aktiven_Admin_und_einen_Audit_Eintrag(string art)
    {
        var protokoll = new List<string>();
        for (var durchlauf = 0; durchlauf < Durchlaeufe; durchlauf++)
        {
            await Fixture.DatenbankLeerenAsync();
            var (aId, b) = await ZweiAdminsAsync();
            var auditVorher = await AuditDb.AnzahlAsync();

            Task<HttpResponseMessage> Aendern(HttpClient client, Guid ziel) =>
                art == "Rolle" ? PutRolleAsync(client, ziel, "Sachbearbeiter") : PutStatusAsync(client, ziel, false);

            var antworten = await Task.WhenAll(Aendern(Client, b.Id), Aendern(b.Client, aId));
            try
            {
                var status = antworten.Select(a => (int)a.StatusCode).Order().ToArray();
                var codes = new List<string?>();
                foreach (var antwort in antworten.Where(a => a.StatusCode != HttpStatusCode.OK))
                {
                    codes.Add(await CodeAsync(antwort));
                }

                var aktiveAdmins = await BenutzerDb.AnzahlAktiverAdministratorenAsync();
                var neueAudits = await AuditDb.AnzahlAsync() - auditVorher;
                protokoll.Add($"#{durchlauf}: {string.Join("/", status)} {string.Join(",", codes)} admins={aktiveAdmins} audit={neueAudits}");

                Assert.Equal(1, antworten.Count(a => a.StatusCode == HttpStatusCode.OK));
                var abgelehnt = Assert.Single(antworten, a => a.StatusCode != HttpStatusCode.OK);
                Assert.True(
                    abgelehnt.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Conflict,
                    $"Unerwarteter Status {abgelehnt.StatusCode}. Verlauf:\n{string.Join("\n", protokoll)}");
                var erlaubteCodes = abgelehnt.StatusCode == HttpStatusCode.Conflict
                    ? new[] { "letzter_administrator", "eigenes_konto" }
                    : art == "Rolle"
                        ? new[] { "keine_berechtigung" }
                        : new[] { "keine_berechtigung", "benutzer_deaktiviert" };
                Assert.Contains(Assert.Single(codes), erlaubteCodes);
                Assert.Equal(1, aktiveAdmins);
                Assert.Equal(1, neueAudits);
            }
            finally
            {
                foreach (var antwort in antworten)
                {
                    antwort.Dispose();
                }
            }
        }
    }

    // ---------- ADR-0018: Advisory-Sperre ----------

    /// <summary>
    /// Ermittelt den Schlüssel der Advisory-Sperre der Anwendung: Eine Rollenänderung wird beim Audit-INSERT
    /// angehalten (Test-Trigger wartet auf <see cref="TestBremse"/>); in dieser Zeit hält ihre Transaktion die
    /// Sperre der Anwendung. Liefert den Schlüssel als SQL-Argumentliste für pg_advisory_lock.
    /// </summary>
    private async Task<string> SperrSchluesselErmittelnAsync(Guid zielId)
    {
        await using var halter = OhnePool();
        await halter.OpenAsync();
        await AusfuehrenAsync(halter, $"SELECT pg_advisory_lock({TestBremse})");
        await using var bremse = await AuditDb.EinfuegenWartetAufAsync(TestBremse);

        var aenderung = PutRolleAsync(Client, zielId, "Betrachter");
        string? schluessel;
        HttpStatusCode status;
        try
        {
            schluessel = await WartenAufAsync(aenderung, async () =>
            {
                await using var befehl = new NpgsqlCommand(
                    """
                    SELECT classid::bigint, objid::bigint, objsubid FROM pg_locks
                    WHERE locktype = 'advisory' AND granted AND pid <> pg_backend_pid()
                    """,
                    halter);
                await using var leser = await befehl.ExecuteReaderAsync();
                if (!await leser.ReadAsync())
                {
                    return null;
                }

                var (classid, objid, objsubid) = (leser.GetInt64(0), leser.GetInt64(1), leser.GetInt16(2));
                return objsubid == 1 ? $"{(classid << 32) | objid}" : $"{(int)(uint)classid}, {(int)(uint)objid}";
            });
        }
        finally
        {
            await AusfuehrenAsync(halter, $"SELECT pg_advisory_unlock({TestBremse})");
            using var antwort = await aenderung;
            status = antwort.StatusCode;
        }

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.True(schluessel is not null, "Während einer Rollenänderung hält keine Transaktion eine Advisory-Sperre (ADR-0018).");
        return schluessel!;
    }

    [Fact]
    public async Task Rollenaenderung_haelt_waehrend_des_Schreibens_eine_Advisory_Sperre()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null);

        var schluessel = await SperrSchluesselErmittelnAsync(ziel.Id);

        Assert.False(string.IsNullOrEmpty(schluessel));
    }

    [Fact]
    public async Task Die_Advisory_Sperre_ist_transaktional_und_nach_der_Aenderung_frei()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null);
        var schluessel = await SperrSchluesselErmittelnAsync(ziel.Id);

        await using var verbindung = OhnePool();
        await verbindung.OpenAsync();
        await using var befehl = new NpgsqlCommand($"SELECT pg_try_advisory_lock({schluessel})", verbindung);

        Assert.True((bool)(await befehl.ExecuteScalarAsync())!, "Die Sperre ist nach Abschluss der Änderung noch belegt.");
    }

    [Fact]
    public async Task Statusaenderung_wartet_auf_die_Advisory_Sperre()
    {
        await AdminIdAsync();
        var ziel = await KontoAsync(null);
        var schluessel = await SperrSchluesselErmittelnAsync(ziel.Id);
        await using var halter = OhnePool();
        await halter.OpenAsync();
        await AusfuehrenAsync(halter, $"SELECT pg_advisory_lock({schluessel})");

        var aenderung = PutStatusAsync(Client, ziel.Id, false);
        var wartet = await WartenAufAsync(aenderung, async () => await WartetAufAdvisoryAsync(halter) ? "ja" : null);
        await AusfuehrenAsync(halter, $"SELECT pg_advisory_unlock({schluessel})");
        using var antwort = await aenderung;

        Assert.Equal("ja", wartet);
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Akteur_wird_innerhalb_der_Sperre_erneut_geprueft()
    {
        // X ist Admin und besteht die Autorisierung. Während seine Änderung auf die Sperre wartet, wird ihm die
        // Adminrolle entzogen. Innerhalb der Sperre muss das erkannt werden: 403 keine_berechtigung, nichts geschrieben.
        await AdminIdAsync();
        var x = await ZweiterAdminAsync("Test Akteur X");
        var ziel = await KontoAsync(null, name: "Test Ziel Z");
        var schluessel = await SperrSchluesselErmittelnAsync(ziel.Id);
        var auditVorher = await AuditDb.AnzahlAsync();

        await using var halter = OhnePool();
        await halter.OpenAsync();
        await AusfuehrenAsync(halter, $"SELECT pg_advisory_lock({schluessel})");
        var aenderung = PutRolleAsync(x.Client, ziel.Id, "Sachbearbeiter");
        string? wartet;
        try
        {
            wartet = await WartenAufAsync(aenderung, async () => await WartetAufAdvisoryAsync(halter) ? "ja" : null);
            await BenutzerDb.RolleSetzenAsync(x.Subject, "Betrachter");
        }
        finally
        {
            await AusfuehrenAsync(halter, $"SELECT pg_advisory_unlock({schluessel})");
        }

        using var antwort = await aenderung;

        Assert.Equal("ja", wartet);
        await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
        Assert.Equal("Betrachter", (await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Rolle);
        Assert.Equal(auditVorher, await AuditDb.AnzahlAsync());
    }

    [Fact]
    public async Task Deaktivierung_des_Akteurs_waehrend_des_Wartens_wird_innerhalb_der_Sperre_erkannt()
    {
        await AdminIdAsync();
        var x = await ZweiterAdminAsync("Test Akteur Y");
        var ziel = await KontoAsync(null, name: "Test Ziel W");
        var schluessel = await SperrSchluesselErmittelnAsync(ziel.Id);
        var auditVorher = await AuditDb.AnzahlAsync();

        await using var halter = OhnePool();
        await halter.OpenAsync();
        await AusfuehrenAsync(halter, $"SELECT pg_advisory_lock({schluessel})");
        var aenderung = PutStatusAsync(x.Client, ziel.Id, false);
        try
        {
            await WartenAufAsync(aenderung, async () => await WartetAufAdvisoryAsync(halter) ? "ja" : null);
            await BenutzerDb.StatusSetzenAsync(x.Subject, false);
        }
        finally
        {
            await AusfuehrenAsync(halter, $"SELECT pg_advisory_unlock({schluessel})");
        }

        using var antwort = await aenderung;

        await AssertKeinZugriffAsync(antwort, "keine_berechtigung");
        Assert.True((await BenutzerDb.RolleUndStatusAsync(ziel.Id)).Aktiv);
        Assert.Equal(auditVorher, await AuditDb.AnzahlAsync());
    }

    // ---------- Hilfen ----------

    /// <summary>
    /// Verbindung ohne Pool: Session-Sperren enden sicher mit dem Schließen, auch wenn ein Test vor dem Freigeben
    /// scheitert (eine gepoolte Verbindung behielte die Sperre für den nächsten Test).
    /// </summary>
    private NpgsqlConnection OhnePool() =>
        new(new NpgsqlConnectionStringBuilder(Fixture.ConnectionString) { Pooling = false }.ConnectionString);

    private static async Task AusfuehrenAsync(NpgsqlConnection verbindung, string sql)
    {
        await using var befehl = new NpgsqlCommand(sql, verbindung);
        await befehl.ExecuteNonQueryAsync();
    }

    /// <summary>Wartet ein anderer Backend-Prozess auf eine Advisory-Sperre?</summary>
    private static async Task<bool> WartetAufAdvisoryAsync(NpgsqlConnection verbindung)
    {
        await using var befehl = new NpgsqlCommand(
            "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND wait_event = 'advisory' AND pid <> pg_backend_pid()",
            verbindung);
        return (long)(await befehl.ExecuteScalarAsync())! > 0;
    }

    /// <summary>Prüft die Bedingung wiederholt, bis sie einen Wert liefert, die Anfrage endet oder die Wartezeit abläuft.</summary>
    private static async Task<string?> WartenAufAsync(Task anfrage, Func<Task<string?>> bedingung)
    {
        var ende = DateTime.UtcNow + Wartezeit;
        while (DateTime.UtcNow < ende && !anfrage.IsCompleted)
        {
            if (await bedingung() is { } wert)
            {
                return wert;
            }

            await Task.Delay(25);
        }

        return null;
    }
}
