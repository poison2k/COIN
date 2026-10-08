using Coin.Domain.Gemeinsam;
using Coin.Domain.Katalog;

namespace Coin.Domain.Ausgaben;

/// <summary>Status eines Exemplars, abgeleitet aus der aktiven Ausgabe (ADR-0020 Punkt 1).</summary>
public enum ExemplarStatus
{
    Verfuegbar,
    Ausgegeben,
}

/// <summary>Ein Exemplar ohne Ausgabedaten (coin-ausgaben AK-3, AK-4).</summary>
public sealed record Exemplar(int Nummer, ExemplarStatus Status);

/// <summary>Kennzahlen eines Coins über alle Exemplare.</summary>
public sealed record Kennzahlen(int? Auflage, int Ausgegeben, int Verfuegbar);

/// <summary>Kennzahlen und eine Seite Exemplare (<see cref="Seite{T}.Gesamt"/> gilt für den Filter).</summary>
public sealed record ExemplarUebersicht(Kennzahlen Kennzahlen, Seite<Exemplar> Exemplare);

/// <summary>Benutzer als Akteur in der Historie; der Name kommt beim Lesen aus <c>benutzer</c>.</summary>
public sealed record Akteur(Guid Id, string Name);

/// <summary>Storno in der Lesesicht.</summary>
public sealed record StornoEintrag(DateTimeOffset Am, Akteur Von, string Grund);

/// <summary>Ausgabe in der Lesesicht (Historie und Antworten der schreibenden Endpunkte).</summary>
public sealed record AusgabeEintrag(
    Guid Id,
    int ExemplarNummer,
    AusgabeAngaben Angaben,
    DateTimeOffset ErfasstAm,
    Akteur ErfasstVon,
    StornoEintrag? Storno);

/// <summary>Ergebnis von <see cref="AusgabeService.ErfassenAsync"/>.</summary>
public abstract record AusgabeErfassenErgebnis
{
    private AusgabeErfassenErgebnis()
    {
    }

    public sealed record Erfasst(AusgabeEintrag Ausgabe) : AusgabeErfassenErgebnis;

    public sealed record Ungueltig(IReadOnlyDictionary<string, string[]> Fehler) : AusgabeErfassenErgebnis;

    public sealed record CoinNichtGefunden : AusgabeErfassenErgebnis;

    public sealed record AuflageUnbekannt : AusgabeErfassenErgebnis;

    public sealed record ExemplarAusgegeben(int Nummer) : AusgabeErfassenErgebnis;

    public sealed record KeinExemplarFrei : AusgabeErfassenErgebnis;
}

/// <summary>Ergebnis von <see cref="AusgabeService.StornierenAsync"/>.</summary>
public abstract record AusgabeStornierenErgebnis
{
    private AusgabeStornierenErgebnis()
    {
    }

    public sealed record Storniert(AusgabeEintrag Ausgabe) : AusgabeStornierenErgebnis;

    public sealed record Ungueltig(IReadOnlyDictionary<string, string[]> Fehler) : AusgabeStornierenErgebnis;

    public sealed record NichtGefunden : AusgabeStornierenErgebnis;

    public sealed record BereitsStorniert : AusgabeStornierenErgebnis;
}

/// <summary>Ergebnis von <see cref="AusgabeService.AuflageAendernAsync"/>.</summary>
public abstract record AuflageAendernErgebnis
{
    private AuflageAendernErgebnis()
    {
    }

    public sealed record Geaendert(CoinEintrag Coin) : AuflageAendernErgebnis;

    public sealed record Ungueltig(IReadOnlyDictionary<string, string[]> Fehler) : AuflageAendernErgebnis;

    public sealed record CoinNichtGefunden : AuflageAendernErgebnis;

    public sealed record ZuKlein(int HoechsteAusgegebeneNummer) : AuflageAendernErgebnis;
}

/// <summary>Ergebnis der Leseabfragen (Exemplare, Historie).</summary>
public abstract record AbfrageErgebnis<T>
{
    private AbfrageErgebnis()
    {
    }

    public sealed record Gefunden(T Wert) : AbfrageErgebnis<T>;

    public sealed record Ungueltig(IReadOnlyDictionary<string, string[]> Fehler) : AbfrageErgebnis<T>;

    public sealed record CoinNichtGefunden : AbfrageErgebnis<T>;
}
