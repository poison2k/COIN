import { sende, type ApiErgebnis } from '@/shared/api'
import { vorlagenUrl, type VorlagenStatus } from '@/entities/zertifikatsvorlage'

/** POST /api/coins/{id}/zertifikatsvorlage/zuruecksetzen – ohne Body (ADR-0023 Punkt 6); liefert den Vorlagenstatus. */
export function setzeVorlageZurueck(coinId: string): Promise<ApiErgebnis<VorlagenStatus>> {
  return sende<VorlagenStatus>(
    `${vorlagenUrl(coinId)}/zuruecksetzen`,
    { method: 'POST', headers: { Accept: 'application/json' } },
    [200],
  )
}
