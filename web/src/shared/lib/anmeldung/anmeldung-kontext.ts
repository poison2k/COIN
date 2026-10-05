import { createContext } from 'react'

/** Zustand der Anmeldung im Browser (AK-30). */
export type AnmeldeStatus = 'pruefe' | 'anonym' | 'angemeldet' | 'nichtKonfiguriert'

export interface Anmeldung {
  status: AnmeldeStatus
  /** Kennung der aktuellen Sitzung (nur angemeldet); wechselt nur bei einer neuen Anmeldung, nicht bei Erneuerung. */
  sitzung: string | null
  /** Der Rückruf vom Identitätsanbieter ist fehlgeschlagen (ungültiger State, Abbruch, Netzwerk). */
  rueckrufFehlgeschlagen: boolean
  /** Rückkehrziel aus dem State der Anmeldung, ungeprüft (siehe sicheresZiel). */
  rueckkehrZiel: unknown
  /** Startet die Anmeldung (Weiterleitung zum Identitätsanbieter) mit Rückkehr auf `ziel`. */
  anmelden: (ziel: string) => Promise<void>
  /** Entfernt den lokalen User und leitet zum Abmelden an den Identitätsanbieter (AK-31). */
  abmelden: () => Promise<void>
  /** Entfernt nur den lokalen User (z. B. nach einer 401-Antwort). */
  sitzungVerwerfen: () => Promise<void>
}

const nichts = async () => {}

/** Ohne Konfiguration (VITE_OIDC_*): Katalog lesbar, keine Anmeldung möglich (AK-23). */
export const NICHT_KONFIGURIERT: Anmeldung = {
  status: 'nichtKonfiguriert',
  sitzung: null,
  rueckrufFehlgeschlagen: false,
  rueckkehrZiel: undefined,
  anmelden: nichts,
  abmelden: nichts,
  sitzungVerwerfen: nichts,
}

export const AnmeldungKontext = createContext<Anmeldung>(NICHT_KONFIGURIERT)
