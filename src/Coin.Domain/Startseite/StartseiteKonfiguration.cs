using System.Globalization;

namespace Coin.Domain.Startseite;

/// <summary>
/// Konfiguration der Startseite als Ganzes (Feature startseite, ADR-0030 Punkt 1): fünf feste Blöcke mit Schaltern,
/// Reihenfolge, Texten, Anzahl und zwei Logos. Ohne gespeicherte Zeile gilt <see cref="Standard"/> (Punkt 2).
/// </summary>
public sealed record StartseiteKonfiguration(
    IReadOnlyList<BlockArt> Reihenfolge,
    bool KopfAktiv,
    string Titel,
    string Untertitel,
    StartseiteLogo? LogoBereitsteller,
    StartseiteLogo? LogoSoftware,
    bool InfotextAktiv,
    string Infotext,
    bool KennzahlenAktiv,
    bool NeuesteAktiv,
    int NeuesteAnzahl,
    bool MeistausgegebeneAktiv,
    int MeistausgegebeneAnzahl)
{
    public const int TitelMax = 100;
    public const int UntertitelMax = 200;
    public const int AlternativtextMax = 200;
    public const int InfotextMax = 5000;
    public const int NeuesteMin = 3;
    public const int NeuesteMax = 12;
    public const int MeistausgegebeneMin = 3;
    public const int MeistausgegebeneMax = 10;

    public const string StandardTitel = "C.O.I.N.";
    public const string StandardUntertitel = "Certified Official Issue Numbering";

    public const string StandardInfotext =
        "C.O.I.N. verwaltet die Gedenk-Coins der Bundeswehr: den Katalog der Coins, ihre nummerierten Exemplare und die Echtheitszertifikate.";

    private const string Steuerzeichen = "Der Text enthält unzulässige Steuerzeichen.";

    /// <summary>Standardkonfiguration aus dem Code (AK-1).</summary>
    public static StartseiteKonfiguration Standard { get; } = new(
        StartseiteNamen.AlleBloecke,
        KopfAktiv: false,
        StandardTitel,
        StandardUntertitel,
        LogoBereitsteller: null,
        LogoSoftware: null,
        InfotextAktiv: true,
        StandardInfotext,
        KennzahlenAktiv: true,
        NeuesteAktiv: true,
        NeuesteAnzahl: 6,
        MeistausgegebeneAktiv: true,
        MeistausgegebeneAnzahl: 5);

    public StartseiteLogo? Logo(LogoPlatz platz) => platz == LogoPlatz.Bereitsteller ? LogoBereitsteller : LogoSoftware;

    public bool IstAktiv(BlockArt art) => art switch
    {
        BlockArt.Kopf => KopfAktiv,
        BlockArt.Infotext => InfotextAktiv,
        BlockArt.Kennzahlen => KennzahlenAktiv,
        BlockArt.Neueste => NeuesteAktiv,
        BlockArt.Meistausgegeben => MeistausgegebeneAktiv,
        _ => false,
    };

    /// <summary>Aktive Blöcke in gespeicherter Reihenfolge (AK-2).</summary>
    public IReadOnlyList<BlockArt> AktiveBloecke() => [.. Reihenfolge.Where(IstAktiv)];

    /// <summary>Öffentliche Kopfansicht (AK-37): immer aktiv und Position, Texte und Logos nur bei aktivem Kopfbereich.</summary>
    public KopfAnsicht KopfAnsicht()
    {
        var position = Reihenfolge.ToList().IndexOf(BlockArt.Kopf) + 1;
        return KopfAktiv
            ? new KopfAnsicht(true, position, Titel, Untertitel, LogoBereitsteller, LogoSoftware)
            : new KopfAnsicht(false, position, null, null, null, null);
    }

    /// <summary>
    /// Prüft und bereinigt eine Konfiguration (AK-9, Abschnitt 5.5): Zeilenenden werden zu <c>\n</c>, Titel, Untertitel
    /// und Alternativtexte an den Rändern getrimmt, der Infotext nicht. Alle Befunde werden gesammelt; Schlüssel wie in
    /// der API. Texte inaktiver Blöcke werden nur auf Länge und Steuerzeichen geprüft.
    /// </summary>
    public static Ergebnis<StartseiteKonfiguration> Pruefen(StartseiteKonfiguration roh)
    {
        ArgumentNullException.ThrowIfNull(roh);
        var fehler = new Dictionary<string, string[]>(StringComparer.Ordinal);

        var reihenfolge = roh.Reihenfolge ?? [];
        if (reihenfolge.Count != StartseiteNamen.AlleBloecke.Count
            || reihenfolge.Distinct().Count() != StartseiteNamen.AlleBloecke.Count
            || reihenfolge.Any(b => !Enum.IsDefined(b)))
        {
            fehler["reihenfolge"] = ["Die Reihenfolge muss jeden Block genau einmal enthalten."];
        }

        var titel = Normalisieren(roh.Titel).Trim();
        if (TextFehler(titel, TitelMax, "Der Titel darf höchstens 100 Zeichen lang sein.", roh.KopfAktiv,
                "Bitte einen Titel eingeben oder den Kopfbereich ausschalten.") is { } titelFehler)
        {
            fehler["kopf.titel"] = [titelFehler];
        }

        var untertitel = Normalisieren(roh.Untertitel).Trim();
        if (TextFehler(untertitel, UntertitelMax, "Der Untertitel darf höchstens 200 Zeichen lang sein.", false, null) is { } untertitelFehler)
        {
            fehler["kopf.untertitel"] = [untertitelFehler];
        }

        var logoBereitsteller = LogoPruefen(roh.LogoBereitsteller, LogoPlatz.Bereitsteller, fehler);
        var logoSoftware = LogoPruefen(roh.LogoSoftware, LogoPlatz.Software, fehler);

        var infotext = Normalisieren(roh.Infotext);
        if (TextFehler(infotext, InfotextMax, "Der Infotext darf höchstens 5.000 Zeichen lang sein.", roh.InfotextAktiv,
                "Bitte einen Infotext eingeben oder den Block ausschalten.") is { } infotextFehler)
        {
            fehler["infotext.text"] = [infotextFehler];
        }

        if (roh.NeuesteAnzahl is < NeuesteMin or > NeuesteMax)
        {
            fehler["neueste.anzahl"] = ["Die Anzahl muss zwischen 3 und 12 liegen."];
        }

        if (roh.MeistausgegebeneAnzahl is < MeistausgegebeneMin or > MeistausgegebeneMax)
        {
            fehler["meistausgegeben.anzahl"] = ["Die Anzahl muss zwischen 3 und 10 liegen."];
        }

        if (fehler.Count > 0)
        {
            return Ergebnis<StartseiteKonfiguration>.Fehlschlag(fehler);
        }

        return Ergebnis<StartseiteKonfiguration>.Erfolg(roh with
        {
            Reihenfolge = [.. reihenfolge],
            Titel = titel,
            Untertitel = untertitel,
            LogoBereitsteller = logoBereitsteller,
            LogoSoftware = logoSoftware,
            Infotext = infotext,
        });
    }

    /// <summary>
    /// Änderungen zwischen alter (oder Standard-) und neuer Konfiguration für das Audit (ADR-0030 Punkt 7, Abschnitt 4.3).
    /// Reihenfolge: Blöcke in Standardreihenfolge, dann Reihenfolge, Texte, Anzahl, Logos. Texte nur als „geändert“.
    /// </summary>
    public static IReadOnlyList<StartseiteAenderung> Aenderungen(StartseiteKonfiguration alt, StartseiteKonfiguration neu)
    {
        ArgumentNullException.ThrowIfNull(alt);
        ArgumentNullException.ThrowIfNull(neu);
        var liste = new List<StartseiteAenderung>();

        foreach (var block in StartseiteNamen.AlleBloecke)
        {
            if (alt.IstAktiv(block) != neu.IstAktiv(block))
            {
                liste.Add(new StartseiteAenderung(
                    neu.IstAktiv(block) ? StartseiteAenderungsArt.BlockEingeschaltet : StartseiteAenderungsArt.BlockAusgeschaltet,
                    block.Name()));
            }
        }

        var folgeAlt = Folge(alt.Reihenfolge);
        var folgeNeu = Folge(neu.Reihenfolge);
        if (!string.Equals(folgeAlt, folgeNeu, StringComparison.Ordinal))
        {
            liste.Add(new StartseiteAenderung(StartseiteAenderungsArt.ReihenfolgeGeaendert, null, folgeAlt, folgeNeu));
        }

        if (!string.Equals(alt.Titel, neu.Titel, StringComparison.Ordinal))
        {
            liste.Add(new StartseiteAenderung(StartseiteAenderungsArt.TitelGeaendert));
        }

        if (!string.Equals(alt.Untertitel, neu.Untertitel, StringComparison.Ordinal))
        {
            liste.Add(new StartseiteAenderung(StartseiteAenderungsArt.UntertitelGeaendert));
        }

        if (!string.Equals(alt.Infotext, neu.Infotext, StringComparison.Ordinal))
        {
            liste.Add(new StartseiteAenderung(StartseiteAenderungsArt.InfotextGeaendert));
        }

        AnzahlVergleichen(liste, BlockArt.Neueste, alt.NeuesteAnzahl, neu.NeuesteAnzahl);
        AnzahlVergleichen(liste, BlockArt.Meistausgegeben, alt.MeistausgegebeneAnzahl, neu.MeistausgegebeneAnzahl);

        foreach (var platz in StartseiteNamen.AllePlaetze)
        {
            var logoAlt = alt.Logo(platz);
            var logoNeu = neu.Logo(platz);
            var ziel = platz.Name();
            if (logoAlt is null && logoNeu is not null)
            {
                liste.Add(new StartseiteAenderung(StartseiteAenderungsArt.LogoHochgeladen, ziel, null, logoNeu.Sha256));
            }
            else if (logoAlt is not null && logoNeu is null)
            {
                liste.Add(new StartseiteAenderung(StartseiteAenderungsArt.LogoEntfernt, ziel, logoAlt.Sha256, null));
            }
            else if (logoAlt is not null && logoNeu is not null)
            {
                if (!string.Equals(logoAlt.Sha256, logoNeu.Sha256, StringComparison.Ordinal))
                {
                    liste.Add(new StartseiteAenderung(StartseiteAenderungsArt.LogoErsetzt, ziel, logoAlt.Sha256, logoNeu.Sha256));
                }
                else if (!string.Equals(logoAlt.Alternativtext, logoNeu.Alternativtext, StringComparison.Ordinal))
                {
                    liste.Add(new StartseiteAenderung(StartseiteAenderungsArt.AlternativtextGeaendert, ziel));
                }
            }
        }

        return liste;
    }

    /// <summary>Ohne Texte, damit Inhalte nicht in Logs landen.</summary>
    public override string ToString() => nameof(StartseiteKonfiguration);

    /// <summary>Reihenfolge als Text für das Audit, z. B. <c>kopf,infotext,…</c>.</summary>
    public static string Folge(IEnumerable<BlockArt> reihenfolge) => string.Join(",", reihenfolge.Select(b => b.Name()));

    private static void AnzahlVergleichen(List<StartseiteAenderung> liste, BlockArt block, int alt, int neu)
    {
        if (alt != neu)
        {
            liste.Add(new StartseiteAenderung(
                StartseiteAenderungsArt.AnzahlGeaendert,
                block.Name(),
                alt.ToString(CultureInfo.InvariantCulture),
                neu.ToString(CultureInfo.InvariantCulture)));
        }
    }

    private static StartseiteLogo? LogoPruefen(StartseiteLogo? logo, LogoPlatz platz, Dictionary<string, string[]> fehler)
    {
        if (logo is null)
        {
            return null;
        }

        var alternativtext = Normalisieren(logo.Alternativtext).Trim();
        if (TextFehler(alternativtext, AlternativtextMax, "Der Alternativtext darf höchstens 200 Zeichen lang sein.", true,
                $"Bitte einen Alternativtext für das Logo {platz.Genitiv()} eingeben.") is { } meldung)
        {
            fehler[$"kopf.{platz.Feld()}.alternativtext"] = [meldung];
        }

        return logo with { Alternativtext = alternativtext };
    }

    /// <summary>Eine Meldung je Feld: Steuerzeichen vor Länge vor Pflicht.</summary>
    private static string? TextFehler(string text, int max, string zuLang, bool pflicht, string? fehlt)
    {
        if (EnthaeltSteuerzeichen(text))
        {
            return Steuerzeichen;
        }

        if (text.Length > max)
        {
            return zuLang;
        }

        return pflicht && string.IsNullOrWhiteSpace(text) ? fehlt : null;
    }

    /// <summary>Erlaubt sind <c>\n</c>, <c>\r</c> und <c>\t</c>; alle anderen Steuerzeichen (C0, DEL, C1) nicht.</summary>
    private static bool EnthaeltSteuerzeichen(string text) =>
        text.Any(z => char.IsControl(z) && z is not ('\n' or '\r' or '\t'));

    private static string Normalisieren(string? text) =>
        (text ?? string.Empty).Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n');
}

/// <summary>Arten der Audit-Einträge (Abschnitt 4.3).</summary>
public enum StartseiteAenderungsArt
{
    BlockEingeschaltet,
    BlockAusgeschaltet,
    ReihenfolgeGeaendert,
    TitelGeaendert,
    UntertitelGeaendert,
    InfotextGeaendert,
    AnzahlGeaendert,
    LogoHochgeladen,
    LogoErsetzt,
    LogoEntfernt,
    AlternativtextGeaendert,
}

/// <summary>Eine Änderung für das Audit: nie Textinhalte, bei Logos nur der SHA-256 (ADR-0030 Punkt 7).</summary>
public sealed record StartseiteAenderung(StartseiteAenderungsArt Art, string? Ziel = null, string? Alt = null, string? Neu = null);
