import { expect, test, type Page, type Request, type Route } from '@playwright/test'
import { mockeStartseiteStandard } from './startseite-mocks.js'

// Feature anmeldung-keycloak, Abschnitt 6.3: Anmeldung im Browser, API und IdP vollständig gemockt.
// Der IdP ist laut playwright.config.ts http://127.0.0.1:9/realms/coin (unerreichbar). Alle Daten sind synthetisch.

const WEB = 'http://localhost:5193'
const IDP = 'http://127.0.0.1:9'
const AUTHORITY = `${IDP}/realms/coin`
const CLIENT_ID = 'coin-web'
const AUTHORIZE = `${AUTHORITY}/protocol/openid-connect/auth`
const TOKEN = `${AUTHORITY}/protocol/openid-connect/token`
const LOGOUT = `${AUTHORITY}/protocol/openid-connect/logout`
const USER_SCHLUESSEL = `oidc.user:${AUTHORITY}:${CLIENT_ID}`

interface Me {
  id: string
  name: string
  email: string | null
  rolle: 'Administrator' | 'Sachbearbeiter' | 'Betrachter' | 'keine'
  berechtigungen: string[]
}

const ADMIN: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a001',
  name: 'Test Administrator',
  email: 'admin@test.local',
  rolle: 'Administrator',
  berechtigungen: ['audit.read', 'coins.read', 'coins.write', 'users.manage'],
}
const NEU: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a004',
  name: 'Test Neu',
  email: 'neu@test.local',
  rolle: 'keine',
  berechtigungen: [],
}

/** Nicht gemockte Aufrufe an API oder IdP; jeder Eintrag lässt den Test scheitern. */
let ungemockt: string[] = []
/** Aufgezeichnete Aufrufe an den IdP (Authorize, Token, Logout). */
let idp: Request[] = []
let meAufrufe = 0

function istApi(url: URL): boolean {
  return url.pathname === '/api' || url.pathname.startsWith('/api/')
}

function base64Url(objekt: object): string {
  return Buffer.from(JSON.stringify(objekt)).toString('base64url')
}

/** Unsigniertes ID-Token (oidc-client-ts prüft keine Signatur). */
function idToken(name: string, nonce?: string): string {
  const jetzt = Math.floor(Date.now() / 1000)
  return `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url({ iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-1', name, iat: jetzt, exp: jetzt + 300, ...(nonce ? { nonce } : {}) })}.`
}

const DISCOVERY = {
  issuer: AUTHORITY,
  authorization_endpoint: AUTHORIZE,
  token_endpoint: TOKEN,
  end_session_endpoint: LOGOUT,
  jwks_uri: `${AUTHORITY}/protocol/openid-connect/certs`,
}

async function mockeMe(page: Page, me: Me | null): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/me',
    async (route) => {
      meAufrufe++
      await route.fulfill(
        me
          ? { status: 200, contentType: 'application/json', body: JSON.stringify(me) }
          : {
              status: 401,
              contentType: 'application/problem+json',
              body: JSON.stringify({ title: 'Nicht angemeldet', status: 401 }),
            },
      )
    },
  )
}

/** Mockt den IdP: Discovery, Authorize (Seite statt Weiterleitung), Token und Logout (→ /abgemeldet). */
async function mockeIdp(page: Page, tokenAntwort: (r: Request) => object = () => ({})): Promise<void> {
  await page.route(`${AUTHORITY}/.well-known/openid-configuration`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DISCOVERY) }),
  )
  await page.route(`${AUTHORIZE}**`, async (route) => {
    idp.push(route.request())
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html lang="de"><body>IdP-Anmeldeseite (Mock)</body></html>',
    })
  })
  await page.route(TOKEN, async (route) => {
    idp.push(route.request())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'openid profile email',
        ...tokenAntwort(route.request()),
      }),
    })
  })
  await page.route(`${LOGOUT}**`, async (route) => {
    idp.push(route.request())
    await route.fulfill({ status: 302, headers: { Location: `${WEB}/abgemeldet` } })
  })
}

/** Schreibt einen angemeldeten User in sessionStorage (vor dem Laden der App) und mockt /api/me. */
async function meldeAnAls(
  page: Page,
  me: Me,
  optionen: { laeuftAbIn?: number; accessToken?: string } = {},
): Promise<void> {
  const jetzt = Math.floor(Date.now() / 1000)
  const user = {
    id_token: idToken(me.name),
    session_state: null,
    access_token: optionen.accessToken ?? 'ui-access-token-1',
    refresh_token: 'ui-refresh-token-1',
    token_type: 'Bearer',
    scope: 'openid profile email',
    profile: { iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-1', iat: jetzt, exp: jetzt + 300, name: me.name },
    expires_at: jetzt + (optionen.laeuftAbIn ?? 300),
  }
  await page.addInitScript(
    ([schluessel, wert]) => {
      // Nur beim ersten Laden setzen, damit ein späteres Abmelden nicht durch Neuladen rückgängig gemacht wird.
      if (!sessionStorage.getItem('ui-test-initialisiert')) {
        sessionStorage.setItem('ui-test-initialisiert', '1')
        sessionStorage.setItem(schluessel, wert)
      }
    },
    [USER_SCHLUESSEL, JSON.stringify(user)],
  )
  await mockeMe(page, me)
}

function kopfzeile(page: Page) {
  return page.locator('header')
}

test.beforeEach(async ({ page }) => {
  ungemockt = []
  idp = []
  meAufrufe = 0
  await page.route(
    (url) => istApi(url) || url.origin === IDP,
    async (route: Route) => {
      ungemockt.push(`${route.request().method()} ${route.request().url()}`)
      await route.abort('failed')
    },
  )
  await page.route(
    (url) => url.pathname === '/api/coins',
    // Seit katalog-seiten (AK-1, Entscheidung F7) im Seiten-Format.
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eintraege: [], gesamt: 0, seite: 1, groesse: 25 }),
      }),
  )
  await mockeIdp(page, () => ({
    access_token: 'ui-access-token-neu',
    refresh_token: 'ui-refresh-token-neu',
    id_token: idToken('Test Administrator'),
  }))
  // startseite (9.7): `/` ruft jetzt GET /api/startseite bzw. …/kopf auf; Standardantworten statt Catch-all.
  await mockeStartseiteStandard(page)
})

test.afterEach(() => {
  expect(ungemockt, 'Nicht gemockte API-/IdP-Aufrufe').toEqual([])
})

// ---------- AK-24 ----------

test('„Anmelden“ leitet zum Authorize-Endpunkt mit Code-Flow, PKCE S256 und exakter Redirect-URI', async ({ page }) => {
  await mockeMe(page, null)
  await page.goto('/coins')

  await kopfzeile(page).getByRole('button', { name: 'Anmelden' }).click()

  await expect(page).toHaveURL(new RegExp(`^${AUTHORIZE}`))
  const url = new URL(page.url())
  expect(url.searchParams.get('response_type')).toBe('code')
  expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
  expect(url.searchParams.get('redirect_uri')).toBe(`${WEB}/anmeldung/rueckruf`)
  expect(url.searchParams.get('code_challenge')).toBeTruthy()
  expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  expect(url.searchParams.get('state')).toBeTruthy()
  expect(url.searchParams.get('scope')?.split(' ')).toEqual(expect.arrayContaining(['openid', 'profile', 'email']))
  expect(url.searchParams.has('client_secret')).toBe(false)
})

test('anonym wird beim Öffnen von / und /coins nicht zum Login geleitet und /api/me nicht aufgerufen', async ({
  page,
}) => {
  await mockeMe(page, null)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeVisible()
  await page.goto('/coins')
  // katalog-seiten (AK-12/AK-13): kein Anmeldehinweis mehr, anonym auch kein „Coin hinzufügen“.
  await expect(page.getByText('Noch keine Coins erfasst.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Coin hinzufügen' })).toHaveCount(0)

  expect(page.url()).toBe(`${WEB}/coins`)
  expect(idp).toEqual([])
  expect(meAufrufe).toBe(0)
})

async function anmeldenUndZurueck(page: Page, me: Me, start: string): Promise<void> {
  await mockeMe(page, me)
  await page.goto(start)
  await kopfzeile(page).getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL(new RegExp(`^${AUTHORIZE}`))
  const state = new URL(page.url()).searchParams.get('state')
  await page.goto(`/anmeldung/rueckruf?code=ui-test-code&state=${state}`)
}

test('Rückruf führt zum Ausgangspfad inklusive Query und zeigt den Namen', async ({ page }) => {
  await anmeldenUndZurueck(page, ADMIN, '/coins?seite=2')

  await expect(page).toHaveURL(`${WEB}/coins?seite=2`)
  await expect(kopfzeile(page)).toContainText('Test Administrator')
})

test('Rückruf tauscht den Code am Token-Endpunkt mit PKCE-Verifier ohne Client-Secret', async ({ page }) => {
  await anmeldenUndZurueck(page, ADMIN, '/coins')
  await expect(page).toHaveURL(`${WEB}/coins`)

  const token = idp.find((r) => r.url() === TOKEN)
  const body = new URLSearchParams(token?.postData() ?? '')
  expect(body.get('grant_type')).toBe('authorization_code')
  expect(body.get('code')).toBe('ui-test-code')
  expect(body.get('code_verifier')).toBeTruthy()
  expect(body.has('client_secret')).toBe(false)
})

test('Rückruf mit rolle „keine“ führt nach /kein-zugriff', async ({ page }) => {
  await anmeldenUndZurueck(page, NEU, '/coins')

  await expect(page).toHaveURL(`${WEB}/kein-zugriff`)
  await expect(page.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeVisible()
})

test('Rückruf mit unbekanntem State zeigt „Anmeldung fehlgeschlagen“', async ({ page }) => {
  await mockeMe(page, null)
  await page.goto('/anmeldung/rueckruf?code=ui-test-code&state=unbekannt')

  await expect(page.getByRole('heading', { level: 1, name: 'Anmeldung fehlgeschlagen' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Erneut anmelden' })).toBeVisible()
})

test('Rückruf entfernt code und state aus der Adresszeile', async ({ page }) => {
  await anmeldenUndZurueck(page, ADMIN, '/coins')

  await expect(page).toHaveURL(`${WEB}/coins`)
  expect(page.url()).not.toMatch(/code=|state=/)
})

// ---------- AK-30 ----------

test('Kopfzeile anonym: „Anmelden“, kein „Abmelden“', async ({ page }) => {
  await mockeMe(page, null)
  await page.goto('/')

  await expect(kopfzeile(page).getByRole('button', { name: 'Anmelden' })).toBeVisible()
  await expect(kopfzeile(page).getByRole('button', { name: 'Abmelden' })).toHaveCount(0)
})

test('Kopfzeile angemeldet: Name mit „Angemeldet als“ und „Abmelden“', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/')

  await expect(kopfzeile(page).getByRole('button', { name: 'Abmelden' })).toBeVisible()
  await expect(kopfzeile(page)).toContainText('Test Administrator')
  await expect(kopfzeile(page).getByText('Angemeldet als')).toHaveCount(1)
  await expect(kopfzeile(page).getByRole('button', { name: 'Anmelden' })).toHaveCount(0)
})

test('Kopfzeile auf schmalem Bildschirm zeigt „Anmelden“ sichtbar', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 })
  await mockeMe(page, null)
  await page.goto('/coins')

  await expect(kopfzeile(page).getByRole('button', { name: 'Anmelden' })).toBeInViewport()
})

// ---------- AK-34: Tastatur ----------

async function tabBis(page: Page, name: string): Promise<void> {
  const ziel = kopfzeile(page).getByRole('button', { name })
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    if (await ziel.evaluate((el) => el === document.activeElement)) return
  }
  throw new Error(`„${name}“ ist per Tab nicht erreichbar.`)
}

async function hatSichtbarenFokus(page: Page, name: string): Promise<boolean> {
  return kopfzeile(page)
    .getByRole('button', { name })
    .evaluate((el) => {
      const stil = getComputedStyle(el)
      return el.matches(':focus-visible') && (stil.outlineStyle !== 'none' || stil.boxShadow !== 'none')
    })
}

test('Tastatur: „Anmelden“ per Tab erreichbar, sichtbar fokussiert und per Enter auslösbar', async ({ page }) => {
  await mockeMe(page, null)
  await page.goto('/')
  await expect(kopfzeile(page).getByRole('button', { name: 'Anmelden' })).toBeVisible()

  await tabBis(page, 'Anmelden')

  await expect(kopfzeile(page).getByRole('button', { name: 'Anmelden' })).toBeFocused()
  expect(await hatSichtbarenFokus(page, 'Anmelden')).toBe(true)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`^${AUTHORIZE}`))
})

test('Tastatur: „Abmelden“ per Tab erreichbar, sichtbar fokussiert und per Enter auslösbar', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/')
  await expect(kopfzeile(page).getByRole('button', { name: 'Abmelden' })).toBeVisible()

  await tabBis(page, 'Abmelden')

  await expect(kopfzeile(page).getByRole('button', { name: 'Abmelden' })).toBeFocused()
  expect(await hatSichtbarenFokus(page, 'Abmelden')).toBe(true)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(`${WEB}/abgemeldet`)
})

// ---------- AK-31, AK-25 ----------

test('Abmelden leitet zum End-Session-Endpunkt mit id_token_hint, client_id und Post-Logout-URI', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/')

  await kopfzeile(page).getByRole('button', { name: 'Abmelden' }).click()

  await expect(page).toHaveURL(`${WEB}/abgemeldet`)
  const logout = idp.find((r) => r.url().startsWith(LOGOUT))
  expect(logout, 'kein Aufruf des End-Session-Endpunkts').toBeDefined()
  const url = new URL(logout!.url())
  expect(url.searchParams.get('id_token_hint')).toBeTruthy()
  expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
  expect(url.searchParams.get('post_logout_redirect_uri')).toBe(`${WEB}/abgemeldet`)
})

test('nach dem Abmelden gibt es keine oidc.-Schlüssel und im localStorage höchstens coin-theme', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/')
  await kopfzeile(page).getByRole('button', { name: 'Abmelden' }).click()
  // Nach der Weiterleitung über den IdP-Mock lädt Vite die App neu; unter Last dauert das länger als 5 s.
  await page.waitForURL(`${WEB}/abgemeldet`, { waitUntil: 'load', timeout: 15_000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Abgemeldet' })).toBeVisible({ timeout: 15_000 })

  const speicher = await page.evaluate(() => ({
    session: Object.keys(sessionStorage),
    local: Object.keys(localStorage),
  }))
  expect(speicher.session.filter((k) => k.startsWith('oidc.'))).toEqual([])
  expect(speicher.local.filter((k) => k !== 'coin-theme')).toEqual([])
})

test('angemeldet liegen User und OIDC-State nur im sessionStorage, Cookies werden nicht gesetzt', async ({
  page,
  context,
}) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/coins')
  await expect(kopfzeile(page)).toContainText('Test Administrator')

  const speicher = await page.evaluate(() => ({
    session: Object.keys(sessionStorage),
    local: Object.keys(localStorage),
  }))
  expect(speicher.session).toContain(USER_SCHLUESSEL)
  expect(speicher.local.filter((k) => k !== 'coin-theme')).toEqual([])
  expect(await context.cookies(WEB)).toEqual([])
})

test('/abgemeldet zeigt Text, „Erneut anmelden“ und „Zum Coin-Katalog“', async ({ page }) => {
  await mockeMe(page, null)
  await page.goto('/abgemeldet')

  await expect(page.getByRole('heading', { level: 1, name: 'Abgemeldet' })).toBeVisible()
  await expect(page.getByText('Sie wurden abgemeldet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Erneut anmelden' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Zum Coin-Katalog' })).toHaveAttribute('href', '/coins')
})

// ---------- AK-26 ----------

test('Erneuerung läuft per grant_type=refresh_token', async ({ page }) => {
  // Läuft in 30 s ab: oidc-client-ts erneuert 60 s vor Ablauf, also sofort.
  await meldeAnAls(page, ADMIN, { laeuftAbIn: 30 })
  await page.goto('/')

  await expect.poll(() => idp.filter((r) => r.url() === TOKEN).length, { timeout: 10_000 }).toBeGreaterThan(0)
  const body = new URLSearchParams(idp.find((r) => r.url() === TOKEN)?.postData() ?? '')
  expect(body.get('grant_type')).toBe('refresh_token')
  expect(body.get('refresh_token')).toBe('ui-refresh-token-1')
})

test('nach der Erneuerung senden API-Aufrufe das neue Token', async ({ page }) => {
  await meldeAnAls(page, ADMIN, { laeuftAbIn: 30 })
  let authorization: string | undefined
  await page.route(
    (url) => url.pathname === '/api/coins',
    async (route) => {
      if (route.request().method() === 'POST') {
        authorization = route.request().headers()['authorization']
        await route.fulfill({
          status: 403,
          contentType: 'application/problem+json',
          body: '{"title":"Kein Zugriff","status":403}',
        })
        return
      }
      await route.fallback()
    },
  )
  // katalog-seiten (AK-21): Das Formular liegt auf /coins/neu.
  await page.goto('/coins/neu')
  await expect.poll(() => idp.filter((r) => r.url() === TOKEN).length, { timeout: 10_000 }).toBeGreaterThan(0)

  await page.getByLabel(/^Name/).fill('Coin Alpha')
  await page.getByLabel(/^Herausgeber/).fill('Herausgeber Beta')
  await page.getByRole('button', { name: 'Coin anlegen' }).click()

  await expect.poll(() => authorization).toBe('Bearer ui-access-token-neu')
})

test('scheitert die Erneuerung, zeigt die App den Zustand anonym', async ({ page }) => {
  await meldeAnAls(page, ADMIN, { laeuftAbIn: 30 })
  await page.route(TOKEN, (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"invalid_grant"}' }),
  )
  await page.goto('/')

  await expect(kopfzeile(page).getByRole('button', { name: 'Anmelden' })).toBeVisible({ timeout: 10_000 })
})

// ---------- AK-28 ----------

test('/api/me wird bei mehreren Navigationen genau einmal aufgerufen', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/')
  await expect(kopfzeile(page)).toContainText('Test Administrator')

  await page.getByRole('link', { name: 'Katalog', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Katalog' })).toBeVisible()
  await page.getByRole('link', { name: 'Startseite', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeVisible()

  expect(meAufrufe).toBe(1)
})

test('API-Aufrufe senden angemeldet Authorization: Bearer', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  const header = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/me')
  await page.goto('/')

  expect((await header).headers()['authorization']).toBe('Bearer ui-access-token-1')
})
