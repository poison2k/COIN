import { sende, type ApiErgebnis } from '@/shared/api'
import type { Benutzer } from '../model/types'

/** GET /api/me – nur angemeldet aufrufen (AK-28). */
export function ladeAngemeldetenBenutzer(): Promise<ApiErgebnis<Benutzer>> {
  return sende<Benutzer>('/api/me', { method: 'GET', headers: { Accept: 'application/json' } }, [200])
}
