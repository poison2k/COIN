import type { ProblemDetails } from './problem-details'

/** Typisiertes Ergebnis eines API-Aufrufs. Es werden keine Ausnahmen geworfen. */
export type ApiErgebnis<T> =
  | { art: 'ok'; daten: T }
  | { art: 'validierung'; fehler: Record<string, string[]> }
  | { art: 'konflikt' }
  | { art: 'zuGross' }
  | { art: 'formatUngueltig' }
  | { art: 'nichtGefunden' }
  | { art: 'fehler' }

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

export async function sende<T>(url: string, init: RequestInit, erfolgsStatus: number[]): Promise<ApiErgebnis<T>> {
  try {
    const antwort = await fetch(url, init)
    return await bildeAb<T>(antwort, erfolgsStatus)
  } catch {
    // Netzwerkfehler: keine technischen Details nach außen geben.
    return { art: 'fehler' }
  }
}
