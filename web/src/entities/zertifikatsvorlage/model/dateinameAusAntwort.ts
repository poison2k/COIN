import { dateiname } from '../api/vorlagen'

/** Zulässige Dateinamen aus dem Header: nur ASCII-Buchstaben, Ziffern und Bindestriche (Abschnitt 5.2). */
const ERLAUBTER_NAME = /^zertifikatsvorlage-[A-Za-z0-9-]+\.docx$/

/**
 * Dateiname eines Downloads (zertifikatsvorlagen AK-30, Rev. 3): der Name aus `Content-Disposition`, wenn er dem
 * Muster `zertifikatsvorlage-….docx` entspricht, sonst der Name nach Abschnitt 5.2 aus dem bekannten Stand. So passt
 * der Name der aktuellen Vorlage auch dann, wenn inzwischen eine neue Version hochgeladen wurde.
 */
export function dateinameAusAntwort(
  ausHeader: string | null | undefined,
  coinId?: string,
  version?: number | null,
): string {
  return typeof ausHeader === 'string' && ERLAUBTER_NAME.test(ausHeader) ? ausHeader : dateiname(coinId, version)
}
