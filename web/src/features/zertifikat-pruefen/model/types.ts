/** Ergebnisart einer Prüfung (hologrammnummer, Abschnitt 5.4). */
export type PruefErgebnisArt = 'gueltig' | 'storniert' | 'falscherCoin' | 'nichtGefunden'

/**
 * Datensatz einer Prüfung bei `gueltig` und `storniert`. Ohne issues.read nur Coin, Exemplar, Nummern, Datum und Status;
 * über `…/mit-empfaenger` zusätzlich die Angaben der Ausgabe. Nie ein Storno-Grund (H7).
 */
export interface PruefDatensatz {
  coin: { id: string; name: string }
  exemplarNummer: number
  zertifikatsnummer: string
  hologrammnummer: string
  /** Ausgabedatum `JJJJ-MM-TT`. */
  datum: string
  status: 'aktiv' | 'storniert'
  /** Storno-Datum `JJJJ-MM-TT` oder `null`. */
  storniertAm: string | null
  ausgabeId?: string
  empfaenger?: { name: string; dienstgrad: string | null; dienststelle: string | null }
  gelegenheit?: string
  begruendung?: string
  ausgebendeStelle?: string
}

/** Antwort von POST /api/pruefung bzw. …/mit-empfaenger; `datensatz` ist bei falscherCoin/nichtGefunden `null`. */
export interface PruefErgebnis {
  ergebnis: PruefErgebnisArt
  datensatz: PruefDatensatz | null
}
