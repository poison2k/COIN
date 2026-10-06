import type { BenutzerEintrag } from '@/entities/benutzer'
import { sende, type ApiErgebnis } from '@/shared/api'

/** PUT /api/benutzer/{id}/status (AK-13). Deaktivieren entzieht keine Rolle. */
export function setzeStatus(id: string, aktiv: boolean): Promise<ApiErgebnis<BenutzerEintrag>> {
  return sende<BenutzerEintrag>(
    `/api/benutzer/${encodeURIComponent(id)}/status`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ aktiv }),
    },
    [200],
  )
}
