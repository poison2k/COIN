const zahlFormat = new Intl.NumberFormat('de-DE')
const tagFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
})

const zeitpunktFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
})

const zeitpunktSekundenFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
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

/**
 * Tag und Uhrzeit eines Zeitstempels nach Europe/Berlin als `TT.MM.JJJJ, HH:MM Uhr` (R7, startseite-listen-pruefung);
 * leer bei ungültigem Wert.
 */
export function formatiereZeitpunkt(zeitpunkt: string): string {
  const datum = new Date(zeitpunkt)
  return Number.isNaN(datum.getTime()) ? '' : `${zeitpunktFormat.format(datum)} Uhr`
}

/** Wie `formatiereZeitpunkt`, mit Sekunden (`TT.MM.JJJJ, HH:MM:SS Uhr`), z. B. für `title`; leer bei ungültigem Wert. */
export function formatiereZeitpunktMitSekunden(zeitpunkt: string): string {
  const datum = new Date(zeitpunkt)
  return Number.isNaN(datum.getTime()) ? '' : `${zeitpunktSekundenFormat.format(datum)} Uhr`
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
