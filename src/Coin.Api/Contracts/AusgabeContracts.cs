using Coin.Domain.Ausgaben;
using Coin.Domain.Gemeinsam;

namespace Coin.Api.Contracts;

/// <summary>
/// Anfrage zum Erfassen einer Ausgabe (coin-ausgaben 5.2). Ohne Validierungsattribute (Regeln in der Domain).
/// Mitgesendete Felder wie <c>id</c>, <c>erfasstVon</c>, <c>erfasstAm</c>, <c>storno</c> werden ignoriert (AK-6).
/// <see cref="ToString"/> gibt keine Werte aus, damit keine Personendaten ins Log gelangen (AK-19).
/// </summary>
public sealed record AusgabeErfassenRequest(
    int? ExemplarNummer,
    string? EmpfaengerName,
    string? EmpfaengerDienstgrad,
    string? EmpfaengerDienststelle,
    DateOnly? Datum,
    string? Gelegenheit,
    string? Begruendung,
    string? AusgebendeStelle)
{
    public AusgabeAngabenEingabe Eingabe() => new(
        EmpfaengerName, EmpfaengerDienstgrad, EmpfaengerDienststelle, Datum, Gelegenheit, Begruendung, AusgebendeStelle);

    public override string ToString() => nameof(AusgabeErfassenRequest);
}

/// <summary>Anfrage zum Stornieren. <see cref="ToString"/> ohne Werte (AK-19).</summary>
public sealed record AusgabeStornierenRequest(string? Grund)
{
    public override string ToString() => nameof(AusgabeStornierenRequest);
}

/// <summary>Anfrage zum Ändern der Auflage (AK-17). <see cref="ToString"/> ohne Werte.</summary>
public sealed record AuflageAendernRequest(int? Auflage)
{
    public override string ToString() => nameof(AuflageAendernRequest);
}

/// <summary>Query von <c>GET …/exemplare</c> und <c>GET …/ausgaben</c>. <see cref="ToString"/> ohne Werte.</summary>
public sealed class StatusSeiteAnfrage
{
    public string? Status { get; init; }

    public int? Seite { get; init; }

    public int? Groesse { get; init; }

    public override string ToString() => nameof(StatusSeiteAnfrage);
}

/// <summary>Kennzahlen eines Coins (AK-3).</summary>
public sealed record KennzahlenResponse(int? Auflage, int Ausgegeben, int Verfuegbar);

/// <summary>Ein Exemplar: nur Nummer und Status (AK-4).</summary>
public sealed record ExemplarResponse(int Nummer, string Status);

/// <summary>Antwort von <c>GET …/exemplare</c>: <c>{ kennzahlen, eintraege, gesamt, seite, groesse }</c>.</summary>
public sealed record ExemplareResponse(
    KennzahlenResponse Kennzahlen, IReadOnlyList<ExemplarResponse> Eintraege, int Gesamt, int Seite, int Groesse)
{
    public static ExemplareResponse Aus(ExemplarUebersicht uebersicht)
    {
        ArgumentNullException.ThrowIfNull(uebersicht);
        var k = uebersicht.Kennzahlen;
        var seite = uebersicht.Exemplare;
        return new ExemplareResponse(
            new KennzahlenResponse(k.Auflage, k.Ausgegeben, k.Verfuegbar),
            [.. seite.Eintraege.Select(e => new ExemplarResponse(e.Nummer, StatusText(e.Status)))],
            seite.Gesamt,
            seite.Nummer,
            seite.Groesse);
    }

    private static string StatusText(ExemplarStatus status) => status switch
    {
        ExemplarStatus.Verfuegbar => "verfuegbar",
        ExemplarStatus.Ausgegeben => "ausgegeben",
        _ => throw new ArgumentOutOfRangeException(nameof(status)),
    };
}

public sealed record AkteurResponse(Guid Id, string Name);

public sealed record EmpfaengerResponse(string Name, string? Dienstgrad, string? Dienststelle);

public sealed record StornoResponse(DateTimeOffset Am, AkteurResponse Von, string Grund);

/// <summary>Ausgabe in Antworten (coin-ausgaben 5.2), nur unter <c>issues.read</c>/<c>issues.write</c>.</summary>
public sealed record AusgabeResponse(
    Guid Id,
    int ExemplarNummer,
    string Zertifikatsnummer,
    EmpfaengerResponse Empfaenger,
    DateOnly Datum,
    string Gelegenheit,
    string Begruendung,
    string AusgebendeStelle,
    DateTimeOffset ErfasstAm,
    AkteurResponse ErfasstVon,
    StornoResponse? Storno)
{
    public static AusgabeResponse Aus(AusgabeEintrag a)
    {
        ArgumentNullException.ThrowIfNull(a);
        var g = a.Angaben;
        return new AusgabeResponse(
            a.Id,
            a.ExemplarNummer,
            a.Zertifikatsnummer,
            new EmpfaengerResponse(g.EmpfaengerName, g.EmpfaengerDienstgrad, g.EmpfaengerDienststelle),
            g.Datum,
            g.Gelegenheit,
            g.Begruendung,
            g.AusgebendeStelle,
            a.ErfasstAm,
            new AkteurResponse(a.ErfasstVon.Id, a.ErfasstVon.Name),
            a.Storno is { } s ? new StornoResponse(s.Am, new AkteurResponse(s.Von.Id, s.Von.Name), s.Grund) : null);
    }

    public static SeiteResponse<AusgabeResponse> Seite(Seite<AusgabeEintrag> seite) => SeiteResponse<AusgabeResponse>.Aus(seite, Aus);
}
