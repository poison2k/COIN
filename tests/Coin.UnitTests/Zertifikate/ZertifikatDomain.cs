using System.Collections;
using System.Reflection;
using System.Text;
using Coin.Domain.Ausgaben;
using Coin.Domain.Katalog;
using Coin.Domain.Vorlagen;

namespace Coin.UnitTests.Zertifikate;

/// <summary>
/// Zugriff auf die neuen Domain-Typen aus zertifikat-erzeugen (Entwurf 5.5) per Reflexion, damit das Testprojekt
/// übersetzbar bleibt, solange die Typen fehlen. Fehlt ein Typ oder eine Methode, scheitert der Test mit einer
/// Meldung, die den erwarteten Vertrag nennt. Erwartete Verträge:
/// <list type="bullet">
/// <item><c>Coin.Domain.Katalog.CoinKennung</c>: statische Methode <c>string X(int|long nummer)</c> (Formatierung) und
/// statische Methode <c>bool X(string?)</c> (Muster <c>^C[0-9]{4,}$</c>).</item>
/// <item><c>Coin.Domain.Zertifikate.Zertifikatsnummer.Bilden(string kennung, int exemplar)</c> → <c>string</c>.</item>
/// <item><c>Coin.Domain.Zertifikate.PlatzhalterErsetzung</c>: statische Methode mit (Segmenttexte eines Absatzes,
/// Werte als <c>IReadOnlyDictionary&lt;string, string&gt;</c>) → je Segment eine Folge von Bausteinen (Text,
/// Zeilenumbruch, Tabulator); statische Methode <c>int X(IEnumerable&lt;string&gt;)</c> (Vorkommen zählen) und eine
/// öffentliche Konstante <c>200</c> (Grenze).</item>
/// <item><c>Coin.Domain.Zertifikate.ZertifikatWerte.Aus(coin, ausgabe)</c> mit Werten je Katalogname.</item>
/// </list>
/// </summary>
internal static class ZertifikatDomain
{
    public static readonly Assembly Domain = typeof(Platzhalterkatalog).Assembly;

    /// <summary>Darstellung eines Zeilenumbruch-Bausteins in <see cref="Ersetzen"/>.</summary>
    public const string Umbruch = "⏎";

    /// <summary>Darstellung eines Tabulator-Bausteins in <see cref="Ersetzen"/>.</summary>
    public const string Tab = "⇥";

    public static Type Typ(string name) =>
        Domain.GetType(name) ?? throw new Xunit.Sdk.XunitException($"Typ {name} fehlt (Entwurf zertifikat-erzeugen, Abschnitt 5.5).");

    private static IEnumerable<MethodInfo> Statisch(Type typ) =>
        typ.GetMethods(BindingFlags.Public | BindingFlags.Static).Where(m => !m.IsSpecialName);

    private static object? Aufrufen(MethodInfo methode, params object?[] args)
    {
        try
        {
            return methode.Invoke(null, args);
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            throw ex.InnerException;
        }
    }

    // ---------- CoinKennung ----------

    private static readonly Lazy<Type> KennungTyp = new(() => Typ("Coin.Domain.Katalog.CoinKennung"));

    /// <summary>Formatiert eine laufende Nummer als Kennung (<c>C0001</c>).</summary>
    public static string KennungFormatieren(long nummer)
    {
        var methode = Statisch(KennungTyp.Value)
            .Where(m => m.ReturnType == typeof(string) && m.GetParameters() is [{ } p] && (p.ParameterType == typeof(int) || p.ParameterType == typeof(long)))
            .OrderByDescending(m => m.GetParameters()[0].ParameterType == typeof(long))
            .FirstOrDefault()
            ?? throw new Xunit.Sdk.XunitException("CoinKennung: statische Methode string X(int|long) für die Formatierung fehlt.");
        var arg = methode.GetParameters()[0].ParameterType == typeof(int) ? (object)checked((int)nummer) : nummer;
        return (string)Aufrufen(methode, arg)!;
    }

    /// <summary>Prüft eine Kennung gegen das Muster <c>^C[0-9]{4,}$</c>.</summary>
    public static bool KennungGueltig(string? kennung)
    {
        var methode = Statisch(KennungTyp.Value)
            .FirstOrDefault(m => m.ReturnType == typeof(bool) && m.GetParameters() is [{ } p] && p.ParameterType == typeof(string))
            ?? throw new Xunit.Sdk.XunitException("CoinKennung: statische Methode bool X(string?) für die Musterprüfung fehlt.");
        return (bool)Aufrufen(methode, kennung)!;
    }

    // ---------- Zertifikatsnummer ----------

    public static string NummerBilden(string kennung, int exemplar)
    {
        var typ = Typ("Coin.Domain.Zertifikate.Zertifikatsnummer");
        var methode = Statisch(typ).FirstOrDefault(m => m.Name == "Bilden" && m.GetParameters().Length == 2)
            ?? throw new Xunit.Sdk.XunitException("Zertifikatsnummer.Bilden(kennung, exemplar) fehlt.");
        var parameter = methode.GetParameters();
        var args = parameter[1].ParameterType == typeof(long) ? new object[] { kennung, (long)exemplar } : [kennung, exemplar];
        var ergebnis = Aufrufen(methode, args);
        return ergebnis as string ?? ergebnis?.ToString() ?? string.Empty;
    }

    // ---------- PlatzhalterErsetzung ----------

    private static readonly Lazy<Type> ErsetzungTyp = new(() => Typ("Coin.Domain.Zertifikate.PlatzhalterErsetzung"));

    /// <summary>Werte je Platzhalter; jeder Wert wird unter dem Namen und unter der Schreibweise mit Klammern abgelegt.</summary>
    public static IReadOnlyDictionary<string, string> Werte(IReadOnlyDictionary<string, string> werte)
    {
        var ergebnis = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (name, wert) in werte)
        {
            ergebnis[name] = wert;
            ergebnis[$"{{{{{name}}}}}"] = wert;
        }

        return ergebnis;
    }

    /// <summary>Werte für alle 13 Katalognamen; einzelne lassen sich überschreiben.</summary>
    public static Dictionary<string, string> StandardWerte(params (string Name, string Wert)[] abweichend)
    {
        var werte = Platzhalterkatalog.Alle.ToDictionary(p => p.Name, p => $"W<{p.Name}>", StringComparer.Ordinal);
        foreach (var (name, wert) in abweichend)
        {
            werte[name] = wert;
        }

        return werte;
    }

    /// <summary>
    /// Ersetzt in den Segmenten eines Absatzes und liefert je Segment den neuen Inhalt als Text; Zeilenumbrüche
    /// erscheinen als <see cref="Umbruch"/>, Tabulatoren als <see cref="Tab"/>.
    /// </summary>
    public static string[] Ersetzen(IReadOnlyList<string> segmente, IReadOnlyDictionary<string, string> werte)
    {
        var methode = Statisch(ErsetzungTyp.Value)
            .FirstOrDefault(m => m.GetParameters() is [{ } a, { } b]
                && a.ParameterType.IsAssignableFrom(typeof(string[]))
                && b.ParameterType.IsAssignableFrom(typeof(Dictionary<string, string>))
                && typeof(IEnumerable).IsAssignableFrom(m.ReturnType))
            ?? throw new Xunit.Sdk.XunitException(
                "PlatzhalterErsetzung: statische Methode (IReadOnlyList<string> segmente, IReadOnlyDictionary<string, string> werte) " +
                "→ je Segment eine Folge von Bausteinen fehlt (ADR-0028 Punkt 2).");
        var ergebnis = (IEnumerable)Aufrufen(methode, segmente.ToArray(), new Dictionary<string, string>(Werte(werte)))!;
        return ergebnis.Cast<object?>().Select(Darstellen).ToArray();
    }

    /// <summary>Text eines Segments aus seinen Bausteinen.</summary>
    private static string Darstellen(object? segment)
    {
        if (segment is string text)
        {
            return text;
        }

        var bausteine = segment is IEnumerable liste ? liste.Cast<object?>() : [segment];
        var aufbau = new StringBuilder();
        foreach (var baustein in bausteine)
        {
            aufbau.Append(Baustein(baustein));
        }

        return aufbau.ToString();
    }

    private static string Baustein(object? baustein)
    {
        if (baustein is null)
        {
            return string.Empty;
        }

        if (baustein is string text)
        {
            return text;
        }

        // Art aus Typname (z. B. Baustein.Zeilenumbruch) oder einer Enum-Eigenschaft (z. B. Art = Tabulator).
        var typ = baustein.GetType();
        var art = typ.Name + " " + (typ.GetProperties().FirstOrDefault(p => p.PropertyType.IsEnum)?.GetValue(baustein)?.ToString() ?? string.Empty);
        if (art.Contains("Umbruch", StringComparison.OrdinalIgnoreCase) || art.Contains("Break", StringComparison.OrdinalIgnoreCase)
            || art.Contains("Zeile", StringComparison.OrdinalIgnoreCase))
        {
            return Umbruch;
        }

        if (art.Contains("Tab", StringComparison.OrdinalIgnoreCase))
        {
            return Tab;
        }

        var textEigenschaft = typ.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(p => p.PropertyType == typeof(string) && p.GetIndexParameters().Length == 0)
            ?? throw new Xunit.Sdk.XunitException($"Unbekannter Baustein {typ.FullName}.");
        return (string?)textEigenschaft.GetValue(baustein) ?? string.Empty;
    }

    /// <summary>Zählt die Platzhaltervorkommen in den Absatztexten (AK-14).</summary>
    public static int VorkommenZaehlen(IReadOnlyList<string> absatztexte)
    {
        var methode = Statisch(ErsetzungTyp.Value)
            .FirstOrDefault(m => m.ReturnType == typeof(int) && m.GetParameters() is [{ } p]
                && (p.ParameterType.IsAssignableFrom(typeof(string[])) || p.ParameterType.IsAssignableFrom(typeof(List<IReadOnlyList<string>>))))
            ?? throw new Xunit.Sdk.XunitException("PlatzhalterErsetzung: statische Methode int X(IEnumerable<string> absatztexte) zum Zählen fehlt.");
        var parameter = methode.GetParameters()[0].ParameterType;
        object arg = parameter.IsAssignableFrom(typeof(string[]))
            ? absatztexte.ToArray()
            : absatztexte.Select(t => (IReadOnlyList<string>)[t]).ToList();
        return (int)Aufrufen(methode, arg)!;
    }

    /// <summary>Öffentliche Konstante der Grenze (Wert 200).</summary>
    public static int Grenze()
    {
        var konstanten = ErsetzungTyp.Value.GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(f => f.IsLiteral && f.FieldType == typeof(int))
            .Select(f => (int)f.GetRawConstantValue()!)
            .ToList();
        return Assert.Single(konstanten);
    }

    // ---------- ZertifikatWerte ----------

    /// <summary>Werte nach Abschnitt 4 als Wörterbuch Name (ohne Klammern) → Text; dazu das Objekt selbst.</summary>
    public static (Dictionary<string, string> Werte, object Objekt) WerteAus(CoinDaten coin, AusgabeDaten ausgabe)
    {
        var typ = Typ("Coin.Domain.Zertifikate.ZertifikatWerte");
        var methode = Statisch(typ).FirstOrDefault(m => m.Name == "Aus" && m.GetParameters().Length == 2)
            ?? throw new Xunit.Sdk.XunitException("ZertifikatWerte.Aus(coin, ausgabe) fehlt.");
        var parameter = methode.GetParameters();
        var objekt = Aufrufen(methode, CoinObjekt(parameter[0].ParameterType, coin), AusgabeObjekt(parameter[1].ParameterType, ausgabe))!;
        return (Auslesen(objekt), objekt);
    }

    private static Dictionary<string, string> Auslesen(object objekt)
    {
        IEnumerable<KeyValuePair<string, string>>? paare = objekt as IEnumerable<KeyValuePair<string, string>>;
        paare ??= objekt.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.GetIndexParameters().Length == 0 && typeof(IEnumerable<KeyValuePair<string, string>>).IsAssignableFrom(p.PropertyType))
            .Select(p => (IEnumerable<KeyValuePair<string, string>>?)p.GetValue(objekt))
            .FirstOrDefault();
        if (paare is not null)
        {
            return paare.ToDictionary(p => p.Key.Trim('{', '}'), p => p.Value, StringComparer.Ordinal);
        }

        var indexer = objekt.GetType().GetProperties()
            .FirstOrDefault(p => p.GetIndexParameters() is [{ } i] && i.ParameterType == typeof(string) && p.PropertyType == typeof(string))
            ?? throw new Xunit.Sdk.XunitException("ZertifikatWerte: weder Wörterbuch noch Indexer string → string gefunden.");
        return Platzhalterkatalog.Alle.ToDictionary(p => p.Name, p => (string)indexer.GetValue(objekt, [p.Name])!, StringComparer.Ordinal);
    }

    /// <summary>Coin-Angaben für <see cref="WerteAus"/> (Abschnitt 4: aktueller Stand).</summary>
    public sealed record CoinDaten(string Name, string Herausgeber, int? Auflage, string? Beschreibung, string Kennung = "C0042");

    /// <summary>Ausgabe-Angaben für <see cref="WerteAus"/>.</summary>
    public sealed record AusgabeDaten(
        int ExemplarNummer,
        string Zertifikatsnummer,
        string EmpfaengerName,
        string? Dienstgrad,
        string? Dienststelle,
        DateOnly Datum,
        string Gelegenheit,
        string Begruendung,
        string AusgebendeStelle);

    private static readonly Guid CoinId = Guid.Parse("01920000-0000-7000-8000-0000000000c1");
    private static readonly DateTimeOffset Zeit = new(2026, 10, 8, 9, 0, 0, TimeSpan.Zero);

    private static object CoinObjekt(Type typ, CoinDaten c)
    {
        var werte = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["id"] = CoinId, ["name"] = c.Name, ["herausgeber"] = c.Herausgeber, ["auflage"] = c.Auflage,
            ["beschreibung"] = c.Beschreibung, ["erstelltAm"] = Zeit, ["kennung"] = c.Kennung, ["bildSha256"] = null,
        };
        if (typ == typeof(CoinTyp))
        {
            var wiederherstellen = typ.GetMethods(BindingFlags.Public | BindingFlags.Static).Single(m => m.Name == nameof(CoinTyp.Wiederherstellen));
            return Aufrufen(wiederherstellen, NachNamen(wiederherstellen.GetParameters(), werte))!;
        }

        return Konstruieren(typ, werte);
    }

    private static object AusgabeObjekt(Type typ, AusgabeDaten a)
    {
        var angaben = new AusgabeAngaben(a.EmpfaengerName, a.Dienstgrad, a.Dienststelle, a.Datum, a.Gelegenheit, a.Begruendung, a.AusgebendeStelle);
        var werte = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["id"] = Guid.Parse("01920000-0000-7000-8000-0000000000e1"), ["coinId"] = CoinId, ["exemplarNummer"] = a.ExemplarNummer,
            ["zertifikatsnummer"] = a.Zertifikatsnummer, ["angaben"] = angaben,
            ["erfasstVon"] = typ == typeof(Ausgabe) ? Guid.Parse("01920000-0000-7000-8000-0000000000a1") : new Akteur(Guid.Empty, "Test Erfasser"),
            ["erfasstAm"] = Zeit, ["storno"] = null,
        };
        if (typ == typeof(Ausgabe))
        {
            var wiederherstellen = typ.GetMethods(BindingFlags.Public | BindingFlags.Static).Single(m => m.Name == nameof(Ausgabe.Wiederherstellen));
            return Aufrufen(wiederherstellen, NachNamen(wiederherstellen.GetParameters(), werte))!;
        }

        return Konstruieren(typ, werte);
    }

    /// <summary>Erzeugt ein Objekt über den Konstruktor mit den meisten Parametern, Argumente nach Parameternamen.</summary>
    public static object Konstruieren(Type typ, IReadOnlyDictionary<string, object?> werte)
    {
        var konstruktor = typ.GetConstructors().OrderByDescending(k => k.GetParameters().Length).First();
        return konstruktor.Invoke(NachNamen(konstruktor.GetParameters(), werte));
    }

    private static object?[] NachNamen(ParameterInfo[] parameter, IReadOnlyDictionary<string, object?> werte) =>
        parameter.Select(p => werte.TryGetValue(p.Name!, out var wert)
            ? wert
            : p.HasDefaultValue ? p.DefaultValue
            : p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType)
            : throw new Xunit.Sdk.XunitException($"Kein Testwert für Parameter {p.Name} ({p.ParameterType.Name}).")).ToArray();
}
