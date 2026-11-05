using Coin.Domain.Ausgaben;

namespace Coin.Domain.Pruefung;

/// <summary>
/// Prüfung einer Hologrammnummer (hologrammnummer AK-16 bis AK-21, ADR-0034): eine Leseabfrage, ein Audit-Insert und eine
/// Mindestdauer von 250 ms ab Aufrufbeginn für alle vier Ergebnisse, damit die Antwortzeit die Ergebnisart nicht verrät.
/// Eingabefehler antworten sofort, ohne Abfrage und ohne Audit.
/// </summary>
public sealed class PruefService(IPruefRepository repository, TimeProvider zeit)
{
    /// <summary>Mindestdauer je Prüfung (H9), fest im Code.</summary>
    public static readonly TimeSpan Mindestdauer = TimeSpan.FromMilliseconds(250);

    public async Task<PruefenErgebnis> PruefenAsync(
        string? eingabe, Guid? coinId, bool mitEmpfaenger, Guid akteurId, CancellationToken ct)
    {
        var beginn = zeit.GetTimestamp();
        var jetzt = Jetzt();

        Hologrammnummer nummer;
        switch (Hologrammnummer.Pruefen(eingabe))
        {
            case HologrammnummerPruefung.Gueltig gueltig:
                nummer = gueltig.Nummer;
                break;
            case HologrammnummerPruefung.Ungueltig ungueltig:
                return Ungueltig(ungueltig.Meldung);
            default:
                return Ungueltig(Hologrammnummer.MeldungLeer);
        }

        var treffer = await repository.TrefferAsync(nummer.Normalform, mitEmpfaenger, ct);

        // Feste Reihenfolge (ADR-0034 Punkt 2): nicht gefunden → falscher Coin (vor Storno) → storniert → gültig.
        var art = treffer switch
        {
            null => PruefErgebnisArt.NichtGefunden,
            _ when coinId is { } gewaehlt && gewaehlt != treffer.CoinId => PruefErgebnisArt.FalscherCoin,
            { StorniertAm: not null } => PruefErgebnisArt.Storniert,
            _ => PruefErgebnisArt.Gueltig,
        };

        await repository.AuditSchreibenAsync(
            new PruefAuditEintrag(akteurId, jetzt, nummer.Normalform, coinId, art, treffer?.AusgabeId, mitEmpfaenger), ct);

        var rest = Mindestdauer - zeit.GetElapsedTime(beginn);
        if (rest > TimeSpan.Zero)
        {
            await Task.Delay(rest, zeit, ct);
        }

        var datensatz = art is PruefErgebnisArt.Gueltig or PruefErgebnisArt.Storniert ? treffer : null;
        return new PruefenErgebnis.Geprueft(art, datensatz);
    }

    private static PruefenErgebnis.Ungueltig Ungueltig(string meldung) =>
        new(new Dictionary<string, string[]> { ["hologrammnummer"] = [meldung] });

    /// <summary>Aktuelle Zeit in UTC, auf Mikrosekunden gekürzt (wie die anderen Services).</summary>
    private DateTimeOffset Jetzt()
    {
        var jetzt = zeit.GetUtcNow().ToUniversalTime();
        return jetzt.AddTicks(-(jetzt.Ticks % TimeSpan.TicksPerMicrosecond));
    }
}
