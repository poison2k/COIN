namespace Coin.Domain.Vorlagen;

/// <summary>Ein Platzhalter einer Zertifikatsvorlage; <see cref="Name"/> im Format <c>Gruppe.Feld</c> ohne Klammern.</summary>
public sealed record Platzhalter(string Name, bool Pflicht, string Bedeutung, string Beispiel)
{
    /// <summary>Schreibweise im Dokument, z. B. <c>{{Coin.Name}}</c>.</summary>
    public string Text => $"{{{{{Name}}}}}";
}

/// <summary>
/// Einzige Liste der Platzhalter (zertifikatsvorlagen AK-1, Abschnitt 4.1). Standardvorlage, Prüfung und
/// Dokumentation (<c>docs/platzhalter.md</c>, per Test abgeglichen) verwenden nur diese Liste.
/// </summary>
public static class Platzhalterkatalog
{
    public static IReadOnlyList<Platzhalter> Alle { get; } =
    [
        new("Coin.Name", true, "Name des Coins", "Einsatzkontingent Beispiel 2025"),
        new("Exemplar.Nummer", true, "Nummer des Exemplars", "12"),
        new("Zertifikat.Nummer", true, "Eindeutige Nummer des Zertifikats", "wird beim Ausstellen vergeben"),
        new("Empfaenger.Name", true, "Name des Empfängers", "Max Beispiel"),
        new("Coin.Herausgeber", false, "Herausgeber des Coins", "Beispielbataillon 1"),
        new("Coin.Beschreibung", false, "Beschreibung des Coins", "Optionaler Text"),
        new("Coin.Auflage", false, "Auflage des Coins", "500"),
        new("Empfaenger.Dienstgrad", false, "Dienstgrad des Empfängers", "Hauptmann"),
        new("Empfaenger.Dienststelle", false, "Dienststelle des Empfängers", "Beispielbataillon 1"),
        new("Ausgabe.Datum", false, "Datum der Ausgabe", "01.10.2026"),
        new("Ausgabe.Gelegenheit", false, "Gelegenheit der Ausgabe", "Truppenbesuch"),
        new("Ausgabe.Begruendung", false, "Begründung der Ausgabe", "Herausragende Leistung"),
        new("Ausgabe.AusgebendeStelle", false, "Ausgebende Stelle oder Person", "Kommandeur Beispielbataillon 1"),
    ];
}
