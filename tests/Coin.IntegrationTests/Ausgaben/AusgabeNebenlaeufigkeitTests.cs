using System.Net;
using Coin.IntegrationTests.Infrastruktur;
using Npgsql;

namespace Coin.IntegrationTests.Ausgaben;

/// <summary>
/// Feature coin-ausgaben, AK-9, AK-10, AK-12 und AK-17 (ADR-0020 Punkt 5 und 6): gleichzeitige Zugriffe.
/// Mehrere Durchläufe je Test, weil ein einzelner Lauf ein Rennen zufällig gewinnen kann.
/// </summary>
public class AusgabeNebenlaeufigkeitTests(PostgresFixture fixture) : AusgabenTestBasis(fixture)
{
    private const int Durchlaeufe = 5;

    /// <summary>Startet alle Anfragen möglichst gleichzeitig.</summary>
    private static async Task<HttpResponseMessage[]> GleichzeitigAsync(params Func<Task<HttpResponseMessage>>[] anfragen)
    {
        using var start = new SemaphoreSlim(0);
        var laufend = anfragen.Select(async a =>
        {
            await start.WaitAsync();
            return await a();
        }).ToArray();
        start.Release(anfragen.Length);
        return await Task.WhenAll(laufend);
    }

    private static async Task<string?> CodeAsync(HttpResponseMessage antwort) =>
        (await JsonAsync(antwort)).TryGetProperty("code", out var code) ? code.GetString() : null;

    // ---------- AK-9: zehn parallele POST auf dieselbe Nummer ----------

    [Fact]
    public async Task Zehn_parallele_Ausgaben_derselben_Nummer_ergeben_genau_einen_201()
    {
        await AdminIdAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var coinId = await CoinMitAuflageAsync(20);

            var antworten = await GleichzeitigAsync(Enumerable.Range(0, 10)
                .Select(_ => (Func<Task<HttpResponseMessage>>)(() => PostAusgabeAsync(coinId, GueltigeAusgabe(7))))
                .ToArray());

            var status = antworten.Select(a => (int)a.StatusCode).Order().ToArray();
            Assert.Equal([201, 409, 409, 409, 409, 409, 409, 409, 409, 409], status);
            foreach (var a in antworten)
            {
                a.Dispose();
            }
        }
    }

    [Fact]
    public async Task Zehn_parallele_Ausgaben_derselben_Nummer_liefern_neunmal_exemplar_ausgegeben()
    {
        await AdminIdAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var coinId = await CoinMitAuflageAsync(20);

            var antworten = await GleichzeitigAsync(Enumerable.Range(0, 10)
                .Select(_ => (Func<Task<HttpResponseMessage>>)(() => PostAusgabeAsync(coinId, GueltigeAusgabe(7))))
                .ToArray());

            var codes = new List<string?>();
            foreach (var a in antworten.Where(a => a.StatusCode == HttpStatusCode.Conflict))
            {
                codes.Add(await CodeAsync(a));
            }

            Assert.Equal(Enumerable.Repeat<string?>("exemplar_ausgegeben", 9), codes);
            foreach (var a in antworten)
            {
                a.Dispose();
            }
        }
    }

    [Fact]
    public async Task Nach_zehn_parallelen_Ausgaben_gibt_es_genau_eine_aktive_Ausgabe_und_einen_Audit_Eintrag()
    {
        await AdminIdAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var coinId = await CoinMitAuflageAsync(20);

            var antworten = await GleichzeitigAsync(Enumerable.Range(0, 10)
                .Select(_ => (Func<Task<HttpResponseMessage>>)(() => PostAusgabeAsync(coinId, GueltigeAusgabe(7))))
                .ToArray());
            foreach (var a in antworten)
            {
                a.Dispose();
            }

            var aktiv = (await AusgabeDb.AusgabenAsync()).Where(z => z.CoinId == coinId && z.StorniertAm is null).ToList();
            var audit = (await AusgabeDb.AuditAsync()).Where(z => z.CoinId == coinId && z.Art == "Erfasst").ToList();
            Assert.Single(aktiv);
            Assert.Single(audit);
        }
    }

    // ---------- AK-9: K parallele „nächste freie“ ----------

    [Fact]
    public async Task Parallele_naechste_freie_vergeben_verschiedene_kleinste_freie_Nummern()
    {
        await AdminIdAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var coinId = await CoinMitAuflageAsync(20);
            await ErfasseAsync(coinId, 2);
            await ErfasseAsync(coinId, 4);

            var antworten = await GleichzeitigAsync(Enumerable.Range(0, 6)
                .Select(_ => (Func<Task<HttpResponseMessage>>)(() => PostAusgabeAsync(coinId, GueltigeAusgabe())))
                .ToArray());

            var nummern = new List<int>();
            foreach (var a in antworten)
            {
                Assert.Equal(HttpStatusCode.Created, a.StatusCode);
                nummern.Add((await JsonAsync(a)).GetProperty("exemplarNummer").GetInt32());
                a.Dispose();
            }

            Assert.Equal([1, 3, 5, 6, 7, 8], nummern.Order());
        }
    }

    [Fact]
    public async Task Mehr_parallele_naechste_freie_als_frei_ergeben_kein_exemplar_frei_fuer_den_Rest()
    {
        await AdminIdAsync();
        var coinId = await CoinMitAuflageAsync(3);

        var antworten = await GleichzeitigAsync(Enumerable.Range(0, 5)
            .Select(_ => (Func<Task<HttpResponseMessage>>)(() => PostAusgabeAsync(coinId, GueltigeAusgabe())))
            .ToArray());

        var ergebnisse = new List<string>();
        foreach (var a in antworten)
        {
            ergebnisse.Add(a.StatusCode == HttpStatusCode.Created ? "201" : $"{(int)a.StatusCode} {await CodeAsync(a)}");
            a.Dispose();
        }

        Assert.Equal(["201", "201", "201", "409 kein_exemplar_frei", "409 kein_exemplar_frei"], ergebnisse.Order(StringComparer.Ordinal));
    }

    // ---------- AK-12: zwei parallele Stornos ----------

    [Fact]
    public async Task Zwei_parallele_Stornos_ergeben_genau_einen_200_und_einen_409()
    {
        await AdminIdAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var coinId = await CoinMitAuflageAsync(5);
            var ausgabeId = (await ErfasseAsync(coinId)).GetProperty("id").GetGuid();

            var antworten = await GleichzeitigAsync(
                () => PostStornoAsync(Client, coinId, ausgabeId, "Grund A"),
                () => PostStornoAsync(Client, coinId, ausgabeId, "Grund B"));

            var ergebnisse = new List<string>();
            foreach (var a in antworten)
            {
                ergebnisse.Add(a.StatusCode == HttpStatusCode.OK ? "200" : $"{(int)a.StatusCode} {await CodeAsync(a)}");
                a.Dispose();
            }

            Assert.Equal(["200", "409 bereits_storniert"], ergebnisse.Order(StringComparer.Ordinal));
        }
    }

    [Fact]
    public async Task Zwei_parallele_Stornos_schreiben_genau_einen_Audit_Eintrag_Storniert()
    {
        await AdminIdAsync();
        var coinId = await CoinMitAuflageAsync(5);
        var ausgabeId = (await ErfasseAsync(coinId)).GetProperty("id").GetGuid();

        var antworten = await GleichzeitigAsync(
            () => PostStornoAsync(Client, coinId, ausgabeId, "Grund A"),
            () => PostStornoAsync(Client, coinId, ausgabeId, "Grund B"));
        foreach (var a in antworten)
        {
            a.Dispose();
        }

        Assert.Single(await AusgabeDb.AuditAsync(), z => z.Art == "Storniert");
    }

    // ---------- AK-17: parallel Senkung auf 5 und Ausgabe Nr. 6 ----------

    [Fact]
    public async Task Parallele_Senkung_und_Ausgabe_ueber_der_neuen_Auflage_sind_nie_beide_erfolgreich()
    {
        await AdminIdAsync();
        for (var lauf = 0; lauf < Durchlaeufe * 2; lauf++)
        {
            var coinId = await CoinMitAuflageAsync(10);

            var antworten = await GleichzeitigAsync(
                () => PutAuflageAsync(Client, coinId, 5),
                () => PostAusgabeAsync(coinId, GueltigeAusgabe(6)));
            using var senkung = antworten[0];
            using var ausgabe = antworten[1];

            var ergebnis = $"Senkung {(int)senkung.StatusCode}, Ausgabe {(int)ausgabe.StatusCode}";
            Assert.True(
                ergebnis is "Senkung 409, Ausgabe 201" or "Senkung 200, Ausgabe 400",
                $"Unerwartete Kombination: {ergebnis}");
        }
    }

    [Fact]
    public async Task Nach_paralleler_Senkung_und_Ausgabe_ist_der_Zustand_konsistent()
    {
        await AdminIdAsync();
        for (var lauf = 0; lauf < Durchlaeufe; lauf++)
        {
            var coinId = await CoinMitAuflageAsync(10);

            var antworten = await GleichzeitigAsync(
                () => PutAuflageAsync(Client, coinId, 5),
                () => PostAusgabeAsync(coinId, GueltigeAusgabe(6)));
            foreach (var a in antworten)
            {
                a.Dispose();
            }

            var nummern = await AusgabeDb.ExemplarNummernAsync(coinId);
            var ausgaben = (await AusgabeDb.AusgabenAsync()).Where(z => z.CoinId == coinId).ToList();
            Assert.True(
                (nummern.Count == 10 && ausgaben.Count == 1) || (nummern.Count == 5 && ausgaben.Count == 0),
                $"Exemplare {nummern.Count}, Ausgaben {ausgaben.Count}");
        }
    }

    // ---------- AK-10: Sperre der Coin-Zeile ----------

    /// <summary>Hält <c>FOR UPDATE</c> auf der Coin-Zeile, bis das Ergebnis entsorgt wird.</summary>
    private async Task<(NpgsqlConnection Verbindung, NpgsqlTransaction Transaktion)> SperreCoinAsync(Guid coinId)
    {
        var verbindung = new NpgsqlConnection(Fixture.ConnectionString);
        await verbindung.OpenAsync();
        var transaktion = await verbindung.BeginTransactionAsync();
        await using var befehl = new NpgsqlCommand("SELECT id FROM coin_typ WHERE id = @id FOR UPDATE", verbindung, transaktion);
        befehl.Parameters.AddWithValue("id", coinId);
        await befehl.ExecuteNonQueryAsync();
        return (verbindung, transaktion);
    }

    public static TheoryData<string> GesperrteAktionen => ["Erfassen", "Stornieren", "Auflage"];

    [Theory]
    [MemberData(nameof(GesperrteAktionen))]
    public async Task Aktion_wartet_auf_die_Sperre_der_Coin_Zeile(string aktion)
    {
        var coinId = await CoinMitAuflageAsync(10);
        var ausgabeId = (await ErfasseAsync(coinId, 1)).GetProperty("id").GetGuid();
        var (verbindung, transaktion) = await SperreCoinAsync(coinId);

        Task<HttpResponseMessage> anfrage = aktion switch
        {
            "Erfassen" => PostAusgabeAsync(coinId, GueltigeAusgabe()),
            "Stornieren" => PostStornoAsync(Client, coinId, ausgabeId, "Grund"),
            _ => PutAuflageAsync(Client, coinId, 12),
        };
        var fertigWaehrendSperre = await Task.WhenAny(anfrage, Task.Delay(TimeSpan.FromSeconds(2))) == anfrage;
        await transaktion.CommitAsync();
        await verbindung.DisposeAsync();
        using var antwort = await anfrage;

        Assert.False(fertigWaehrendSperre, $"{aktion} lief trotz gesperrter Coin-Zeile durch ({(int)antwort.StatusCode}).");
        Assert.True(antwort.IsSuccessStatusCode, $"{aktion} nach Freigabe: {(int)antwort.StatusCode}");
    }

    [Fact]
    public async Task Die_Sperre_eines_Coins_blockiert_andere_Coins_nicht()
    {
        var gesperrt = await CoinMitAuflageAsync(10);
        var anderer = await CoinMitAuflageAsync(10);
        await AdminIdAsync();
        var (verbindung, transaktion) = await SperreCoinAsync(gesperrt);
        try
        {
            var anfrage = PostAusgabeAsync(anderer, GueltigeAusgabe());

            var fertig = await Task.WhenAny(anfrage, Task.Delay(TimeSpan.FromSeconds(10))) == anfrage;

            Assert.True(fertig, "Ausgabe für einen anderen Coin wartete auf die Sperre.");
            using var antwort = await anfrage;
            Assert.Equal(HttpStatusCode.Created, antwort.StatusCode);
        }
        finally
        {
            await transaktion.RollbackAsync();
            await verbindung.DisposeAsync();
        }
    }
}
