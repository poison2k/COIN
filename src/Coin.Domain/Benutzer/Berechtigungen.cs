using System.Collections.Frozen;

namespace Coin.Domain.Benutzer;

/// <summary>Feste Berechtigungen (ADR-0016). Nicht konfigurierbar; jede hat eine gleichnamige Policy in der API.</summary>
public static class Berechtigungen
{
    /// <summary>Katalog lesen. Definiert, aber nicht durchgesetzt, solange der Katalog öffentlich ist (ADR-0014).</summary>
    public const string CoinsRead = "coins.read";

    /// <summary>Coins anlegen, Motivbild hochladen.</summary>
    public const string CoinsWrite = "coins.write";

    /// <summary>Benutzer auflisten, Rolle und Status ändern.</summary>
    public const string UsersManage = "users.manage";

    /// <summary>Audit-Log lesen.</summary>
    public const string AuditRead = "audit.read";

    public static IReadOnlyList<string> Alle { get; } = [CoinsRead, CoinsWrite, UsersManage, AuditRead];
}

/// <summary>Rechtematrix Rolle → Berechtigungen (ADR-0016, <c>docs/berechtigungen.md</c>). Unveränderlich.</summary>
public static class Rechtematrix
{
    private static readonly IReadOnlySet<string> Keine = FrozenSet<string>.Empty;

    private static readonly FrozenDictionary<Rolle, IReadOnlySet<string>> Matrix = new Dictionary<Rolle, IReadOnlySet<string>>
    {
        [Rolle.Administrator] = Menge(Berechtigungen.CoinsRead, Berechtigungen.CoinsWrite, Berechtigungen.UsersManage, Berechtigungen.AuditRead),
        [Rolle.Sachbearbeiter] = Menge(Berechtigungen.CoinsRead, Berechtigungen.CoinsWrite),
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
