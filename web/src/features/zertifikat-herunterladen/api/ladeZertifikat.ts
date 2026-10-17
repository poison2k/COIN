import { ladeDatei, type ApiErgebnis, type Datei } from '@/shared/api'

/**
 * GET /api/coins/{id}/ausgaben/{ausgabeId}/zertifikat – das DOCX per `fetch` mit Token, nie mit Token in der URL
 * (zertifikat-erzeugen, AK-25). 409 mit `code` und `detail` (`ausgabe_storniert`, `vorlage_zu_viele_platzhalter`).
 */
export function ladeZertifikat(coinId: string, ausgabeId: string): Promise<ApiErgebnis<Datei>> {
  return ladeDatei(`/api/coins/${encodeURIComponent(coinId)}/ausgaben/${encodeURIComponent(ausgabeId)}/zertifikat`, {
    konfliktDetail: true,
  })
}
