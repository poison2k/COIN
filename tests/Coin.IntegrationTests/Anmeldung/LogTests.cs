using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.IdentityModel.Logging;

namespace Coin.IntegrationTests.Anmeldung;

/// <summary>
/// Feature anmeldung-keycloak, AK-21: Keine Tokens, kein Authorization-Header, keine E-Mails und keine Anzeigenamen
/// in den Logs. Alle Logs ab Trace werden im Speicher abgefangen.
/// Erweitert durch rollen-benutzerverwaltung, AK-22: Das Szenario ruft zusätzlich Benutzerliste, Rolle/Status setzen,
/// Audit-Log und /api/me eines Deaktivierten auf; auch dabei keine E-Mails, Anzeigenamen oder Audit-Inhalte.
/// </summary>
public class LogTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private const string LogEmail = "log.pruefung@coin-test.invalid";
    private const string LogName = "Logprüfung Testperson";

    private readonly List<string> _neueEndpunkte = [];

    private static TokenDaten LogBenutzer => new()
    {
        Subject = "sub-log-pruefung",
        Email = LogEmail,
        Name = LogName,
    };

    /// <summary>Führt typische Aufrufe aus (gültig, ungültig, anonym, 403, Upload) und liefert die gesammelten Logs.</summary>
    private async Task<(SammelLoggerProvider Logs, string[] Tokens)> SzenarioAsync()
    {
        var logs = new SammelLoggerProvider();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Logger = logs,
            Einstellungen = new Dictionary<string, string?>
            {
                ["Logging:LogLevel:Default"] = "Trace",
                ["Logging:LogLevel:Microsoft"] = "Trace",
                ["Logging:LogLevel:Microsoft.AspNetCore"] = "Trace",
            },
        });

        var gueltig = Idp.ErzeugeToken(LogBenutzer);
        var admin = Idp.ErzeugeToken(Testbenutzer.Admin);
        var abgelaufen = Idp.ErzeugeToken(LogBenutzer with { AblaufIn = TimeSpan.FromHours(-1), AusgestelltVersatz = TimeSpan.FromHours(-2) });
        var fremd = TestIdentitaetsanbieter.Fremd.ErzeugeToken(LogBenutzer);
        var falscheAud = Idp.ErzeugeToken(LogBenutzer with { Audience = "fremde-api" });

        using var client = factory.ClientOhneToken();
        async Task<HttpStatusCode> SendeAsync(HttpMethod methode, string url, string? token, HttpContent? inhalt = null)
        {
            using var anfrage = new HttpRequestMessage(methode, url) { Content = inhalt };
            if (token is not null)
            {
                anfrage.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }

            using var antwort = await client.SendAsync(anfrage);
            return antwort.StatusCode;
        }

        Assert.Equal(HttpStatusCode.OK, await SendeAsync(HttpMethod.Get, MeUrl, gueltig));
        Assert.Equal(HttpStatusCode.Forbidden, await SendeAsync(HttpMethod.Post, CoinsUrl, gueltig, JsonContent.Create(GueltigerCoin())));
        await SendeAsync(HttpMethod.Get, MeUrl, abgelaufen);
        await SendeAsync(HttpMethod.Get, MeUrl, fremd);
        await SendeAsync(HttpMethod.Post, CoinsUrl, falscheAud, JsonContent.Create(GueltigerCoin()));
        await SendeAsync(HttpMethod.Get, CoinsUrl, falscheAud);
        await SendeAsync(HttpMethod.Get, MeUrl, null);

        using var anlegen = new HttpRequestMessage(HttpMethod.Post, CoinsUrl) { Content = JsonContent.Create(GueltigerCoin("Coin Log")) };
        anlegen.Headers.Authorization = new AuthenticationHeaderValue("Bearer", admin);
        using var angelegt = await client.SendAsync(anlegen);
        Assert.Equal(HttpStatusCode.Created, angelegt.StatusCode);
        var id = (await JsonAsync(angelegt)).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, await SendeAsync(HttpMethod.Put, BildUrl(id), admin, Multipart(Testbilder.Png())));

        // rollen-benutzerverwaltung (AK-22): neue Endpunkte. Die Status werden gesammelt und in einem eigenen Test
        // geprüft, damit die übrigen Log-Prüfungen nicht vom Stand der Implementierung abhängen.
        using var meAnfrage = new HttpRequestMessage(HttpMethod.Get, MeUrl);
        meAnfrage.Headers.Authorization = new AuthenticationHeaderValue("Bearer", gueltig);
        using var meAntwort = await client.SendAsync(meAnfrage);
        var logId = (await JsonAsync(meAntwort)).GetProperty("id").GetGuid();
        _neueEndpunkte.Clear();
        async Task MerkeAsync(string name, HttpMethod methode, string url, string? token, HttpContent? inhalt = null) =>
            _neueEndpunkte.Add($"{name} -> {(int)await SendeAsync(methode, url, token, inhalt)}");

        await MerkeAsync("Liste", HttpMethod.Get, $"{BenutzerUrl}?suche={Uri.EscapeDataString("Logprüfung")}", admin);
        await MerkeAsync("Rolle", HttpMethod.Put, RolleUrl(logId), admin, JsonContent.Create(new { rolle = "Betrachter" }));
        await MerkeAsync("Deaktivieren", HttpMethod.Put, StatusUrl(logId), admin, JsonContent.Create(new { aktiv = false }));
        await MerkeAsync("Me deaktiviert", HttpMethod.Get, MeUrl, gueltig);
        await MerkeAsync("Reaktivieren", HttpMethod.Put, StatusUrl(logId), admin, JsonContent.Create(new { aktiv = true }));
        await MerkeAsync("Audit", HttpMethod.Get, AuditUrl, admin);
        await MerkeAsync("Audit gefiltert", HttpMethod.Get, $"{AuditUrl}?benutzerId={logId}", admin);
        await MerkeAsync("Liste als Betrachter", HttpMethod.Get, BenutzerUrl, gueltig);
        await MerkeAsync("Rolle ungueltig", HttpMethod.Put, RolleUrl(logId), admin, JsonContent.Create(new { rolle = "Superuser" }));
        await MerkeAsync("Suche E-Mail", HttpMethod.Get, $"{BenutzerUrl}?suche={Uri.EscapeDataString(LogEmail)}", admin);

        return (logs, [gueltig, admin, abgelaufen, fremd, falscheAud]);
    }

    [Fact]
    public async Task Logs_werden_tatsaechlich_abgefangen()
    {
        var (logs, _) = await SzenarioAsync();

        Assert.Contains(logs.Eintraege, e => e.Contains("Microsoft.AspNetCore", StringComparison.Ordinal));
        Assert.Contains(logs.Eintraege, e => e.StartsWith("Debug", StringComparison.Ordinal) || e.StartsWith("Trace", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Szenario_ruft_die_neuen_Endpunkte_mit_den_erwarteten_Status_auf()
    {
        await SzenarioAsync();

        Assert.Equal(
            [
                "Liste -> 200",
                "Rolle -> 200",
                "Deaktivieren -> 200",
                "Me deaktiviert -> 403",
                "Reaktivieren -> 200",
                "Audit -> 200",
                "Audit gefiltert -> 200",
                "Liste als Betrachter -> 403",
                "Rolle ungueltig -> 400",
                "Suche E-Mail -> 200",
            ],
            _neueEndpunkte);
    }

    [Fact]
    public async Task Logs_enthalten_keine_Audit_Werte_zum_Testbenutzer()
    {
        var (logs, _) = await SzenarioAsync();
        Assert.Contains("Rolle -> 200", _neueEndpunkte);

        // Ids sind erlaubt, Namen und Werte der Änderungen in Verbindung mit Personen nicht.
        Assert.DoesNotContain("keine → Betrachter", logs.Gesamt);
        Assert.DoesNotContain("aktiv → deaktiviert", logs.Gesamt);
        Assert.DoesNotContain("Logprüfung", logs.Gesamt);
    }

    [Fact]
    public async Task Logs_enthalten_die_Suchbegriffe_der_Benutzersuche_auch_URL_kodiert_nicht()
    {
        var (logs, _) = await SzenarioAsync();

        // Die Suche nach einer E-Mail steht in der Query; auch die kodierte Form ist ein Personendatum (AK-22).
        Assert.DoesNotContain(Uri.EscapeDataString(LogEmail), logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Uri.EscapeDataString("Logprüfung"), logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Logs_enthalten_keine_Tokens()
    {
        var (logs, tokens) = await SzenarioAsync();

        foreach (var token in tokens)
        {
            Assert.DoesNotContain(token, logs.Gesamt);
        }
    }

    [Fact]
    public async Task Logs_enthalten_keine_Token_Bestandteile()
    {
        var (logs, tokens) = await SzenarioAsync();

        foreach (var teil in tokens.SelectMany(t => t.Split('.')).Where(t => t.Length > 20))
        {
            Assert.DoesNotContain(teil, logs.Gesamt);
        }
    }

    [Fact]
    public async Task Logs_enthalten_keine_Authorization_Header()
    {
        var (logs, _) = await SzenarioAsync();

        Assert.DoesNotContain("Bearer ey", logs.Gesamt);
        Assert.DoesNotContain("Authorization: Bearer", logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Logs_enthalten_keine_Emails()
    {
        var (logs, _) = await SzenarioAsync();

        Assert.DoesNotContain(LogEmail, logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Testbenutzer.AdminEmail, logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Logs_enthalten_keine_Anzeigenamen()
    {
        var (logs, _) = await SzenarioAsync();

        Assert.DoesNotContain(LogName, logs.Gesamt);
        Assert.DoesNotContain(Testbenutzer.AdminName, logs.Gesamt);
    }

    [Fact]
    public async Task ShowPII_ist_nicht_aktiviert()
    {
        await SzenarioAsync();

        Assert.False(IdentityModelEventSource.ShowPII);
        Assert.False(IdentityModelEventSource.LogCompleteSecurityArtifact);
    }
}
