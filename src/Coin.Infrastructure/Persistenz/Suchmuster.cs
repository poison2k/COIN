namespace Coin.Infrastructure.Persistenz;

/// <summary>Gemeinsame Helfer für parametrisierte Teilstring-Suche (<c>ILIKE … ESCAPE '\'</c>) und Paging.</summary>
internal static class Suchmuster
{
    /// <summary>Escape-Zeichen für <c>ILIKE</c>.</summary>
    public const string Escape = @"\";

    /// <summary>Muster <c>%…%</c>; <c>%</c>, <c>_</c> und das Escape-Zeichen selbst gelten wörtlich.</summary>
    public static string Teilstring(string text) => $"%{Maskieren(text)}%";

    /// <summary>Anzahl zu überspringender Zeilen; <c>null</c>, wenn die Seite jenseits jeder möglichen Zeile liegt.</summary>
    public static int? Versatz(int seite, int groesse)
    {
        var versatz = (long)(seite - 1) * groesse;
        return versatz > int.MaxValue ? null : (int)versatz;
    }

    private static string Maskieren(string text) => text
        .Replace(@"\", @"\\", StringComparison.Ordinal)
        .Replace("%", @"\%", StringComparison.Ordinal)
        .Replace("_", @"\_", StringComparison.Ordinal);
}
