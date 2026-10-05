import type { UserManager } from 'oidc-client-ts'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthProvider, useAuth } from 'react-oidc-context'
import { ROUTEN } from '@/shared/config'
import { AnmeldungKontext, NICHT_KONFIGURIERT, type Anmeldung, type AnmeldeStatus } from './anmeldung-kontext'
import { setzeTokenQuelle } from './token-quelle'

export interface AnmeldungProviderProps {
  /** `null` = Anmeldung nicht konfiguriert. */
  userManager: UserManager | null
  children: ReactNode
}

/** Entfernt code und state (bzw. error) aus der Adresszeile, ohne den Zustand der History zu verlieren (AK-24). */
function entferneAntwortParameter(): void {
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash}`)
}

/**
 * Anmeldung über OIDC (ADR-0012) mit react-oidc-context. Der Rückruf wird nur auf dem Rückrufpfad ausgewertet;
 * die App startet die Anmeldung nie von selbst (AK-24).
 */
export function AnmeldungProvider({ userManager, children }: AnmeldungProviderProps) {
  // Einmal beim Start bestimmen: Nur der Rückrufpfad tauscht code gegen Token.
  const [istRueckruf] = useState(() => window.location.pathname === ROUTEN.anmeldungRueckruf)

  if (!userManager) {
    return <AnmeldungKontext.Provider value={NICHT_KONFIGURIERT}>{children}</AnmeldungKontext.Provider>
  }

  return (
    <AuthProvider
      userManager={userManager}
      skipSigninCallback={!istRueckruf}
      onSigninCallback={entferneAntwortParameter}
    >
      <AnmeldungBruecke userManager={userManager}>{children}</AnmeldungBruecke>
    </AuthProvider>
  )
}

function AnmeldungBruecke({ userManager, children }: { userManager: UserManager; children: ReactNode }) {
  const auth = useAuth()

  useEffect(() => {
    // API-Aufrufe lesen das Token bei jedem Aufruf neu, also auch nach einer Erneuerung (AK-26, AK-27).
    setzeTokenQuelle(async () => {
      const user = await userManager.getUser()
      return user && !user.expired ? user.access_token : null
    })
    // Scheitert die Erneuerung, gilt die Sitzung als beendet (AK-26).
    const beiErneuerungsfehler = () => {
      void userManager.removeUser()
    }
    userManager.events.addSilentRenewError(beiErneuerungsfehler)
    return () => {
      setzeTokenQuelle(null)
      userManager.events.removeSilentRenewError(beiErneuerungsfehler)
    }
  }, [userManager])

  const rueckrufFehlgeschlagen = auth.error?.source === 'signinCallback'

  useEffect(() => {
    if (rueckrufFehlgeschlagen) entferneAntwortParameter()
  }, [rueckrufFehlgeschlagen])

  const status: AnmeldeStatus = auth.isLoading ? 'pruefe' : auth.isAuthenticated ? 'angemeldet' : 'anonym'
  const sitzung = status === 'angemeldet' ? (auth.user?.profile.sub ?? '') : null
  const userState = auth.user?.state as { ziel?: unknown } | undefined
  const rueckkehrZiel = userState?.ziel

  const wert = useMemo<Anmeldung>(
    () => ({
      status,
      sitzung,
      rueckrufFehlgeschlagen,
      rueckkehrZiel,
      anmelden: async (ziel) => {
        try {
          await userManager.signinRedirect({ state: { ziel } })
        } catch {
          // Identitätsanbieter nicht erreichbar: Die Seite bleibt, der Benutzer kann es erneut versuchen.
        }
      },
      abmelden: async () => {
        try {
          // Entfernt den User und setzt id_token_hint, client_id und post_logout_redirect_uri (AK-31).
          await userManager.signoutRedirect({ extraQueryParams: { client_id: userManager.settings.client_id } })
        } catch {
          await userManager.removeUser()
        }
      },
      sitzungVerwerfen: () => userManager.removeUser(),
    }),
    [status, sitzung, rueckrufFehlgeschlagen, rueckkehrZiel, userManager],
  )

  return <AnmeldungKontext.Provider value={wert}>{children}</AnmeldungKontext.Provider>
}
