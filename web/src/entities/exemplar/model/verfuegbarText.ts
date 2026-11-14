import { formatiereZahl } from '@/shared/lib/format'

/** Zugänglicher Text des Fortschrittsbalkens „Verfügbar“: „{v} von {a} verfügbar ({p} %)“ (formulare-detailseiten AK-21). */
export function verfuegbarText(verfuegbar: number, auflage: number): string {
  const prozent = auflage > 0 ? Math.round((verfuegbar / auflage) * 100) : 0
  return `${formatiereZahl(verfuegbar)} von ${formatiereZahl(auflage)} verfügbar (${formatiereZahl(prozent)} %)`
}
