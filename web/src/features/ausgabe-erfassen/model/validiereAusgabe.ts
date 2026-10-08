/** Wahl des Exemplars: nächstes freies oder eine bestimmte Nummer (AK-27). */
export type ExemplarWahl = 'naechste' | 'nummer'

/** Rohwerte des Formulars „Ausgabe erfassen“ (alle Felder als Text). */
export interface AusgabeEingaben {
  wahl: ExemplarWahl
  exemplarNummer: string
  empfaengerName: string
  empfaengerDienstgrad: string
  empfaengerDienststelle: string
  datum: string
  gelegenheit: string
  begruendung: string
  ausgebendeStelle: string
}

export type AusgabeFeld = Exclude<keyof AusgabeEingaben, 'wahl'>

/** Fehler je Feld; nur ungültige Felder haben einen Eintrag. */
export type AusgabeFehler = Partial<Record<AusgabeFeld, string>>

export interface AusgabeKontext {
  /** Auflage des Coins (Obergrenze der Exemplar-Nummer). */
  auflage: number
  /** Heute nach Europe/Berlin als `JJJJ-MM-TT` (F8). */
  heute: string
}

/** Reihenfolge der Felder im Formular (Fokus auf das erste fehlerhafte Feld). */
export const FELD_REIHENFOLGE: readonly AusgabeFeld[] = [
  'exemplarNummer',
  'empfaengerName',
  'empfaengerDienstgrad',
  'empfaengerDienststelle',
  'datum',
  'gelegenheit',
  'begruendung',
  'ausgebendeStelle',
]

function pflicht(wert: string, max: number, bezeichnung: string): string | undefined {
  const text = wert.trim()
  if (text === '') return `${bezeichnung} ist erforderlich.`
  return text.length > max ? `${bezeichnung} darf höchstens ${max} Zeichen lang sein.` : undefined
}

function optional(wert: string, max: number, bezeichnung: string): string | undefined {
  return wert.trim().length > max ? `${bezeichnung} darf höchstens ${max} Zeichen lang sein.` : undefined
}

/** Clientseitige Prüfung mit denselben Texten wie die API (coin-ausgaben AK-7, AK-27). */
export function validiereAusgabe(eingaben: AusgabeEingaben, { auflage, heute }: AusgabeKontext): AusgabeFehler {
  const fehler: AusgabeFehler = {}

  if (eingaben.wahl === 'nummer') {
    const roh = eingaben.exemplarNummer.trim()
    const nummer = /^\d+$/.test(roh) ? Number(roh) : Number.NaN
    if (roh === '') fehler.exemplarNummer = 'Exemplar-Nummer ist erforderlich.'
    else if (!(nummer >= 1 && nummer <= auflage))
      fehler.exemplarNummer = `Exemplar-Nummer muss zwischen 1 und ${auflage} liegen.`
  }

  const pruefungen: Array<[AusgabeFeld, string | undefined]> = [
    ['empfaengerName', pflicht(eingaben.empfaengerName, 200, 'Name des Empfängers')],
    ['empfaengerDienstgrad', optional(eingaben.empfaengerDienstgrad, 100, 'Dienstgrad')],
    ['empfaengerDienststelle', optional(eingaben.empfaengerDienststelle, 200, 'Dienststelle')],
    ['gelegenheit', pflicht(eingaben.gelegenheit, 200, 'Gelegenheit')],
    ['begruendung', pflicht(eingaben.begruendung, 2000, 'Begründung')],
    ['ausgebendeStelle', pflicht(eingaben.ausgebendeStelle, 200, 'Ausgebende Stelle')],
  ]
  for (const [feld, meldung] of pruefungen) if (meldung) fehler[feld] = meldung

  const datum = eingaben.datum.trim()
  if (datum === '') fehler.datum = 'Datum ist erforderlich.'
  else if (datum > heute) fehler.datum = 'Das Datum darf nicht in der Zukunft liegen.'

  return fehler
}
