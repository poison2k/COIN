using Coin.Domain.Gemeinsam;
using Coin.Domain.Katalog;

namespace Coin.Domain.Ausgaben;

/// <summary>
/// Use Cases zu Exemplaren und Ausgaben (coin-ausgaben): Exemplare/Kennzahlen, Historie, Erfassen, Stornieren und
/// Auflage ändern. Schreibende Fälle laufen unter der Sperre der Coin-Zeile (ADR-0020 Punkt 6).
/// </summary>
public sealed class AusgabeService(IAusgabeRepository repository, ICoinKatalogRepository katalog, TimeProvider zeit)
{
    private const string StatusFehler = "Bitte einen gültigen Status wählen.";

    public async Task<AbfrageErgebnis<ExemplarUebersicht>> ExemplareAsync(
        Guid coinId, string? status, int? seite, int? groesse, CancellationToken ct)
    {
        var fehler = Seitenabfrage.SeiteFehler(seite, groesse);
        ExemplarStatus? filter = status switch
        {
            null => null,
            "verfuegbar" => ExemplarStatus.Verfuegbar,
            "ausgegeben" => ExemplarStatus.Ausgegeben,
            _ => StatusUngueltig<ExemplarStatus>(fehler),
        };
        if (fehler.Count > 0)
        {
            return new AbfrageErgebnis<ExemplarUebersicht>.Ungueltig(fehler);
        }

        var uebersicht = await repository.ExemplareAsync(
            coinId, filter, seite ?? 1, groesse ?? Seitenabfrage.StandardGroesse, ct);
        return uebersicht is null
            ? new AbfrageErgebnis<ExemplarUebersicht>.CoinNichtGefunden()
            : new AbfrageErgebnis<ExemplarUebersicht>.Gefunden(uebersicht);
    }

    public async Task<AbfrageErgebnis<Seite<AusgabeEintrag>>> HistorieAsync(
        Guid coinId, string? status, int? seite, int? groesse, CancellationToken ct)
    {
        var fehler = Seitenabfrage.SeiteFehler(seite, groesse);
        bool? storniert = status switch
        {
            null => null,
            "aktiv" => false,
            "storniert" => true,
            _ => StatusUngueltig<bool>(fehler),
        };
        if (fehler.Count > 0)
        {
            return new AbfrageErgebnis<Seite<AusgabeEintrag>>.Ungueltig(fehler);
        }

        var liste = await repository.HistorieAsync(coinId, storniert, seite ?? 1, groesse ?? Seitenabfrage.StandardGroesse, ct);
        return liste is null
            ? new AbfrageErgebnis<Seite<AusgabeEintrag>>.CoinNichtGefunden()
            : new AbfrageErgebnis<Seite<AusgabeEintrag>>.Gefunden(liste);
    }

    /// <summary>
    /// Erfasst eine Ausgabe. Reihenfolge (AK-8): Angaben (400) → Coin (404) → Auflage unbekannt (409) →
    /// Exemplar-Nummer außerhalb der Auflage (400) → Exemplar ausgegeben bzw. keines frei (409).
    /// </summary>
    public async Task<AusgabeErfassenErgebnis> ErfassenAsync(
        Guid coinId, int? exemplarNummer, AusgabeAngabenEingabe eingabe, Guid akteurId, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(eingabe);
        var jetzt = Jetzt();
        var pruefung = AusgabeAngaben.Pruefen(
            eingabe.EmpfaengerName, eingabe.EmpfaengerDienstgrad, eingabe.EmpfaengerDienststelle, eingabe.Datum,
            eingabe.Gelegenheit, eingabe.Begruendung, eingabe.AusgebendeStelle, jetzt);
        if (pruefung.Wert is not { } angaben)
        {
            return new AusgabeErfassenErgebnis.Ungueltig(pruefung.Fehler);
        }

        Ausgabe ausgabe;
        await using (var sperre = await repository.SperrenAsync(coinId, ct))
        {
            if (sperre is null)
            {
                return new AusgabeErfassenErgebnis.CoinNichtGefunden();
            }

            if (sperre.Auflage is not { } auflage)
            {
                return new AusgabeErfassenErgebnis.AuflageUnbekannt();
            }

            int nummer;
            if (exemplarNummer is { } gewuenscht)
            {
                if (gewuenscht < 1 || gewuenscht > auflage)
                {
                    return new AusgabeErfassenErgebnis.Ungueltig(new Dictionary<string, string[]>
                    {
                        ["exemplarNummer"] = [$"Exemplar-Nummer muss zwischen 1 und {auflage} liegen."],
                    });
                }

                if (await sperre.IstAusgegebenAsync(gewuenscht, ct))
                {
                    return new AusgabeErfassenErgebnis.ExemplarAusgegeben(gewuenscht);
                }

                nummer = gewuenscht;
            }
            else if (await sperre.NaechsteFreieNummerAsync(ct) is { } frei)
            {
                nummer = frei;
            }
            else
            {
                return new AusgabeErfassenErgebnis.KeinExemplarFrei();
            }

            ausgabe = Ausgabe.Erstellen(coinId, nummer, angaben, akteurId, jetzt);
            if (!await sperre.AusgabeHinzufuegenAsync(ausgabe, ct))
            {
                return new AusgabeErfassenErgebnis.ExemplarAusgegeben(nummer);
            }

            await sperre.AbschliessenAsync(ct);
        }

        return new AusgabeErfassenErgebnis.Erfasst(await GespeichertAsync(ausgabe.Id, ct));
    }

    /// <summary>Storniert eine aktive Ausgabe. Reihenfolge (AK-12): Grund (400) → Coin/Ausgabe (404) → bereits storniert (409).</summary>
    public async Task<AusgabeStornierenErgebnis> StornierenAsync(
        Guid coinId, Guid ausgabeId, string? grund, Guid akteurId, CancellationToken ct)
    {
        if (Ausgabe.GrundFehler(grund) is { } meldung)
        {
            return new AusgabeStornierenErgebnis.Ungueltig(new Dictionary<string, string[]> { ["grund"] = [meldung] });
        }

        await using (var sperre = await repository.SperrenAsync(coinId, ct))
        {
            if (sperre is null || await sperre.AusgabeLadenAsync(ausgabeId, ct) is not { } ausgabe)
            {
                return new AusgabeStornierenErgebnis.NichtGefunden();
            }

            switch (ausgabe.Stornieren(grund, akteurId, Jetzt()))
            {
                case StornoErgebnis.BereitsStorniert:
                    return new AusgabeStornierenErgebnis.BereitsStorniert();
                case StornoErgebnis.Ungueltig ungueltig:
                    return new AusgabeStornierenErgebnis.Ungueltig(ungueltig.Fehler);
                case StornoErgebnis.Storniert:
                    break;
                default:
                    throw new InvalidOperationException("Unbekanntes Ergebnis beim Stornieren.");
            }

            await sperre.StornoSpeichernAsync(ausgabe, ct);
            await sperre.AbschliessenAsync(ct);
        }

        return new AusgabeStornierenErgebnis.Storniert(await GespeichertAsync(ausgabeId, ct));
    }

    /// <summary>Ändert die Auflage (AK-17, F3/F4). Reihenfolge: Wert (400) → Coin (404) → zu klein (409).</summary>
    public async Task<AuflageAendernErgebnis> AuflageAendernAsync(Guid coinId, int? auflage, CancellationToken ct)
    {
        if (AuflageAenderung.Feldfehler(auflage) is { } fehler)
        {
            return new AuflageAendernErgebnis.Ungueltig(fehler);
        }

        await using (var sperre = await repository.SperrenAsync(coinId, ct))
        {
            if (sperre is null)
            {
                return new AuflageAendernErgebnis.CoinNichtGefunden();
            }

            var hoechste = await sperre.HoechsteJeAusgegebeneNummerAsync(ct);
            switch (AuflageAenderung.Pruefen(sperre.Auflage, auflage, hoechste))
            {
                case AuflageAenderung.Ungueltig ungueltig:
                    return new AuflageAendernErgebnis.Ungueltig(ungueltig.Fehler);
                case AuflageAenderung.ZuKlein zuKlein:
                    return new AuflageAendernErgebnis.ZuKlein(zuKlein.HoechsteAusgegebeneNummer);
                case AuflageAenderung.Unveraendert:
                    break;
                case AuflageAenderung.Erhoehung erhoehung:
                    await sperre.AuflageErhoehenAsync(auflage!.Value, erhoehung.Von, erhoehung.Bis, ct);
                    break;
                case AuflageAenderung.Senkung senkung:
                    await sperre.AuflageSenkenAsync(auflage!.Value, senkung.Von, senkung.Bis, ct);
                    break;
                default:
                    throw new InvalidOperationException("Unbekanntes Ergebnis beim Ändern der Auflage.");
            }

            await sperre.AbschliessenAsync(ct);
        }

        var coin = await katalog.FindenAsync(coinId, ct)
            ?? throw new InvalidOperationException("Coin nach dem Ändern der Auflage nicht gefunden.");
        return new AuflageAendernErgebnis.Geaendert(coin);
    }

    /// <summary>
    /// Ersetzt die Stammdaten eines Coins (zertifikatsvorlagen AK-22, ADR-0025). Reihenfolge: Felder (400) → Coin (404)
    /// → Auflage <c>null</c> bei gesetzter Auflage (400) → Duplikat (409) → Auflage zu klein (409). Alles in einer
    /// Transaktion unter der Coin-Sperre; ohne Änderung wird nichts geschrieben. Kein Audit (F3).
    /// </summary>
    public async Task<CoinBearbeitenErgebnis> CoinBearbeitenAsync(
        Guid coinId, string? name, string? herausgeber, int? auflage, string? beschreibung, CancellationToken ct)
    {
        // Feldregeln ohne Bezug auf den gespeicherten Coin; „Auflage ist erforderlich“ folgt nach der Sperre.
        var vorab = CoinStammdaten.Pruefen(name, herausgeber, auflage, beschreibung, bisherigeAuflage: null);
        if (vorab.Wert is null)
        {
            return new CoinBearbeitenErgebnis.Ungueltig(vorab.Fehler);
        }

        await using (var sperre = await repository.SperrenAsync(coinId, ct))
        {
            if (sperre is null)
            {
                return new CoinBearbeitenErgebnis.CoinNichtGefunden();
            }

            var geprueft = CoinStammdaten.Pruefen(name, herausgeber, auflage, beschreibung, sperre.Auflage);
            if (geprueft.Wert is not { } daten)
            {
                return new CoinBearbeitenErgebnis.Ungueltig(geprueft.Fehler);
            }

            var bisher = await katalog.FindenAsync(coinId, ct)
                ?? throw new InvalidOperationException("Gesperrter Coin nicht gefunden.");
            var geschrieben = false;
            if (bisher.Name != daten.Name || bisher.Herausgeber != daten.Herausgeber || bisher.Beschreibung != daten.Beschreibung)
            {
                // Vorabprüfung für eine klare Antwort; gleichzeitige Anfragen fängt der eindeutige Index ab.
                if (await sperre.NameVergebenAsync(daten.Name, daten.Herausgeber, ct)
                    || !await sperre.StammdatenSetzenAsync(daten.Name, daten.Herausgeber, daten.Beschreibung, ct))
                {
                    return new CoinBearbeitenErgebnis.Duplikat();
                }

                geschrieben = true;
            }

            if (daten.Auflage is not null)
            {
                var hoechste = await sperre.HoechsteJeAusgegebeneNummerAsync(ct);
                switch (AuflageAenderung.Pruefen(sperre.Auflage, daten.Auflage, hoechste))
                {
                    case AuflageAenderung.Ungueltig ungueltig:
                        return new CoinBearbeitenErgebnis.Ungueltig(ungueltig.Fehler);
                    case AuflageAenderung.ZuKlein zuKlein:
                        return new CoinBearbeitenErgebnis.AuflageZuKlein(zuKlein.HoechsteAusgegebeneNummer);
                    case AuflageAenderung.Unveraendert:
                        break;
                    case AuflageAenderung.Erhoehung erhoehung:
                        await sperre.AuflageErhoehenAsync(daten.Auflage.Value, erhoehung.Von, erhoehung.Bis, ct);
                        geschrieben = true;
                        break;
                    case AuflageAenderung.Senkung senkung:
                        await sperre.AuflageSenkenAsync(daten.Auflage.Value, senkung.Von, senkung.Bis, ct);
                        geschrieben = true;
                        break;
                    default:
                        throw new InvalidOperationException("Unbekanntes Ergebnis beim Ändern der Auflage.");
                }
            }

            if (geschrieben)
            {
                await sperre.AbschliessenAsync(ct);
            }
        }

        var coin = await katalog.FindenAsync(coinId, ct)
            ?? throw new InvalidOperationException("Coin nach dem Bearbeiten nicht gefunden.");
        return new CoinBearbeitenErgebnis.Geaendert(coin);
    }

    private async Task<AusgabeEintrag> GespeichertAsync(Guid ausgabeId, CancellationToken ct) =>
        await repository.FindenAsync(ausgabeId, ct)
        ?? throw new InvalidOperationException("Gespeicherte Ausgabe nicht gefunden.");

    /// <summary>Vermerkt den Fehler am Feld <c>status</c> und liefert „kein Filter“.</summary>
    private static T? StatusUngueltig<T>(Dictionary<string, string[]> fehler)
        where T : struct
    {
        fehler["status"] = [StatusFehler];
        return null;
    }

    /// <summary>Aktuelle Zeit in UTC, auf Mikrosekunden gekürzt (wie <see cref="CoinKatalogService"/>).</summary>
    private DateTimeOffset Jetzt()
    {
        var jetzt = zeit.GetUtcNow().ToUniversalTime();
        return jetzt.AddTicks(-(jetzt.Ticks % TimeSpan.TicksPerMicrosecond));
    }
}

/// <summary>Ungeprüfte Angaben aus der Anfrage (vor <see cref="AusgabeAngaben.Pruefen"/>).</summary>
public sealed record AusgabeAngabenEingabe(
    string? EmpfaengerName,
    string? EmpfaengerDienstgrad,
    string? EmpfaengerDienststelle,
    DateOnly? Datum,
    string? Gelegenheit,
    string? Begruendung,
    string? AusgebendeStelle)
{
    /// <summary>Ohne Werte, damit keine Personendaten in Logs landen (AK-19).</summary>
    public override string ToString() => nameof(AusgabeAngabenEingabe);
}
