import { createContext, useContext } from 'react'
import type { Benutzer } from '@/entities/benutzer'
import type { Erfassen } from '@/pages/coin-liste'
import type { BenutzerZustand } from '@/widgets/app-shell'

/** Der angemeldete Benutzer (aus /api/me, einmal pro Anmeldung geladen) und was daraus für die Seiten folgt. */
export interface BenutzerKontextWert {
  zustand: BenutzerZustand
  /** Benutzer laut /api/me; `null`, solange nicht angemeldet, nicht geladen oder bei einem Fehler. */
  benutzer: Benutzer | null
  /** Abschnitt „Neuen Coin erfassen“ auf /coins (AK-33). */
  erfassen: Erfassen
}

export const BenutzerKontext = createContext<BenutzerKontextWert>({
  zustand: { art: 'nichtKonfiguriert' },
  benutzer: null,
  erfassen: 'anmelden',
})

export function useBenutzerKontext(): BenutzerKontextWert {
  return useContext(BenutzerKontext)
}
