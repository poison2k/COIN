import { sende, type ApiErgebnis, type Seite } from '@/shared/api'
import type { Ausgabe, AusgabeStatus } from '../model/types'

/** Einträge je Seite der Historie. */
export const AUSGABEN_JE_SEITE = 25

export interface AusgabenAnfrage {
  /** Filter; ohne Angabe alle. */
  status?: AusgabeStatus
  /** Seite, beginnend bei 1. */
  seite: number
}

/** GET /api/coins/{id}/ausgaben – Historie, neueste zuerst (nur mit issues.read). */
export function ladeAusgaben(coinId: string, { status, seite }: AusgabenAnfrage): Promise<ApiErgebnis<Seite<Ausgabe>>> {
  const query = new URLSearchParams()
  if (status) query.set('status', status)
  query.set('seite', String(seite))
  query.set('groesse', String(AUSGABEN_JE_SEITE))
  return sende<Seite<Ausgabe>>(
    `/api/coins/${encodeURIComponent(coinId)}/ausgaben?${query.toString()}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    [200],
  )
}

/** GET /api/coins/{id}/ausgaben/{ausgabeId} – eine Ausgabe, aktiv oder storniert (nur mit issues.read, AK-22). */
export function ladeAusgabe(coinId: string, ausgabeId: string): Promise<ApiErgebnis<Ausgabe>> {
  return sende<Ausgabe>(
    `/api/coins/${encodeURIComponent(coinId)}/ausgaben/${encodeURIComponent(ausgabeId)}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    [200],
  )
}
