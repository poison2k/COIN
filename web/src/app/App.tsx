import { RouterProvider } from '@tanstack/react-router'
import type { UserManager } from 'oidc-client-ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { setzeBeiNichtAngemeldet } from '@/shared/api'
import { leseOidcKonfig } from '@/shared/config'
import { AnmeldungProvider, erstelleUserManager, useAnmeldung } from '@/shared/lib/anmeldung'
import { ThemeProvider } from '@/shared/lib/theme'
import { BenutzerKontext, type BenutzerKontextWert } from './anmeldung/benutzer-kontext'
import { useBenutzer } from './anmeldung/use-benutzer'
import { erstelleRouter, type AppRouter, type RouterKontext } from './router/router'
import type { SchutzKontext } from './router/schutz'

export interface AppProps {
  /** Optionaler Router, z. B. mit Memory-History in Tests. */
  router?: AppRouter
  /**
   * Optionaler UserManager (Tests). `null` = Anmeldung nicht konfiguriert; ohne Angabe aus VITE_OIDC_* (AK-23).
   */
  userManager?: UserManager | null
}

function userManagerAusUmgebung(): UserManager | null {
  const konfig = leseOidcKonfig(import.meta.env)
  return konfig ? erstelleUserManager(konfig) : null
}

export default function App({ router, userManager }: AppProps) {
  // Router und UserManager werden einmalig erzeugt, sofern keine übergeben wurden.
  const [aktiverRouter] = useState(() => router ?? erstelleRouter())
  const [aktiverUserManager] = useState(() => (userManager === undefined ? userManagerAusUmgebung() : userManager))

  return (
    <ThemeProvider defaultTheme="system" storageKey="coin-theme">
      <AnmeldungProvider userManager={aktiverUserManager}>
        <AppMitAnmeldung router={aktiverRouter} />
      </AnmeldungProvider>
    </ThemeProvider>
  )
}

/**
 * Verbindet Anmeldung, Benutzer (/api/me, einmal pro Anmeldung) und Router (anmeldung-keycloak, Abschnitt 5.5).
 * Die Guards im Router warten über `schutz()`, bis der Anmeldezustand feststeht.
 */
function AppMitAnmeldung({ router }: { router: AppRouter }) {
  const anmeldung = useAnmeldung()
  const { bereit, ...benutzerWert } = useBenutzer(anmeldung)
  const { zustand, benutzer, erfassen } = benutzerWert
  const { status, anmelden, sitzungVerwerfen } = anmeldung

  // 401 auf einen schreibenden Aufruf: Sitzung verwerfen und mit Rückkehr auf den aktuellen Pfad anmelden (AK-27).
  useEffect(() => {
    setzeBeiNichtAngemeldet(() => {
      const ziel = router.state.location.href
      void sitzungVerwerfen().then(() => anmelden(ziel))
    })
    return () => setzeBeiNichtAngemeldet(null)
  }, [router, anmelden, sitzungVerwerfen])

  const schutzKontext = useMemo<SchutzKontext>(
    () => ({ anmeldung: { status, anmelden }, benutzer }),
    [status, anmelden, benutzer],
  )

  const aktuell = useRef({ kontext: schutzKontext, bereit })
  const wartende = useRef<Array<(kontext: SchutzKontext) => void>>([])

  useEffect(() => {
    aktuell.current = { kontext: schutzKontext, bereit }
    if (bereit) {
      for (const aufloesen of wartende.current.splice(0)) aufloesen(schutzKontext)
    }
  }, [schutzKontext, bereit])

  const [routerKontext] = useState<RouterKontext>(() => ({
    schutz: () =>
      new Promise<SchutzKontext>((aufloesen) => {
        if (aktuell.current.bereit) aufloesen(aktuell.current.kontext)
        else wartende.current.push(aufloesen)
      }),
  }))

  const kontextWert = useMemo<BenutzerKontextWert>(
    () => ({ zustand, benutzer, erfassen }),
    [zustand, benutzer, erfassen],
  )

  return (
    <BenutzerKontext.Provider value={kontextWert}>
      <RouterProvider router={router} context={routerKontext} />
    </BenutzerKontext.Provider>
  )
}
