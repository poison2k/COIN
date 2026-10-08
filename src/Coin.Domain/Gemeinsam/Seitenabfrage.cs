namespace Coin.Domain.Gemeinsam;

/// <summary>
/// Gemeinsame Prüfung von Suche und Paging für Listen (Benutzerliste, Audit-Log, Coin-Katalog).
/// Fehlerschlüssel: <c>suche</c>, <c>seite</c>, <c>groesse</c>.
/// </summary>
public static class Seitenabfrage
{
    public const int GroesseMin = 1;
    public const int GroesseMax = 100;
    public const int StandardGroesse = 25;
    public const int SucheMaxLaenge = 100;

    /// <summary>Fehler zu Seite und Seitengröße; leer, wenn beide fehlen oder gültig sind.</summary>
    public static Dictionary<string, string[]> SeiteFehler(int? seite, int? groesse)
    {
        var fehler = new Dictionary<string, string[]>();
        if (seite is < 1)
        {
            fehler["seite"] = ["Die Seite muss mindestens 1 sein."];
        }

        if (groesse is < GroesseMin or > GroesseMax)
        {
            fehler["groesse"] = [$"Die Seitengröße muss zwischen {GroesseMin} und {GroesseMax} liegen."];
        }

        return fehler;
    }

    /// <summary>Fehler zu Suchbegriff (Länge nach dem Trimmen), Seite und Seitengröße.</summary>
    public static Dictionary<string, string[]> Fehler(string? suche, int? seite, int? groesse)
    {
        var fehler = SeiteFehler(seite, groesse);
        if (suche?.Trim() is { Length: > SucheMaxLaenge })
        {
            fehler["suche"] = [$"Der Suchbegriff darf höchstens {SucheMaxLaenge} Zeichen lang sein."];
        }

        return fehler;
    }

    /// <summary>Getrimmter Suchbegriff; <c>null</c>, wenn nichts übrig bleibt.</summary>
    public static string? Suchbegriff(string? suche)
    {
        var begriff = suche?.Trim();
        return string.IsNullOrEmpty(begriff) ? null : begriff;
    }
}
