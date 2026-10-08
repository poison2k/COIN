import { sende, type ApiErgebnis } from '@/shared/api'
import type { ExemplarSeite, ExemplarStatus } from '../model/types'

/** Einträge je Seite (AK-20). */
export const EXEMPLARE_JE_SEITE = 25

export interface ExemplareAnfrage {
  /** Filter; ohne Angabe alle. */
  status?: ExemplarStatus
  /** Seite, beginnend bei 1. */
  seite: number
}

/** GET /api/coins/{id}/exemplare – Kennzahlen und Exemplare (nur mit coins.read, ADR-0021). */
export function ladeExemplare(
  coinId: string,
  { status, seite }: ExemplareAnfrage,
): Promise<ApiErgebnis<ExemplarSeite>> {
  const query = new URLSearchParams()
  if (status) query.set('status', status)
  query.set('seite', String(seite))
  query.set('groesse', String(EXEMPLARE_JE_SEITE))
  return sende<ExemplarSeite>(
    `/api/coins/${encodeURIComponent(coinId)}/exemplare?${query.toString()}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    [200],
  )
}
