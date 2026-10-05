import { holeToken } from '@/shared/lib/anmeldung'
import type { ProblemDetails } from './problem-details'

/** Typisiertes Ergebnis eines API-Aufrufs. Es werden keine Ausnahmen geworfen. */
export type ApiErgebnis<T> =
  | { art: 'ok'; daten: T }
  | { art: 'validierung'; fehler: Record<string, string[]> }
  | { art: 'nichtAngemeldet' }
  | { art: 'keinZugriff' }
  | { art: 'konflikt' }
  | { art: 'zuGross' }
  | { art: 'formatUngueltig' }
  | { art: 'nichtGefunden' }
  | { art: 'fehler' }

/** Wird bei 401 auf einen schreibenden Aufruf ausgelöst (Sitzung abgelaufen, AK-27). */
let beiNichtAngemeldet: (() => void) | null = null

/** Registriert die Reaktion auf 401 bei schreibenden Aufrufen; `null` entfernt sie. */
export function setzeBeiNichtAngemeldet(callback: (() => void) | null): void {
  beiNichtAngemeldet = callback
}

/** Das Token geht nur an die eigene API: gleiche Origin und Pfad unter /api/ (kein Token-Abfluss an Dritte). */
function istEigeneApi(url: string): boolean {
  try {
    const ziel = new URL(url, window.location.origin)
    return ziel.origin === window.location.origin && ziel.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

const LESENDE_METHODEN = new Set(['GET', 'HEAD', 'OPTIONS'])

export async function leseJson(antwort: Response): Promise<unknown> {
  try {
    return await antwort.json()
  } catch {
    return null
  }
}

export async function bildeAb<T>(antwort: Response, erfolgsStatus: number[]): Promise<ApiErgebnis<T>> {
  if (erfolgsStatus.includes(antwort.status)) {
    const daten = await leseJson(antwort)
    return daten === null ? { art: 'fehler' } : { art: 'ok', daten: daten as T }
  }
  switch (antwort.status) {
    case 400: {
      const problem = (await leseJson(antwort)) as ProblemDetails | null
      return { art: 'validierung', fehler: problem?.errors ?? {} }
    }
    case 401:
      return { art: 'nichtAngemeldet' }
    case 403:
      return { art: 'keinZugriff' }
    case 404:
      return { art: 'nichtGefunden' }
    case 409:
      return { art: 'konflikt' }
    case 413:
      return { art: 'zuGross' }
    case 415:
      return { art: 'formatUngueltig' }
    default:
      return { art: 'fehler' }
  }
}

/**
 * Sendet eine Anfrage an die API. Angemeldet mit `Authorization: Bearer` (AK-27); das Token wird bei jedem Aufruf
 * neu gelesen. Das Motivbild lädt der Browser per <img src> ohne diesen Weg (öffentlich, ADR-0014).
 */
export async function sende<T>(url: string, init: RequestInit, erfolgsStatus: number[]): Promise<ApiErgebnis<T>> {
  try {
    const headers = new Headers(init.headers)
    const token = await holeToken()
    if (token && istEigeneApi(url)) headers.set('Authorization', `Bearer ${token}`)

    const antwort = await fetch(url, { ...init, headers })
    const methode = (init.method ?? 'GET').toUpperCase()
    if (antwort.status === 401 && !LESENDE_METHODEN.has(methode)) beiNichtAngemeldet?.()
    return await bildeAb<T>(antwort, erfolgsStatus)
  } catch {
    // Netzwerkfehler: keine technischen Details nach außen geben.
    return { art: 'fehler' }
  }
}
