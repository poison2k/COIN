namespace Coin.Domain.Benutzer;

/// <summary>Art einer protokollierten Änderung (ADR-0017).</summary>
public enum AuditArt
{
    Rolle,
    Status,
}

/// <summary>
/// Unveränderlicher Audit-Eintrag (ADR-0017). Nur Ids, keine Namen oder E-Mails. <see cref="AkteurId"/> <c>null</c> =
/// System (Bootstrap). Werte: Rolle = Enum-Name oder „keine“, Status = „aktiv“ oder „deaktiviert“.
/// </summary>
public sealed record AuditEintrag(
    Guid Id,
    DateTimeOffset Zeitpunkt,
    Guid? AkteurId,
    Guid BenutzerId,
    AuditArt Art,
    string Alt,
    string Neu)
{
    public const string Aktiv = "aktiv";
    public const string Deaktiviert = "deaktiviert";

    public static string RolleWert(Rolle? rolle) => RolleText.Von(rolle);

    public static string StatusWert(bool aktiv) => aktiv ? Aktiv : Deaktiviert;
}

/// <summary>Audit-Eintrag zum Lesen, mit Namen aus der Tabelle <c>benutzer</c> (per Join).</summary>
public sealed record AuditEintragAnsicht(
    Guid Id,
    DateTimeOffset Zeitpunkt,
    Guid? AkteurId,
    string? AkteurName,
    Guid BenutzerId,
    string BenutzerName,
    AuditArt Art,
    string Alt,
    string Neu);

/// <summary>Eine Seite einer Liste. <see cref="Nummer"/> beginnt bei 1.</summary>
public sealed record Seite<T>(IReadOnlyList<T> Eintraege, int Gesamt, int Nummer, int Groesse);
