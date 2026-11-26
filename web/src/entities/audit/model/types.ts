/** Person im Audit-Log: nur Id und Name, keine E-Mail (AK-14). */
export interface AuditPerson {
  id: string
  name: string
}

/** Eintrag des Audit-Logs (GET /api/audit, AK-14). `akteur` null = System (Ersteinrichtung). */
export interface AuditEintrag {
  id: string
  zeitpunkt: string
  akteur: AuditPerson | null
  benutzer: AuditPerson
  /** API-Wert der Aktion (Liste über GET /api/audit/aktionen). */
  art: string
  /** Rolle (Administrator, Sachbearbeiter, Betrachter, keine) oder Status (aktiv, deaktiviert). */
  alt: string
  neu: string
}

/** Deutsche Anzeige gespeicherter Werte; Rollennamen bleiben unverändert (AK-31). */
const WERT_ANZEIGE: Readonly<Record<string, string>> = {
  keine: 'Keine Rolle',
  aktiv: 'Aktiv',
  deaktiviert: 'Deaktiviert',
}

export function wertAnzeige(wert: string): string {
  return WERT_ANZEIGE[wert] ?? wert
}

export const SYSTEM_ANZEIGE = 'System (Ersteinrichtung)'

/** Aktionstyp aus GET /api/audit/aktionen: API-Wert und deutscher Anzeigetext (nacharbeiten-audit-filter 4.2). */
export interface AuditAktion {
  wert: string
  bezeichnung: string
}
