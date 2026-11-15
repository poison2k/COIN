import { formatiereTag, formatiereZahl } from '@/shared/lib/format'

/** Datum `TT.MM.JJJJ` nach Europe/Berlin (R7, gemeinsame Formatfunktion); leer bei ungültigem Wert. */
export function formatiereDatum(iso: string): string {
  return formatiereTag(iso)
}

/** Auflage als Zahl im Format `de-DE` oder „unbekannt“. */
export function formatiereAuflage(auflage: number | null): string {
  return auflage === null ? 'unbekannt' : formatiereZahl(auflage)
}
