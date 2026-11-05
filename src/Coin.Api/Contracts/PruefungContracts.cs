using Coin.Domain.Ausgaben;
using Coin.Domain.Pruefung;

namespace Coin.Api.Contracts;

/// <summary>
/// Anfrage an <c>POST /api/pruefung</c> und <c>POST /api/pruefung/mit-empfaenger</c> (hologrammnummer 5.2). Die Nummer
/// steht nur im Body, nie in der URL. <see cref="ToString"/> ohne Werte (AK-22).
/// </summary>
public sealed record PruefungRequest(string? Hologrammnummer, Guid? CoinId)
{
    public override string ToString() => nameof(PruefungRequest);
}

/// <summary>Coin im Prüfergebnis.</summary>
public sealed record PruefCoinResponse(Guid Id, string Name);

/// <summary>
/// Datensatz der Prüfung ohne Personendaten (ADR-0034 Punkt 1): kein <c>ausgabeId</c>, keine Empfängerfelder, kein
/// Storno-Grund. <c>status</c> ist <c>aktiv</c> oder <c>storniert</c>, <c>storniertAm</c> ein Datum (Europe/Berlin).
/// </summary>
public sealed record PruefDatensatzResponse(
    PruefCoinResponse Coin,
    int ExemplarNummer,
    string Zertifikatsnummer,
    string Hologrammnummer,
    DateOnly Datum,
    string Status,
    DateOnly? StorniertAm)
{
    public static PruefDatensatzResponse Aus(PruefTreffer t)
    {
        ArgumentNullException.ThrowIfNull(t);
        return new PruefDatensatzResponse(
            new PruefCoinResponse(t.CoinId, t.CoinName), t.ExemplarNummer, t.Zertifikatsnummer, t.Hologrammnummer, t.Datum,
            PruefTexte.Status(t), PruefTexte.StorniertAm(t));
    }
}

/// <summary>Antwort von <c>POST /api/pruefung</c>; <c>datensatz</c> ist bei <c>falscherCoin</c> und <c>nichtGefunden</c> <c>null</c>.</summary>
public sealed record PruefungResponse(string Ergebnis, PruefDatensatzResponse? Datensatz)
{
    public static PruefungResponse Aus(PruefenErgebnis.Geprueft geprueft)
    {
        ArgumentNullException.ThrowIfNull(geprueft);
        return new PruefungResponse(
            PruefTexte.Ergebnis(geprueft.Art), geprueft.Treffer is { } t ? PruefDatensatzResponse.Aus(t) : null);
    }
}

/// <summary>Datensatz mit den Angaben der Ausgabe (nur <c>issues.read</c>); weiterhin ohne Storno-Grund und Erfasser.</summary>
public sealed record PruefDatensatzMitEmpfaengerResponse(
    Guid AusgabeId,
    PruefCoinResponse Coin,
    int ExemplarNummer,
    string Zertifikatsnummer,
    string Hologrammnummer,
    DateOnly Datum,
    string Status,
    DateOnly? StorniertAm,
    EmpfaengerResponse Empfaenger,
    string Gelegenheit,
    string Begruendung,
    string AusgebendeStelle)
{
    public static PruefDatensatzMitEmpfaengerResponse Aus(PruefTrefferMitEmpfaenger t)
    {
        ArgumentNullException.ThrowIfNull(t);
        var g = t.Angaben;
        return new PruefDatensatzMitEmpfaengerResponse(
            t.AusgabeId, new PruefCoinResponse(t.CoinId, t.CoinName), t.ExemplarNummer, t.Zertifikatsnummer, t.Hologrammnummer,
            t.Datum, PruefTexte.Status(t), PruefTexte.StorniertAm(t),
            new EmpfaengerResponse(g.EmpfaengerName, g.EmpfaengerDienstgrad, g.EmpfaengerDienststelle), g.Gelegenheit, g.Begruendung,
            g.AusgebendeStelle);
    }
}

/// <summary>Antwort von <c>POST /api/pruefung/mit-empfaenger</c>.</summary>
public sealed record PruefungMitEmpfaengerResponse(string Ergebnis, PruefDatensatzMitEmpfaengerResponse? Datensatz)
{
    public static PruefungMitEmpfaengerResponse Aus(PruefenErgebnis.Geprueft geprueft)
    {
        ArgumentNullException.ThrowIfNull(geprueft);
        var datensatz = geprueft.Treffer switch
        {
            null => null,
            PruefTrefferMitEmpfaenger t => PruefDatensatzMitEmpfaengerResponse.Aus(t),
            _ => throw new InvalidOperationException("Treffer ohne Angaben der Ausgabe."),
        };
        return new PruefungMitEmpfaengerResponse(PruefTexte.Ergebnis(geprueft.Art), datensatz);
    }
}

internal static class PruefTexte
{
    public static string Ergebnis(PruefErgebnisArt art) => art switch
    {
        PruefErgebnisArt.Gueltig => "gueltig",
        PruefErgebnisArt.Storniert => "storniert",
        PruefErgebnisArt.FalscherCoin => "falscherCoin",
        PruefErgebnisArt.NichtGefunden => "nichtGefunden",
        _ => throw new ArgumentOutOfRangeException(nameof(art)),
    };

    public static string Status(PruefTreffer t) => t.StorniertAm is null ? "aktiv" : "storniert";

    public static DateOnly? StorniertAm(PruefTreffer t) => t.StorniertAm is { } am ? Berlin.Heute(am) : null;
}
