const zahlFormat = new Intl.NumberFormat('de-DE')
const tagFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
})

/** Zahl im Format `de-DE` (Tausenderpunkte). */
export function formatiereZahl(zahl: number): string {
  return zahlFormat.format(zahl)
}

/** Reines Datum `JJJJ-MM-TT` als `TT.MM.JJJJ`, ohne Umrechnung in eine Zeitzone; sonst unverändert. */
export function formatiereKalenderdatum(datum: string): string {
  const teile = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum)
  return teile ? `${teile[3]}.${teile[2]}.${teile[1]}` : datum
}

/** Tag eines Zeitstempels nach Europe/Berlin als `TT.MM.JJJJ`; leer bei ungültigem Wert. */
export function formatiereTag(zeitpunkt: string): string {
  const datum = new Date(zeitpunkt)
  return Number.isNaN(datum.getTime()) ? '' : tagFormat.format(datum)
}

/** Heutiges Datum nach Europe/Berlin als `JJJJ-MM-TT` (coin-ausgaben F8). */
export function heuteInBerlin(jetzt: Date = new Date()): string {
  // en-CA formatiert als JJJJ-MM-TT.
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Berlin',
  }).format(jetzt)
}
