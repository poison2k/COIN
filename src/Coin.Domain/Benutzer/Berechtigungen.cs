using System.Collections.Frozen;

namespace Coin.Domain.Benutzer;

/// <summary>Feste Berechtigungen (ADR-0016). Nicht konfigurierbar; jede hat eine gleichnamige Policy in der API.</summary>
public static class Berechtigungen
{
    /// <summary>Exemplare und Kennzahlen lesen; die übrigen Katalog-Endpunkte bleiben öffentlich (ADR-0014, ADR-0021).</summary>
    public const string CoinsRead = "coins.read";

    /// <summary>Coins anlegen, Motivbild hochladen, Auflage ändern.</summary>
    public const string CoinsWrite = "coins.write";

    /// <summary>Ausgaben mit Empfängerdaten lesen (ADR-0021).</summary>
    public const string IssuesRead = "issues.read";

    /// <summary>Ausgaben erfassen und stornieren (ADR-0021).</summary>
    public const string IssuesWrite = "issues.write";

    /// <summary>Benutzer auflisten, Rolle und Status ändern.</summary>
    public const string UsersManage = "users.manage";

    /// <summary>Audit-Log lesen.</summary>
    public const string AuditRead = "audit.read";

    /// <summary>Startseite konfigurieren: Blöcke, Reihenfolge, Texte, Logos (ADR-0032 Punkt 5).</summary>
    public const string StartpageManage = "startpage.manage";

    public static IReadOnlyList<string> Alle { get; } =
        [CoinsRead, CoinsWrite, IssuesRead, IssuesWrite, UsersManage, AuditRead, StartpageManage];
}

/// <summary>Rechtematrix Rolle → Berechtigungen (ADR-0016, <c>docs/berechtigungen.md</c>). Unveränderlich.</summary>
public static class Rechtematrix
{
    private static readonly IReadOnlySet<string> Keine = FrozenSet<string>.Empty;

    private static readonly FrozenDictionary<Rolle, IReadOnlySet<string>> Matrix = new Dictionary<Rolle, IReadOnlySet<string>>
    {
        [Rolle.Administrator] = Menge(
            Berechtigungen.CoinsRead,
            Berechtigungen.CoinsWrite,
            Berechtigungen.IssuesRead,
            Berechtigungen.IssuesWrite,
            Berechtigungen.UsersManage,
            Berechtigungen.AuditRead,
            Berechtigungen.StartpageManage),
        [Rolle.Sachbearbeiter] = Menge(
            Berechtigungen.CoinsRead, Berechtigungen.CoinsWrite, Berechtigungen.IssuesRead, Berechtigungen.IssuesWrite),
        [Rolle.Betrachter] = Menge(Berechtigungen.CoinsRead),
    }.ToFrozenDictionary();

    /// <summary>Berechtigungen der Rolle; für „keine Rolle“ (<c>null</c>) die leere Menge.</summary>
    public static IReadOnlySet<string> Von(Rolle? rolle) =>
        rolle is { } r && Matrix.TryGetValue(r, out var menge) ? menge : Keine;

    /// <summary>Hat der Benutzer die Berechtigung? Deaktivierte Benutzer haben keine.</summary>
    public static bool Hat(Benutzer benutzer, string berechtigung)
    {
        ArgumentNullException.ThrowIfNull(benutzer);
        return benutzer.Aktiv && Von(benutzer.Rolle).Contains(berechtigung);
    }

    /// <summary>Berechtigungen des Benutzers, ordinal sortiert (für <c>GET /api/me</c>).</summary>
    public static IReadOnlyList<string> Sortiert(Benutzer benutzer)
    {
        ArgumentNullException.ThrowIfNull(benutzer);
        return benutzer.Aktiv ? [.. Von(benutzer.Rolle).Order(StringComparer.Ordinal)] : [];
    }

    private static IReadOnlySet<string> Menge(params string[] berechtigungen) =>
        berechtigungen.ToFrozenSet(StringComparer.Ordinal);
}
