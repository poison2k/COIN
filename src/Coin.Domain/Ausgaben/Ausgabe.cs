namespace Coin.Domain.Ausgaben;

/// <summary>Storno einer Ausgabe: wann, durch wen, warum (ADR-0020 Punkt 4).</summary>
public sealed record Storno(DateTimeOffset Am, Guid Von, string Grund);

/// <summary>Ergebnis von <see cref="Ausgabe.Stornieren"/>.</summary>
public abstract record StornoErgebnis
{
    private StornoErgebnis()
    {
    }

    public sealed record Storniert : StornoErgebnis;

    public sealed record Ungueltig(IReadOnlyDictionary<string, string[]> Fehler) : StornoErgebnis;

    public sealed record BereitsStorniert : StornoErgebnis;
}

/// <summary>
/// Ausgabe eines Exemplars an einen Empfänger (coin-ausgaben, ADR-0020). Wird nie gelöscht und nicht bearbeitet,
/// sondern höchstens einmal storniert.
/// </summary>
public sealed class Ausgabe
{
    public const int StornoGrundMaxLaenge = 500;

    private Ausgabe(
        Guid id,
        Guid coinId,
        int exemplarNummer,
        string? zertifikatsnummer,
        AusgabeAngaben angaben,
        Guid erfasstVon,
        DateTimeOffset erfasstAm,
        Storno? storno)
    {
        Id = id;
        CoinId = coinId;
        ExemplarNummer = exemplarNummer;
        Zertifikatsnummer = zertifikatsnummer;
        Angaben = angaben;
        ErfasstVon = erfasstVon;
        ErfasstAm = erfasstAm;
        Storno = storno;
    }

    public Guid Id { get; }

    public Guid CoinId { get; }

    public int ExemplarNummer { get; }

    /// <summary>
    /// Zertifikatsnummer <c>&lt;Kennung&gt;-&lt;Exemplar&gt;</c> (zertifikat-erzeugen AK-3, ADR-0027 Punkt 4), unter der Coin-Sperre
    /// gebildet und danach unveränderlich. <c>null</c> nur bei Ausgaben, die ohne Nummer erzeugt wurden (nicht speicherbar).
    /// </summary>
    public string? Zertifikatsnummer { get; }

    public AusgabeAngaben Angaben { get; }

    public Guid ErfasstVon { get; }

    public DateTimeOffset ErfasstAm { get; }

    public Storno? Storno { get; private set; }

    /// <summary>Neue Ausgabe; Exemplar, Zertifikatsnummer, Erfasser und Zeit kommen vom Server.</summary>
    public static Ausgabe Erstellen(
        Guid coinId, int exemplarNummer, AusgabeAngaben angaben, Guid erfasstVon, DateTimeOffset erfasstAm, string? zertifikatsnummer = null)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(exemplarNummer, 1);
        ArgumentNullException.ThrowIfNull(angaben);
        return new Ausgabe(Guid.CreateVersion7(), coinId, exemplarNummer, zertifikatsnummer, angaben, erfasstVon, erfasstAm, null);
    }

    /// <summary>Stellt eine gespeicherte Ausgabe wieder her (nur für die Persistenz, ohne erneute Prüfung).</summary>
    public static Ausgabe Wiederherstellen(
        Guid id,
        Guid coinId,
        int exemplarNummer,
        string zertifikatsnummer,
        AusgabeAngaben angaben,
        Guid erfasstVon,
        DateTimeOffset erfasstAm,
        Storno? storno) =>
        new(id, coinId, exemplarNummer, zertifikatsnummer, angaben, erfasstVon, erfasstAm, storno);

    /// <summary>Storniert die Ausgabe (Grund Pflicht, höchstens 500 Zeichen nach dem Trimmen; nur einmal).</summary>
    public StornoErgebnis Stornieren(string? grund, Guid akteurId, DateTimeOffset jetzt)
    {
        if (Storno is not null)
        {
            return new StornoErgebnis.BereitsStorniert();
        }

        var fehler = GrundFehler(grund);
        if (fehler is not null)
        {
            return new StornoErgebnis.Ungueltig(new Dictionary<string, string[]> { ["grund"] = [fehler] });
        }

        Storno = new Storno(jetzt, akteurId, grund!.Trim());
        return new StornoErgebnis.Storniert();
    }

    /// <summary>Fehlermeldung zum Storno-Grund oder <c>null</c>, wenn er gültig ist.</summary>
    public static string? GrundFehler(string? grund)
    {
        var getrimmt = grund?.Trim() ?? string.Empty;
        if (getrimmt.Length == 0)
        {
            return "Bitte einen Grund für das Storno angeben.";
        }

        return getrimmt.Length > StornoGrundMaxLaenge
            ? $"Der Grund darf höchstens {StornoGrundMaxLaenge} Zeichen lang sein."
            : null;
    }
}
