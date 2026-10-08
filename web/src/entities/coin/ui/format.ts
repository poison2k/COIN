const datumsFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
const zahlFormat = new Intl.NumberFormat('de-DE')

/** Datum im Format `de-DE` (TT.MM.JJJJ); leer bei ungültigem Wert. */
export function formatiereDatum(iso: string): string {
  const datum = new Date(iso)
  return Number.isNaN(datum.getTime()) ? '' : datumsFormat.format(datum)
}

/** Auflage als Zahl im Format `de-DE` oder „unbekannt“. */
export function formatiereAuflage(auflage: number | null): string {
  return auflage === null ? 'unbekannt' : zahlFormat.format(auflage)
}
