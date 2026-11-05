import type { Ausgabe } from '@/entities/ausgabe'
import { sende, type ApiErgebnis } from '@/shared/api'

/** Body von PUT …/hologrammnummer (hologrammnummer, Abschnitt 5.2). */
export interface HologrammnummerAenderung {
  hologrammnummer: string
  /** Pflicht bei einer Korrektur; beim Ergänzen ignoriert der Server ihn. */
  grund: string | null
  /** Nummer, die der Benutzer gesehen hat (`null` = keine); Abweichung → 409 `hologrammnummer_geaendert`. */
  bisherige: string | null
}

/**
 * PUT /api/coins/{id}/ausgaben/{ausgabeId}/hologrammnummer – nur mit issues.write (AK-10, AK-11). 200 mit der Ausgabe;
 * 409 mit `code` (`hologrammnummer_vergeben`, `hologrammnummer_geaendert`, `ausgabe_storniert`).
 */
export function aendereHologrammnummer(
  coinId: string,
  ausgabeId: string,
  daten: HologrammnummerAenderung,
): Promise<ApiErgebnis<Ausgabe>> {
  return sende<Ausgabe>(
    `/api/coins/${encodeURIComponent(coinId)}/ausgaben/${encodeURIComponent(ausgabeId)}/hologrammnummer`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(daten),
    },
    [200],
  )
}
