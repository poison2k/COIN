import type { NavigateParams, NavigateResponse } from 'oidc-client-ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testUser } from '../../../../test/anmeldung'
import { erstelleUserManager } from './user-manager'

// AK-24 bis AK-26: Einstellungen des UserManagers, Speicherorte und Erneuerung per Refresh-Token.

const AUTHORITY = 'http://idp.coin-test.invalid/realms/coin'
const KONFIG = { authority: AUTHORITY, clientId: 'coin-web' }
const ORIGIN = 'http://localhost:5183'
const TOKEN_ENDPOINT = `${AUTHORITY}/protocol/openid-connect/token`

const DISCOVERY = {
  issuer: AUTHORITY,
  authorization_endpoint: `${AUTHORITY}/protocol/openid-connect/auth`,
  token_endpoint: TOKEN_ENDPOINT,
  end_session_endpoint: `${AUTHORITY}/protocol/openid-connect/logout`,
  jwks_uri: `${AUTHORITY}/protocol/openid-connect/certs`,
}

interface IdpAufruf {
  url: string
  methode: string
  body: string
}

let idpAufrufe: IdpAufruf[]

/** Simuliert Discovery und Token-Endpunkt des IdP. */
function stubIdp() {
  idpAufrufe = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      idpAufrufe.push({ url, methode: init?.method ?? 'GET', body: init?.body ? String(init.body) : '' })
      if (url.endsWith('/.well-known/openid-configuration')) {
        return new Response(JSON.stringify(DISCOVERY), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url === TOKEN_ENDPOINT) {
        return new Response(
          JSON.stringify({
            access_token: 'erneuertes-token',
            token_type: 'Bearer',
            expires_in: 300,
            refresh_token: 'neues-refresh',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(null, { status: 404 })
    }),
  )
}

function oidcSchluessel(speicher: Storage): string[] {
  return Object.keys(speicher).filter((k) => k.startsWith('oidc.'))
}

beforeEach(() => {
  stubIdp()
})

afterEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('erstelleUserManager – Einstellungen (AK-24)', () => {
  it('übernimmt Authority und Client-Id', () => {
    const { settings } = erstelleUserManager(KONFIG, ORIGIN)

    expect(settings.authority).toBe(AUTHORITY)
    expect(settings.client_id).toBe('coin-web')
  })

  it('setzt die Redirect-URI auf Origin + /anmeldung/rueckruf', () => {
    expect(erstelleUserManager(KONFIG, ORIGIN).settings.redirect_uri).toBe('http://localhost:5183/anmeldung/rueckruf')
  })

  it('setzt die Post-Logout-URI auf Origin + /abgemeldet', () => {
    expect(erstelleUserManager(KONFIG, ORIGIN).settings.post_logout_redirect_uri).toBe(
      'http://localhost:5183/abgemeldet',
    )
  })

  it('nutzt ohne Angabe die Origin des Browsers', () => {
    expect(erstelleUserManager(KONFIG).settings.redirect_uri).toBe(`${window.location.origin}/anmeldung/rueckruf`)
  })

  it('nutzt den Authorization Code Flow', () => {
    expect(erstelleUserManager(KONFIG, ORIGIN).settings.response_type).toBe('code')
  })

  it('fordert die Scopes openid, profile und email an', () => {
    const scopes = erstelleUserManager(KONFIG, ORIGIN).settings.scope.split(' ')

    expect(scopes).toEqual(expect.arrayContaining(['openid', 'profile', 'email']))
  })

  it('nutzt PKCE', () => {
    expect(erstelleUserManager(KONFIG, ORIGIN).settings.disablePKCE).toBe(false)
  })

  it('hat kein Client-Secret', () => {
    expect(erstelleUserManager(KONFIG, ORIGIN).settings.client_secret).toBeUndefined()
  })
})

describe('erstelleUserManager – Erneuerung (AK-26)', () => {
  it('erneuert automatisch', () => {
    expect(erstelleUserManager(KONFIG, ORIGIN).settings.automaticSilentRenew).toBe(true)
  })

  it('überwacht keine Session per iframe', () => {
    expect(erstelleUserManager(KONFIG, ORIGIN).settings.monitorSession).toBe(false)
  })

  it('lädt keine Userinfo', () => {
    expect(erstelleUserManager(KONFIG, ORIGIN).settings.loadUserInfo).toBe(false)
  })

  it('konfiguriert keine Silent-Redirect-URI (kein iframe)', () => {
    expect(erstelleUserManager(KONFIG, ORIGIN).settings.silent_redirect_uri).toBeFalsy()
  })

  it('erneuert per grant_type=refresh_token am Token-Endpunkt', async () => {
    const userManager = erstelleUserManager(KONFIG, ORIGIN)
    await userManager.storeUser(testUser({ zustand: 'abgelaufen' }))

    await userManager.signinSilent()

    const tokenAufruf = idpAufrufe.find((a) => a.url === TOKEN_ENDPOINT)
    expect(tokenAufruf?.methode).toBe('POST')
    expect(new URLSearchParams(tokenAufruf?.body).get('grant_type')).toBe('refresh_token')
  })

  it('liefert nach der Erneuerung das neue Access-Token', async () => {
    const userManager = erstelleUserManager(KONFIG, ORIGIN)
    await userManager.storeUser(testUser({ zustand: 'abgelaufen' }))

    await userManager.signinSilent()

    expect((await userManager.getUser())?.access_token).toBe('erneuertes-token')
  })
})

describe('erstelleUserManager – Speicherorte (AK-25)', () => {
  it('speichert den User in sessionStorage', async () => {
    const userManager = erstelleUserManager(KONFIG, ORIGIN)

    await userManager.storeUser(testUser())

    expect(oidcSchluessel(sessionStorage)).toEqual([`oidc.user:${AUTHORITY}:coin-web`])
  })

  it('speichert den User nicht in localStorage', async () => {
    const userManager = erstelleUserManager(KONFIG, ORIGIN)

    await userManager.storeUser(testUser())

    expect(oidcSchluessel(localStorage)).toEqual([])
  })

  it('speichert den OIDC-State der Anmeldung in sessionStorage und nicht in localStorage', async () => {
    const userManager = erstelleUserManager(KONFIG, ORIGIN)

    // jsdom kann nicht zu einem anderen Dokument navigieren: Nur die Weiterleitung selbst wird abgefangen,
    // Request, PKCE und State-Speicherung laufen echt. Der State wird vor der Weiterleitung geschrieben.
    const umleitung = vi.fn<(params: NavigateParams) => Promise<NavigateResponse>>(
      () => new Promise<NavigateResponse>(() => {}),
    )
    vi.spyOn(userManager['_redirectNavigator'], 'prepare').mockResolvedValue({ navigate: umleitung, close: () => {} })
    void userManager.signinRedirect().catch(() => {})

    await vi.waitFor(() => expect(umleitung).toHaveBeenCalledTimes(1))
    expect(oidcSchluessel(sessionStorage).length).toBeGreaterThan(0)
    expect(oidcSchluessel(localStorage)).toEqual([])
  })

  it('entfernt beim Entfernen des Users alle oidc.-Schlüssel des Users', async () => {
    const userManager = erstelleUserManager(KONFIG, ORIGIN)
    await userManager.storeUser(testUser())

    await userManager.removeUser()

    expect(oidcSchluessel(sessionStorage)).toEqual([])
  })
})
