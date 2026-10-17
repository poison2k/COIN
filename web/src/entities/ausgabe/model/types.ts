/** Benutzer als Akteur (Erfasser, Stornierer); der Name kommt aus der Benutzerverwaltung. */
export interface AusgabeAkteur {
  id: string
  name: string
}

/** Storno einer Ausgabe. */
export interface AusgabeStorno {
  /** ISO-8601-Zeitstempel. */
  am: string
  von: AusgabeAkteur
  grund: string
}

/** Eine Ausgabe (coin-ausgaben 5.2, zertifikat-erzeugen 5.3). Enthält Personendaten; nur mit issues.read/issues.write. */
export interface Ausgabe {
  id: string
  exemplarNummer: number
  /** Zertifikatsnummer `C0042-0012`; nach Storno trägt eine Neuausgabe desselben Exemplars dieselbe Nummer. */
  zertifikatsnummer: string
  empfaenger: { name: string; dienstgrad: string | null; dienststelle: string | null }
  /** Reines Datum `JJJJ-MM-TT`. */
  datum: string
  gelegenheit: string
  begruendung: string
  ausgebendeStelle: string
  /** ISO-8601-Zeitstempel. */
  erfasstAm: string
  erfasstVon: AusgabeAkteur
  storno: AusgabeStorno | null
}

/** Filter der Historie. */
export type AusgabeStatus = 'aktiv' | 'storniert'
