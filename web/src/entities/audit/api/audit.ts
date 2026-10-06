import { sende, type ApiErgebnis, type Seite } from '@/shared/api'
import type { AuditEintrag } from '../model/types'

export interface AuditLogAnfrage {
  /** Nur Einträge zu diesem Zielbenutzer; ohne Angabe alle. */
  benutzerId?: string
  seite: number
  groesse: number
}

/** GET /api/audit – nur mit audit.read (AK-14). */
export function ladeAuditLog({
  benutzerId,
  seite,
  groesse,
}: AuditLogAnfrage): Promise<ApiErgebnis<Seite<AuditEintrag>>> {
  const query = new URLSearchParams()
  if (benutzerId) query.set('benutzerId', benutzerId)
  query.set('seite', String(seite))
  query.set('groesse', String(groesse))
  return sende<Seite<AuditEintrag>>(
    `/api/audit?${query.toString()}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    [200],
  )
}
