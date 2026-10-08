using Coin.Domain.Benutzer;

namespace Coin.Api.Contracts;

/// <summary>Eintrag der Benutzerliste (AK-11). Ohne Issuer und Subject.</summary>
public sealed record BenutzerEintragResponse(Guid Id, string Name, string? Email, string Rolle, bool Aktiv, DateTimeOffset ErstelltAm)
{
    public static BenutzerEintragResponse Aus(Benutzer benutzer) => new(
        benutzer.Id, benutzer.Anzeigename, benutzer.Email, RolleText.Von(benutzer.Rolle), benutzer.Aktiv, benutzer.ErstelltAm);
}

/// <summary>
/// Query von <c>GET /api/benutzer</c>. <see cref="ToString"/> gibt bewusst keine Werte aus: Der Suchbegriff kann eine
/// E-Mail oder ein Name sein und darf nicht in Logs landen (AK-22, MVC protokolliert Argumente auf Trace).
/// </summary>
public sealed class BenutzerListeAnfrage
{
    public string? Suche { get; init; }

    public int? Seite { get; init; }

    public int? Groesse { get; init; }

    public override string ToString() => nameof(BenutzerListeAnfrage);
}

/// <summary>Body von <c>PUT /api/benutzer/{id}/rolle</c>. Als Text gebunden, damit die Meldung deutsch ist (AK-12).</summary>
public sealed record RolleZuweisenRequest(string? Rolle);

/// <summary>Body von <c>PUT /api/benutzer/{id}/status</c> (AK-13).</summary>
public sealed record StatusSetzenRequest(bool? Aktiv);

/// <summary>Person im Audit-Log: nur Id und Name, keine E-Mail (AK-14).</summary>
public sealed record AuditPersonResponse(Guid Id, string Name);

/// <summary>Eintrag des Audit-Logs (AK-14). <see cref="Akteur"/> <c>null</c> = System (Bootstrap).</summary>
public sealed record AuditEintragResponse(
    Guid Id,
    DateTimeOffset Zeitpunkt,
    AuditPersonResponse? Akteur,
    AuditPersonResponse Benutzer,
    string Art,
    string Alt,
    string Neu)
{
    public static AuditEintragResponse Aus(AuditEintragAnsicht eintrag) => new(
        eintrag.Id,
        eintrag.Zeitpunkt,
        eintrag.AkteurId is { } akteurId ? new AuditPersonResponse(akteurId, eintrag.AkteurName ?? string.Empty) : null,
        new AuditPersonResponse(eintrag.BenutzerId, eintrag.BenutzerName),
        eintrag.Art.ToString(),
        eintrag.Alt,
        eintrag.Neu);
}
