namespace Coin.Domain;

/// <summary>
/// Ergebnis einer fachlichen Operation: entweder ein Wert oder Validierungsfehler je Feld
/// (Schlüssel = camelCase-Feldname, Werte = deutsche Meldungen). Siehe ADR-0002.
/// </summary>
public sealed class Ergebnis<T> where T : class
{
    private static readonly IReadOnlyDictionary<string, string[]> KeineFehler =
        new Dictionary<string, string[]>();

    private Ergebnis(T? wert, IReadOnlyDictionary<string, string[]> fehler)
    {
        Wert = wert;
        Fehler = fehler;
    }

    public bool IstErfolgreich => Wert is not null;

    public T? Wert { get; }

    public IReadOnlyDictionary<string, string[]> Fehler { get; }

    public static Ergebnis<T> Erfolg(T wert)
    {
        ArgumentNullException.ThrowIfNull(wert);
        return new Ergebnis<T>(wert, KeineFehler);
    }

    public static Ergebnis<T> Fehlschlag(IReadOnlyDictionary<string, string[]> fehler)
    {
        ArgumentNullException.ThrowIfNull(fehler);
        if (fehler.Count == 0)
        {
            throw new ArgumentException("Ein Fehlschlag braucht mindestens einen Fehler.", nameof(fehler));
        }

        return new Ergebnis<T>(null, fehler);
    }
}
