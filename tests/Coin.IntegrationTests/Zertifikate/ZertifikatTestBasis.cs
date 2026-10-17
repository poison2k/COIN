using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using Coin.IntegrationTests.Ausgaben;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Zertifikate;

/// <summary>Coin und Ausgabe für einen Download: Ids und die vergebene Zertifikatsnummer.</summary>
public sealed record ZertifikatKontext(Guid CoinId, Guid AusgabeId, string Nummer);

/// <summary>
/// Gemeinsame Hilfen für zertifikat-erzeugen (Abschnitt 5): URLs, Download, Fehler, Vorlagen hochladen. Standard-Client
/// ist der Bootstrap-Administrator. Alle Testdateien werden im Test erzeugt (<see cref="DocxBauer"/>).
/// </summary>
public abstract partial class ZertifikatTestBasis(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    protected const string DocxContentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    protected const string KonfliktTitel = "Zertifikat nicht möglich";

    protected const string DetailStorniert = "Für eine stornierte Ausgabe kann kein Zertifikat heruntergeladen werden.";

    protected const string DetailZuVielePlatzhalter =
        "Die aktive Vorlage enthält mehr als 200 Platzhalter. Bitte eine angepasste Vorlage hochladen.";

    protected const string DetailFehler = "Das Zertifikat konnte nicht erzeugt werden. Bitte später erneut versuchen.";

    protected const string UploadZuVielePlatzhalter = "Die Vorlage enthält mehr als 200 Platzhalter. Bitte die Anzahl verringern.";

    [GeneratedRegex(@"^C[0-9]{4,}-[0-9]{4,}$")]
    protected static partial Regex NummernMuster();

    [GeneratedRegex(@"^C[0-9]{4,}$")]
    protected static partial Regex KennungsMuster();

    protected ZertifikatAuditTabelle ZertifikatDb => new(Fixture.ConnectionString);

    protected VorlageTabelle VorlageDb => new(Fixture.ConnectionString);

    protected static string AusgabeUrl(Guid coinId, Guid ausgabeId) => $"{AusgabenUrl(coinId)}/{ausgabeId}";

    protected static string ZertifikatUrl(Guid coinId, Guid ausgabeId) => $"{AusgabeUrl(coinId, ausgabeId)}/zertifikat";

    protected static string VersionenUrl(Guid coinId) => $"{CoinsUrl}/{coinId}/zertifikatsvorlage/versionen";

    protected static string VersionDateiUrl(Guid coinId, int version) => $"{VersionenUrl(coinId)}/{version}/datei";

    protected static string ZuruecksetzenUrl(Guid coinId) => $"{CoinsUrl}/{coinId}/zertifikatsvorlage/zuruecksetzen";

    protected static Task<HttpResponseMessage> PostVersionAsync(HttpClient client, Guid coinId, byte[] inhalt)
    {
        var datei = new ByteArrayContent(inhalt);
        datei.Headers.ContentType = MediaTypeHeaderValue.Parse(DocxContentType);
        return client.PostAsync(VersionenUrl(coinId), new MultipartFormDataContent { { datei, "datei", "vorlage.docx" } });
    }

    /// <summary>Lädt eine Vorlage als Administrator hoch (erwartet 201) und liefert die neue Versionsnummer.</summary>
    protected async Task<int> LadeVorlageHochAsync(Guid coinId, byte[] inhalt)
    {
        using var antwort = await PostVersionAsync(Client, coinId, inhalt);
        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"Upload: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return (await JsonAsync(antwort)).GetProperty("aktiveVersion").GetInt32();
    }

    /// <summary>Die gespeicherte (bereinigte) Fassung einer Version als Administrator.</summary>
    protected async Task<byte[]> GespeicherteVersionAsync(Guid coinId, int version)
    {
        using var antwort = await Client.GetAsync(VersionDateiUrl(coinId, version));
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Version: {(int)antwort.StatusCode}");
        return await antwort.Content.ReadAsByteArrayAsync();
    }

    /// <summary>Legt einen Coin mit Auflage an und erfasst eine Ausgabe (Standard: nächstes freies Exemplar).</summary>
    protected async Task<ZertifikatKontext> AusgabeAsync(
        int? exemplar = null, int auflage = 20, Dictionary<string, object?>? ausgabe = null, string? coinName = null, HttpClient? client = null)
    {
        var coinId = await CoinMitAuflageAsync(auflage, coinName);
        return await AusgabeZuAsync(coinId, exemplar, ausgabe, client);
    }

    /// <summary>Erfasst eine Ausgabe zu einem vorhandenen Coin (erwartet 201).</summary>
    protected async Task<ZertifikatKontext> AusgabeZuAsync(Guid coinId, int? exemplar = null, Dictionary<string, object?>? ausgabe = null, HttpClient? client = null)
    {
        var body = ausgabe ?? GueltigeAusgabe(exemplar);
        body["exemplarNummer"] = exemplar ?? body.GetValueOrDefault("exemplarNummer");
        using var antwort = await PostAusgabeAsync(client ?? Client, coinId, body);
        Assert.True(antwort.StatusCode == HttpStatusCode.Created, $"Erfassen: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        var json = await JsonAsync(antwort);
        Assert.True(json.TryGetProperty("zertifikatsnummer", out var nummer), "Antwort ohne zertifikatsnummer (AK-3).");
        return new ZertifikatKontext(coinId, json.GetProperty("id").GetGuid(), nummer.GetString()!);
    }

    protected Task<HttpResponseMessage> GetZertifikatAsync(ZertifikatKontext k, HttpClient? client = null) =>
        (client ?? Client).GetAsync(ZertifikatUrl(k.CoinId, k.AusgabeId));

    /// <summary>Lädt das Zertifikat (erwartet 200) und liefert die Bytes.</summary>
    protected async Task<byte[]> ZertifikatAsync(ZertifikatKontext k, HttpClient? client = null)
    {
        using var antwort = await GetZertifikatAsync(k, client);
        Assert.True(antwort.StatusCode == HttpStatusCode.OK, $"Zertifikat: {(int)antwort.StatusCode} {await antwort.Content.ReadAsStringAsync()}");
        return await antwort.Content.ReadAsByteArrayAsync();
    }

    /// <summary>Prüft eine 409 des Downloads: title „Zertifikat nicht möglich“, <c>code</c>, <c>detail</c>.</summary>
    protected static async Task<JsonElement> AssertZertifikatKonfliktAsync(HttpResponseMessage antwort, string code, string detail)
    {
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.Conflict);
        Assert.Equal((KonfliktTitel, code, detail), (json.GetProperty("title").GetString(), json.GetProperty("code").GetString(), json.GetProperty("detail").GetString()));
        return json;
    }

    /// <summary>Prüft eine 404 „Ausgabe nicht gefunden“.</summary>
    protected static async Task AssertAusgabeNichtGefundenAsync(HttpResponseMessage antwort)
    {
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.NotFound);
        Assert.Equal("Ausgabe nicht gefunden", json.GetProperty("title").GetString());
    }

    /// <summary>
    /// Speichert eine Version direkt per SQL als aktive Vorlage (an Prüfung und Bereinigung vorbei, AK-14: gespeicherte
    /// Versionen werden nicht nachgeprüft).
    /// </summary>
    protected async Task VersionPerSqlAktivierenAsync(Guid coinId, byte[] inhalt, int version = 1)
    {
        var adminId = await AdminIdAsync();
        var sha = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(inhalt));
        await using var verbindung = new Npgsql.NpgsqlConnection(Fixture.ConnectionString);
        await verbindung.OpenAsync();
        await using var befehl = new Npgsql.NpgsqlCommand(
            """
            INSERT INTO zertifikat_vorlage (id, coin_id, version, inhalt, groesse_bytes, sha256, hochgeladen_am, hochgeladen_von)
            VALUES (gen_random_uuid(), @coin, @version, @inhalt, @groesse, @sha, now(), @von);
            UPDATE coin_typ SET aktive_vorlage_version = @version WHERE id = @coin;
            """,
            verbindung);
        befehl.Parameters.AddWithValue("coin", coinId);
        befehl.Parameters.AddWithValue("version", version);
        befehl.Parameters.AddWithValue("inhalt", inhalt);
        befehl.Parameters.AddWithValue("groesse", inhalt.Length);
        befehl.Parameters.AddWithValue("sha", sha);
        befehl.Parameters.AddWithValue("von", adminId);
        await befehl.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// Ein Trigger oder Constraint hat die Änderung abgelehnt – nicht bloß eine fehlende Spalte oder Tabelle (damit der
    /// Test vor der Migration nicht aus dem falschen Grund besteht).
    /// </summary>
    protected static void AssertAbgelehnt(Exception? fehler)
    {
        var postgres = Assert.IsType<Npgsql.PostgresException>(fehler);
        Assert.NotEqual(Npgsql.PostgresErrorCodes.UndefinedColumn, postgres.SqlState);
        Assert.NotEqual(Npgsql.PostgresErrorCodes.UndefinedTable, postgres.SqlState);
    }

    protected static void AssertDownloadHeader(HttpResponseMessage antwort, string dateiname)
    {
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Equal(DocxContentType, antwort.Content.Headers.ContentType?.MediaType);
        var disposition = antwort.Content.Headers.ContentDisposition;
        Assert.NotNull(disposition);
        Assert.Equal("attachment", disposition!.DispositionType);
        Assert.Equal(dateiname, disposition.FileName?.Trim('"'));
        Assert.Equal("nosniff", string.Join(",", antwort.Headers.GetValues("X-Content-Type-Options")));
        Assert.Equal("default-src 'none'; sandbox", string.Join(",", antwort.Headers.GetValues("Content-Security-Policy")));
        Assert.Contains("no-store", antwort.Headers.CacheControl?.ToString() ?? string.Empty, StringComparison.Ordinal);
    }
}
