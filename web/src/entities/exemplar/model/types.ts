/** Status eines Exemplars, abgeleitet aus der aktiven Ausgabe (coin-ausgaben AK-3). */
export type ExemplarStatus = 'verfuegbar' | 'ausgegeben'

/** Ein Exemplar ohne Ausgabedaten (AK-4). */
export interface Exemplar {
  nummer: number
  status: ExemplarStatus
}

/** Kennzahlen eines Coins über alle Exemplare. */
export interface Kennzahlen {
  auflage: number | null
  ausgegeben: number
  verfuegbar: number
}

/** Antwort von GET /api/coins/{id}/exemplare. */
export interface ExemplarSeite {
  kennzahlen: Kennzahlen
  eintraege: Exemplar[]
  gesamt: number
  seite: number
  groesse: number
}
