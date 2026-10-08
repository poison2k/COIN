import type { Ausgabe } from '@/entities/ausgabe'
import { sende, type ApiErgebnis } from '@/shared/api'

/** POST /api/coins/{id}/ausgaben/{ausgabeId}/storno – nur mit issues.write; 409 `bereits_storniert` (AK-12). */
export function storniereAusgabe(coinId: string, ausgabeId: string, grund: string): Promise<ApiErgebnis<Ausgabe>> {
  return sende<Ausgabe>(
    `/api/coins/${encodeURIComponent(coinId)}/ausgaben/${encodeURIComponent(ausgabeId)}/storno`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ grund }),
    },
    [200],
  )
}
