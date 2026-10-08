using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Coin.IntegrationTests.Infrastruktur;

namespace Coin.IntegrationTests.Coins;

/// <summary>
/// Feature katalog-seiten, AK-1 bis AK-5: <c>GET /api/coins?suche=&amp;seite=1&amp;groesse=25</c> bleibt öffentlich und
/// liefert <c>{ eintraege, gesamt, seite, groesse }</c>. Suche als Teilstring in Name oder Herausgeber ohne Beachtung
/// der Groß-/Kleinschreibung (<c>%</c>, <c>_</c>, <c>\</c> wörtlich), Sortierung nach Name (case-insensitiv), dann id,
/// Validierung wie bei <c>/api/benutzer</c>. Die Antwort hängt nicht vom Token ab.
/// </summary>
public class CoinSucheTests(PostgresFixture fixture) : IntegrationTestBasis(fixture)
{
    private static readonly Regex Englisch = new(@"\b(The|is|must|field|value|valid|required|between|range|invalid)\b", RegexOptions.IgnoreCase);

    private async Task<JsonElement> ListeAsync(string query = "", HttpClient? client = null)
    {
        using var antwort = await (client ?? Anonym).GetAsync($"{CoinsUrl}{query}");
        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        return await JsonAsync(antwort);
    }

    private static string[] Namen(JsonElement seite) =>
        seite.GetProperty("eintraege").EnumerateArray().Select(e => e.GetProperty("name").GetString()!).ToArray();

    private static Guid[] Ids(JsonElement seite) =>
        seite.GetProperty("eintraege").EnumerateArray().Select(e => e.GetProperty("id").GetGuid()).ToArray();

    private static string Url(string suche) => $"?suche={Uri.EscapeDataString(suche)}";

    private static async Task<string[]> FehlermeldungenAsync(HttpResponseMessage antwort, string feld)
    {
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);
        return json.GetProperty("errors").GetProperty(feld).EnumerateArray().Select(m => m.GetString()!).ToArray();
    }

    // ---------- AK-1: Antwortform ----------

    [Fact]
    public async Task Liste_liefert_ein_Objekt_statt_eines_Arrays()
    {
        await LegeCoinAnAsync();

        var json = await ListeAsync();

        Assert.Equal(JsonValueKind.Object, json.ValueKind);
    }

    [Fact]
    public async Task Liste_hat_genau_die_Felder_eintraege_gesamt_seite_groesse()
    {
        await LegeCoinAnAsync();

        var felder = (await ListeAsync()).EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray();

        Assert.Equal(["eintraege", "gesamt", "groesse", "seite"], felder);
    }

    [Fact]
    public async Task Eintrag_hat_weiterhin_genau_die_sieben_Coin_Felder()
    {
        await LegeCoinAnAsync();

        var eintrag = (await ListeAsync()).GetProperty("eintraege").EnumerateArray().Single();

        Assert.Equal(
            ["auflage", "beschreibung", "bildUrl", "erstelltAm", "herausgeber", "id", "name"],
            eintrag.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray());
    }

    [Fact]
    public async Task Eintrag_enthaelt_die_Werte_des_Coins()
    {
        var angelegt = await LegeCoinAnAsync("Coin Werte", "Herausgeber Werte", 250, "Ein Text");

        var eintrag = (await ListeAsync()).GetProperty("eintraege").EnumerateArray().Single();

        Assert.Equal(angelegt.GetProperty("id").GetGuid(), eintrag.GetProperty("id").GetGuid());
        Assert.Equal("Coin Werte", eintrag.GetProperty("name").GetString());
        Assert.Equal("Herausgeber Werte", eintrag.GetProperty("herausgeber").GetString());
        Assert.Equal(250, eintrag.GetProperty("auflage").GetInt32());
        Assert.Equal("Ein Text", eintrag.GetProperty("beschreibung").GetString());
    }

    [Fact]
    public async Task Ohne_Parameter_gelten_seite_1_und_groesse_25()
    {
        var json = await ListeAsync();

        Assert.Equal(1, json.GetProperty("seite").GetInt32());
        Assert.Equal(25, json.GetProperty("groesse").GetInt32());
    }

    [Fact]
    public async Task Ohne_Parameter_liefert_die_erste_Seite_hoechstens_25_Eintraege()
    {
        for (var i = 1; i <= 26; i++)
        {
            await LegeCoinAnAsync($"Coin Menge {i:00}");
        }

        var json = await ListeAsync();

        Assert.Equal(25, Namen(json).Length);
        Assert.Equal(26, json.GetProperty("gesamt").GetInt32());
    }

    [Fact]
    public async Task Liste_mit_Parametern_ist_ohne_Token_abrufbar()
    {
        using var antwort = await Anonym.GetAsync($"{CoinsUrl}?suche=Alpha&seite=1&groesse=10");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Groesse_begrenzt_die_Zahl_der_Eintraege_und_gesamt_zaehlt_alle()
    {
        await LegeCoinAnAsync("Coin A");
        await LegeCoinAnAsync("Coin B");
        await LegeCoinAnAsync("Coin C");

        var json = await ListeAsync("?groesse=2");

        Assert.Equal(["Coin A", "Coin B"], Namen(json));
        Assert.Equal(3, json.GetProperty("gesamt").GetInt32());
        Assert.Equal(2, json.GetProperty("groesse").GetInt32());
    }

    // ---------- AK-2: Suche ----------

    [Fact]
    public async Task Leere_Suche_liefert_alle_Coins()
    {
        await LegeCoinAnAsync("Coin Alpha");
        await LegeCoinAnAsync("Coin Beta");

        Assert.Equal(["Coin Alpha", "Coin Beta"], Namen(await ListeAsync("?suche=")));
    }

    [Fact]
    public async Task Suche_aus_Leerzeichen_liefert_alle_Coins()
    {
        await LegeCoinAnAsync("Coin Alpha");
        await LegeCoinAnAsync("Coin Beta");

        Assert.Equal(["Coin Alpha", "Coin Beta"], Namen(await ListeAsync(Url("   "))));
    }

    [Fact]
    public async Task Suche_findet_Teilstrings_im_Namen_ohne_Beachtung_der_Gross_Kleinschreibung()
    {
        await LegeCoinAnAsync("Jubiläum Panzerbataillon", "Herausgeber Eins");
        await LegeCoinAnAsync("Coin Andere", "Herausgeber Zwei");

        Assert.Equal(["Jubiläum Panzerbataillon"], Namen(await ListeAsync(Url("PANZERbat"))));
    }

    [Fact]
    public async Task Suche_findet_Teilstrings_im_Herausgeber_ohne_Beachtung_der_Gross_Kleinschreibung()
    {
        await LegeCoinAnAsync("Coin Eins", "Sanitätsregiment Test");
        await LegeCoinAnAsync("Coin Zwei", "Herausgeber Anders");

        Assert.Equal(["Coin Eins"], Namen(await ListeAsync(Url("sanitätsREGIMENT"))));
    }

    [Fact]
    public async Task Suche_findet_Treffer_in_Name_oder_Herausgeber()
    {
        await LegeCoinAnAsync("Marine Coin", "Herausgeber Eins");
        await LegeCoinAnAsync("Coin Zwei", "Marinekommando Test");
        await LegeCoinAnAsync("Coin Drei", "Herausgeber Drei");

        Assert.Equal(["Coin Zwei", "Marine Coin"], Namen(await ListeAsync(Url("marine"))));
    }

    [Fact]
    public async Task Suche_durchsucht_die_Beschreibung_nicht()
    {
        await LegeCoinAnAsync("Coin Eins", "Herausgeber Eins", beschreibung: "Enthält das Wort Wüstenfuchs");

        Assert.Empty(Namen(await ListeAsync(Url("Wüstenfuchs"))));
    }

    [Fact]
    public async Task Suche_wird_getrimmt()
    {
        await LegeCoinAnAsync("Coin Alpha");
        await LegeCoinAnAsync("Coin Beta");

        Assert.Equal(["Coin Alpha"], Namen(await ListeAsync(Url("  Alpha  "))));
    }

    [Fact]
    public async Task Suche_ohne_Treffer_liefert_eine_leere_Liste_mit_gesamt_0()
    {
        await LegeCoinAnAsync("Coin Alpha");

        var json = await ListeAsync(Url("Gibtesnicht"));

        Assert.Empty(Namen(json));
        Assert.Equal(0, json.GetProperty("gesamt").GetInt32());
    }

    [Fact]
    public async Task Gesamt_zaehlt_nur_die_Treffer_der_Suche()
    {
        await LegeCoinAnAsync("Treffer Eins");
        await LegeCoinAnAsync("Treffer Zwei");
        await LegeCoinAnAsync("Coin Anders");

        Assert.Equal(2, (await ListeAsync(Url("treffer"))).GetProperty("gesamt").GetInt32());
    }

    [Fact]
    public async Task Prozentzeichen_in_der_Suche_gilt_woertlich()
    {
        await LegeCoinAnAsync("Coin 100% Silber");
        await LegeCoinAnAsync("Coin 1000 Silber");

        Assert.Equal(["Coin 100% Silber"], Namen(await ListeAsync(Url("100%"))));
    }

    [Fact]
    public async Task Prozentzeichen_allein_findet_nicht_alle_Coins()
    {
        await LegeCoinAnAsync("Coin Ohne Sonderzeichen");

        Assert.Empty(Namen(await ListeAsync(Url("%"))));
    }

    [Fact]
    public async Task Unterstrich_in_der_Suche_gilt_woertlich()
    {
        await LegeCoinAnAsync("Coin a_b");
        await LegeCoinAnAsync("Coin axb");

        Assert.Equal(["Coin a_b"], Namen(await ListeAsync(Url("a_b"))));
    }

    [Fact]
    public async Task Backslash_in_der_Suche_gilt_woertlich()
    {
        await LegeCoinAnAsync(@"Coin Pfad\Name");
        await LegeCoinAnAsync("Coin PfadName");

        Assert.Equal([@"Coin Pfad\Name"], Namen(await ListeAsync(Url(@"d\N"))));
    }

    [Fact]
    public async Task Backslash_vor_Prozent_gilt_woertlich()
    {
        await LegeCoinAnAsync(@"Coin x\%y");
        await LegeCoinAnAsync("Coin x%y");

        Assert.Equal([@"Coin x\%y"], Namen(await ListeAsync(Url(@"\%"))));
    }

    [Fact]
    public async Task Suche_mit_SQL_Sonderzeichen_liefert_200_und_laesst_den_Katalog_unveraendert()
    {
        await LegeCoinAnAsync("Coin Alpha");

        using var antwort = await Anonym.GetAsync($"{CoinsUrl}{Url("'; DROP TABLE coin_typ; --")}");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
        Assert.Single(await LadeListeAsync());
    }

    // ---------- AK-3: Sortierung ----------

    [Fact]
    public async Task Sortierung_nach_Name_ohne_Beachtung_der_Gross_Kleinschreibung()
    {
        await LegeCoinAnAsync("sort beta");
        await LegeCoinAnAsync("Sort Alpha");
        await LegeCoinAnAsync("SORT gamma");

        Assert.Equal(["Sort Alpha", "sort beta", "SORT gamma"], Namen(await ListeAsync(Url("sort "))));
    }

    [Fact]
    public async Task Bei_gleichem_Namen_wird_nach_id_sortiert()
    {
        var ids = new List<Guid>();
        foreach (var herausgeber in new[] { "Herausgeber C", "Herausgeber A", "Herausgeber B" })
        {
            ids.Add(await LegeCoinAnUndLiefereIdAsync("Coin Gleich", herausgeber));
        }

        Assert.Equal(ids.Order(), Ids(await ListeAsync(Url("Coin Gleich"))));
    }

    [Fact]
    public async Task Reihenfolge_bei_gleichen_Namen_ist_ueber_Seiten_hinweg_stabil()
    {
        var ids = new List<Guid>();
        for (var i = 0; i < 5; i++)
        {
            ids.Add(await LegeCoinAnUndLiefereIdAsync("Coin Gleich", $"Herausgeber {i}"));
        }

        var geblaettert = new List<Guid>();
        for (var seite = 1; seite <= 3; seite++)
        {
            geblaettert.AddRange(Ids(await ListeAsync($"?seite={seite}&groesse=2")));
        }

        Assert.Equal(ids.Order(), geblaettert);
    }

    // ---------- AK-4: Paging ----------

    [Fact]
    public async Task Seite_2_mit_Groesse_2_liefert_den_dritten_und_vierten_Eintrag()
    {
        foreach (var name in new[] { "Seite A", "Seite B", "Seite C", "Seite D", "Seite E" })
        {
            await LegeCoinAnAsync(name);
        }

        var json = await ListeAsync($"{Url("Seite ")}&seite=2&groesse=2");

        Assert.Equal(["Seite C", "Seite D"], Namen(json));
        Assert.Equal(5, json.GetProperty("gesamt").GetInt32());
        Assert.Equal(2, json.GetProperty("seite").GetInt32());
        Assert.Equal(2, json.GetProperty("groesse").GetInt32());
    }

    [Fact]
    public async Task Seite_hinter_dem_Ende_liefert_eine_leere_Liste_mit_korrektem_gesamt()
    {
        await LegeCoinAnAsync("Coin Einzig");

        var json = await ListeAsync("?seite=9&groesse=25");

        Assert.Empty(Namen(json));
        Assert.Equal(1, json.GetProperty("gesamt").GetInt32());
        Assert.Equal(9, json.GetProperty("seite").GetInt32());
    }

    [Theory]
    [InlineData("?groesse=1")]
    [InlineData("?groesse=100")]
    [InlineData("?seite=1")]
    public async Task Grenzwerte_im_gueltigen_Bereich_liefern_200(string query)
    {
        using var antwort = await Anonym.GetAsync($"{CoinsUrl}{query}");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Suche_mit_genau_100_Zeichen_liefert_200()
    {
        using var antwort = await Anonym.GetAsync($"{CoinsUrl}{Url(new string('x', 100))}");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Fact]
    public async Task Suche_mit_100_Zeichen_und_umgebenden_Leerzeichen_liefert_200()
    {
        using var antwort = await Anonym.GetAsync($"{CoinsUrl}{Url($"  {new string('x', 100)}  ")}");

        Assert.Equal(HttpStatusCode.OK, antwort.StatusCode);
    }

    [Theory]
    [InlineData("?seite=0")]
    [InlineData("?seite=-1")]
    public async Task Seite_kleiner_1_liefert_400_mit_der_Meldung_an_seite(string query)
    {
        using var antwort = await Anonym.GetAsync($"{CoinsUrl}{query}");

        Assert.Equal(["Die Seite muss mindestens 1 sein."], await FehlermeldungenAsync(antwort, "seite"));
    }

    [Theory]
    [InlineData("?groesse=0")]
    [InlineData("?groesse=101")]
    public async Task Groesse_ausserhalb_1_bis_100_liefert_400_mit_der_Meldung_an_groesse(string query)
    {
        using var antwort = await Anonym.GetAsync($"{CoinsUrl}{query}");

        Assert.Equal(["Die Seitengröße muss zwischen 1 und 100 liegen."], await FehlermeldungenAsync(antwort, "groesse"));
    }

    [Fact]
    public async Task Suche_mit_101_Zeichen_liefert_400_mit_der_Meldung_an_suche()
    {
        using var antwort = await Anonym.GetAsync($"{CoinsUrl}{Url(new string('x', 101))}");

        Assert.Equal(["Der Suchbegriff darf höchstens 100 Zeichen lang sein."], await FehlermeldungenAsync(antwort, "suche"));
    }

    [Theory]
    [InlineData("?seite=abc", "seite")]
    [InlineData("?groesse=abc", "groesse")]
    [InlineData("?seite=1.5", "seite")]
    public async Task Keine_Zahl_liefert_400_mit_Ungueltiger_Wert_am_Feld(string query, string feld)
    {
        using var antwort = await Anonym.GetAsync($"{CoinsUrl}{query}");

        Assert.Equal(["Ungültiger Wert für dieses Feld."], await FehlermeldungenAsync(antwort, feld));
    }

    [Theory]
    [InlineData("?seite=0")]
    [InlineData("?groesse=101")]
    [InlineData("?seite=abc")]
    public async Task Validierungsfehler_haben_den_Titel_Eingaben_ungueltig(string query)
    {
        using var antwort = await Anonym.GetAsync($"{CoinsUrl}{query}");
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);

        Assert.Equal("Eingaben ungültig", json.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Mehrere_Fehler_werden_gemeinsam_gemeldet()
    {
        using var antwort = await Anonym.GetAsync($"{CoinsUrl}{Url(new string('x', 101))}&seite=0&groesse=101");

        Assert.Equal(["groesse", "seite", "suche"], await AssertValidierungsfehlerAsync(antwort));
    }

    [Theory]
    [InlineData("?seite=0")]
    [InlineData("?groesse=101")]
    [InlineData("SUCHE_101")]
    public async Task Validierungsmeldungen_sind_deutsch(string query)
    {
        var url = query == "SUCHE_101" ? Url(new string('x', 101)) : query;
        using var antwort = await Anonym.GetAsync($"{CoinsUrl}{url}");
        var json = await AssertProblemDetailsAsync(antwort, HttpStatusCode.BadRequest);

        var meldungen = json.GetProperty("errors").EnumerateObject()
            .SelectMany(p => p.Value.EnumerateArray().Select(m => m.GetString() ?? string.Empty))
            .ToList();
        Assert.NotEmpty(meldungen);
        Assert.All(meldungen, m => Assert.DoesNotMatch(Englisch, m));
    }

    // ---------- AK-5: unabhängig vom Token, kein Benutzerabgleich ----------

    private const string SuchAnfrage = "?suche=coin&seite=1&groesse=2";

    private async Task<(HttpStatusCode Status, string Body)> AbrufAsync(HttpClient client, string query)
    {
        using var antwort = await client.GetAsync($"{CoinsUrl}{query}");
        return (antwort.StatusCode, await antwort.Content.ReadAsStringAsync());
    }

    private async Task KatalogMitDreiCoinsAsync()
    {
        await LegeCoinAnAsync("Coin Alpha");
        await LegeCoinAnAsync("Coin Beta");
        await LegeCoinAnAsync("Coin Gamma");
    }

    [Fact]
    public async Task Suche_mit_ungueltigem_Token_ist_identisch_zur_anonymen_Antwort()
    {
        await KatalogMitDreiCoinsAsync();
        var anonym = await AbrufAsync(Anonym, SuchAnfrage);

        var mitToken = await AbrufAsync(ClientMitToken(Idp.ErzeugeToken(new TokenDaten { Audience = "fremde-api" })), SuchAnfrage);

        Assert.Equal(HttpStatusCode.OK, anonym.Status);
        Assert.Equal(anonym, mitToken);
    }

    [Fact]
    public async Task Suche_mit_dem_Token_eines_Deaktivierten_ist_identisch_zur_anonymen_Antwort()
    {
        await KatalogMitDreiCoinsAsync();
        var deaktiviert = await ClientMitRolleAsync("Betrachter", aktiv: false);
        var anonym = await AbrufAsync(Anonym, SuchAnfrage);

        var mitToken = await AbrufAsync(deaktiviert, SuchAnfrage);

        Assert.Equal(HttpStatusCode.OK, anonym.Status);
        Assert.Equal(anonym, mitToken);
    }

    [Fact]
    public async Task Suche_mit_gueltigem_Token_ist_identisch_zur_anonymen_Antwort()
    {
        await KatalogMitDreiCoinsAsync();
        var anonym = await AbrufAsync(Anonym, SuchAnfrage);

        var mitToken = await AbrufAsync(Client, SuchAnfrage);

        Assert.Equal(anonym, mitToken);
    }

    [Fact]
    public async Task Validierungsfehler_ist_mit_ungueltigem_Token_identisch_zur_anonymen_Antwort()
    {
        var anonym = await AbrufAsync(Anonym, "?seite=0");

        var mitToken = await AbrufAsync(ClientMitToken("kein-jwt"), "?seite=0");

        Assert.Equal(HttpStatusCode.BadRequest, anonym.Status);
        Assert.Equal(anonym.Status, mitToken.Status);
    }

    [Fact]
    public async Task Suche_mit_gueltigem_Token_legt_keinen_Benutzer_an()
    {
        var client = ClientMit(new TokenDaten { Subject = "sub-nur-suchend" });

        using (await client.GetAsync($"{CoinsUrl}{SuchAnfrage}"))
        {
        }

        Assert.DoesNotContain(await BenutzerDb.AlleAsync(), z => z.Subject == "sub-nur-suchend");
    }
}
