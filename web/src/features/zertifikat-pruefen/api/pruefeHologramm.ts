import { sende, type ApiErgebnis } from '@/shared/api'
import type { PruefErgebnis } from '../model/types'

/** Request der Prüfung (hologrammnummer, Abschnitt 5.2). */
export interface PruefAnfrage {
  hologrammnummer: string
  /** Gewählter Coin oder `null`. */
  coinId: string | null
}

/**
 * POST /api/pruefung (coins.read) bzw. POST /api/pruefung/mit-empfaenger (issues.read, `mitEmpfaenger`). Die Nummer
 * steht nur im Body, nie in der URL (ADR-0034 Punkt 1). 429 → `zuVieleAnfragen` mit der Wartezeit aus `Retry-After`.
 */
export function pruefeHologramm(
  anfrage: PruefAnfrage,
  { mitEmpfaenger }: { mitEmpfaenger: boolean },
): Promise<ApiErgebnis<PruefErgebnis>> {
  return sende<PruefErgebnis>(
    mitEmpfaenger ? '/api/pruefung/mit-empfaenger' : '/api/pruefung',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ hologrammnummer: anfrage.hologrammnummer, coinId: anfrage.coinId }),
    },
    [200],
  )
}
