using System.Collections;
using System.Reflection;
using Coin.Domain.Katalog;

namespace Coin.UnitTests.Startseite;

/// <summary>Ergebnis der Logoprüfung in Testform: <c>Meldung</c> <c>null</c> = gültig.</summary>
internal sealed record LogoErgebnis(string? Meldung, string? Format, int Breite, int Hoehe);

/// <summary>Eine Audit-Änderung in Testform (Abschnitt 4.3): Art, Ziel, Alt, Neu als Text, Ziel klein geschrieben.</summary>
internal sealed record Aenderung(string Art, string? Ziel = null, string? Alt = null, string? Neu = null);

/// <summary>Öffentliche Kopfansicht in Testform (AK-37).</summary>
internal sealed record KopfErgebnis(bool Aktiv, int Position, string? Titel, string? Untertitel, bool LogoBereitsteller, bool LogoSoftware);

/// <summary>
/// Zugriff auf die neuen Domain-Typen der Startseite (Entwurf startseite Abschnitt 4–6, ADR-0030/0031) per Reflexion, damit
/// das Testprojekt übersetzbar bleibt, solange die Typen fehlen. Fehlt ein Typ oder eine Methode, scheitert der Test mit
/// einer Meldung, die den erwarteten Vertrag nennt. Erwartete Verträge (Namespace <c>Coin.Domain.Startseite</c>):
/// <list type="bullet">
/// <item><c>enum BlockArt { Kopf, Infotext, Kennzahlen, Neueste, Meistausgegeben }</c>, <c>enum LogoPlatz { Bereitsteller, Software }</c>.</item>
/// <item><c>sealed record StartseiteLogo(string Sha256, string Alternativtext, …)</c> – weitere Parameter erlaubt (im Test Standardwert).</item>
/// <item><c>sealed record StartseiteKonfiguration(IReadOnlyList&lt;BlockArt&gt; Reihenfolge, bool KopfAktiv, string Titel,
/// string Untertitel, StartseiteLogo? LogoBereitsteller, StartseiteLogo? LogoSoftware, bool InfotextAktiv, string Infotext,
/// bool KennzahlenAktiv, bool NeuesteAktiv, int NeuesteAnzahl, bool MeistausgegebeneAktiv, int MeistausgegebeneAnzahl)</c> mit
/// <list type="bullet">
/// <item><c>static StartseiteKonfiguration Standard { get; }</c> (AK-1),</item>
/// <item><c>static Ergebnis&lt;StartseiteKonfiguration&gt; Pruefen(StartseiteKonfiguration roh)</c> – trimmt, normalisiert
/// Zeilenenden, prüft nach 5.5; Fehlerschlüssel wie in der API (<c>kopf.titel</c>, <c>infotext.text</c>, …),</item>
/// <item>Instanzmethode <c>KopfAnsicht()</c> → Objekt mit <c>Aktiv</c>, <c>Position</c>, <c>Titel</c>, <c>Untertitel</c>,
/// <c>LogoBereitsteller</c>, <c>LogoSoftware</c> (Texte/Logos <c>null</c>, wenn inaktiv),</item>
/// <item><c>static IReadOnlyList&lt;StartseiteAenderung&gt; Aenderungen(StartseiteKonfiguration alt, StartseiteKonfiguration neu)</c>
/// – Einträge mit <c>Art</c> (Enum oder Text, Namen aus 4.3), <c>Ziel</c>, <c>Alt</c>, <c>Neu</c> (<c>string?</c>).</item>
/// </list></item>
/// <item><c>static class LogoPruefung</c> mit <c>Pruefen(byte[] | ReadOnlyMemory&lt;byte&gt; daten)</c> → Objekt mit
/// <c>string? Meldung</c> (<c>null</c> = gültig, sonst genau eine Meldung aus 5.5), <c>BildFormat? Format</c>,
/// <c>int Breite</c>, <c>int Hoehe</c>.</item>
/// </list>
/// </summary>
internal static class StartseiteDomain
{
    public const string Ns = "Coin.Domain.Startseite";

    public static readonly Assembly Domain = typeof(BildFormatErkennung).Assembly;

    public static Type Typ(string name) =>
        Domain.GetType($"{Ns}.{name}") ?? throw new Xunit.Sdk.XunitException($"Typ {Ns}.{name} fehlt (Entwurf startseite, Abschnitt 4–6).");

    private static object? Aufrufen(MethodInfo methode, object? ziel, params object?[] args)
    {
        try
        {
            return methode.Invoke(ziel, args);
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            throw ex.InnerException;
        }
    }

    private static object? Eigenschaft(object? objekt, string name)
    {
        if (objekt is null)
        {
            return null;
        }

        var eigenschaft = objekt.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase)
            ?? throw new Xunit.Sdk.XunitException($"{objekt.GetType().Name}: Eigenschaft {name} fehlt.");
        return eigenschaft.GetValue(objekt);
    }

    // ---------- Logoprüfung ----------

    private static readonly Lazy<MethodInfo> PruefenLogo = new(() =>
        Typ("LogoPruefung").GetMethods(BindingFlags.Public | BindingFlags.Static)
            .Where(m => m.Name == "Pruefen" && m.GetParameters() is [{ } p]
                && (p.ParameterType == typeof(byte[]) || p.ParameterType == typeof(ReadOnlyMemory<byte>)))
            .OrderByDescending(m => m.GetParameters()[0].ParameterType == typeof(byte[]))
            .FirstOrDefault()
            ?? throw new Xunit.Sdk.XunitException("LogoPruefung.Pruefen(byte[] | ReadOnlyMemory<byte>) fehlt (ADR-0031 Punkt 2)."));

    public static LogoErgebnis LogoPruefen(byte[] daten)
    {
        var methode = PruefenLogo.Value;
        var arg = methode.GetParameters()[0].ParameterType == typeof(byte[]) ? (object)daten : new ReadOnlyMemory<byte>(daten);
        var ergebnis = Aufrufen(methode, null, arg) ?? throw new Xunit.Sdk.XunitException("LogoPruefung.Pruefen lieferte null.");
        var format = Eigenschaft(ergebnis, "Format");
        return new LogoErgebnis(
            (string?)Eigenschaft(ergebnis, "Meldung"),
            format?.ToString(),
            Convert.ToInt32(Eigenschaft(ergebnis, "Breite") ?? 0),
            Convert.ToInt32(Eigenschaft(ergebnis, "Hoehe") ?? 0));
    }

    // ---------- Konfiguration ----------

    private static readonly Lazy<Type> KonfigurationTyp = new(() => Typ("StartseiteKonfiguration"));

    /// <summary>Werte einer Konfiguration in Testform (Namen wie die Parameter des Records).</summary>
    public sealed record Werte
    {
        public string[] Reihenfolge { get; init; } = ["kopf", "infotext", "kennzahlen", "neueste", "meistausgegeben"];
        public bool KopfAktiv { get; init; }
        public string Titel { get; init; } = "C.O.I.N.";
        public string Untertitel { get; init; } = "Certified Official Issue Numbering";
        public (string Sha256, string Alternativtext)? LogoBereitsteller { get; init; }
        public (string Sha256, string Alternativtext)? LogoSoftware { get; init; }
        public bool InfotextAktiv { get; init; } = true;
        public string Infotext { get; init; } = StandardInfotext;
        public bool KennzahlenAktiv { get; init; } = true;
        public bool NeuesteAktiv { get; init; } = true;
        public int NeuesteAnzahl { get; init; } = 6;
        public bool MeistausgegebeneAktiv { get; init; } = true;
        public int MeistausgegebeneAnzahl { get; init; } = 5;
    }

    public const string StandardInfotext =
        "C.O.I.N. verwaltet die Gedenk-Coins der Bundeswehr: den Katalog der Coins, ihre nummerierten Exemplare und die Echtheitszertifikate.";

    /// <summary><c>StartseiteKonfiguration.Standard</c>.</summary>
    public static object Standard()
    {
        var eigenschaft = KonfigurationTyp.Value.GetProperty("Standard", BindingFlags.Public | BindingFlags.Static)
            ?? throw new Xunit.Sdk.XunitException("StartseiteKonfiguration.Standard fehlt (ADR-0030 Punkt 2).");
        return eigenschaft.GetValue(null) ?? throw new Xunit.Sdk.XunitException("StartseiteKonfiguration.Standard ist null.");
    }

    /// <summary>Erzeugt eine Konfiguration aus Testwerten über den Konstruktor (Zuordnung nach Parameternamen).</summary>
    public static object Konfiguration(Werte werte)
    {
        var typ = KonfigurationTyp.Value;
        var konstruktor = typ.GetConstructors().OrderByDescending(k => k.GetParameters().Length).FirstOrDefault()
            ?? throw new Xunit.Sdk.XunitException("StartseiteKonfiguration: öffentlicher Konstruktor fehlt.");
        var quelle = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["Reihenfolge"] = werte.Reihenfolge,
            ["KopfAktiv"] = werte.KopfAktiv,
            ["Titel"] = werte.Titel,
            ["Untertitel"] = werte.Untertitel,
            ["LogoBereitsteller"] = werte.LogoBereitsteller,
            ["LogoSoftware"] = werte.LogoSoftware,
            ["InfotextAktiv"] = werte.InfotextAktiv,
            ["Infotext"] = werte.Infotext,
            ["KennzahlenAktiv"] = werte.KennzahlenAktiv,
            ["NeuesteAktiv"] = werte.NeuesteAktiv,
            ["NeuesteAnzahl"] = werte.NeuesteAnzahl,
            ["MeistausgegebeneAktiv"] = werte.MeistausgegebeneAktiv,
            ["MeistausgegebeneAnzahl"] = werte.MeistausgegebeneAnzahl,
        };
        var fehlend = quelle.Keys.Where(n => konstruktor.GetParameters().All(p => !string.Equals(p.Name, n, StringComparison.OrdinalIgnoreCase))).ToList();
        if (fehlend.Count > 0)
        {
            throw new Xunit.Sdk.XunitException($"StartseiteKonfiguration: Konstruktorparameter fehlen: {string.Join(", ", fehlend)}.");
        }

        var args = konstruktor.GetParameters()
            .Select(p => quelle.TryGetValue(p.Name!, out var wert) ? Umwandeln(wert, p.ParameterType) : Standardwert(p))
            .ToArray();
        return konstruktor.Invoke(args);
    }

    /// <summary>Liest eine Konfiguration in Testwerte zurück.</summary>
    public static Werte Lesen(object konfiguration) => new()
    {
        Reihenfolge = ((IEnumerable)Eigenschaft(konfiguration, "Reihenfolge")!).Cast<object>().Select(o => o.ToString()!.ToLowerInvariant()).ToArray(),
        KopfAktiv = (bool)Eigenschaft(konfiguration, "KopfAktiv")!,
        Titel = (string)Eigenschaft(konfiguration, "Titel")!,
        Untertitel = (string)Eigenschaft(konfiguration, "Untertitel")!,
        LogoBereitsteller = LogoLesen(Eigenschaft(konfiguration, "LogoBereitsteller")),
        LogoSoftware = LogoLesen(Eigenschaft(konfiguration, "LogoSoftware")),
        InfotextAktiv = (bool)Eigenschaft(konfiguration, "InfotextAktiv")!,
        Infotext = (string)Eigenschaft(konfiguration, "Infotext")!,
        KennzahlenAktiv = (bool)Eigenschaft(konfiguration, "KennzahlenAktiv")!,
        NeuesteAktiv = (bool)Eigenschaft(konfiguration, "NeuesteAktiv")!,
        NeuesteAnzahl = Convert.ToInt32(Eigenschaft(konfiguration, "NeuesteAnzahl")),
        MeistausgegebeneAktiv = (bool)Eigenschaft(konfiguration, "MeistausgegebeneAktiv")!,
        MeistausgegebeneAnzahl = Convert.ToInt32(Eigenschaft(konfiguration, "MeistausgegebeneAnzahl")),
    };

    private static (string, string)? LogoLesen(object? logo) =>
        logo is null ? null : ((string)Eigenschaft(logo, "Sha256")!, (string)Eigenschaft(logo, "Alternativtext")!);

    /// <summary>Ergebnis von <c>StartseiteKonfiguration.Pruefen</c>: entweder die bereinigten Werte oder die Fehler je Feld.</summary>
    public static (Werte? Wert, IReadOnlyDictionary<string, string[]> Fehler) Pruefen(Werte werte)
    {
        var methode = KonfigurationTyp.Value.GetMethods(BindingFlags.Public | BindingFlags.Static)
            .FirstOrDefault(m => m.Name == "Pruefen" && m.GetParameters() is [{ } p] && p.ParameterType == KonfigurationTyp.Value)
            ?? throw new Xunit.Sdk.XunitException("StartseiteKonfiguration.Pruefen(StartseiteKonfiguration roh) fehlt (Abschnitt 5.5).");
        var ergebnis = Aufrufen(methode, null, Konfiguration(werte))!;
        var fehler = (IReadOnlyDictionary<string, string[]>)Eigenschaft(ergebnis, "Fehler")!;
        var wert = Eigenschaft(ergebnis, "Wert");
        return (wert is null ? null : Lesen(wert), fehler);
    }

    /// <summary><c>konfiguration.KopfAnsicht()</c> in Testform.</summary>
    public static KopfErgebnis KopfAnsicht(Werte werte)
    {
        var konfiguration = Konfiguration(werte);
        var methode = KonfigurationTyp.Value.GetMethod("KopfAnsicht", BindingFlags.Public | BindingFlags.Instance, Type.EmptyTypes)
            ?? throw new Xunit.Sdk.XunitException("StartseiteKonfiguration.KopfAnsicht() fehlt (AK-37, Abschnitt 9.1).");
        var ansicht = Aufrufen(methode, konfiguration)!;
        return new KopfErgebnis(
            (bool)Eigenschaft(ansicht, "Aktiv")!,
            Convert.ToInt32(Eigenschaft(ansicht, "Position")),
            (string?)Eigenschaft(ansicht, "Titel"),
            (string?)Eigenschaft(ansicht, "Untertitel"),
            Eigenschaft(ansicht, "LogoBereitsteller") is not null,
            Eigenschaft(ansicht, "LogoSoftware") is not null);
    }

    /// <summary><c>StartseiteKonfiguration.Aenderungen(alt, neu)</c> in Testform.</summary>
    public static Aenderung[] Aenderungen(object alt, object neu)
    {
        var methode = KonfigurationTyp.Value.GetMethods(BindingFlags.Public | BindingFlags.Static)
            .FirstOrDefault(m => m.Name == "Aenderungen" && m.GetParameters().Length == 2)
            ?? throw new Xunit.Sdk.XunitException("StartseiteKonfiguration.Aenderungen(alt, neu) fehlt (ADR-0030 Punkt 7, Abschnitt 4.3).");
        var liste = (IEnumerable)Aufrufen(methode, null, alt, neu)!;
        return liste.Cast<object>().Select(e => new Aenderung(
            Eigenschaft(e, "Art")!.ToString()!,
            Eigenschaft(e, "Ziel")?.ToString()?.ToLowerInvariant(),
            Eigenschaft(e, "Alt")?.ToString(),
            Eigenschaft(e, "Neu")?.ToString())).ToArray();
    }

    public static Aenderung[] Aenderungen(Werte alt, Werte neu) => Aenderungen(Konfiguration(alt), Konfiguration(neu));

    // ---------- Umwandlung ----------

    private static object? Umwandeln(object? wert, Type ziel)
    {
        if (wert is null)
        {
            return null;
        }

        var nullable = Nullable.GetUnderlyingType(ziel);
        if (nullable is not null)
        {
            return Umwandeln(wert, nullable);
        }

        if (ziel.IsInstanceOfType(wert) && wert is not string[])
        {
            return wert;
        }

        if (wert is string[] namen)
        {
            var element = ElementTyp(ziel);
            var array = Array.CreateInstance(element, namen.Length);
            for (var i = 0; i < namen.Length; i++)
            {
                array.SetValue(element.IsEnum ? Enum.Parse(element, namen[i], ignoreCase: true) : namen[i], i);
            }

            return ziel.IsAssignableFrom(array.GetType()) ? array : Activator.CreateInstance(typeof(List<>).MakeGenericType(element), array);
        }

        if (wert is ValueTuple<string, string> logo)
        {
            var logoTyp = Typ("StartseiteLogo");
            var konstruktor = logoTyp.GetConstructors().OrderByDescending(k => k.GetParameters().Length).First();
            var args = konstruktor.GetParameters().Select(p => p.Name?.ToLowerInvariant() switch
            {
                "sha256" => logo.Item1,
                "alternativtext" => logo.Item2,
                _ => Standardwert(p),
            }).ToArray();
            return konstruktor.Invoke(args);
        }

        return Convert.ChangeType(wert, ziel);
    }

    private static Type ElementTyp(Type sammlung) =>
        sammlung.IsArray
            ? sammlung.GetElementType()!
            : sammlung.GetGenericArguments().FirstOrDefault()
              ?? sammlung.GetInterfaces().First(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IEnumerable<>)).GetGenericArguments()[0];

    private static object? Standardwert(ParameterInfo p)
    {
        if (p.HasDefaultValue)
        {
            return p.DefaultValue;
        }

        if (p.ParameterType == typeof(string))
        {
            return string.Empty;
        }

        if (p.ParameterType == typeof(DateTimeOffset))
        {
            return new DateTimeOffset(2026, 10, 26, 8, 0, 0, TimeSpan.Zero);
        }

        if (p.ParameterType.IsEnum)
        {
            return Enum.GetValues(p.ParameterType).GetValue(0);
        }

        return p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType) : null;
    }
}
