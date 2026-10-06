namespace Coin.Domain.Benutzer;

/// <summary>Persistenz der Benutzerverwaltung (ADR-0017, ADR-0018).</summary>
public interface IBenutzerverwaltungRepository
{
    /// <summary>
    /// Führt <paramref name="aktion"/> in einer Transaktion unter der Sperre der Benutzerverwaltung aus. Alle Rollen- und
    /// Statusänderungen laufen damit nacheinander. Commit nur, wenn die Aktion ohne Ausnahme endet.
    /// </summary>
    Task<T> InSperreAsync<T>(Func<IBenutzerverwaltungSitzung, Task<T>> aktion, CancellationToken ct);

    /// <summary>Benutzer mit <paramref name="suche"/> (Teilstring, wörtlich, ohne Groß-/Kleinschreibung) in Name oder E-Mail.</summary>
    Task<Seite<Benutzer>> SuchenAsync(string? suche, int seite, int groesse, CancellationToken ct);

    /// <summary>Audit-Einträge, neueste zuerst, optional nur für einen Zielbenutzer.</summary>
    Task<Seite<AuditEintragAnsicht>> AuditSeiteAsync(Guid? benutzerId, int seite, int groesse, CancellationToken ct);
}

/// <summary>Zugriffe innerhalb von <see cref="IBenutzerverwaltungRepository.InSperreAsync{T}"/>.</summary>
public interface IBenutzerverwaltungSitzung
{
    Task<Benutzer?> LadenAsync(Guid id, CancellationToken ct);

    Task<int> AnzahlAktiverAdministratorenAsync(CancellationToken ct);

    /// <summary>Speichert Rolle und Status des Benutzers und den Audit-Eintrag in derselben Transaktion.</summary>
    Task SpeichernAsync(Benutzer benutzer, AuditEintrag eintrag, CancellationToken ct);
}
