/** Zulässiger Name aus `Content-Disposition` (AK-25). */
const ERLAUBTER_NAME = /^Zertifikat_C[0-9]{4,}-[0-9]{4,7}\.docx$/

/** Zulässige Zertifikatsnummer für den Rückfallnamen. */
const ERLAUBTE_NUMMER = /^C[0-9]{4,}-[0-9]{4,7}$/

/**
 * Dateiname eines Zertifikat-Downloads (zertifikat-erzeugen, AK-25): der Name aus `Content-Disposition`, wenn er dem
 * Muster `Zertifikat_C….docx` entspricht, sonst `Zertifikat_{nummer}.docx` aus den geladenen Daten; ist auch die
 * Nummer ungültig, `Zertifikat.docx`.
 */
export function zertifikatDateiname(ausHeader: string | null | undefined, nummer: string): string {
  if (typeof ausHeader === 'string' && ERLAUBTER_NAME.test(ausHeader)) return ausHeader
  return ERLAUBTE_NUMMER.test(nummer) ? `Zertifikat_${nummer}.docx` : 'Zertifikat.docx'
}
