using Coin.Domain.Ausgaben;
using Coin.Domain.Katalog;

namespace Coin.Domain.Zertifikate;

/// <summary>Ergebnis des <see cref="IZertifikatErzeuger"/> (ADR-0028). <see cref="object.ToString"/> enthält keine Inhalte.</summary>
public abstract record ZertifikatErzeugenErgebnis
{
    private ZertifikatErzeugenErgebnis()
    {
    }

    /// <summary>Das befüllte DOCX.</summary>
    public sealed record Erzeugt(byte[] Inhalt) : ZertifikatErzeugenErgebnis
    {
        public override string ToString() => nameof(Erzeugt);
    }

    /// <summary>Mehr als <see cref="PlatzhalterErsetzung.MaxVorkommen"/> Platzhalter in der Vorlage (AK-14).</summary>
    public sealed record ZuVielePlatzhalter : ZertifikatErzeugenErgebnis;

    /// <summary>Die Vorlage konnte nicht gelesen oder das Ergebnis nicht geschrieben werden (AK-17).</summary>
    public sealed record Fehlgeschlagen : ZertifikatErzeugenErgebnis;
}

/// <summary>
/// Port: erzeugt aus den Bytes einer gespeicherten Vorlage und den Werten ein Zertifikat, nur im Speicher (ADR-0028
/// Punkt 6 und 7). Die Vorlage wird nur gelesen. Höchstens zwei Erzeugungen gleichzeitig je Prozess (AK-16); das Warten
/// endet mit <paramref name="ct"/>. Gibt keine Ausnahmen mit Dokumentinhalt nach außen.
/// </summary>
public interface IZertifikatErzeuger
{
    Task<ZertifikatErzeugenErgebnis> ErzeugenAsync(byte[] vorlage, IReadOnlyDictionary<string, string> werte, CancellationToken ct);
}

/// <summary>Port: Zertifikatsfassung der Standardvorlage ohne „Erläuterung der Platzhalter“ (F7), je Prozess einmal erzeugt.</summary>
public interface IStandardzertifikat
{
    byte[] Inhalt { get; }
}

/// <summary>
/// Port: Betriebsprotokoll der Erzeugung (AK-17). Genau eine Warnung mit fester Meldung, ohne Ausnahmeobjekt, Parameter
/// oder Dokumentinhalt.
/// </summary>
public interface IZertifikatProtokoll
{
    void ErzeugungFehlgeschlagen();
}

/// <summary>Alles, was ein Download braucht, aus einer Abfrage (AK-8): Coin (aktueller Stand), Ausgabe, aktive Vorlage.</summary>
public sealed record ZertifikatQuelle(CoinEintrag Coin, AusgabeEintrag Ausgabe, int? VorlageVersion, byte[]? VorlageInhalt)
{
    public override string ToString() => nameof(ZertifikatQuelle);
}

/// <summary>Ein Eintrag in <c>zertifikat_audit</c> (ADR-0029), ohne Empfängerdaten und ohne Dateiinhalt.</summary>
public sealed record ZertifikatAuditEintrag(
    DateTimeOffset Zeitpunkt, Guid AkteurId, Guid AusgabeId, Guid CoinId, string Zertifikatsnummer, int? VorlageVersion)
{
    /// <summary>Einzige Art bisher (ADR-0029 Punkt 1).</summary>
    public const string ArtHeruntergeladen = "Heruntergeladen";

    public override string ToString() => nameof(ZertifikatAuditEintrag);
}

/// <summary>Datenzugriff für Zertifikate (ADR-0028, ADR-0029).</summary>
public interface IZertifikatRepository
{
    /// <summary>
    /// Ausgabe des Coins mit aktuellem Coin und aktiver Vorlage (Zeiger und Inhalt) in einer Abfrage; <c>null</c> bei
    /// unbekanntem Coin oder unbekannter bzw. fremder Ausgabe. Ohne eigene Vorlage sind Version und Inhalt <c>null</c>.
    /// </summary>
    Task<ZertifikatQuelle?> LadenAsync(Guid coinId, Guid ausgabeId, CancellationToken ct);

    /// <summary>
    /// Schreibt den Audit-Eintrag atomar mit der Storno-Prüfung (ADR-0029 Punkt 4). <c>false</c>, wenn die Ausgabe
    /// inzwischen storniert ist (dann wurde nichts geschrieben).
    /// </summary>
    Task<bool> AuditSchreibenAsync(ZertifikatAuditEintrag eintrag, CancellationToken ct);
}

/// <summary>Ergebnis von <see cref="ZertifikatService.HerunterladenAsync"/>. <see cref="object.ToString"/> ohne Werte.</summary>
public abstract record ZertifikatHerunterladenErgebnis
{
    private ZertifikatHerunterladenErgebnis()
    {
    }

    public sealed record Datei(byte[] Inhalt, string Zertifikatsnummer) : ZertifikatHerunterladenErgebnis
    {
        public override string ToString() => nameof(Datei);
    }

    public sealed record NichtGefunden : ZertifikatHerunterladenErgebnis;

    public sealed record Storniert : ZertifikatHerunterladenErgebnis;

    public sealed record ZuVielePlatzhalter : ZertifikatHerunterladenErgebnis;

    public sealed record Fehlgeschlagen : ZertifikatHerunterladenErgebnis;
}
