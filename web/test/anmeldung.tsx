import { InMemoryWebStorage, User, UserManager, WebStorageStateStore } from 'oidc-client-ts'
import type { INavigator, IWindow, NavigateParams, NavigateResponse } from 'oidc-client-ts'
import { vi } from 'vitest'
import type { Benutzer } from '@/entities/benutzer'

// Testhilfe Anmeldung (Feature anmeldung-keycloak, Abschnitt 6.2): echter UserManager mit In-Memory-Speicher,
// fester Discovery (keine Netzwerkaufrufe) und einem Navigator, der Weiterleitungen nur aufzeichnet.
// Alle Personendaten sind synthetisch.

export const TEST_AUTHORITY = 'http://idp.coin-test.invalid/realms/coin'
export const TEST_CLIENT_ID = 'coin-web'
export const TEST_ACCESS_TOKEN = 'test-access-token-1'
export const AUTHORIZATION_ENDPOINT = `${TEST_AUTHORITY}/protocol/openid-connect/auth`
export const END_SESSION_ENDPOINT = `${TEST_AUTHORITY}/protocol/openid-connect/logout`
export const TOKEN_ENDPOINT = `${TEST_AUTHORITY}/protocol/openid-connect/token`

/** Antworten von GET /api/me für die Testbenutzer. */
export const ME = {
  admin: {
    id: '0199a1b2-0000-7000-8000-00000000a001',
    name: 'Test Administrator',
    email: 'admin@test.local',
    rolle: 'Administrator',
  },
  sachbearbeiter: {
    id: '0199a1b2-0000-7000-8000-00000000a002',
    name: 'Test Sachbearbeiter',
    email: 'sachbearbeiter@test.local',
    rolle: 'Sachbearbeiter',
  },
  betrachter: {
    id: '0199a1b2-0000-7000-8000-00000000a003',
    name: 'Test Betrachter',
    email: 'betrachter@test.local',
    rolle: 'Betrachter',
  },
  keine: { id: '0199a1b2-0000-7000-8000-00000000a004', name: 'Test Neu', email: 'neu@test.local', rolle: 'keine' },
} as const satisfies Record<string, Benutzer>

export type TestBenutzer = keyof typeof ME

/** Zustand der gespeicherten Sitzung beim Start der App. */
export type SitzungsZustand = 'angemeldet' | 'abgelaufen' | 'anonym'

/** Unsigniertes JWT als ID-Token (oidc-client-ts prüft keine Signatur, der Inhalt ist synthetisch). */
function idToken(sub: string, name: string): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jetzt = Math.floor(Date.now() / 1000)
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: TEST_AUTHORITY, aud: TEST_CLIENT_ID, sub, name, iat: jetzt, exp: jetzt + 300 })}.`
}

/** Synthetischer User wie nach einer Anmeldung; `ziel` landet in `state` (Rückkehrziel). */
export function testUser(
  optionen: { zustand?: 'angemeldet' | 'abgelaufen'; name?: string; accessToken?: string; ziel?: string } = {},
): User {
  const { zustand = 'angemeldet', name = 'Test Administrator', accessToken = TEST_ACCESS_TOKEN, ziel } = optionen
  const jetzt = Math.floor(Date.now() / 1000)
  return new User({
    access_token: accessToken,
    token_type: 'Bearer',
    id_token: idToken('sub-test-1', name),
    refresh_token: 'test-refresh-token',
    scope: 'openid profile email',
    session_state: null,
    profile: { iss: TEST_AUTHORITY, aud: TEST_CLIENT_ID, sub: 'sub-test-1', iat: jetzt, exp: jetzt + 300, name },
    expires_at: zustand === 'angemeldet' ? jetzt + 300 : jetzt - 60,
    userState: ziel === undefined ? undefined : { ziel },
  })
}

/** Zeichnet Weiterleitungen (Authorize-, End-Session-URL) auf, statt zu navigieren. */
export class AufzeichnenderNavigator implements INavigator {
  readonly urls: string[] = []

  async prepare(): Promise<IWindow> {
    return {
      navigate: (params: NavigateParams): Promise<NavigateResponse> => {
        this.urls.push(params.url)
        // Eine echte Weiterleitung verlässt die Seite; das Promise bleibt deshalb offen.
        return new Promise<NavigateResponse>(() => {})
      },
      close: () => {},
    }
  }

  async callback(): Promise<void> {}

  /** Letzte aufgezeichnete URL als URL-Objekt. */
  letzte(): URL {
    const url = this.urls.at(-1)
    if (!url) throw new Error('Es wurde keine Weiterleitung aufgezeichnet.')
    return new URL(url)
  }
}

/** Schlüssel, unter dem oidc-client-ts den User ablegt (Präfix „oidc.“). */
export const USER_SCHLUESSEL = `oidc.user:${TEST_AUTHORITY}:${TEST_CLIENT_ID}`

/**
 * Erzeugt einen echten UserManager für Tests. `signinRedirect` und `signoutRedirect` laufen echt durch
 * (Request, PKCE, State), sind aber Spies; die Weiterleitung selbst zeichnet der Navigator auf.
 */
export function erstelleTestAnmeldung(zustand: SitzungsZustand = 'angemeldet', name = 'Test Administrator') {
  const userSpeicher = new InMemoryWebStorage()
  const stateSpeicher = new InMemoryWebStorage()
  const navigator = new AufzeichnenderNavigator()
  const origin = window.location.origin
  const userManager = new UserManager(
    {
      authority: TEST_AUTHORITY,
      client_id: TEST_CLIENT_ID,
      redirect_uri: `${origin}/anmeldung/rueckruf`,
      post_logout_redirect_uri: `${origin}/abgemeldet`,
      response_type: 'code',
      scope: 'openid profile email',
      userStore: new WebStorageStateStore({ store: userSpeicher }),
      stateStore: new WebStorageStateStore({ store: stateSpeicher }),
      automaticSilentRenew: false,
      monitorSession: false,
      loadUserInfo: false,
      metadata: {
        issuer: TEST_AUTHORITY,
        authorization_endpoint: AUTHORIZATION_ENDPOINT,
        token_endpoint: TOKEN_ENDPOINT,
        end_session_endpoint: END_SESSION_ENDPOINT,
        jwks_uri: `${TEST_AUTHORITY}/protocol/openid-connect/certs`,
      },
    },
    navigator,
  )
  if (zustand !== 'anonym') {
    userSpeicher.setItem(USER_SCHLUESSEL, testUser({ zustand, name }).toStorageString())
  }
  const signinRedirect = vi.spyOn(userManager, 'signinRedirect')
  const signoutRedirect = vi.spyOn(userManager, 'signoutRedirect')

  return {
    userManager,
    navigator,
    userSpeicher,
    stateSpeicher,
    signinRedirect,
    signoutRedirect,
    /** Ist (noch) ein User gespeichert? */
    hatUser: () => userSpeicher.getItem(USER_SCHLUESSEL) != null,
    /**
     * Simuliert die Rückkehr vom IdP: Der Code-Austausch (signinCallback bzw. signinRedirectCallback)
     * liefert den angegebenen User bzw. scheitert mit dem Fehler.
     */
    rueckrufLiefert(ergebnis: User | Error) {
      const umsetzung = async () => {
        if (ergebnis instanceof Error) throw ergebnis
        await userManager.storeUser(ergebnis)
        return ergebnis
      }
      vi.spyOn(userManager, 'signinCallback').mockImplementation(umsetzung)
      vi.spyOn(userManager, 'signinRedirectCallback').mockImplementation(umsetzung)
    },
  }
}

export type TestAnmeldung = ReturnType<typeof erstelleTestAnmeldung>

/** Setzt die Browser-URL (jsdom) – z. B. auf den Rückrufpfad mit code und state. */
export function setzeBrowserUrl(pfadMitQuery: string): void {
  window.history.replaceState(null, '', pfadMitQuery)
}
