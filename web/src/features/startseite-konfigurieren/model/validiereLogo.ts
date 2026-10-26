import { LOGO_MAX_BYTES, type LogoPlatz } from '@/entities/startseite'

const ERLAUBTE_TYPEN = new Set(['image/png', 'image/jpeg', 'image/webp'])

/** Genitiv für Meldungen: „des Bereitstellers“ bzw. „der Software“. */
export const LOGO_GENITIV: Readonly<Record<LogoPlatz, string>> = {
  bereitsteller: 'des Bereitstellers',
  software: 'der Software',
}

/**
 * Client-Vorprüfung einer Logo-Datei (AK-30): Typ laut Browser und Größe ≤ 2 MiB, Meldungen aus 5.5. Den Inhalt prüft
 * der Server (ADR-0031); `null` = keine Beanstandung.
 */
export function validiereLogo(datei: File, platz: LogoPlatz): string | null {
  if (datei.type === 'image/svg+xml') {
    return 'SVG-Dateien sind nicht erlaubt. Bitte das Logo als PNG, JPEG oder WebP hochladen.'
  }
  if (!ERLAUBTE_TYPEN.has(datei.type)) return 'Die Datei ist kein Bild im Format PNG, JPEG oder WebP.'
  if (datei.size === 0) return 'Die Datei ist leer.'
  if (datei.size > LOGO_MAX_BYTES) return `Das Logo ${LOGO_GENITIV[platz]} darf höchstens 2 MB groß sein.`
  return null
}
