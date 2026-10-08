using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Coin.Domain.Katalog;
using Coin.IntegrationTests.Infrastruktur;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Logging;

namespace Coin.IntegrationTests.Anmeldung;

/// <summary>
/// Feature anmeldung-keycloak, AK-21: Keine Tokens, kein Authorization-Header, keine E-Mails und keine Anzeigenamen
/// in den Logs. Alle Logs ab Trace werden im Speicher abgefangen.
/// Erweitert durch rollen-benutzerverwaltung, AK-22: Das Szenario ruft zusätzlich Benutzerliste, Rolle/Status setzen,
/// Audit-Log und /api/me eines Deaktivierten auf; auch dabei keine E-Mails, Anzeigenamen oder Audit-Inhalte.
/// Erweitert durch rollen-benutzerverwaltung Rev. 3, AK-46/AK-47 und ADR-0019: Request-Protokoll <c>AnfrageProtokoll</c>
/// mit genau einem Eintrag je Request (Methode, Routen-Template, Status, Dauer) und ohne Personendaten.
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

    // ======================================================================================================
    // rollen-benutzerverwaltung Rev. 3, AK-46/AK-47, ADR-0019: Request-Protokoll ohne Personendaten
    // ======================================================================================================

    private const string AnfrageKategorie = "Coin.Api.Http.AnfrageProtokoll";
    private const string AnfrageVorlage = "HTTP {Methode} {Route} antwortete {Status} in {DauerMs} ms";
    private const string GeheimeSuche = "geheim.person@test.local";
    private const string UnbekannterPfad = "/api/unbekannt/max.mustermann@test.local";
    private const string ZielEmail = "ziel.protokoll@coin-test.invalid";
    private const string ZielName = "Protokollziel Testperson";
    private const string RolleBody = "{\"rolle\":\"Betrachter\"}";

    /// <summary>Suchbegriff der öffentlichen Coin-Suche (katalog-seiten, AK-5): darf nicht im Protokoll stehen.</summary>
    private const string GeheimeCoinSuche = "Geheimsuche Coinkatalog";

    /// <summary>Ein gesendeter Request mit dem tatsächlich empfangenen Status.</summary>
    private sealed record Gesendet(string Name, int Status);

    /// <summary>Ergebnis des Protokoll-Szenarios.</summary>
    private sealed record ProtokollSzenario(SammelLoggerProvider Logs, IReadOnlyList<Gesendet> Requests, string[] Tokens, Guid ZielId);

    private static List<LogEintrag> AnfrageEintraege(SammelLoggerProvider logs) =>
        logs.Strukturiert.Where(e => e.Kategorie == AnfrageKategorie).ToList();

    private static string Wert(LogEintrag eintrag, string schluessel)
    {
        Assert.True(eintrag.Werte.TryGetValue(schluessel, out var wert), $"Feld {schluessel} fehlt in: {eintrag.Text}");
        return Convert.ToString(wert, CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private static string Signatur(LogEintrag e) => $"{Wert(e, "Methode")} {Wert(e, "Route")} {Wert(e, "Status")}";

    /// <summary>
    /// Führt die Requests aus AK-47 aus: Suche mit E-Mail in der Query, Rolle setzen mit Token und Body, unbekannter
    /// Pfad mit E-Mail, Methode FOO, 401, 403, 415 und (ohne <paramref name="dienste"/>) einen anonymen Bildabruf.
    /// Mit <paramref name="dienste"/> endet das Szenario mit einem anonymen <c>GET /api/coins</c>.
    /// </summary>
    private async Task<ProtokollSzenario> ProtokollSzenarioAsync(
        Action<IServiceCollection>? dienste = null,
        IReadOnlyDictionary<string, string?>? einstellungen = null)
    {
        var logs = new SammelLoggerProvider();
        var werte = new Dictionary<string, string?>
        {
            ["Logging:LogLevel:Default"] = "Trace",
            ["Logging:LogLevel:Microsoft"] = "Trace",
            ["Logging:LogLevel:Microsoft.AspNetCore"] = "Trace",
        };
        foreach (var (schluessel, wert) in einstellungen ?? new Dictionary<string, string?>())
        {
            werte[schluessel] = wert;
        }

        await using var factory = Fixture.NeueFactory(new FactoryOptionen { Logger = logs, Einstellungen = werte, Dienste = dienste });
        var admin = Idp.ErzeugeToken(Testbenutzer.Admin);
        var zielToken = Idp.ErzeugeToken(new TokenDaten { Subject = "sub-protokoll-ziel", Email = ZielEmail, Name = ZielName });
        var ohneRolle = Idp.ErzeugeToken(LogBenutzer);
        var requests = new List<Gesendet>();

        using var client = factory.ClientOhneToken();
        async Task<HttpResponseMessage> SendeAsync(string name, HttpMethod methode, string url, string? token, HttpContent? inhalt = null)
        {
            using var anfrage = new HttpRequestMessage(methode, url) { Content = inhalt };
            if (token is not null)
            {
                anfrage.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }

            var antwort = await client.SendAsync(anfrage);
            requests.Add(new Gesendet(name, (int)antwort.StatusCode));
            return antwort;
        }

        static StringContent Json(string text, string typ = "application/json") => new(text, Encoding.UTF8, typ);

        (await SendeAsync("Me Admin", HttpMethod.Get, MeUrl, admin)).Dispose();
        Guid zielId;
        using (var me = await SendeAsync("Me Ziel", HttpMethod.Get, MeUrl, zielToken))
        {
            zielId = (await JsonAsync(me)).GetProperty("id").GetGuid();
        }

        (await SendeAsync("Me ohne Rolle", HttpMethod.Get, MeUrl, ohneRolle)).Dispose();
        (await SendeAsync("Suche", HttpMethod.Get, $"{BenutzerUrl}?suche={GeheimeSuche}", admin)).Dispose();
        (await SendeAsync("Rolle", HttpMethod.Put, RolleUrl(zielId), admin, Json(RolleBody))).Dispose();
        (await SendeAsync("Unbekannt", HttpMethod.Get, UnbekannterPfad, admin)).Dispose();
        (await SendeAsync("Rolle anonym", HttpMethod.Put, RolleUrl(zielId), null, Json(RolleBody))).Dispose();
        (await SendeAsync("Liste ohne Rolle", HttpMethod.Get, BenutzerUrl, ohneRolle)).Dispose();
        (await SendeAsync("Rolle text/plain", HttpMethod.Put, RolleUrl(zielId), admin, Json(RolleBody, "text/plain"))).Dispose();
        (await SendeAsync("FOO", new HttpMethod("FOO"), CoinsUrl, admin)).Dispose();

        if (dienste is null)
        {
            Guid coinId;
            using (var angelegt = await SendeAsync("Coin anlegen", HttpMethod.Post, CoinsUrl, admin, JsonContent.Create(GueltigerCoin("Coin Protokoll"))))
            {
                Assert.Equal(HttpStatusCode.Created, angelegt.StatusCode);
                coinId = (await JsonAsync(angelegt)).GetProperty("id").GetGuid();
            }

            (await SendeAsync("Bild hochladen", HttpMethod.Put, BildUrl(coinId), admin, Multipart(Testbilder.Png()))).Dispose();
            (await SendeAsync("Bild anonym", HttpMethod.Get, BildUrl(coinId), null)).Dispose();
            (await SendeAsync("Coin-Suche anonym", HttpMethod.Get, $"{CoinsUrl}?suche={Uri.EscapeDataString(GeheimeCoinSuche)}&seite=1&groesse=5", null)).Dispose();
        }
        else
        {
            (await SendeAsync("Liste anonym", HttpMethod.Get, CoinsUrl, null)).Dispose();
        }

        return new ProtokollSzenario(logs, requests, [admin, zielToken, ohneRolle], zielId);
    }

    private static string StatusVon(ProtokollSzenario szenario, string name) =>
        szenario.Requests.Single(r => r.Name == name).Status.ToString(CultureInfo.InvariantCulture);

    /// <summary>Der Protokolleintrag zum n-ten Request (genau ein Eintrag je Request, in Reihenfolge).</summary>
    private static LogEintrag EintragFuer(ProtokollSzenario szenario, string name)
    {
        var index = szenario.Requests.ToList().FindIndex(r => r.Name == name);
        Assert.True(index >= 0, $"Request {name} fehlt im Szenario.");
        var eintraege = AnfrageEintraege(szenario.Logs);
        Assert.Equal(szenario.Requests.Count, eintraege.Count);
        return eintraege[index];
    }

    // ---------- AK-46/AK-47: Felder und Status ----------

    [Fact]
    public async Task Request_Protokoll_schreibt_je_Request_genau_einen_Eintrag()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.Equal(szenario.Requests.Count, AnfrageEintraege(szenario.Logs).Count);
    }

    [Fact]
    public async Task Request_Protokoll_hat_Level_Information()
    {
        var szenario = await ProtokollSzenarioAsync();
        var eintraege = AnfrageEintraege(szenario.Logs);

        Assert.NotEmpty(eintraege);
        Assert.All(eintraege, e => Assert.Equal(LogLevel.Information, e.Level));
    }

    [Fact]
    public async Task Request_Protokoll_hat_eine_feste_EventId()
    {
        var szenario = await ProtokollSzenarioAsync();
        var eintraege = AnfrageEintraege(szenario.Logs);

        Assert.NotEmpty(eintraege);
        Assert.Single(eintraege.Select(e => e.EventId.Id).Distinct());
        Assert.NotEqual(0, eintraege[0].EventId.Id);
    }

    [Fact]
    public async Task Request_Protokoll_nutzt_die_feste_Nachrichtenvorlage()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.NotEmpty(AnfrageEintraege(szenario.Logs));
        Assert.All(AnfrageEintraege(szenario.Logs), e => Assert.Equal(AnfrageVorlage, Wert(e, "{OriginalFormat}")));
    }

    [Fact]
    public async Task Request_Protokoll_erfasst_Methode_Routen_Template_und_Status_je_Request()
    {
        var szenario = await ProtokollSzenarioAsync();
        var eintraege = AnfrageEintraege(szenario.Logs);
        Assert.Equal(szenario.Requests.Count, eintraege.Count);

        // Die Route des FOO-Requests hängt davon ab, ob ASP.NET einen 405-Endpunkt liefert; geprüft wird dort Methode und Status.
        var fooRoute = Wert(eintraege[szenario.Requests.ToList().FindIndex(r => r.Name == "FOO")], "Route");
        Assert.Equal(
            [
                $"GET /api/me {StatusVon(szenario, "Me Admin")}",
                $"GET /api/me {StatusVon(szenario, "Me Ziel")}",
                $"GET /api/me {StatusVon(szenario, "Me ohne Rolle")}",
                $"GET /api/benutzer {StatusVon(szenario, "Suche")}",
                $"PUT /api/benutzer/{{id}}/rolle {StatusVon(szenario, "Rolle")}",
                $"GET (keine Route) {StatusVon(szenario, "Unbekannt")}",
                $"PUT /api/benutzer/{{id}}/rolle {StatusVon(szenario, "Rolle anonym")}",
                $"GET /api/benutzer {StatusVon(szenario, "Liste ohne Rolle")}",
                $"PUT /api/benutzer/{{id}}/rolle {StatusVon(szenario, "Rolle text/plain")}",
                $"ANDERE {fooRoute} {StatusVon(szenario, "FOO")}",
                $"POST /api/coins {StatusVon(szenario, "Coin anlegen")}",
                $"PUT /api/coins/{{id}}/bild {StatusVon(szenario, "Bild hochladen")}",
                $"GET /api/coins/{{id}}/bild {StatusVon(szenario, "Bild anonym")}",
                $"GET /api/coins {StatusVon(szenario, "Coin-Suche anonym")}",
            ],
            eintraege.Select(Signatur).ToArray());
    }

    [Theory]
    [InlineData("Rolle", "200")]
    [InlineData("Rolle anonym", "401")]
    [InlineData("Liste ohne Rolle", "403")]
    [InlineData("Unbekannt", "404")]
    [InlineData("Rolle text/plain", "415")]
    public async Task Request_Protokoll_meldet_den_gesendeten_Statuscode(string request, string status)
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.Equal(status, StatusVon(szenario, request));
        Assert.Equal(status, Wert(EintragFuer(szenario, request), "Status"));
    }

    [Fact]
    public async Task Request_Protokoll_nennt_fuer_die_Rollenaenderung_das_Routen_Template_ohne_Id()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.Equal("/api/benutzer/{id}/rolle", Wert(EintragFuer(szenario, "Rolle"), "Route"));
    }

    [Fact]
    public async Task Request_Protokoll_nennt_fuer_die_Suche_die_Route_ohne_Query()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.Equal("/api/benutzer", Wert(EintragFuer(szenario, "Suche"), "Route"));
    }

    // ---------- katalog-seiten, AK-5: Coin-Suche ohne Suchbegriff und Query im Protokoll ----------

    [Fact]
    public async Task Request_Protokoll_nennt_fuer_die_Coin_Suche_die_Route_ohne_Query()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.Equal("GET /api/coins 200", Signatur(EintragFuer(szenario, "Coin-Suche anonym")));
    }

    [Fact]
    public async Task Request_Protokoll_Szenario_loggt_den_Suchbegriff_der_Coin_Suche_nicht()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.DoesNotContain("Geheimsuche", szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Uri.EscapeDataString(GeheimeCoinSuche), szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("groesse=5", szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Request_Protokoll_erfasst_den_anonymen_Bildabruf_mit_Routen_Template_auf_Information()
    {
        var szenario = await ProtokollSzenarioAsync();
        var eintrag = EintragFuer(szenario, "Bild anonym");

        Assert.Equal("200", StatusVon(szenario, "Bild anonym"));
        Assert.Equal("GET /api/coins/{id}/bild 200", Signatur(eintrag));
        Assert.Equal(LogLevel.Information, eintrag.Level);
    }

    [Fact]
    public async Task Request_Protokoll_meldet_eine_unbekannte_Methode_als_ANDERE()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.Equal("ANDERE", Wert(EintragFuer(szenario, "FOO"), "Methode"));
        Assert.DoesNotContain(AnfrageEintraege(szenario.Logs), e => e.Text.Contains("FOO", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Request_Protokoll_meldet_einen_unbekannten_Pfad_als_keine_Route()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.Equal("(keine Route)", Wert(EintragFuer(szenario, "Unbekannt"), "Route"));
    }

    [Fact]
    public async Task Request_Protokoll_meldet_die_Dauer_in_ganzen_Millisekunden()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.NotEmpty(AnfrageEintraege(szenario.Logs));
        Assert.All(AnfrageEintraege(szenario.Logs), e => Assert.Matches("^[0-9]+$", Wert(e, "DauerMs")));
    }

    [Fact]
    public async Task Request_Protokoll_misst_die_Dauer_ueber_den_TimeProvider()
    {
        var szenario = await ProtokollSzenarioAsync(dienste: s => s.AddSingleton<TimeProvider>(new SchrittZeit(TimeSpan.FromSeconds(1))));

        // Jeder Zeitstempel-Abruf rückt die Uhr um genau 1000 ms vor: Die Dauer ist ein positives Vielfaches davon.
        Assert.NotEmpty(AnfrageEintraege(szenario.Logs));
        Assert.All(AnfrageEintraege(szenario.Logs), e =>
        {
            var dauer = long.Parse(Wert(e, "DauerMs"), CultureInfo.InvariantCulture);
            Assert.True(dauer > 0 && dauer % 1000 == 0, $"DauerMs {dauer} stammt nicht aus dem TimeProvider: {e.Text}");
        });
    }

    [Fact]
    public async Task Request_Protokoll_meldet_500_bei_einer_unbehandelten_Ausnahme()
    {
        var szenario = await ProtokollSzenarioAsync(dienste: s => s.AddScoped(_ => WerfenderProxy<ICoinKatalogRepository>.Erzeugen("Testfehler Request-Protokoll")));

        Assert.Equal("500", StatusVon(szenario, "Liste anonym"));
        Assert.Equal("GET /api/coins 500", Signatur(EintragFuer(szenario, "Liste anonym")));
    }

    [Fact]
    public async Task Request_Protokoll_laesst_sich_ueber_das_Log_Level_seiner_Kategorie_abschalten()
    {
        var szenario = await ProtokollSzenarioAsync(einstellungen: new Dictionary<string, string?>
        {
            [$"Logging:{typeof(SammelLoggerProvider).FullName}:LogLevel:{AnfrageKategorie}"] = "Warning",
        });

        Assert.NotEmpty(szenario.Requests);
        Assert.Empty(AnfrageEintraege(szenario.Logs));
    }

    [Fact]
    public async Task Hosting_Diagnose_schreibt_trotz_Trace_Konfiguration_erst_ab_Warning()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.DoesNotContain(
            szenario.Logs.Strukturiert,
            e => e.Kategorie == "Microsoft.AspNetCore.Hosting.Diagnostics" && e.Level < LogLevel.Warning);
    }

    // ---------- AK-47: keine Personendaten ----------

    [Fact]
    public async Task Request_Protokoll_Szenario_loggt_den_Suchbegriff_nicht()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.DoesNotContain("geheim.person", szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Uri.EscapeDataString(GeheimeSuche), szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Request_Protokoll_Szenario_loggt_keinen_Query_String()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.DoesNotContain("?suche", szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Request_Protokoll_Szenario_loggt_den_rohen_unbekannten_Pfad_nicht()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.DoesNotContain("max.mustermann", szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Request_Protokoll_Szenario_loggt_die_Ziel_Id_nicht()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.DoesNotContain(szenario.ZielId.ToString(), szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(szenario.ZielId.ToString("N"), szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Request_Protokoll_Szenario_loggt_den_Request_Body_nicht()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.DoesNotContain(RolleBody, szenario.Logs.Gesamt);
    }

    [Fact]
    public async Task Request_Protokoll_Szenario_loggt_weder_Tokens_noch_Authorization_Header()
    {
        var szenario = await ProtokollSzenarioAsync();

        foreach (var teil in szenario.Tokens.SelectMany(t => t.Split('.')).Where(t => t.Length > 20))
        {
            Assert.DoesNotContain(teil, szenario.Logs.Gesamt);
        }

        Assert.DoesNotContain("Bearer ey", szenario.Logs.Gesamt);
        Assert.DoesNotContain("Authorization: Bearer", szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Request_Protokoll_Szenario_loggt_weder_Namen_noch_E_Mails_von_Akteur_und_Ziel()
    {
        var szenario = await ProtokollSzenarioAsync();

        Assert.DoesNotContain(Testbenutzer.AdminEmail, szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Testbenutzer.AdminName, szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(ZielEmail, szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(ZielName, szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(LogEmail, szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(LogName, szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    // ---------- AK-22/AK-47 (QA Rev. 3): feste Mindeststufen nicht per Wildcard-Konfiguration aushebelbar ----------
    //
    // Der LoggerRuleSelector bevorzugt die längere Kategorie, ein '*' zählt mit. Eine Regel wie
    // "Microsoft.AspNetCore.Hosting.Diagnostics*" ist länger als die feste Regel und gewinnt sonst. Geprüft wird die
    // Wildcard sowohl allgemein ("Logging:LogLevel:…", wirkt z. B. auf die Konsole) als auch für den Sammel-Empfänger
    // ("Logging:<Empfänger>:LogLevel:…"), dessen eigene Regel Vorrang vor allgemeinen Regeln hat.

    private const string KestrelFehlanfragen = "Microsoft.AspNetCore.Server.Kestrel.BadRequests";

    /// <summary>Wildcard-Kategorien, die länger als die feste Kategorie sind und sie treffen.</summary>
    private static readonly string[] WildcardKategorien =
    [
        "Microsoft.AspNetCore.Hosting.Diagnostics*",
        "Microsoft.AspNetCore.Hosting.*.Diagnostics",
        "Microsoft.AspNetCore.Routing.Matching.DfaMatcher*",
        "Microsoft.AspNetCore.Routing.*.Matching.DfaMatcher",
        "Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker*",
        "Microsoft.AspNetCore.Server.Kestrel.BadRequests*",
    ];

    /// <summary>Wildcard-Kategorie je Empfänger: allgemein und nur für den Sammel-Empfänger.</summary>
    public static TheoryData<string, bool> WildcardKonfigurationen
    {
        get
        {
            var daten = new TheoryData<string, bool>();
            foreach (var kategorie in WildcardKategorien)
            {
                daten.Add(kategorie, false);
                daten.Add(kategorie, true);
            }

            return daten;
        }
    }

    private static Dictionary<string, string?> WildcardEinstellung(string kategorie, bool nurSammelEmpfaenger) => new()
    {
        ["Logging:LogLevel:Default"] = "Trace",
        [nurSammelEmpfaenger
            ? $"Logging:{typeof(SammelLoggerProvider).FullName}:LogLevel:{kategorie}"
            : $"Logging:LogLevel:{kategorie}"] = "Trace",
    };

    [Theory]
    [MemberData(nameof(WildcardKonfigurationen))]
    public async Task Wildcard_Konfiguration_bringt_den_Query_String_nicht_ins_Log(string kategorie, bool nurSammelEmpfaenger)
    {
        var szenario = await ProtokollSzenarioAsync(einstellungen: WildcardEinstellung(kategorie, nurSammelEmpfaenger));

        Assert.DoesNotContain("?suche", szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [MemberData(nameof(WildcardKonfigurationen))]
    public async Task Wildcard_Konfiguration_bringt_den_Suchbegriff_nicht_ins_Log(string kategorie, bool nurSammelEmpfaenger)
    {
        var szenario = await ProtokollSzenarioAsync(einstellungen: WildcardEinstellung(kategorie, nurSammelEmpfaenger));

        Assert.DoesNotContain("geheim.person", szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Uri.EscapeDataString(GeheimeSuche), szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [MemberData(nameof(WildcardKonfigurationen))]
    public async Task Wildcard_Konfiguration_bringt_den_rohen_unbekannten_Pfad_nicht_ins_Log(string kategorie, bool nurSammelEmpfaenger)
    {
        var szenario = await ProtokollSzenarioAsync(einstellungen: WildcardEinstellung(kategorie, nurSammelEmpfaenger));

        Assert.DoesNotContain("max.mustermann", szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [MemberData(nameof(WildcardKonfigurationen))]
    public async Task Wildcard_Konfiguration_bringt_die_Ziel_Id_nicht_ins_Log(string kategorie, bool nurSammelEmpfaenger)
    {
        var szenario = await ProtokollSzenarioAsync(einstellungen: WildcardEinstellung(kategorie, nurSammelEmpfaenger));

        Assert.DoesNotContain(szenario.ZielId.ToString(), szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(szenario.ZielId.ToString("N"), szenario.Logs.Gesamt, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [MemberData(nameof(WildcardKonfigurationen))]
    public async Task Wildcard_Konfiguration_hebt_die_Mindeststufen_der_Kategorien_mit_Request_Daten_nicht_auf(
        string kategorie, bool nurSammelEmpfaenger)
    {
        var szenario = await ProtokollSzenarioAsync(einstellungen: WildcardEinstellung(kategorie, nurSammelEmpfaenger));

        Assert.DoesNotContain(szenario.Logs.Strukturiert, e =>
            (e.Kategorie == "Microsoft.AspNetCore.Hosting.Diagnostics" && e.Level < LogLevel.Warning)
            || (e.Kategorie == "Microsoft.AspNetCore.Routing.Matching.DfaMatcher" && e.Level < LogLevel.Warning)
            || (e.Kategorie == "Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker" && e.Level < LogLevel.Debug)
            || (e.Kategorie == KestrelFehlanfragen && e.Level < LogLevel.Warning));
    }

    // ---------- Feste Mindeststufen und Scope-Unterdrückung in der aus DI aufgelösten ILoggerFactory ----------

    /// <summary>Feste Kategorie und die höchste Stufe, die sie nie schreiben darf.</summary>
    public static TheoryData<string, LogLevel> FesteMindeststufen => new()
    {
        { "Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Information },
        { "Microsoft.AspNetCore.Routing.Matching.DfaMatcher", LogLevel.Information },
        { "Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker", LogLevel.Trace },
        { KestrelFehlanfragen, LogLevel.Information },
    };

    /// <summary>Feste Kategorie, gesperrte Stufe und eine Wildcard-Konfiguration (allgemein bzw. nur Sammel-Empfänger).</summary>
    public static TheoryData<string, LogLevel, string, bool> FesteMindeststufenMitWildcard
    {
        get
        {
            var daten = new TheoryData<string, LogLevel, string, bool>();
            foreach (var eintrag in FesteMindeststufen)
            {
                var kategorie = (string)eintrag[0];
                var stufe = (LogLevel)eintrag[1];
                foreach (var wildcard in WildcardKategorien)
                {
                    var prefix = wildcard[..wildcard.IndexOf('*', StringComparison.Ordinal)];
                    var suffix = wildcard[(wildcard.IndexOf('*', StringComparison.Ordinal) + 1)..];
                    if (kategorie.StartsWith(prefix, StringComparison.Ordinal) && kategorie.EndsWith(suffix, StringComparison.Ordinal))
                    {
                        daten.Add(kategorie, stufe, wildcard, false);
                        daten.Add(kategorie, stufe, wildcard, true);
                    }
                }
            }

            return daten;
        }
    }

    /// <summary>Logger aus der vom DI-Container aufgelösten <see cref="ILoggerFactory"/> (alle Konfiguration auf Trace).</summary>
    private async Task<bool> IstAktiviertAsync(string kategorie, LogLevel stufe, IReadOnlyDictionary<string, string?>? zusaetzlich = null)
    {
        var werte = new Dictionary<string, string?>
        {
            ["Logging:LogLevel:Default"] = "Trace",
            ["Logging:LogLevel:Microsoft"] = "Trace",
            ["Logging:LogLevel:Microsoft.AspNetCore"] = "Trace",
        };
        foreach (var (schluessel, wert) in zusaetzlich ?? new Dictionary<string, string?>())
        {
            werte[schluessel] = wert;
        }

        await using var factory = Fixture.NeueFactory(new FactoryOptionen { Logger = new SammelLoggerProvider(), Einstellungen = werte });
        var logger = factory.Services.GetRequiredService<ILoggerFactory>().CreateLogger(kategorie);
        return logger.IsEnabled(stufe);
    }

    [Theory]
    [MemberData(nameof(FesteMindeststufen))]
    public async Task Aufgeloeste_LoggerFactory_sperrt_feste_Kategorien_unterhalb_der_Mindeststufe(string kategorie, LogLevel gesperrt)
    {
        Assert.False(await IstAktiviertAsync(kategorie, gesperrt), $"{kategorie} schreibt trotz fester Mindeststufe auf {gesperrt}.");
    }

    [Theory]
    [MemberData(nameof(FesteMindeststufenMitWildcard))]
    public async Task Aufgeloeste_LoggerFactory_sperrt_feste_Kategorien_auch_bei_Wildcard_Konfiguration(
        string kategorie, LogLevel gesperrt, string wildcard, bool nurSammelEmpfaenger)
    {
        var einstellung = WildcardEinstellung(wildcard, nurSammelEmpfaenger);

        Assert.False(
            await IstAktiviertAsync(kategorie, gesperrt, einstellung),
            $"{kategorie} schreibt mit {string.Join(", ", einstellung.Keys)}=Trace auf {gesperrt}.");
    }

    [Theory]
    [InlineData("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning)]
    [InlineData("Microsoft.AspNetCore.Routing.Matching.DfaMatcher", LogLevel.Warning)]
    [InlineData("Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker", LogLevel.Debug)]
    [InlineData(KestrelFehlanfragen, LogLevel.Warning)]
    public async Task Aufgeloeste_LoggerFactory_schreibt_feste_Kategorien_ab_der_Mindeststufe(string kategorie, LogLevel mindestens)
    {
        Assert.True(await IstAktiviertAsync(kategorie, mindestens), $"{kategorie} ist auf {mindestens} ganz abgeschaltet.");
    }

    [Fact]
    public async Task Aufgeloeste_LoggerFactory_oeffnet_fuer_die_Hosting_Diagnose_keinen_Scope()
    {
        var logs = new SammelLoggerProvider();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Logger = logs,
            Einstellungen = new Dictionary<string, string?> { ["Logging:LogLevel:Default"] = "Trace" },
        });
        var logger = factory.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Microsoft.AspNetCore.Hosting.Diagnostics");

        using (logger.BeginScope("Scope-Marke-Hosting-4711"))
        {
            logger.LogWarning("Prüfeintrag Hosting-Scope");
        }

        var eintrag = Assert.Single(logs.Strukturiert, e => e.Nachricht == "Prüfeintrag Hosting-Scope");
        Assert.DoesNotContain("Scope-Marke-Hosting-4711", eintrag.Text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Aufgeloeste_LoggerFactory_laesst_Scopes_anderer_Kategorien_unveraendert()
    {
        var logs = new SammelLoggerProvider();
        await using var factory = Fixture.NeueFactory(new FactoryOptionen
        {
            Logger = logs,
            Einstellungen = new Dictionary<string, string?> { ["Logging:LogLevel:Default"] = "Trace" },
        });
        var logger = factory.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Coin.Test.Scopeprobe");

        using (logger.BeginScope("Scope-Marke-Andere-4712"))
        {
            logger.LogWarning("Prüfeintrag anderer Scope");
        }

        var eintrag = Assert.Single(logs.Strukturiert, e => e.Nachricht == "Prüfeintrag anderer Scope");
        Assert.Contains("Scope-Marke-Andere-4712", eintrag.Text, StringComparison.Ordinal);
    }

    /// <summary>Zeitquelle, deren Zeitstempel bei jedem Abruf um einen festen Schritt vorrückt; die Uhrzeit ist die des Systems.</summary>
    private sealed class SchrittZeit(TimeSpan schritt) : TimeProvider
    {
        private long _ticks;

        public override long TimestampFrequency => TimeSpan.TicksPerSecond;

        public override long GetTimestamp() => Interlocked.Add(ref _ticks, schritt.Ticks);

        public override DateTimeOffset GetUtcNow() => System.GetUtcNow();
    }
}
