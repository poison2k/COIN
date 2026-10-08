import type { Ausgabe } from '@/entities/ausgabe'
import { sende, type ApiErgebnis } from '@/shared/api'

/** Request von POST /api/coins/{id}/ausgaben (coin-ausgaben 5.2). */
export interface AusgabeErfassen {
  /** `null` = nächstes freies Exemplar. */
  exemplarNummer: number | null
  empfaengerName: string
  empfaengerDienstgrad: string | null
  empfaengerDienststelle: string | null
  /** `JJJJ-MM-TT`. */
  datum: string
  gelegenheit: string
  begruendung: string
  ausgebendeStelle: string
}

/** POST /api/coins/{id}/ausgaben – nur mit issues.write; 409 mit `code` (AK-8). */
export function erfasseAusgabe(coinId: string, daten: AusgabeErfassen): Promise<ApiErgebnis<Ausgabe>> {
  return sende<Ausgabe>(
    `/api/coins/${encodeURIComponent(coinId)}/ausgaben`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(daten),
    },
    [201],
  )
}
