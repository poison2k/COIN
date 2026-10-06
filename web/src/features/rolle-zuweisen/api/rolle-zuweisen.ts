import type { BenutzerEintrag, Rolle } from '@/entities/benutzer'
import { sende, type ApiErgebnis } from '@/shared/api'

/** PUT /api/benutzer/{id}/rolle (AK-12). „keine“ entzieht die Rolle. */
export function weiseRolleZu(id: string, rolle: Rolle): Promise<ApiErgebnis<BenutzerEintrag>> {
  return sende<BenutzerEintrag>(
    `/api/benutzer/${encodeURIComponent(id)}/rolle`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ rolle }),
    },
    [200],
  )
}
