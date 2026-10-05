import type { Coin, CoinAnlegen, ProblemDetails } from './types'

const COINS_URL = '/api/coins'

/** Typisiertes Ergebnis eines API-Aufrufs. Es werden keine Ausnahmen geworfen. */
export type ApiErgebnis<T> =
  | { art: 'ok'; daten: T }
  | { art: 'validierung'; fehler: Record<string, string[]> }
  | { art: 'konflikt' }
  | { art: 'zuGross' }
  | { art: 'formatUngueltig' }
  | { art: 'nichtGefunden' }
  | { art: 'fehler' }

async function leseJson(antwort: Response): Promise<unknown> {
  try {
    return await antwort.json()
  } catch {
    return null
  }
}

async function bildeAb<T>(antwort: Response, erfolgsStatus: number[]): Promise<ApiErgebnis<T>> {
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

async function sende<T>(url: string, init: RequestInit, erfolgsStatus: number[]): Promise<ApiErgebnis<T>> {
  try {
    const antwort = await fetch(url, init)
    return await bildeAb<T>(antwort, erfolgsStatus)
  } catch {
    // Netzwerkfehler: keine technischen Details nach außen geben.
    return { art: 'fehler' }
  }
}

/** GET /api/coins */
export function ladeCoins(): Promise<ApiErgebnis<Coin[]>> {
  return sende<Coin[]>(COINS_URL, { method: 'GET', headers: { Accept: 'application/json' } }, [200])
}

/** POST /api/coins */
export function legeCoinAn(daten: CoinAnlegen): Promise<ApiErgebnis<Coin>> {
  return sende<Coin>(
    COINS_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(daten),
    },
    [201, 200],
  )
}

/** PUT /api/coins/{id}/bild – multipart, Feld „datei“. Content-Type (mit Boundary) setzt der Browser. */
export function ladeBildHoch(id: string, datei: File): Promise<ApiErgebnis<Coin>> {
  const formData = new FormData()
  formData.append('datei', datei)
  return sende<Coin>(`${COINS_URL}/${encodeURIComponent(id)}/bild`, { method: 'PUT', body: formData }, [200])
}
