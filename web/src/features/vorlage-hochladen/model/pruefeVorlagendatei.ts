/** Höchstgröße einer Vorlage wie im Backend (5 MiB, zertifikatsvorlagen AK-9). Maßgeblich bleibt der Server. */
export const VORLAGE_MAX_BYTES = 5_242_880

export const MELDUNG_KEIN_DOCX = 'Die Datei ist kein Word-Dokument im Format .docx.'
export const MELDUNG_ZU_GROSS = 'Die Vorlage darf höchstens 5 MB groß sein.'
export const MELDUNG_LEER = 'Die Datei ist leer.'

/**
 * Clientseitige Vorprüfung (AK-30): nur Endung `.docx` (ohne Groß-/Kleinschreibung) und Größe. Inhalt, Makros und
 * Platzhalter prüft der Server. `undefined` = keine Beanstandung.
 */
export function pruefeVorlagendatei(datei: File): string | undefined {
  if (!/.\.docx$/i.test(datei.name)) return MELDUNG_KEIN_DOCX
  if (datei.size <= 0) return MELDUNG_LEER
  if (datei.size > VORLAGE_MAX_BYTES) return MELDUNG_ZU_GROSS
  return undefined
}
