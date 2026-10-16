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
        var ergebnis = CoinStammdaten.Pruefen(name, herausgeber, auflage, beschreibung, bisherigeAuflage: null);
        if (ergebnis.Wert is not { } daten)
        {
            return Ergebnis<CoinTyp>.Fehlschlag(ergebnis.Fehler);
        }

        return Ergebnis<CoinTyp>.Erfolg(new CoinTyp(
            Guid.CreateVersion7(),
            daten.Name,
            daten.Herausgeber,
            daten.Auflage,
            daten.Beschreibung,
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
