namespace Coin.Domain.Ausgaben;

/// <summary>
/// Geprüfte Angaben einer Ausgabe (coin-ausgaben AK-6, AK-7). Erzeugung über <see cref="Pruefen"/>; die
/// Exemplar-Nummer gehört nicht dazu, sie wird erst unter der Coin-Sperre gegen die Auflage geprüft (AK-10).
/// </summary>
public sealed record AusgabeAngaben(
    string EmpfaengerName,
    string? EmpfaengerDienstgrad,
    string? EmpfaengerDienststelle,
    DateOnly Datum,
    string Gelegenheit,
    string Begruendung,
    string AusgebendeStelle)
{
    public const int EmpfaengerNameMaxLaenge = 200;
    public const int EmpfaengerDienstgradMaxLaenge = 100;
    public const int EmpfaengerDienststelleMaxLaenge = 200;
    public const int GelegenheitMaxLaenge = 200;
    public const int BegruendungMaxLaenge = 2000;
    public const int AusgebendeStelleMaxLaenge = 200;

    /// <summary>
    /// Trimmt alle Texte, setzt leere optionale Texte auf <c>null</c> und meldet alle Fehler gemeinsam
    /// (Schlüssel = camelCase-Feldname). „Heute“ gilt nach Europe/Berlin (F8).
    /// </summary>
    public static Ergebnis<AusgabeAngaben> Pruefen(
        string? empfaengerName,
        string? empfaengerDienstgrad,
        string? empfaengerDienststelle,
        DateOnly? datum,
        string? gelegenheit,
        string? begruendung,
        string? ausgebendeStelle,
        DateTimeOffset jetzt)
    {
        var fehler = new Dictionary<string, string[]>();

        var name = Pflicht(fehler, "empfaengerName", empfaengerName, EmpfaengerNameMaxLaenge, "Name des Empfängers");
        var dienstgrad = Optional(fehler, "empfaengerDienstgrad", empfaengerDienstgrad, EmpfaengerDienstgradMaxLaenge, "Dienstgrad");
        var dienststelle = Optional(fehler, "empfaengerDienststelle", empfaengerDienststelle, EmpfaengerDienststelleMaxLaenge, "Dienststelle");

        if (datum is null)
        {
            fehler["datum"] = ["Datum ist erforderlich."];
        }
        else if (datum.Value > Berlin.Heute(jetzt))
        {
            fehler["datum"] = ["Das Datum darf nicht in der Zukunft liegen."];
        }

        var gelegenheitGetrimmt = Pflicht(fehler, "gelegenheit", gelegenheit, GelegenheitMaxLaenge, "Gelegenheit");
        var begruendungGetrimmt = Pflicht(fehler, "begruendung", begruendung, BegruendungMaxLaenge, "Begründung");
        var stelle = Pflicht(fehler, "ausgebendeStelle", ausgebendeStelle, AusgebendeStelleMaxLaenge, "Ausgebende Stelle");

        if (fehler.Count > 0)
        {
            return Ergebnis<AusgabeAngaben>.Fehlschlag(fehler);
        }

        return Ergebnis<AusgabeAngaben>.Erfolg(new AusgabeAngaben(
            name, dienstgrad, dienststelle, datum!.Value, gelegenheitGetrimmt, begruendungGetrimmt, stelle));
    }

    private static string Pflicht(Dictionary<string, string[]> fehler, string feld, string? wert, int max, string bezeichnung)
    {
        var getrimmt = wert?.Trim() ?? string.Empty;
        if (getrimmt.Length == 0)
        {
            fehler[feld] = [$"{bezeichnung} ist erforderlich."];
        }
        else if (getrimmt.Length > max)
        {
            fehler[feld] = [$"{bezeichnung} darf höchstens {max} Zeichen lang sein."];
        }

        return getrimmt;
    }

    private static string? Optional(Dictionary<string, string[]> fehler, string feld, string? wert, int max, string bezeichnung)
    {
        var getrimmt = string.IsNullOrWhiteSpace(wert) ? null : wert.Trim();
        if (getrimmt is not null && getrimmt.Length > max)
        {
            fehler[feld] = [$"{bezeichnung} darf höchstens {max} Zeichen lang sein."];
        }

        return getrimmt;
    }
}
