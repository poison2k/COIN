import { sende, type ApiErgebnis, type Seite } from '@/shared/api'
import type { Benutzer, BenutzerEintrag } from '../model/types'

/** GET /api/me – nur angemeldet aufrufen (AK-28). Deaktiviert: `keinZugriff` mit `grund: 'deaktiviert'` (AK-32). */
export function ladeAngemeldetenBenutzer(): Promise<ApiErgebnis<Benutzer>> {
  return sende<Benutzer>('/api/me', { method: 'GET', headers: { Accept: 'application/json' } }, [200])
}

export interface BenutzerlisteAnfrage {
  /** Suchbegriff; leer = alle. */
  suche: string
  seite: number
  groesse: number
}

/** GET /api/benutzer – nur mit users.manage (AK-11). Die Suche geht URL-kodiert als Query-Parameter. */
export function ladeBenutzerliste({
  suche,
  seite,
  groesse,
}: BenutzerlisteAnfrage): Promise<ApiErgebnis<Seite<BenutzerEintrag>>> {
  const query = new URLSearchParams()
  if (suche.trim() !== '') query.set('suche', suche)
  query.set('seite', String(seite))
  query.set('groesse', String(groesse))
  return sende<Seite<BenutzerEintrag>>(
    `/api/benutzer?${query.toString()}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    [200],
  )
}
