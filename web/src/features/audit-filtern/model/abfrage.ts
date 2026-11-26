// Abfrage des Änderungsprotokolls und ihre Darstellung in der URL (nacharbeiten-audit-filter 4.4, ADR-0045 Punkt 4).
// In der URL stehen `von`, `bis`, `aktion` (kommagetrennt), `benutzer` (nur die GUID, nie der Name) und `seite`
// (erst ab 2). Leere Filter und Seite 1 entfallen.

/** Abfrage des Änderungsprotokolls: Filter und Seite. */
export interface AuditAbfrage {
  /** Kalendertag JJJJ-MM-TT (inklusive). */
  von?: string
  /** Kalendertag JJJJ-MM-TT (inklusive). */
  bis?: string
  /** API-Werte der Aktionen. */
  aktionen: string[]
  /** GUID des geänderten Benutzers. */
  benutzerId?: string
  seite: number
}

/** Suchparameter der Filter, wie sie die Route aus der URL liest. */
export interface AuditSuche {
  von?: string
  bis?: string
  aktion?: string
  benutzer?: string
  seite?: number
}

export const LEERE_ABFRAGE: AuditAbfrage = { aktionen: [], seite: 1 }

export function abfrageAusSuche(suche: AuditSuche): AuditAbfrage {
  return {
    von: suche.von,
    bis: suche.bis,
    aktionen: suche.aktion ? suche.aktion.split(',').filter((wert) => wert !== '') : [],
    benutzerId: suche.benutzer,
    seite: suche.seite ?? 1,
  }
}

export function sucheAusAbfrage(abfrage: AuditAbfrage): AuditSuche {
  const suche: AuditSuche = {}
  if (abfrage.von) suche.von = abfrage.von
  if (abfrage.bis) suche.bis = abfrage.bis
  if (abfrage.aktionen.length > 0) suche.aktion = abfrage.aktionen.join(',')
  if (abfrage.benutzerId) suche.benutzer = abfrage.benutzerId
  if (abfrage.seite > 1) suche.seite = abfrage.seite
  return suche
}

/** Ist mindestens ein Filter gesetzt (Zeitraum, Aktion oder Benutzer)? */
export function hatFilter(abfrage: AuditAbfrage): boolean {
  return Boolean(abfrage.von || abfrage.bis || abfrage.aktionen.length > 0 || abfrage.benutzerId)
}
