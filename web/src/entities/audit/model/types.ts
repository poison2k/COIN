/** Person im Audit-Log: nur Id und Name, keine E-Mail (AK-14). */
export interface AuditPerson {
  id: string
  name: string
}

/** Eintrag des Audit-Logs (GET /api/audit, AK-14). `akteur` null = System (Bootstrap). */
export interface AuditEintrag {
  id: string
  zeitpunkt: string
  akteur: AuditPerson | null
  benutzer: AuditPerson
  art: 'Rolle' | 'Status'
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

export const SYSTEM_ANZEIGE = 'System (Bootstrap)'

const ZEITFORMAT = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/** Zeitpunkt als deutsches Datum mit Uhrzeit (lokale Zeitzone). */
export function zeitpunktAnzeige(zeitpunkt: string): string {
  const datum = new Date(zeitpunkt)
  return Number.isNaN(datum.getTime()) ? zeitpunkt : ZEITFORMAT.format(datum)
}
