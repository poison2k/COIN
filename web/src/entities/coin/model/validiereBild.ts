/** Grenzen des Motivbilds wie in der Domain (katalog-seiten AK-10/AK-11). Maßgeblich bleibt der Server. */
export const BILD_MAX_BYTES = 5_242_880
export const ERLAUBTE_BILDTYPEN = ['image/jpeg', 'image/png', 'image/webp'] as const

export const MELDUNG_BILD_FORMAT = 'Nur JPEG, PNG oder WebP erlaubt.'
export const MELDUNG_BILD_ZU_GROSS = 'Bild ist zu groß (max. 5 MB).'

/** Hinweise zum Dateifeld des Motivbilds (Anlegen und Bearbeiten). */
export const HINWEIS_BILD_FORMATE = 'JPEG, PNG oder WebP, höchstens 5 MB.'
export const HINWEIS_BILD_METADATEN = 'Bitte nur Bilder ohne personenbezogene Metadaten hochladen.'

/** Prüft ein Motivbild nach Typ (laut Browser) und Größe. */
export function validiereBild(bild: File): string | undefined {
  if (!(ERLAUBTE_BILDTYPEN as readonly string[]).includes(bild.type)) return MELDUNG_BILD_FORMAT
  if (bild.size <= 0) return 'Die Bilddatei ist leer.'
  if (bild.size > BILD_MAX_BYTES) return MELDUNG_BILD_ZU_GROSS
  return undefined
}
