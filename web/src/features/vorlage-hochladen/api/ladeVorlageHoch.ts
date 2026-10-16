import { sende, type ApiErgebnis } from '@/shared/api'
import { vorlagenUrl, type VorlagenStatus } from '@/entities/zertifikatsvorlage'

/**
 * POST /api/coins/{id}/zertifikatsvorlage/versionen – multipart mit genau einer Datei im Feld „datei“. Den
 * Content-Type (mit Boundary) setzt der Browser. Bei 400 stehen alle Befunde unter `fehler.datei`.
 */
export function ladeVorlageHoch(coinId: string, datei: File): Promise<ApiErgebnis<VorlagenStatus>> {
  const formular = new FormData()
  formular.append('datei', datei)
  return sende<VorlagenStatus>(`${vorlagenUrl(coinId)}/versionen`, { method: 'POST', body: formular }, [201])
}
