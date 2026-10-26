using System.Text.Json;
using Coin.Domain.Startseite;

namespace Coin.Api.Contracts;

/// <summary>Logo in öffentlichen Antworten (Abschnitt 5.2, 5.2a): URL mit Version, Alternativtext, Maße. Kein Hochladender.</summary>
public sealed record StartseiteLogoResponse(string Url, string Alternativtext, int Breite, int Hoehe)
{
    public static StartseiteLogoResponse? Aus(LogoPlatz platz, StartseiteLogo? logo) =>
        logo is null ? null : new StartseiteLogoResponse(LogoUrl(platz, logo), logo.Alternativtext, logo.Breite, logo.Hoehe);

    public static string LogoUrl(LogoPlatz platz, StartseiteLogo logo) => $"/api/startseite/logos/{platz.Name()}?v={logo.Version}";

    public override string ToString() => nameof(StartseiteLogoResponse);
}

/// <summary>Logo in der Konfigurationsantwort (Abschnitt 5.3) mit Format und Größe.</summary>
public sealed record StartseiteLogoDetailsResponse(string Url, string Alternativtext, string Format, int Breite, int Hoehe, int GroesseBytes)
{
    public static StartseiteLogoDetailsResponse? Aus(LogoPlatz platz, StartseiteLogo? logo) =>
        logo is null
            ? null
            : new StartseiteLogoDetailsResponse(
                StartseiteLogoResponse.LogoUrl(platz, logo), logo.Alternativtext, logo.Format.Name(), logo.Breite, logo.Hoehe, logo.GroesseBytes);

    public override string ToString() => nameof(StartseiteLogoDetailsResponse);
}

/// <summary><c>GET /api/startseite/kopf</c> bei aktivem Kopfbereich (5.2a).</summary>
public sealed record KopfAktivResponse(
    bool Aktiv,
    int Position,
    string Titel,
    string Untertitel,
    StartseiteLogoResponse? LogoBereitsteller,
    StartseiteLogoResponse? LogoSoftware)
{
    public override string ToString() => nameof(KopfAktivResponse);
}

/// <summary><c>GET /api/startseite/kopf</c> bei ausgeschaltetem Kopfbereich: weder Texte noch Logos (5.2a).</summary>
public sealed record KopfInaktivResponse(bool Aktiv, int Position);

public static class KopfResponse
{
    /// <summary>Öffentliche Antwort; unabhängig vom Token (ADR-0032 Punkt 1).</summary>
    public static object Aus(KopfAnsicht kopf)
    {
        ArgumentNullException.ThrowIfNull(kopf);
        return kopf.Aktiv
            ? new KopfAktivResponse(
                true,
                kopf.Position,
                kopf.Titel ?? string.Empty,
                kopf.Untertitel ?? string.Empty,
                StartseiteLogoResponse.Aus(LogoPlatz.Bereitsteller, kopf.LogoBereitsteller),
                StartseiteLogoResponse.Aus(LogoPlatz.Software, kopf.LogoSoftware))
            : new KopfInaktivResponse(false, kopf.Position);
    }
}

/// <summary>Kennzahlen ohne Blockart (Vorschaudaten, 5.3).</summary>
public sealed record StartseiteKennzahlenResponse(int Coins, long Exemplare, int Ausgegeben, long Verfuegbar)
{
    public static StartseiteKennzahlenResponse Aus(StartseiteKennzahlen k) => new(k.Coins, k.Exemplare, k.Ausgegeben, k.Verfuegbar);
}

/// <summary>Eintrag „Neueste Coins“ (AK-4); <c>bildUrl</c> wie im Katalog.</summary>
public sealed record NeuerCoinResponse(Guid Id, string Name, string Herausgeber, string? BildUrl)
{
    public static NeuerCoinResponse Aus(NeuerCoin c) => new(
        c.Id,
        c.Name,
        c.Herausgeber,
        c.BildSha256 is { Length: >= CoinResponse.VersionsLaenge } sha ? $"/api/coins/{c.Id}/bild?v={sha[..CoinResponse.VersionsLaenge]}" : null);
}

/// <summary>Eintrag „Meistausgegebene Coins“ (AK-5): nur Coin-Angaben und Anzahl aktiver Ausgaben.</summary>
public sealed record AusgegebenerCoinResponse(Guid Id, string Name, string Herausgeber, int Ausgegeben)
{
    public static AusgegebenerCoinResponse Aus(AusgegebenerCoin c) => new(c.Id, c.Name, c.Herausgeber, c.Ausgegeben);
}

public sealed record KopfBlockResponse(
    string Art,
    string Titel,
    string Untertitel,
    StartseiteLogoResponse? LogoBereitsteller,
    StartseiteLogoResponse? LogoSoftware);

public sealed record InfotextBlockResponse(string Art, string Text)
{
    public override string ToString() => nameof(InfotextBlockResponse);
}

public sealed record KennzahlenBlockResponse(string Art, int Coins, long Exemplare, int Ausgegeben, long Verfuegbar);

public sealed record NeuesteBlockResponse(string Art, IReadOnlyList<NeuerCoinResponse> Eintraege);

public sealed record MeistausgegebenBlockResponse(string Art, IReadOnlyList<AusgegebenerCoinResponse> Eintraege);

/// <summary><c>GET /api/startseite</c> (5.2): nur aktive Blöcke in gespeicherter Reihenfolge.</summary>
public sealed record StartseiteResponse(IReadOnlyList<object> Bloecke)
{
    public static StartseiteResponse Aus(StartseiteDaten daten)
    {
        ArgumentNullException.ThrowIfNull(daten);
        var k = daten.Konfiguration;
        var bloecke = new List<object>();
        foreach (var art in k.AktiveBloecke())
        {
            object? block = art switch
            {
                BlockArt.Kopf => new KopfBlockResponse(
                    art.Name(),
                    k.Titel,
                    k.Untertitel,
                    StartseiteLogoResponse.Aus(LogoPlatz.Bereitsteller, k.LogoBereitsteller),
                    StartseiteLogoResponse.Aus(LogoPlatz.Software, k.LogoSoftware)),
                BlockArt.Infotext => new InfotextBlockResponse(art.Name(), k.Infotext),
                BlockArt.Kennzahlen when daten.Kennzahlen is { } z => new KennzahlenBlockResponse(
                    art.Name(), z.Coins, z.Exemplare, z.Ausgegeben, z.Verfuegbar),
                BlockArt.Neueste when daten.Neueste is { } n => new NeuesteBlockResponse(art.Name(), [.. n.Select(NeuerCoinResponse.Aus)]),
                BlockArt.Meistausgegeben when daten.Meistausgegebene is { } m =>
                    new MeistausgegebenBlockResponse(art.Name(), [.. m.Select(AusgegebenerCoinResponse.Aus)]),
                _ => null,
            };
            if (block is not null)
            {
                bloecke.Add(block);
            }
        }

        return new StartseiteResponse(bloecke);
    }

    public override string ToString() => nameof(StartseiteResponse);
}

public sealed record KopfKonfigurationResponse(
    bool Aktiv,
    string Titel,
    string Untertitel,
    StartseiteLogoDetailsResponse? LogoBereitsteller,
    StartseiteLogoDetailsResponse? LogoSoftware);

public sealed record InfotextKonfigurationResponse(bool Aktiv, string Text);

public sealed record SchalterResponse(bool Aktiv);

public sealed record AnzahlKonfigurationResponse(bool Aktiv, int Anzahl);

public sealed record VorschauDatenResponse(
    StartseiteKennzahlenResponse Kennzahlen,
    IReadOnlyList<NeuerCoinResponse> Neueste,
    IReadOnlyList<AusgegebenerCoinResponse> Meistausgegeben);

/// <summary>
/// <c>GET</c>/<c>PUT /api/startseite/konfiguration</c> (5.3). <see cref="GeaendertVon"/> ist der Anzeigename des
/// Speichernden, nur mit <c>startpage.manage</c> (S11).
/// </summary>
public sealed record KonfigurationResponse(
    int Version,
    bool Standard,
    DateTimeOffset? GeaendertAm,
    string? GeaendertVon,
    IReadOnlyList<string> Reihenfolge,
    KopfKonfigurationResponse Kopf,
    InfotextKonfigurationResponse Infotext,
    SchalterResponse Kennzahlen,
    AnzahlKonfigurationResponse Neueste,
    AnzahlKonfigurationResponse Meistausgegeben,
    VorschauDatenResponse Daten)
{
    public static KonfigurationResponse Aus(StartseiteKonfigurationsDaten daten)
    {
        ArgumentNullException.ThrowIfNull(daten);
        var stand = daten.Stand;
        var k = stand.Konfiguration;
        return new KonfigurationResponse(
            stand.Version,
            stand.IstStandard,
            stand.GeaendertAm,
            stand.GeaendertVon,
            [.. k.Reihenfolge.Select(b => b.Name())],
            new KopfKonfigurationResponse(
                k.KopfAktiv,
                k.Titel,
                k.Untertitel,
                StartseiteLogoDetailsResponse.Aus(LogoPlatz.Bereitsteller, k.LogoBereitsteller),
                StartseiteLogoDetailsResponse.Aus(LogoPlatz.Software, k.LogoSoftware)),
            new InfotextKonfigurationResponse(k.InfotextAktiv, k.Infotext),
            new SchalterResponse(k.KennzahlenAktiv),
            new AnzahlKonfigurationResponse(k.NeuesteAktiv, k.NeuesteAnzahl),
            new AnzahlKonfigurationResponse(k.MeistausgegebeneAktiv, k.MeistausgegebeneAnzahl),
            new VorschauDatenResponse(
                StartseiteKennzahlenResponse.Aus(daten.Kennzahlen),
                [.. daten.Neueste.Select(NeuerCoinResponse.Aus)],
                [.. daten.Meistausgegebene.Select(AusgegebenerCoinResponse.Aus)]));
    }

    public override string ToString() => nameof(KonfigurationResponse);
}

/// <summary>
/// Liest den Teil <c>konfiguration</c> von <c>PUT /api/startseite/konfiguration</c> (Abschnitt 5.4). Fehlende Felder und
/// falsche JSON-Typen ergeben „Ungültiger Wert für dieses Feld.“ unter dem Feldpfad; unbekannte Felder werden ignoriert.
/// Die fachliche Prüfung macht die Domain. Weder Inhalte noch Parserdetails gelangen in Meldungen oder Logs.
/// </summary>
public static class KonfigurationsLeser
{
    public const string MeldungUngueltig = "Ungültiger Wert für dieses Feld.";
    public const string MeldungReihenfolge = "Die Reihenfolge muss jeden Block genau einmal enthalten.";

    /// <summary>Höchste Verschachtelungstiefe des JSON-Teils.</summary>
    private const int MaxTiefe = 16;

    /// <summary>
    /// <c>null</c>, wenn der Teil kein gültiges JSON-Objekt ist; sonst die Anfrage samt Lesefehlern (fehlende Werte durch
    /// die Standardkonfiguration ersetzt, damit alle übrigen Befunde gemeinsam gemeldet werden).
    /// </summary>
    public static StartseiteSpeichernAnfrage? Lesen(byte[] json, byte[]? dateiBereitsteller, byte[]? dateiSoftware)
    {
        ArgumentNullException.ThrowIfNull(json);
        JsonDocument dokument;
        try
        {
            dokument = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = MaxTiefe });
        }
        catch (JsonException)
        {
            return null;
        }

        using (dokument)
        {
            if (dokument.RootElement.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var leser = new Leser();
            var wurzel = dokument.RootElement;
            var standard = StartseiteKonfiguration.Standard;

            var version = leser.Int(wurzel, "version", "version") ?? -1;
            var reihenfolge = leser.Reihenfolge(wurzel);

            var kopf = leser.Objekt(wurzel, "kopf", "kopf");
            var kopfAktiv = leser.Bool(kopf, "aktiv", "kopf.aktiv") ?? standard.KopfAktiv;
            var titel = leser.Text(kopf, "titel", "kopf.titel") ?? string.Empty;
            var untertitel = leser.Text(kopf, "untertitel", "kopf.untertitel") ?? string.Empty;
            var logoBereitsteller = leser.Logo(kopf, LogoPlatz.Bereitsteller);
            var logoSoftware = leser.Logo(kopf, LogoPlatz.Software);

            var infotext = leser.Objekt(wurzel, "infotext", "infotext");
            var infotextAktiv = leser.Bool(infotext, "aktiv", "infotext.aktiv") ?? false;
            var text = leser.Text(infotext, "text", "infotext.text") ?? string.Empty;

            var kennzahlen = leser.Objekt(wurzel, "kennzahlen", "kennzahlen");
            var kennzahlenAktiv = leser.Bool(kennzahlen, "aktiv", "kennzahlen.aktiv") ?? standard.KennzahlenAktiv;

            var neueste = leser.Objekt(wurzel, "neueste", "neueste");
            var neuesteAktiv = leser.Bool(neueste, "aktiv", "neueste.aktiv") ?? standard.NeuesteAktiv;
            var neuesteAnzahl = leser.Int(neueste, "anzahl", "neueste.anzahl") ?? standard.NeuesteAnzahl;

            var meist = leser.Objekt(wurzel, "meistausgegeben", "meistausgegeben");
            var meistAktiv = leser.Bool(meist, "aktiv", "meistausgegeben.aktiv") ?? standard.MeistausgegebeneAktiv;
            var meistAnzahl = leser.Int(meist, "anzahl", "meistausgegeben.anzahl") ?? standard.MeistausgegebeneAnzahl;

            var konfiguration = new StartseiteKonfiguration(
                reihenfolge,
                kopfAktiv,
                titel,
                untertitel,
                logoBereitsteller,
                logoSoftware,
                infotextAktiv,
                text,
                kennzahlenAktiv,
                neuesteAktiv,
                neuesteAnzahl,
                meistAktiv,
                meistAnzahl);
            return new StartseiteSpeichernAnfrage(version, konfiguration, dateiBereitsteller, dateiSoftware, leser.Fehler);
        }
    }

    private sealed class Leser
    {
        public Dictionary<string, string[]> Fehler { get; } = new(StringComparer.Ordinal);

        private void Ungueltig(string pfad) => Fehler.TryAdd(pfad, [MeldungUngueltig]);

        /// <summary>Ein Unterobjekt; fehlt es oder ist es kein Objekt, gilt der Pfad als ungültig.</summary>
        public JsonElement? Objekt(JsonElement? eltern, string name, string pfad)
        {
            if (eltern is not { } e)
            {
                return null;
            }

            if (e.TryGetProperty(name, out var wert) && wert.ValueKind == JsonValueKind.Object)
            {
                return wert;
            }

            Ungueltig(pfad);
            return null;
        }

        public bool? Bool(JsonElement? eltern, string name, string pfad)
        {
            if (eltern is not { } e)
            {
                return null;
            }

            if (e.TryGetProperty(name, out var wert) && wert.ValueKind is JsonValueKind.True or JsonValueKind.False)
            {
                return wert.GetBoolean();
            }

            Ungueltig(pfad);
            return null;
        }

        public string? Text(JsonElement? eltern, string name, string pfad)
        {
            if (eltern is not { } e)
            {
                return null;
            }

            if (e.TryGetProperty(name, out var wert) && wert.ValueKind == JsonValueKind.String)
            {
                return wert.GetString();
            }

            Ungueltig(pfad);
            return null;
        }

        public int? Int(JsonElement? eltern, string name, string pfad)
        {
            if (eltern is not { } e)
            {
                return null;
            }

            if (e.TryGetProperty(name, out var wert) && wert.ValueKind == JsonValueKind.Number && wert.TryGetInt32(out var zahl))
            {
                return zahl;
            }

            Ungueltig(pfad);
            return null;
        }

        /// <summary>Unbekannte Blöcke oder Nicht-Texte ergeben die Reihenfolge-Meldung (5.5).</summary>
        public IReadOnlyList<BlockArt> Reihenfolge(JsonElement wurzel)
        {
            if (!wurzel.TryGetProperty("reihenfolge", out var wert) || wert.ValueKind != JsonValueKind.Array)
            {
                Ungueltig("reihenfolge");
                return StartseiteKonfiguration.Standard.Reihenfolge;
            }

            var liste = new List<BlockArt>();
            foreach (var element in wert.EnumerateArray())
            {
                if (element.ValueKind == JsonValueKind.String && StartseiteNamen.BlockAus(element.GetString()) is { } art)
                {
                    liste.Add(art);
                }
                else
                {
                    Fehler.TryAdd("reihenfolge", [MeldungReihenfolge]);
                }
            }

            return liste;
        }

        /// <summary><c>null</c> = kein Logo; Objekt = Logo mit Alternativtext (ohne Hash, der kommt aus Datei oder Bestand).</summary>
        public StartseiteLogo? Logo(JsonElement? kopf, LogoPlatz platz)
        {
            if (kopf is not { } k)
            {
                return null;
            }

            var pfad = $"kopf.{platz.Feld()}";
            if (!k.TryGetProperty(platz.Feld(), out var wert))
            {
                Ungueltig(pfad);
                return null;
            }

            if (wert.ValueKind == JsonValueKind.Null)
            {
                return null;
            }

            if (wert.ValueKind != JsonValueKind.Object)
            {
                Ungueltig(pfad);
                return null;
            }

            return new StartseiteLogo(string.Empty, Text(wert, "alternativtext", $"{pfad}.alternativtext") ?? string.Empty);
        }
    }
}
