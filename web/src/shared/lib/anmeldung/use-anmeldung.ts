import { useContext } from 'react'
import { AnmeldungKontext, type Anmeldung } from './anmeldung-kontext'

/** Anmeldezustand und Aktionen; außerhalb eines AnmeldungProviders „nicht konfiguriert“. */
export function useAnmeldung(): Anmeldung {
  return useContext(AnmeldungKontext)
}
