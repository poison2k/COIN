namespace Coin.Domain.Katalog;

/// <summary>
/// Ein Coin-Typ im Katalog (fachlich „Coin“). Erzeugung nur über <see cref="Erstellen"/> (ADR-0002).
/// </summary>
public sealed class CoinTyp
{
    public const int NameMaxLaenge = 200;
    public const int HerausgeberMaxLaenge = 200;
    public const int BeschreibungMaxLaenge = 2000;
    public const int AuflageMin = 1;
    public const int AuflageMax = 1_000_000;

    private CoinTyp(Guid id, string name, string herausgeber, int? auflage, string? beschreibung, DateTimeOffset erstelltAm)
    {
        Id = id;
        Name = name;
        Herausgeber = herausgeber;
        Auflage = auflage;
        Beschreibung = beschreibung;
        ErstelltAm = erstelltAm;
    }

    public Guid Id { get; }

    public string Name { get; }

    public string Herausgeber { get; }

    public int? Auflage { get; }

    public string? Beschreibung { get; }

    public DateTimeOffset ErstelltAm { get; }

    /// <summary>
    /// Motivbild des Coins (AK-9). Im API-Ablauf wird das Bild über einen eigenen Endpunkt gesetzt (ADR-0006)
    /// und direkt per Repository gespeichert; Bild und <see cref="BildSetzen"/> bilden die Regel „höchstens ein Bild,
    /// Ersetzen erlaubt“ im Domänenmodell ab und werden von Unit-Tests abgesichert.
    /// </summary>
    public CoinBild? Bild { get; private set; }

    public static Ergebnis<CoinTyp> Erstellen(
        string? name,
        string? herausgeber,
        int? auflage,
        string? beschreibung,
        DateTimeOffset jetzt)
    {
        var fehler = new Dictionary<string, string[]>();

        var nameGetrimmt = name?.Trim() ?? string.Empty;
        if (nameGetrimmt.Length == 0)
        {
            fehler["name"] = ["Name ist erforderlich."];
        }
        else if (nameGetrimmt.Length > NameMaxLaenge)
        {
            fehler["name"] = [$"Name darf höchstens {NameMaxLaenge} Zeichen lang sein."];
        }

        var herausgeberGetrimmt = herausgeber?.Trim() ?? string.Empty;
        if (herausgeberGetrimmt.Length == 0)
        {
            fehler["herausgeber"] = ["Herausgeber ist erforderlich."];
        }
        else if (herausgeberGetrimmt.Length > HerausgeberMaxLaenge)
        {
            fehler["herausgeber"] = [$"Herausgeber darf höchstens {HerausgeberMaxLaenge} Zeichen lang sein."];
        }

        if (auflage is < AuflageMin or > AuflageMax)
        {
            fehler["auflage"] = [$"Auflage muss zwischen {AuflageMin} und {AuflageMax} liegen."];
        }

        var beschreibungGetrimmt = string.IsNullOrWhiteSpace(beschreibung) ? null : beschreibung.Trim();
        if (beschreibungGetrimmt is { Length: > BeschreibungMaxLaenge })
        {
            fehler["beschreibung"] = [$"Beschreibung darf höchstens {BeschreibungMaxLaenge} Zeichen lang sein."];
        }

        if (fehler.Count > 0)
        {
            return Ergebnis<CoinTyp>.Fehlschlag(fehler);
        }

        return Ergebnis<CoinTyp>.Erfolg(new CoinTyp(
            Guid.CreateVersion7(),
            nameGetrimmt,
            herausgeberGetrimmt,
            auflage,
            beschreibungGetrimmt,
            jetzt.ToUniversalTime()));
    }

    /// <summary>Stellt einen gespeicherten Coin wieder her (nur für die Persistenz, ohne erneute Prüfung).</summary>
    public static CoinTyp Wiederherstellen(
        Guid id, string name, string herausgeber, int? auflage, string? beschreibung, DateTimeOffset erstelltAm) =>
        new(id, name, herausgeber, auflage, beschreibung, erstelltAm.ToUniversalTime());

    /// <summary>Setzt das Motivbild; ein vorhandenes Bild wird ersetzt (AK-9, AK-21).</summary>
    public void BildSetzen(CoinBild bild)
    {
        ArgumentNullException.ThrowIfNull(bild);
        Bild = bild;
    }
}
