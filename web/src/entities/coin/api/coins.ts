import { sende, type ApiErgebnis, type Seite } from '@/shared/api'
import type { Coin, CoinAnlegen, CoinAendern } from '../model/types'

const COINS_URL = '/api/coins'

export interface CoinSuche {
  /** Suchbegriff; leer bzw. nur Leerzeichen wird nicht gesendet. */
  suche: string
  /** Seite, beginnend bei 1. */
  seite: number
  groesse: number
}

/** GET /api/coins?suche&seite&groesse – eine Seite des Katalogs (öffentlich). */
export function ladeCoins({ suche, seite, groesse }: CoinSuche): Promise<ApiErgebnis<Seite<Coin>>> {
  const query = new URLSearchParams()
  if (suche.trim() !== '') query.set('suche', suche)
  query.set('seite', String(seite))
  query.set('groesse', String(groesse))
  return sende<Seite<Coin>>(
    `${COINS_URL}?${query.toString()}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    [200],
  )
}

/** GET /api/coins/{id} – ein Coin (öffentlich); 404 → `nichtGefunden`. */
export function ladeCoin(id: string): Promise<ApiErgebnis<Coin>> {
  return sende<Coin>(
    `${COINS_URL}/${encodeURIComponent(id)}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    [200],
  )
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

/**
 * PUT /api/coins/{id}/auflage – Auflage ändern (coin-ausgaben AK-17, nur coins.write). Mit `konfliktDetail` enthält
 * ein 409 (`auflage_zu_klein`) auch den Text des Servers.
 */
export function aendereAuflage(
  id: string,
  auflage: number,
  optionen: { konfliktDetail?: boolean } = {},
): Promise<ApiErgebnis<Coin>> {
  return sende<Coin>(
    `${COINS_URL}/${encodeURIComponent(id)}/auflage`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ auflage }),
    },
    [200],
    optionen,
  )
}

/**
 * PUT /api/coins/{id} – Stammdaten ersetzen (zertifikatsvorlagen AK-22, nur coins.write). Bei 409 enthält das Ergebnis
 * `code` (`coin_existiert`, `auflage_zu_klein`) und den Text des Servers.
 */
export function aendereCoin(id: string, daten: CoinAendern): Promise<ApiErgebnis<Coin>> {
  return sende<Coin>(
    `${COINS_URL}/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: daten.name,
        herausgeber: daten.herausgeber,
        auflage: daten.auflage,
        beschreibung: daten.beschreibung,
      }),
    },
    [200],
    { konfliktDetail: true },
  )
}
