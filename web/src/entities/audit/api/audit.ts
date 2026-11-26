import { sende, type ApiErgebnis, type Seite } from '@/shared/api'
import type { AuditAktion, AuditEintrag } from '../model/types'

export interface AuditLogAnfrage {
  /** Ab diesem Kalendertag (JJJJ-MM-TT, Europe/Berlin); ohne Angabe ohne Untergrenze. */
  von?: string
  /** Bis einschließlich zu diesem Kalendertag (JJJJ-MM-TT); ohne Angabe ohne Obergrenze. */
  bis?: string
  /** API-Werte der Aktionen (je Wert ein Parameter `aktion`); leer oder ohne Angabe alle. */
  aktionen?: ReadonlyArray<string>
  /** Nur Einträge zu diesem Zielbenutzer; ohne Angabe alle. */
  benutzerId?: string
  seite: number
  groesse: number
}

/** GET /api/audit – nur mit audit.read (AK-14), Filter nach nacharbeiten-audit-filter 4.1. */
export function ladeAuditLog({
  von,
  bis,
  aktionen = [],
  benutzerId,
  seite,
  groesse,
}: AuditLogAnfrage): Promise<ApiErgebnis<Seite<AuditEintrag>>> {
  const query = new URLSearchParams()
  if (von) query.set('von', von)
  if (bis) query.set('bis', bis)
  for (const aktion of aktionen) query.append('aktion', aktion)
  if (benutzerId) query.set('benutzerId', benutzerId)
  query.set('seite', String(seite))
  query.set('groesse', String(groesse))
  return sende<Seite<AuditEintrag>>(
    `/api/audit?${query.toString()}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    [200],
  )
}

/** GET /api/audit/aktionen – Aktionstypen für den Filter (nacharbeiten-audit-filter 4.2). */
export function ladeAuditAktionen(): Promise<ApiErgebnis<AuditAktion[]>> {
  return sende<AuditAktion[]>('/api/audit/aktionen', { method: 'GET', headers: { Accept: 'application/json' } }, [200])
}
