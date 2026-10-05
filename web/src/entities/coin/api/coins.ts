import { sende, type ApiErgebnis } from '@/shared/api'
import type { Coin, CoinAnlegen } from '../model/types'

const COINS_URL = '/api/coins'

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
