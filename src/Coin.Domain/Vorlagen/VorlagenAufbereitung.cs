namespace Coin.Domain.Vorlagen;

/// <summary>Befund der Strukturprüfung einer DOCX-Datei (<see cref="IDocxAnalyse"/>).</summary>
public abstract record DocxBefund
{
    private DocxBefund()
    {
    }

    /// <summary>Struktur- oder Inhaltsbefund (AK-10 bis AK-14) mit den wörtlichen Meldungen.</summary>
    public sealed record Abgelehnt(IReadOnlyList<string> Meldungen) : DocxBefund;

    /// <summary>Struktur in Ordnung; Absatztexte der geprüften Teile für die Platzhalterprüfung (AK-15).</summary>
    public sealed record Gelesen(IReadOnlyList<string> Absatztexte) : DocxBefund;
}

/// <summary>
/// Port: prüft eine nicht vertrauenswürdige DOCX-Datei (ADR-0024 Punkt 1, Stufen 2 bis 7) und liest die Absatztexte.
/// Darf keine Ausnahmen mit Dokumentinhalt nach außen geben.
/// </summary>
public interface IDocxAnalyse
{
    DocxBefund Analysieren(byte[] inhalt);

    /// <summary>
    /// Nachprüfung einer bereinigten Fassung (AK-16): vollständige Prüfung wie <see cref="Analysieren"/> und zusätzlich
    /// der bereinigte Zustand. Ohne eigene Umsetzung nur die vollständige Prüfung.
    /// </summary>
    DocxBefund Nachpruefen(byte[] inhalt) => Analysieren(inhalt);
}

/// <summary>Port: entfernt personenbezogene Dokumenteigenschaften aus einer geprüften DOCX-Datei (AK-16).</summary>
public interface IDocxBereinigung
{
    byte[] Bereinigen(byte[] inhalt);
}

/// <summary>
/// Port: Betriebsprotokoll der Aufbereitung (AK-16, G3). Schreibt je Fall genau eine Warnung mit fester Meldung, ohne
/// Ausnahmeobjekt und ohne Dokumentinhalte.
/// </summary>
public interface IVorlagenProtokoll
{
    void BereinigungFehlgeschlagen();

    void NachpruefungFehlgeschlagen();
}

/// <summary>Ergebnis von <see cref="VorlagenAufbereitung.Aufbereiten"/>.</summary>
public abstract record VorlageAufbereitenErgebnis
{
    private VorlageAufbereitenErgebnis()
    {
    }

    /// <summary>Geprüfte und bereinigte Fassung; nur sie wird gespeichert.</summary>
    public sealed record Angenommen(byte[] Inhalt) : VorlageAufbereitenErgebnis;

    public sealed record Abgelehnt(IReadOnlyList<string> Meldungen) : VorlageAufbereitenErgebnis;
}

/// <summary>
/// Ablauf Prüfen → Bereinigen → vollständige Nachprüfung (zertifikatsvorlagen AK-8, AK-15, AK-16; ADR-0024 Punkt 3).
/// Läuft ohne Datenbank und ohne Sperre. Über <see cref="AufbereitenAsync"/> laufen je Instanz (in der API ein
/// Singleton, also je Prozess) höchstens <see cref="MaxGleichzeitig"/> Aufbereitungen gleichzeitig (AK-12,
/// ADR-0024 Punkt 7).
/// </summary>
public sealed class VorlagenAufbereitung(IDocxAnalyse analyse, IDocxBereinigung bereinigung, IVorlagenProtokoll? protokoll = null)
{
    /// <summary>Höchstgröße einer Vorlage (5 MiB), für die hochgeladene und die bereinigte Fassung.</summary>
    public const int MaxGroesseBytes = 5_242_880;

    /// <summary>Höchstzahl gleichzeitiger Aufbereitungen (AK-12).</summary>
    public const int MaxGleichzeitig = 2;

    public const string NichtVerarbeitbar =
        "Die Datei konnte nicht verarbeitet werden. Bitte in Word erneut als Word-Dokument (.docx) speichern und erneut hochladen.";

    private readonly SemaphoreSlim _plaetze = new(MaxGleichzeitig, MaxGleichzeitig);

    /// <summary>
    /// Wartet asynchron auf einen der <see cref="MaxGleichzeitig"/> Plätze (ohne eigene Zeitgrenze, abbrechbar über
    /// <paramref name="ct"/>), bereitet auf und gibt den Platz in jedem Fall wieder frei.
    /// </summary>
    public async Task<VorlageAufbereitenErgebnis> AufbereitenAsync(byte[] inhalt, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(inhalt);

        await _plaetze.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            return Aufbereiten(inhalt);
        }
        finally
        {
            _plaetze.Release();
        }
    }

    /// <summary>Prüft, bereinigt und prüft nach, ohne einen Platz zu belegen.</summary>
    public VorlageAufbereitenErgebnis Aufbereiten(byte[] inhalt)
    {
        ArgumentNullException.ThrowIfNull(inhalt);

        var meldungen = Pruefen(analyse.Analysieren(inhalt));
        if (meldungen.Count > 0)
        {
            return new VorlageAufbereitenErgebnis.Abgelehnt(meldungen);
        }

        byte[] bereinigt;
        try
        {
            bereinigt = bereinigung.Bereinigen(inhalt);
        }
        catch (Exception)
        {
            // Jede Ausnahme der Bereinigung wird ohne Details zur Ablehnung; ihr Text kann Dokumentinhalt enthalten
            // (ADR-0024 Punkt 5). Das Ausnahmeobjekt geht deshalb auch nicht ins Protokoll.
            protokoll?.BereinigungFehlgeschlagen();
            return NichtVerarbeitbarErgebnis();
        }

        if (bereinigt is not { Length: > 0 and <= MaxGroesseBytes } || Pruefen(analyse.Nachpruefen(bereinigt)).Count > 0)
        {
            protokoll?.NachpruefungFehlgeschlagen();
            return NichtVerarbeitbarErgebnis();
        }

        return new VorlageAufbereitenErgebnis.Angenommen(bereinigt);
    }

    /// <summary>Struktur- und Platzhalterprüfung; leer = bestanden.</summary>
    private static IReadOnlyList<string> Pruefen(DocxBefund befund) => befund switch
    {
        DocxBefund.Abgelehnt abgelehnt => abgelehnt.Meldungen,
        DocxBefund.Gelesen gelesen => PlatzhalterPruefung.Pruefen(gelesen.Absatztexte),
        _ => throw new InvalidOperationException("Unbekannter Befund der Analyse."),
    };

    private static VorlageAufbereitenErgebnis.Abgelehnt NichtVerarbeitbarErgebnis() => new([NichtVerarbeitbar]);
}
