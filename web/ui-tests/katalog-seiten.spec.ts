import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

// Feature katalog-seiten, Abschnitt 6 (UI-Tests): Katalog, Detailseite und „Coin hinzufügen“ im Browser.
// API und IdP sind vollständig gemockt (IdP laut playwright.config.ts unerreichbar). Alle Daten sind synthetisch.

const WEB = 'http://localhost:5193'
const IDP = 'http://127.0.0.1:9'
const AUTHORITY = `${IDP}/realms/coin`
const CLIENT_ID = 'coin-web'
const AUTHORIZE = `${AUTHORITY}/protocol/openid-connect/auth`
const TOKEN = `${AUTHORITY}/protocol/openid-connect/token`
const USER_SCHLUESSEL = `oidc.user:${AUTHORITY}:${CLIENT_ID}`

interface Me {
  id: string
  name: string
  email: string | null
  rolle: 'Administrator' | 'Sachbearbeiter' | 'Betrachter' | 'keine'
  berechtigungen: string[]
}

interface Coin {
  id: string
  name: string
  herausgeber: string
  auflage: number | null
  beschreibung: string | null
  erstelltAm: string
  bildUrl: string | null
}

const ADMIN: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a001',
  name: 'Test Administrator',
  email: 'admin@test.local',
  rolle: 'Administrator',
  berechtigungen: ['audit.read', 'coins.read', 'coins.write', 'users.manage'],
}
const SACHBEARBEITER: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a002',
  name: 'Test Sachbearbeiter',
  email: 'sachbearbeiter@test.local',
  rolle: 'Sachbearbeiter',
  berechtigungen: ['coins.read', 'coins.write'],
}
const BETRACHTER: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a003',
  name: 'Test Betrachter',
  email: 'betrachter@test.local',
  rolle: 'Betrachter',
  berechtigungen: ['coins.read'],
}

const TEXTE = {
  ohneBerechtigung:
    'Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.',
  angelegt: 'Coin wurde angelegt.',
  ohneBild: 'Coin wurde ohne Motivbild angelegt.',
  teilerfolg: 'Coin wurde angelegt, das Bild konnte nicht gespeichert werden:',
  platzhalter: 'Dieser Bereich wird in einer späteren Version ergänzt.',
} as const

const ENGLISCH =
  /\b(Sign ?in|Sign ?out|Log ?in|Log ?out|Loading|Error|Forbidden|Access denied|Not Found|Not found|Search|Previous|Next|Page|Add|New|Cancel|Back|Home|Catalog|Description|Publisher|Created|Image|Awards|Issues|Edit|Delete|Submit|Upload|Choose file|No file chosen)\b/

/** Bild-Mock: großes SVG (1000 × 1000), damit die Begrenzung auf 320 × 320 sichtbar wird. */
const GROSSES_BILD =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><rect width="1000" height="1000" fill="#888"/></svg>'

/** Nicht gemockte Aufrufe an API oder IdP; jeder Eintrag lässt den Test scheitern. */
let ungemockt: string[] = []
/** Zustand der gemockten Coin-API. */
let coins: Coin[] = []
/** Alle API-Aufrufe in Reihenfolge („METHODE /pfad?query“). */
let apiAufrufe: string[] = []
/** Aufgezeichnete POST-Bodies auf /api/coins. */
let posts: unknown[] = []
/** Einmalige Antwort auf den nächsten Bild-Upload (z. B. 415). */
let naechsterUpload: { status: number; body: object } | null = null
let zaehler = 0
/** Hält GET /api/coins zurück, bis das Promise erfüllt ist (Zustand „während des Ladens“). */
let listenSperre: Promise<void> | null = null
/** Seiten, auf die GET /api/coins mit 500 antwortet (Ladefehler beim Blättern). */
let fehlerSeiten: number[] = []
/** Künstliche Latenz für GET /api/coins in ms (QA Runde 3, W1: Doppelklick während die Tabelle wächst). */
let listenLatenzMs = 0

function istApi(url: URL): boolean {
  return url.pathname === '/api' || url.pathname.startsWith('/api/')
}

function base64Url(objekt: object): string {
  return Buffer.from(JSON.stringify(objekt)).toString('base64url')
}

function idToken(name: string): string {
  const jetzt = Math.floor(Date.now() / 1000)
  return `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url({ iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-1', name, iat: jetzt, exp: jetzt + 300 })}.`
}

function json(route: Route, status: number, body: unknown, contentType = 'application/json') {
  return route.fulfill({ status, contentType, body: JSON.stringify(body) })
}

function coinNr(nr: number, teil: Partial<Coin> = {}): Coin {
  return {
    id: `0199a1b2-0000-7000-8000-${String(nr).padStart(12, 'e')}`,
    name: `Katalogcoin ${String(nr).padStart(3, '0')}`,
    herausgeber: 'Herausgeber Test',
    auflage: 250,
    beschreibung: null,
    erstelltAm: '2026-10-05T12:00:00+00:00',
    bildUrl: null,
    ...teil,
  }
}

/** Mockt /api/me und schreibt einen angemeldeten User in den sessionStorage (vor dem Laden der App). */
async function meldeAnAls(page: Page, me: Me): Promise<void> {
  const jetzt = Math.floor(Date.now() / 1000)
  const user = {
    id_token: idToken(me.name),
    session_state: null,
    access_token: 'ui-access-token-1',
    refresh_token: 'ui-refresh-token-1',
    token_type: 'Bearer',
    scope: 'openid profile email',
    profile: { iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-1', iat: jetzt, exp: jetzt + 300, name: me.name },
    expires_at: jetzt + 300,
  }
  await page.addInitScript(
    ([schluessel, wert]) => {
      if (!sessionStorage.getItem('ui-test-initialisiert')) {
        sessionStorage.setItem('ui-test-initialisiert', '1')
        sessionStorage.setItem(schluessel, wert)
      }
    },
    [USER_SCHLUESSEL, JSON.stringify(user)],
  )
  await mockeMe(page, me)
}

async function mockeMe(page: Page, me: Me | null): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/me',
    (route) =>
      me
        ? json(route, 200, me)
        : json(route, 401, { title: 'Nicht angemeldet', status: 401 }, 'application/problem+json'),
  )
}

/** Mockt Discovery, Authorize (Seite statt Weiterleitung) und Token des IdP. */
async function mockeIdp(page: Page, name: string): Promise<void> {
  await page.route(`${AUTHORITY}/.well-known/openid-configuration`, (route) =>
    json(route, 200, {
      issuer: AUTHORITY,
      authorization_endpoint: AUTHORIZE,
      token_endpoint: TOKEN,
      jwks_uri: `${AUTHORITY}/protocol/openid-connect/certs`,
    }),
  )
  await page.route(`${AUTHORIZE}**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html lang="de"><body>IdP (Mock)</body></html>' }),
  )
  await page.route(TOKEN, (route) =>
    json(route, 200, {
      token_type: 'Bearer',
      expires_in: 300,
      scope: 'openid profile email',
      access_token: 'ui-access-token-neu',
      refresh_token: 'ui-refresh-token-neu',
      id_token: idToken(name),
    }),
  )
}

/** Mockt GET/POST /api/coins, GET /api/coins/{id}, PUT /api/coins/{id}/bild und GET des Bildes. */
async function mockeCoinApi(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/coins',
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      apiAufrufe.push(`${request.method()} ${url.pathname}${url.search}`)
      if (request.method() === 'POST') {
        const daten = request.postDataJSON() as Omit<Coin, 'id' | 'erstelltAm' | 'bildUrl'>
        posts.push(daten)
        zaehler++
        const coin: Coin = {
          id: `0199a1b2-0000-7000-8000-${String(zaehler).padStart(12, '0')}`,
          name: daten.name.trim(),
          herausgeber: daten.herausgeber.trim(),
          auflage: daten.auflage ?? null,
          beschreibung: daten.beschreibung ?? null,
          erstelltAm: '2026-10-07T09:00:00+00:00',
          bildUrl: null,
        }
        coins.push(coin)
        return json(route, 201, coin)
      }
      if (listenSperre) await listenSperre
      if (listenLatenzMs > 0) await new Promise((aufloesen) => setTimeout(aufloesen, listenLatenzMs))
      if (fehlerSeiten.includes(Number(url.searchParams.get('seite') ?? '1'))) {
        return json(route, 500, { title: 'Interner Fehler', status: 500 }, 'application/problem+json')
      }
      const suche = (url.searchParams.get('suche') ?? '').trim().toLowerCase()
      const seite = Number(url.searchParams.get('seite') ?? '1')
      const groesse = Number(url.searchParams.get('groesse') ?? '25')
      const treffer = coins
        .filter((c) => !suche || c.name.toLowerCase().includes(suche) || c.herausgeber.toLowerCase().includes(suche))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id))
      return json(route, 200, {
        eintraege: treffer.slice((seite - 1) * groesse, seite * groesse),
        gesamt: treffer.length,
        seite,
        groesse,
      })
    },
  )
  await page.route(
    (url) => /^\/api\/coins\/[^/]+$/.test(url.pathname),
    async (route) => {
      const url = new URL(route.request().url())
      apiAufrufe.push(`${route.request().method()} ${url.pathname}`)
      const coin = coins.find((c) => c.id === url.pathname.split('/')[3])
      return coin
        ? json(route, 200, coin)
        : json(route, 404, { title: 'Coin nicht gefunden', status: 404 }, 'application/problem+json')
    },
  )
  await page.route(
    (url) => /^\/api\/coins\/[^/]+\/bild$/.test(url.pathname),
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      apiAufrufe.push(`${request.method()} ${url.pathname}`)
      const coin = coins.find((c) => c.id === url.pathname.split('/')[3])
      if (request.method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: GROSSES_BILD })
      }
      if (naechsterUpload) {
        const antwort = naechsterUpload
        naechsterUpload = null
        return json(route, antwort.status, antwort.body, 'application/problem+json')
      }
      if (!coin) return json(route, 404, { title: 'Coin nicht gefunden', status: 404 }, 'application/problem+json')
      zaehler++
      coin.bildUrl = `/api/coins/${coin.id}/bild?v=${String(zaehler).padStart(16, 'a')}`
      return json(route, 200, coin)
    },
  )
}

function sidebar(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Hauptnavigation' })
}

function suchfeld(page: Page): Locator {
  return page.getByRole('searchbox', { name: 'Coins suchen' })
}

/** Drückt Tab, bis das Element den Fokus hat. */
async function tabBis(page: Page, ziel: Locator, max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    if (await ziel.evaluate((el) => el === document.activeElement)) return
  }
  throw new Error('Element ist per Tab nicht erreichbar.')
}

/** Sichtbarer Fokus: :focus-visible und Outline oder Ring (box-shadow). */
async function hatSichtbarenFokus(element: Locator): Promise<boolean> {
  return element.evaluate((el) => {
    const stil = getComputedStyle(el)
    return el.matches(':focus-visible') && (stil.outlineStyle !== 'none' || stil.boxShadow !== 'none')
  })
}

/** Wo der Fokus liegt: „body“, „{aria-label der nav}: {Text}“ oder „anderswo: …“ (für lesbare Fehlermeldungen). */
async function fokusOrt(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'body'
    const nav = el.closest('nav')
    const text = el.textContent?.trim() ?? ''
    return nav ? `${nav.getAttribute('aria-label') ?? ''}: ${text}` : `anderswo: ${el.tagName} ${text}`
  })
}

/** Hält die nächsten Listenabrufe zurück; der Aufruf der Rückgabe gibt sie frei. */
function sperreListe(): () => void {
  let freigeben!: () => void
  listenSperre = new Promise<void>((aufloesen) => {
    freigeben = aufloesen
  })
  return () => {
    listenSperre = null
    freigeben()
  }
}

/** Sichtbarer Fokus am gerade fokussierten Element (gleiche Prüfung wie `hatSichtbarenFokus`); body zählt nicht. */
async function aktiverFokusSichtbar(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return false
    const stil = getComputedStyle(el)
    return el.matches(':focus-visible') && (stil.outlineStyle !== 'none' || stil.boxShadow !== 'none')
  })
}

/** Scrollt das Fenster ans Ende der Seite (unter die Liste). */
async function ansSeitenende(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
}

/** Zwei Mausklicks kurz hintereinander an derselben Bildschirmstelle (Doppelklick); `zwischen` läuft dazwischen. */
async function zweimalKlicken(page: Page, ziel: Locator, zwischen: () => Promise<void>): Promise<void> {
  const box = await ziel.boundingBox()
  expect(box).not.toBeNull()
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2
  await page.mouse.click(x, y)
  await zwischen()
  await page.mouse.click(x, y)
}

async function alleTexte(page: Page): Promise<string> {
  return page.evaluate(() => {
    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    return [document.body.innerText, ...attribute].join(' ')
  })
}

test.beforeEach(async ({ page }) => {
  ungemockt = []
  coins = []
  apiAufrufe = []
  posts = []
  naechsterUpload = null
  zaehler = 0
  listenSperre = null
  fehlerSeiten = []
  listenLatenzMs = 0
  await page.route(
    (url) => istApi(url) || url.origin === IDP,
    async (route: Route) => {
      ungemockt.push(`${route.request().method()} ${route.request().url()}`)
      await route.abort('failed')
    },
  )
  await mockeCoinApi(page)
})

test.afterEach(() => {
  expect(ungemockt, 'Nicht gemockte API-/IdP-Aufrufe').toEqual([])
})

// ---------- AK-13, AK-21, AK-22: Administrator legt per Tastatur an ----------

test('Admin: Katalog → „Coin hinzufügen“ → Formular per Tastatur → Detailseite mit Meldung und Fokus auf h1', async ({
  page,
}) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/coins')
  await expect(page.getByRole('heading', { level: 1, name: 'Katalog' })).toBeVisible()

  await page.getByRole('link', { name: 'Coin hinzufügen' }).click()
  await expect(page).toHaveURL(`${WEB}/coins/neu`)
  await expect(page.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeVisible()

  await tabBis(page, page.getByLabel(/^Name/))
  await page.keyboard.type('Coin Tastatur')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel(/^Herausgeber/)).toBeFocused()
  await page.keyboard.type('Herausgeber Tastatur')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel(/^Auflage/)).toBeFocused()
  await page.keyboard.type('1500')
  await page.getByLabel(/^Herausgeber/).focus()
  await page.keyboard.press('Enter')

  await expect
    .poll(() => posts)
    .toEqual([{ name: 'Coin Tastatur', herausgeber: 'Herausgeber Tastatur', auflage: 1500, beschreibung: null }])
  await expect(page).toHaveURL(new RegExp(`^${WEB}/coins/0199a1b2-0000-7000-8000-000000000001$`))
  const h1 = page.getByRole('heading', { level: 1, name: 'Coin Tastatur' })
  await expect(h1).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: TEXTE.angelegt })).toBeVisible()
  await expect(h1).toBeFocused()
})

test('Admin: „Zurück“ im Browser führt nach dem Anlegen nicht zum ausgefüllten Formular', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/coins')
  await page.getByRole('link', { name: 'Coin hinzufügen' }).click()
  await page.getByLabel(/^Name/).fill('Coin Zurueck')
  await page.getByLabel(/^Herausgeber/).fill('Herausgeber Zurueck')
  await page.getByRole('button', { name: 'Coin anlegen' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Coin Zurueck' })).toBeVisible()

  await page.goBack()

  await expect(page).toHaveURL(`${WEB}/coins`)
  await expect(page.getByRole('button', { name: 'Coin anlegen' })).toHaveCount(0)
  expect(posts).toHaveLength(1)
})

test('Admin: nach dem Neuladen der Detailseite erscheint die Meldung nicht wieder', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/coins/neu')
  await page.getByLabel(/^Name/).fill('Coin Neuladen')
  await page.getByLabel(/^Herausgeber/).fill('Herausgeber Neuladen')
  await page.getByRole('button', { name: 'Coin anlegen' }).click()
  await expect(page.getByRole('status').filter({ hasText: TEXTE.angelegt })).toBeVisible()

  await page.reload()

  await expect(page.getByRole('heading', { level: 1, name: 'Coin Neuladen' })).toBeVisible()
  await expect(page.locator('header')).toContainText('Test Administrator')
  await expect(page.getByText(TEXTE.angelegt)).toHaveCount(0)
})

test('Sachbearbeiter sieht „Coin hinzufügen“ und erreicht das Formular', async ({ page }) => {
  await meldeAnAls(page, SACHBEARBEITER)
  await page.goto('/coins')

  await page.getByRole('link', { name: 'Coin hinzufügen' }).click()

  await expect(page.getByRole('button', { name: 'Coin anlegen' })).toBeVisible()
})

// ---------- AK-23: Teilerfolg ----------

test('Teilerfolg beim Bild (415): „Ohne Bild fortfahren“ führt zur Detailseite mit eigener Meldung', async ({
  page,
}) => {
  await meldeAnAls(page, ADMIN)
  naechsterUpload = { status: 415, body: { title: 'Format nicht unterstützt', status: 415 } }
  await page.goto('/coins/neu')
  await page.getByLabel(/^Name/).fill('Coin Teilerfolg')
  await page.getByLabel(/^Herausgeber/).fill('Herausgeber Teilerfolg')
  await page.getByLabel(/^Motivbild/).setInputFiles({
    name: 'motiv.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  })
  await page.getByRole('button', { name: 'Coin anlegen' }).click()

  await expect(page.getByText(TEXTE.teilerfolg)).toBeVisible()
  await expect(page).toHaveURL(`${WEB}/coins/neu`)
  await expect(page.getByRole('button', { name: 'Bild erneut hochladen' })).toBeVisible()

  await page.getByRole('button', { name: 'Ohne Bild fortfahren' }).click()

  await expect(page).toHaveURL(new RegExp(`^${WEB}/coins/0199a1b2-`))
  await expect(page.getByRole('status').filter({ hasText: TEXTE.ohneBild })).toBeVisible()
  await expect(page.getByText('Kein Motivbild vorhanden.')).toBeVisible()
  expect(posts).toHaveLength(1)
})

// ---------- AK-9, AK-10, AK-13: Betrachter und anonym ----------

test('Betrachter: kein „Coin hinzufügen“; Direktaufruf von /coins/neu endet auf „Kein Zugriff“ ohne POST', async ({
  page,
}) => {
  coins = [coinNr(1)]
  await meldeAnAls(page, BETRACHTER)
  await page.goto('/coins')
  await expect(page.getByRole('table', { name: 'Coins' })).toBeVisible()
  await expect(page.locator('header')).toContainText('Test Betrachter')
  await expect(page.getByRole('link', { name: 'Coin hinzufügen' })).toHaveCount(0)

  await page.goto('/coins/neu')

  await expect(page).toHaveURL(`${WEB}/kein-zugriff?grund=berechtigung`)
  await expect(page.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeVisible()
  await expect(page.getByText(TEXTE.ohneBerechtigung)).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Zum Coin-Katalog' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('button', { name: 'Erneut prüfen' })).toHaveCount(0)
  expect(posts).toEqual([])
})

test('„Kein Zugriff“ mit Grund keine Berechtigung enthält keine englischen Texte', async ({ page }) => {
  await meldeAnAls(page, BETRACHTER)
  await page.goto('/coins/neu')
  await expect(page.getByText(TEXTE.ohneBerechtigung)).toBeVisible()

  expect(await alleTexte(page)).not.toMatch(ENGLISCH)
})

test('anonym: Direktaufruf von /coins/neu startet die Anmeldung und kehrt danach zu /coins/neu zurück', async ({
  page,
}) => {
  await mockeIdp(page, ADMIN.name)
  await mockeMe(page, ADMIN)

  await page.goto('/coins/neu')

  await expect(page).toHaveURL(new RegExp(`^${AUTHORIZE}`))
  const state = new URL(page.url()).searchParams.get('state')
  await page.goto(`/anmeldung/rueckruf?code=ui-test-code&state=${state}`)
  await expect(page).toHaveURL(`${WEB}/coins/neu`)
  await expect(page.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeVisible()
})

test('anonym: Katalog ohne „Coin hinzufügen“, Detailseite lesbar, „Verleihungen“ ohne zusätzlichen Request', async ({
  page,
}) => {
  coins = [coinNr(1, { name: 'Coin Anonym' })]
  await mockeMe(page, null)
  await page.goto('/coins')
  await expect(page.getByRole('link', { name: 'Coin Anonym' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Coin hinzufügen' })).toHaveCount(0)

  apiAufrufe = []
  await page.getByRole('link', { name: 'Coin Anonym' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Coin Anonym' })).toBeVisible()
  const abschnitt = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Verleihungen' }) })
  await expect(abschnitt).toContainText(TEXTE.platzhalter)
  await page.waitForTimeout(200)
  expect(apiAufrufe).toEqual([`GET /api/coins/${coins[0].id}`])
})

// ---------- AK-14, AK-15: Suche, Blättern, URL, Tastatur ----------

test('Suche und Blättern stehen in Request und URL; „Zurück“ von der Detailseite stellt beides wieder her', async ({
  page,
}) => {
  coins = Array.from({ length: 30 }, (_, i) => coinNr(i + 1))
  await mockeMe(page, null)
  await page.goto('/coins')
  await expect(page.getByRole('status').filter({ hasText: '30 Coins gefunden' })).toBeVisible()

  await suchfeld(page).fill('katalogcoin')
  await suchfeld(page).press('Enter')
  await expect(page).toHaveURL(/[?&]suche=katalogcoin/)
  expect(apiAufrufe.at(-1)).toMatch(/suche=katalogcoin/)

  await page.getByRole('button', { name: 'Nächste Seite' }).click()
  await expect(page).toHaveURL(/[?&]seite=2/)
  await expect(page.getByText('Seite 2 von 2')).toBeVisible()
  expect(apiAufrufe.at(-1)).toMatch(/seite=2/)
  expect(apiAufrufe.at(-1)).toMatch(/suche=katalogcoin/)

  await page.getByRole('link', { name: 'Katalogcoin 026' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Katalogcoin 026' })).toBeVisible()
  await page.goBack()

  await expect(page).toHaveURL(/[?&]seite=2/)
  await expect(page).toHaveURL(/[?&]suche=katalogcoin/)
  await expect(page.getByText('Seite 2 von 2')).toBeVisible()
  await expect(suchfeld(page)).toHaveValue('katalogcoin')
  await expect(page.getByRole('link', { name: 'Katalogcoin 026' })).toBeVisible()
})

test('Neuladen von /coins?suche=…&seite=2 zeigt dieselbe Suche und Seite', async ({ page }) => {
  coins = Array.from({ length: 30 }, (_, i) => coinNr(i + 1))
  await mockeMe(page, null)

  await page.goto('/coins?suche=Katalogcoin&seite=2')
  await page.reload()

  await expect(page.getByText('Seite 2 von 2')).toBeVisible()
  await expect(suchfeld(page)).toHaveValue('Katalogcoin')
})

test('ungültige Werte in der URL (seite=abc) gelten als Seite 1 ohne Fehlermeldung', async ({ page }) => {
  coins = [coinNr(1)]
  await mockeMe(page, null)

  await page.goto('/coins?seite=abc')

  await expect(page.getByRole('table', { name: 'Coins' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(apiAufrufe.filter((a) => a.startsWith('GET /api/coins?')).every((a) => /[?&]seite=1(&|$)/.test(a))).toBe(true)
})

test('Tastatur: Tab bis zum Namens-Link, Enter öffnet die Detailseite', async ({ page }) => {
  coins = [coinNr(1, { name: 'Coin Tastaturlink' })]
  await mockeMe(page, null)
  await page.goto('/coins')
  const link = page.getByRole('link', { name: 'Coin Tastaturlink' })
  await expect(link).toBeVisible()

  await tabBis(page, link)
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(`${WEB}/coins/${coins[0].id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Coin Tastaturlink' })).toBeVisible()
})

test('Mausklick auf eine andere Zelle der Zeile öffnet die Detailseite', async ({ page }) => {
  coins = [coinNr(1, { name: 'Coin Zeilenklick', herausgeber: 'Herausgeber Zeilenklick' })]
  await mockeMe(page, null)
  await page.goto('/coins')

  await page.getByRole('cell', { name: 'Herausgeber Zeilenklick' }).click()

  await expect(page).toHaveURL(`${WEB}/coins/${coins[0].id}`)
})

test('sichtbarer Fokus an „Coin hinzufügen“, Suche, Namens-Link, Blättern und „Zurück zum Katalog“', async ({
  page,
}) => {
  coins = Array.from({ length: 30 }, (_, i) => coinNr(i + 1))
  await meldeAnAls(page, ADMIN)
  await page.goto('/coins')
  await expect(page.getByRole('table', { name: 'Coins' })).toBeVisible()

  const ziele = [
    page.getByRole('link', { name: 'Coin hinzufügen' }),
    suchfeld(page),
    page.getByRole('button', { name: 'Suchen' }),
    page.getByRole('link', { name: 'Katalogcoin 001' }),
    page.getByRole('button', { name: 'Nächste Seite' }),
  ]
  for (const ziel of ziele) {
    await tabBis(page, ziel)
    expect(await hatSichtbarenFokus(ziel)).toBe(true)
  }

  await page.goto(`/coins/${coins[0].id}`)
  const zurueck = page.getByRole('link', { name: 'Zurück zum Katalog' })
  await expect(zurueck).toBeVisible()
  await tabBis(page, zurueck)
  expect(await hatSichtbarenFokus(zurueck)).toBe(true)
})

// ---------- AK-26 (WCAG 2.4.3): Fokus beim Blättern ----------

test('Enter auf „Nächste Seite“ mit verzögerter Antwort: Fokus bleibt während des Ladens im Blättern', async ({
  page,
}) => {
  coins = Array.from({ length: 60 }, (_, i) => coinNr(i + 1))
  await mockeMe(page, null)
  await page.goto('/coins')
  await expect(page.getByText('Seite 1 von 3')).toBeVisible()
  const freigeben = sperreListe()
  await page.getByRole('button', { name: 'Nächste Seite' }).focus()

  await page.keyboard.press('Enter')
  await expect.poll(() => apiAufrufe.some((a) => /[?&]seite=2(&|$)/.test(a))).toBe(true)
  await page.waitForTimeout(150)

  try {
    expect(await fokusOrt(page)).toMatch(/^Seitennavigation: /)
  } finally {
    freigeben()
  }
})

test('Enter auf „Nächste Seite“ mit verzögerter Antwort: nach dem Laden liegt der Fokus auf „Nächste Seite“', async ({
  page,
}) => {
  coins = Array.from({ length: 60 }, (_, i) => coinNr(i + 1))
  await mockeMe(page, null)
  await page.goto('/coins')
  await expect(page.getByText('Seite 1 von 3')).toBeVisible()
  const freigeben = sperreListe()
  await page.getByRole('button', { name: 'Nächste Seite' }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => apiAufrufe.some((a) => /[?&]seite=2(&|$)/.test(a))).toBe(true)
  await page.waitForTimeout(150)

  freigeben()

  await expect(page.getByText('Seite 2 von 3')).toBeVisible()
  expect(await fokusOrt(page)).toBe('Seitennavigation: Nächste Seite')
})

test('Enter auf „Nächste Seite“ zur letzten Seite: Fokus bleibt im Blättern, nicht auf body', async ({ page }) => {
  coins = Array.from({ length: 30 }, (_, i) => coinNr(i + 1))
  await mockeMe(page, null)
  await page.goto('/coins')
  await expect(page.getByText('Seite 1 von 2')).toBeVisible()
  await page.getByRole('button', { name: 'Nächste Seite' }).focus()

  await page.keyboard.press('Enter')

  await expect(page.getByText('Seite 2 von 2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nächste Seite' })).toBeDisabled()
  expect(await fokusOrt(page)).toMatch(/^Seitennavigation: /)
})

// ---------- QA Runde 2 (N1): Blättern behält die Scroll-Position ----------

test('Enter auf „Nächste Seite“ am Seitenende: der fokussierte Button bleibt im sichtbaren Bereich', async ({
  page,
}) => {
  coins = Array.from({ length: 60 }, (_, i) => coinNr(i + 1))
  await page.setViewportSize({ width: 1280, height: 720 })
  await mockeMe(page, null)
  await page.goto('/coins')
  await expect(page.getByText('Seite 1 von 3')).toBeVisible()
  const naechste = page.getByRole('button', { name: 'Nächste Seite' })
  await ansSeitenende(page)
  await expect(naechste).toBeInViewport()
  await expect(page.getByRole('link', { name: 'Katalogcoin 001' })).not.toBeInViewport()
  await naechste.focus()

  await page.keyboard.press('Enter')

  await expect(page.getByText('Seite 2 von 3')).toBeVisible()
  await expect(naechste).toBeFocused()
  await expect(naechste).toBeInViewport()
})

test('Doppelklick auf „Nächste Seite“ am Seitenende öffnet keine Detailseite', async ({ page }) => {
  coins = Array.from({ length: 60 }, (_, i) => coinNr(i + 1))
  await page.setViewportSize({ width: 1280, height: 720 })
  await mockeMe(page, null)
  await page.goto('/coins')
  await expect(page.getByText('Seite 1 von 3')).toBeVisible()
  await ansSeitenende(page)
  const naechste = page.getByRole('button', { name: 'Nächste Seite' })
  await expect(naechste).toBeInViewport()

  await zweimalKlicken(page, naechste, () => expect(page).toHaveURL(/[?&]seite=2/))
  await page.waitForTimeout(300)

  expect(new URL(page.url()).pathname).toBe('/coins')
  expect(apiAufrufe.filter((a) => a.startsWith('GET /api/coins/'))).toEqual([])
})

test('Doppelklick auf „Nächste Seite“ am Seitenende mit verzögerter Antwort öffnet keine Detailseite', async ({
  page,
}) => {
  coins = Array.from({ length: 60 }, (_, i) => coinNr(i + 1))
  await page.setViewportSize({ width: 1280, height: 720 })
  await mockeMe(page, null)
  await page.goto('/coins')
  await expect(page.getByText('Seite 1 von 3')).toBeVisible()
  await ansSeitenende(page)
  const naechste = page.getByRole('button', { name: 'Nächste Seite' })
  await expect(naechste).toBeInViewport()
  const freigeben = sperreListe()

  try {
    await zweimalKlicken(page, naechste, async () => {
      await expect.poll(() => apiAufrufe.some((a) => /[?&]seite=2(&|$)/.test(a))).toBe(true)
      await page.waitForTimeout(100)
    })
    await page.waitForTimeout(300)
  } finally {
    freigeben()
  }

  expect(new URL(page.url()).pathname).toBe('/coins')
  expect(apiAufrufe.filter((a) => a.startsWith('GET /api/coins/'))).toEqual([])
  await expect(page.getByText('Seite 2 von 3')).toBeVisible()
})

// ---------- QA Runde 2 (H1): sichtbarer Fokus auf der Seitennavigation ----------

test('„Vorherige Seite“ von Seite 5 von 1 per Tastatur: der Fokus in der Seitennavigation ist sichtbar', async ({
  page,
}) => {
  coins = Array.from({ length: 10 }, (_, i) => coinNr(i + 1))
  await mockeMe(page, null)
  await page.goto('/coins?seite=5')
  await expect(page.getByText('Seite 5 von 1')).toBeVisible()
  await tabBis(page, page.getByRole('button', { name: 'Vorherige Seite' }))

  await page.keyboard.press('Enter')

  await expect(page.getByText('Seite 1 von 1')).toBeVisible()
  expect(await fokusOrt(page)).toMatch(/^Seitennavigation: /)
  expect(await aktiverFokusSichtbar(page)).toBe(true)
})

test('„Vorherige Seite“ von der letzten Seite mit verzögerter Antwort: der Fokus ist während des Ladens sichtbar', async ({
  page,
}) => {
  coins = Array.from({ length: 30 }, (_, i) => coinNr(i + 1))
  await mockeMe(page, null)
  await page.goto('/coins?seite=2')
  await expect(page.getByText('Seite 2 von 2')).toBeVisible()
  await tabBis(page, page.getByRole('button', { name: 'Vorherige Seite' }))
  const vorher = apiAufrufe.length
  const freigeben = sperreListe()

  await page.keyboard.press('Enter')
  await expect.poll(() => apiAufrufe.slice(vorher).some((a) => /[?&]seite=1(&|$)/.test(a))).toBe(true)
  await page.waitForTimeout(150)

  try {
    expect(await fokusOrt(page)).toMatch(/^Seitennavigation: /)
    expect(await aktiverFokusSichtbar(page)).toBe(true)
  } finally {
    freigeben()
  }
})

// ---------- QA Runde 3 (W1): echter Doppelklick auf „Vorherige Seite“ von einer kurzen letzten Seite ----------

/**
 * Echter Doppelklick an derselben Bildschirmstelle wie im Browser: erster Klick mit clickCount 1, zweiter mit
 * clickCount 2 (event.detail = 2). Dazwischen vergeht `abstandMs` – genug, damit die neue Seite gerendert ist.
 */
async function echterDoppelklick(page: Page, ziel: Locator, abstandMs: number): Promise<void> {
  const box = await ziel.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down({ clickCount: 1 })
  await page.mouse.up({ clickCount: 1 })
  await page.waitForTimeout(abstandMs)
  await page.mouse.down({ clickCount: 2 })
  await page.mouse.up({ clickCount: 2 })
}

for (const latenz of [20, 50, 80]) {
  test(`echter Doppelklick auf „Vorherige Seite“ von einer kurzen letzten Seite (Latenz ${latenz} ms) öffnet keine Detailseite`, async ({
    page,
  }) => {
    coins = Array.from({ length: 30 }, (_, i) => coinNr(i + 1))
    await page.setViewportSize({ width: 1280, height: 720 })
    await mockeMe(page, null)
    await page.goto('/coins?seite=2')
    await expect(page.getByText('Seite 2 von 2')).toBeVisible()
    const vorherige = page.getByRole('button', { name: 'Vorherige Seite' })
    await expect(vorherige).toBeInViewport()
    listenLatenzMs = latenz

    await echterDoppelklick(page, vorherige, latenz + 150)
    await page.waitForTimeout(300)

    expect(new URL(page.url()).pathname).toBe('/coins')
  })
}

// ---------- QA Runde 2 (H2): Ladefehler beim Blättern ----------

test('Ladefehler nach Enter auf „Nächste Seite“: der Fokus bleibt im Hauptbereich und fällt nicht auf body', async ({
  page,
}) => {
  coins = Array.from({ length: 60 }, (_, i) => coinNr(i + 1))
  fehlerSeiten = [2]
  await mockeMe(page, null)
  await page.goto('/coins')
  await expect(page.getByText('Seite 1 von 3')).toBeVisible()
  await page.getByRole('button', { name: 'Nächste Seite' }).focus()

  await page.keyboard.press('Enter')

  await expect(page.getByRole('alert').filter({ hasText: 'Coins konnten nicht geladen werden.' })).toBeVisible()
  await page.waitForTimeout(150)
  const ort = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'body'
    return el.closest('main') ? 'main' : `außerhalb von main: ${el.tagName}`
  })
  expect(ort).toBe('main')
})

// ---------- AK-17 bis AK-19: Detailseite ----------

test('Detailseite zeigt Stammdaten und das Motivbild höchstens 320 × 320 px', async ({ page }) => {
  coins = [
    coinNr(1, {
      name: 'Coin Bild',
      auflage: 12500,
      beschreibung: 'Erste Zeile\nZweite Zeile',
      bildUrl: '/api/coins/0199a1b2-0000-7000-8000-eeeeeeeeeee1/bild?v=aaaaaaaaaaaaaaaa',
    }),
  ]
  await mockeMe(page, null)

  await page.goto(`/coins/${coins[0].id}`)

  await expect(page.getByRole('heading', { level: 1, name: 'Coin Bild' })).toBeVisible()
  await expect(page.locator('dl')).toContainText('12.500')
  await expect(page.locator('dl')).toContainText('05.10.2026')
  const beschreibung = await page.locator('dd').filter({ hasText: 'Erste Zeile' }).innerText()
  expect(beschreibung).toMatch(/Erste Zeile\s*\n\s*Zweite Zeile/)
  const bild = page.getByRole('img', { name: 'Motiv: Coin Bild' })
  await expect(bild).toBeVisible()
  await expect.poll(() => bild.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
  const box = await bild.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeLessThanOrEqual(320)
  expect(box!.height).toBeLessThanOrEqual(320)
})

test('Detailseite für eine unbekannte GUID zeigt „Coin nicht gefunden“ mit Link zum Katalog', async ({ page }) => {
  await mockeMe(page, null)

  await page.goto('/coins/0199a1b2-0000-7000-8000-0000000000ff')

  await expect(page.getByRole('heading', { level: 1, name: 'Coin nicht gefunden' })).toBeVisible()
  await expect(page.getByText('Diesen Coin gibt es nicht im Katalog.')).toBeVisible()
  await page.getByRole('link', { name: 'Zum Katalog' }).click()
  await expect(page).toHaveURL(`${WEB}/coins`)
})

test('/coins/abc zeigt „Coin nicht gefunden“ ohne API-Aufruf für den Coin', async ({ page }) => {
  await mockeMe(page, null)

  await page.goto('/coins/abc')

  await expect(page.getByRole('heading', { level: 1, name: 'Coin nicht gefunden' })).toBeVisible()
  expect(apiAufrufe.filter((a) => a.startsWith('GET /api/coins/'))).toEqual([])
})

test('/coins/neu ruft nie GET /api/coins/neu auf', async ({ page }) => {
  await meldeAnAls(page, ADMIN)

  await page.goto('/coins/neu')

  await expect(page.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeVisible()
  expect(apiAufrufe.filter((a) => a.startsWith('GET /api/coins/'))).toEqual([])
})

// ---------- AK-25, AK-26: Navigation, Texte, schmaler Bildschirm ----------

test('Sidebar „Katalog“: aktiv auf Unterseiten, aria-current nur auf /coins, kein Eintrag „Coin hinzufügen“', async ({
  page,
}) => {
  coins = [coinNr(1)]
  await meldeAnAls(page, ADMIN)
  const katalog = sidebar(page).getByRole('link', { name: 'Katalog', exact: true })

  await page.goto('/coins')
  await expect(katalog).toHaveAttribute('aria-current', 'page')

  await page.goto('/coins/neu')
  await expect(page.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeVisible()
  await expect(katalog).toHaveAttribute('data-active')
  await expect(katalog).not.toHaveAttribute('aria-current', 'page')
  await expect(sidebar(page).getByRole('link', { name: /Coin hinzufügen/ })).toHaveCount(0)

  await page.goto(`/coins/${coins[0].id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Katalogcoin 001' })).toBeVisible()
  await expect(katalog).toHaveAttribute('data-active')
  await expect(katalog).not.toHaveAttribute('aria-current', 'page')
})

test('Katalog, „Coin hinzufügen“ und Detailseite enthalten keine englischen Texte', async ({ page }) => {
  coins = Array.from({ length: 30 }, (_, i) => coinNr(i + 1))
  await meldeAnAls(page, ADMIN)

  await page.goto('/coins')
  await expect(page.getByRole('table', { name: 'Coins' })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)

  await page.goto('/coins/neu')
  await expect(page.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)

  await page.goto(`/coins/${coins[0].id}`)
  await expect(page.getByRole('heading', { level: 2, name: 'Verleihungen' })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)
  expect(await alleTexte(page)).not.toMatch(/Ausgabe/i)
})

test('schmaler Bildschirm: Überschrift, „Coin hinzufügen“ und Suche sind erreichbar, kein waagerechtes Scrollen', async ({
  page,
}) => {
  coins = Array.from({ length: 30 }, (_, i) => coinNr(i + 1))
  await page.setViewportSize({ width: 375, height: 740 })
  await meldeAnAls(page, ADMIN)

  await page.goto('/coins')

  await expect(page.getByRole('heading', { level: 1, name: 'Katalog' })).toBeInViewport()
  await expect(page.getByRole('link', { name: 'Coin hinzufügen' })).toBeVisible()
  await expect(suchfeld(page)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('schmaler Bildschirm: Detailseite und Formular ohne waagerechtes Scrollen', async ({ page }) => {
  coins = [coinNr(1, { bildUrl: '/api/coins/0199a1b2-0000-7000-8000-eeeeeeeeeee1/bild?v=aaaaaaaaaaaaaaaa' })]
  await page.setViewportSize({ width: 375, height: 740 })
  await meldeAnAls(page, ADMIN)

  await page.goto(`/coins/${coins[0].id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Katalogcoin 001' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.goto('/coins/neu')
  await expect(page.getByRole('button', { name: 'Coin anlegen' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
