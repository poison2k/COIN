import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

// Feature zertifikat-erzeugen, Abschnitt 8 (UI-Test): Spalte „Zertifikat“ in der Ausgabehistorie mit aktiver und
// stornierter Ausgabe desselben Exemplars (gleiche Nummer), Download per Tastatur, 409 ausgabe_storniert, Ausgabe-Seite
// mit Download, Betrachter ohne Zugriff, sichtbarer Fokus. API und IdP sind vollständig gemockt; Daten synthetisch.

const IDP = 'http://127.0.0.1:9'
const AUTHORITY = `${IDP}/realms/coin`
const CLIENT_ID = 'coin-web'
const USER_SCHLUESSEL = `oidc.user:${AUTHORITY}:${CLIENT_ID}`
const TOKEN = 'ui-access-token-zertifikat'

test.use({ timezoneId: 'Europe/Berlin' })

interface Me {
  id: string
  name: string
  email: string | null
  rolle: 'Administrator' | 'Sachbearbeiter' | 'Betrachter' | 'keine'
  berechtigungen: string[]
}

interface Ausgabe {
  id: string
  exemplarNummer: number
  zertifikatsnummer: string
  empfaenger: { name: string; dienstgrad: string | null; dienststelle: string | null }
  datum: string
  gelegenheit: string
  begruendung: string
  ausgebendeStelle: string
  erfasstAm: string
  erfasstVon: { id: string; name: string }
  storno: null | { am: string; von: { id: string; name: string }; grund: string }
}

const SACHBEARBEITER: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a002',
  name: 'Test Sachbearbeiter',
  email: 'sachbearbeiter@test.local',
  rolle: 'Sachbearbeiter',
  berechtigungen: ['coins.read', 'coins.write', 'issues.read', 'issues.write'],
}
const BETRACHTER: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a003',
  name: 'Test Betrachter',
  email: 'betrachter@test.local',
  rolle: 'Betrachter',
  berechtigungen: ['coins.read'],
}

const COIN = {
  id: '0199a1b2-0000-7000-8000-0000000000c2',
  name: 'Coin Zertifikatstest',
  herausgeber: 'Herausgeber Test',
  auflage: 150,
  beschreibung: null,
  erstelltAm: '2026-10-05T12:00:00+00:00',
  bildUrl: null,
}

const NEU_ID = '0199a1b2-0000-7000-8000-00000000e012'
const ALT_ID = '0199a1b2-0000-7000-8000-00000000e011'
const NUMMER = 'C0042-0012'
const STORNIERT_TEXT =
  'Diese Ausgabe wurde inzwischen storniert. Ein Zertifikat kann nicht mehr heruntergeladen werden.'

const ENGLISCH =
  /\b(Loading|Error|Forbidden|Not Found|Not found|Back|Certificate|Download|Recipient|Reason|Occasion|Issued|Show|View|Cancelled|disabled)\b/

let ungemockt: string[] = []
let zertifikatAnfragen: { pfad: string; authorization: string | null }[] = []
let ausgabenAnfragen: string[] = []
let ausgaben: Ausgabe[] = []
let naechsterDownload: 'storniert' | null = null

function ausgabe(id: string, teil: Partial<Ausgabe> = {}): Ausgabe {
  return {
    id,
    exemplarNummer: 12,
    zertifikatsnummer: NUMMER,
    empfaenger: { name: 'Erika Beispiel', dienstgrad: 'Hauptmann', dienststelle: 'Beispielbataillon 1' },
    datum: '2026-10-01',
    gelegenheit: 'Truppenbesuch',
    begruendung: 'Herausragende Leistung',
    ausgebendeStelle: 'Kommandeur',
    erfasstAm: '2026-10-07T09:00:00+00:00',
    erfasstVon: { id: SACHBEARBEITER.id, name: SACHBEARBEITER.name },
    storno: null,
    ...teil,
  }
}

function json(route: Route, status: number, body: unknown, contentType = 'application/json') {
  return route.fulfill({ status, contentType, body: JSON.stringify(body) })
}

function problem(route: Route, status: number, body: object) {
  return json(route, status, { status, ...body }, 'application/problem+json')
}

function base64Url(objekt: object): string {
  return Buffer.from(JSON.stringify(objekt)).toString('base64url')
}

async function meldeAnAls(page: Page, me: Me): Promise<void> {
  const jetzt = Math.floor(Date.now() / 1000)
  const idToken = `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url({ iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-z', name: me.name, iat: jetzt, exp: jetzt + 300 })}.`
  const user = {
    id_token: idToken,
    session_state: null,
    access_token: TOKEN,
    refresh_token: 'ui-refresh-token-zertifikat',
    token_type: 'Bearer',
    scope: 'openid profile email',
    profile: { iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-z', iat: jetzt, exp: jetzt + 300, name: me.name },
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
  await page.route(
    (url) => url.pathname === '/api/me',
    (route) => json(route, 200, me),
  )
}

async function mockeApi(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}`,
    (route) => json(route, 200, COIN),
  )
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}/exemplare`,
    (route) => {
      const ausgegeben = ausgaben.filter((a) => a.storno === null).length
      return json(route, 200, {
        kennzahlen: { auflage: COIN.auflage, ausgegeben, verfuegbar: COIN.auflage - ausgegeben },
        eintraege: Array.from({ length: 25 }, (_, i) => ({
          nummer: i + 1,
          status: ausgaben.some((a) => a.exemplarNummer === i + 1 && a.storno === null) ? 'ausgegeben' : 'verfuegbar',
        })),
        gesamt: COIN.auflage,
        seite: 1,
        groesse: 25,
      })
    },
  )
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}/ausgaben`,
    (route) => {
      ausgabenAnfragen.push(new URL(route.request().url()).pathname)
      return json(route, 200, { eintraege: ausgaben, gesamt: ausgaben.length, seite: 1, groesse: 25 })
    },
  )
  await page.route(
    (url) => /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+(\/zertifikat)?$/.test(url.pathname),
    async (route) => {
      const request = route.request()
      const pfad = new URL(request.url()).pathname
      const id = pfad.split('/')[5]
      const gefunden = ausgaben.find((a) => a.id === id)
      if (!pfad.endsWith('/zertifikat')) {
        ausgabenAnfragen.push(pfad)
        return gefunden ? json(route, 200, gefunden) : problem(route, 404, { title: 'Ausgabe nicht gefunden' })
      }
      zertifikatAnfragen.push({ pfad, authorization: await request.headerValue('authorization') })
      if (!gefunden) return problem(route, 404, { title: 'Ausgabe nicht gefunden' })
      if (naechsterDownload === 'storniert' || gefunden.storno) {
        naechsterDownload = null
        gefunden.storno ??= { am: '2026-10-08T10:00:00+00:00', von: { id: 'x', name: 'Test Admin' }, grund: 'Doppelt' }
        return problem(route, 409, {
          title: 'Zertifikat nicht möglich',
          code: 'ausgabe_storniert',
          detail: 'Für eine stornierte Ausgabe kann kein Zertifikat heruntergeladen werden.',
        })
      }
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="Zertifikat_${gefunden.zertifikatsnummer}.docx"`,
          'Cache-Control': 'no-store',
        },
        body: Buffer.from('PK-ui-test-zertifikat'),
      })
    },
  )
}

test.beforeEach(async ({ page }) => {
  ungemockt = []
  zertifikatAnfragen = []
  ausgabenAnfragen = []
  naechsterDownload = null
  ausgaben = [
    ausgabe(NEU_ID),
    ausgabe(ALT_ID, {
      erfasstAm: '2026-10-02T09:00:00+00:00',
      storno: { am: '2026-10-06T10:00:00+00:00', von: { id: 'x', name: 'Test Admin' }, grund: 'Falsches Exemplar' },
    }),
  ]
  await page.route(
    (url) => url.pathname === '/api' || url.pathname.startsWith('/api/') || url.origin === IDP,
    async (route: Route) => {
      ungemockt.push(`${route.request().method()} ${route.request().url()}`)
      await route.abort('failed')
    },
  )
})

test.afterEach(() => {
  expect(ungemockt, 'Nicht gemockte API-/IdP-Aufrufe').toEqual([])
})

async function starteAls(page: Page, me: Me): Promise<void> {
  await mockeApi(page)
  await meldeAnAls(page, me)
}

async function tabBis(page: Page, ziel: Locator, max = 120): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    if (await ziel.evaluate((el) => el === document.activeElement)) return
  }
  throw new Error('Element ist per Tab nicht erreichbar.')
}

async function hatSichtbarenFokus(element: Locator): Promise<boolean> {
  return element.evaluate((el) => {
    const stil = getComputedStyle(el)
    return el.matches(':focus-visible') && (stil.outlineStyle !== 'none' || stil.boxShadow !== 'none')
  })
}

async function alleTexte(page: Page): Promise<string> {
  return page.evaluate(() => {
    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    return [document.body.innerText, ...attribute].join(' ')
  })
}

function historie(page: Page): Locator {
  return page.getByRole('table', { name: 'Ausgabehistorie' })
}

// ---------- Sachbearbeiter ----------

test('Sachbearbeiter lädt das Zertifikat der aktiven Zeile per Tastatur herunter', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  await expect(historie(page)).toBeVisible()

  const button = historie(page).getByRole('button', { name: `Zertifikat ${NUMMER} herunterladen`, exact: true })
  await expect(button).toBeVisible()
  await tabBis(page, button)
  const download = page.waitForEvent('download')
  await page.keyboard.press('Enter')

  expect((await download).suggestedFilename()).toBe(`Zertifikat_${NUMMER}.docx`)
  expect(zertifikatAnfragen).toEqual([
    { pfad: `/api/coins/${COIN.id}/ausgaben/${NEU_ID}/zertifikat`, authorization: `Bearer ${TOKEN}` },
  ])
})

test('Der Button der stornierten Zeile ist gesperrt und nennt den Grund', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)

  const gesperrt = historie(page).getByRole('button', {
    name: `Zertifikat ${NUMMER} herunterladen (nicht möglich, Ausgabe storniert)`,
  })

  await expect(gesperrt).toBeDisabled()
  await expect(
    historie(page).getByRole('link', { name: `Stornierte Ausgabe ${NUMMER} anzeigen`, exact: true }),
  ).toBeVisible()
  await expect(historie(page).getByRole('link', { name: `Ausgabe ${NUMMER} anzeigen`, exact: true })).toBeVisible()
})

test('Nach 409 ausgabe_storniert erscheint der Alarm, der Fokus bleibt und die Historie lädt neu', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  await expect(historie(page)).toBeVisible()
  naechsterDownload = 'storniert'
  const vorher = ausgabenAnfragen.filter((p) => p.endsWith('/ausgaben')).length

  const button = historie(page).getByRole('button', { name: `Zertifikat ${NUMMER} herunterladen`, exact: true })
  await expect(button).toBeVisible()
  await button.focus()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('alert').filter({ hasText: STORNIERT_TEXT })).toBeVisible()
  await expect.poll(() => ausgabenAnfragen.filter((p) => p.endsWith('/ausgaben')).length).toBeGreaterThan(vorher)

  // AK-26: Nach dem Neuladen ist derselbe Button gesperrt, der Fokus bleibt auf ihm (nicht auf <body>).
  const gesperrt = page
    .getByRole('table', { name: 'Ausgabehistorie' })
    .getByRole('row')
    .nth(1)
    .getByRole('button', { name: `Zertifikat ${NUMMER} herunterladen (nicht möglich, Ausgabe storniert)`, exact: true })
  await expect(gesperrt).toBeDisabled()
  await expect(gesperrt).toBeFocused()
})

test('Ausgabe-Seite: nach 409 ausgabe_storniert erscheint der Alarm und der Fokus bleibt auf dem gesperrten Button', async ({
  page,
}) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}/ausgaben/${NEU_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 12' })).toBeVisible()
  naechsterDownload = 'storniert'
  const vorher = ausgabenAnfragen.filter((p) => p.endsWith(NEU_ID)).length

  const button = page.getByRole('button', { name: /Zertifikat.*herunterladen/ })
  await expect(button).toBeEnabled()
  await button.focus()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('alert').filter({ hasText: STORNIERT_TEXT })).toBeVisible()
  await expect.poll(() => ausgabenAnfragen.filter((p) => p.endsWith(NEU_ID)).length).toBeGreaterThan(vorher)
  await expect(page.getByText('Für stornierte Ausgaben kann kein Zertifikat heruntergeladen werden.')).toBeVisible()
  await expect(button).toBeDisabled()
  await expect(button).toBeFocused()
})

test('Link zur Ausgabe-Seite und Download dort', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)

  const link = historie(page).getByRole('link', { name: `Ausgabe ${NUMMER} anzeigen`, exact: true })
  await expect(link).toBeVisible()
  await link.click()

  await expect(page).toHaveURL(new RegExp(`/coins/${COIN.id}/ausgaben/${NEU_ID}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 12' })).toBeVisible()
  await expect(page.getByRole('link', { name: COIN.name })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Zertifikat.*herunterladen/ }).click()
  expect((await download).suggestedFilename()).toBe(`Zertifikat_${NUMMER}.docx`)
})

test('Ausgabe-Seite einer stornierten Ausgabe: Button gesperrt mit Hinweis darunter', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}/ausgaben/${ALT_ID}`)

  const button = page.getByRole('button', { name: /Zertifikat.*herunterladen/ })
  await expect(button).toBeDisabled()
  await expect(page.getByText('Für stornierte Ausgaben kann kein Zertifikat heruntergeladen werden.')).toBeVisible()
  expect(zertifikatAnfragen).toEqual([])
})

test('Link und Button der Historie haben einen sichtbaren Fokus', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  await expect(historie(page)).toBeVisible()

  const link = historie(page).getByRole('link', { name: `Ausgabe ${NUMMER} anzeigen`, exact: true })
  await expect(link).toBeVisible()
  await tabBis(page, link)
  expect(await hatSichtbarenFokus(link)).toBe(true)
  await page.keyboard.press('Tab')
  const button = historie(page).getByRole('button', { name: `Zertifikat ${NUMMER} herunterladen`, exact: true })
  await expect(button).toBeFocused()
  expect(await hatSichtbarenFokus(button)).toBe(true)
})

test('Ausgabe-Seite und Detailseite enthalten keine englischen Texte', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  await expect(historie(page)).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)

  await page.goto(`/coins/${COIN.id}/ausgaben/${NEU_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 12' })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)
})

test('Ausgabe-Seite im schmalen Viewport: Button und Angaben bleiben ohne waagerechtes Scrollen erreichbar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}/ausgaben/${NEU_ID}`)

  const button = page.getByRole('button', { name: /Zertifikat.*herunterladen/ })
  await expect(button).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

// ---------- Betrachter ----------

test('Betrachter sieht keine Historie und keinen Zertifikat-Button und sendet keine Requests darauf', async ({
  page,
}) => {
  await starteAls(page, BETRACHTER)
  await page.goto(`/coins/${COIN.id}`)
  await expect(page.getByRole('heading', { level: 1, name: COIN.name })).toBeVisible()

  await expect(page.getByRole('button', { name: /Zertifikat/ })).toHaveCount(0)
  expect(zertifikatAnfragen).toEqual([])
  expect(ausgabenAnfragen).toEqual([])
})

test('Betrachter erhält beim Direktaufruf der Ausgabe-Seite „Kein Zugriff“', async ({ page }) => {
  await starteAls(page, BETRACHTER)
  await page.goto(`/coins/${COIN.id}/ausgaben/${NEU_ID}`)

  await expect(page.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeVisible()
  await expect(page).toHaveURL(/\/kein-zugriff\?grund=berechtigung$/)
  expect(zertifikatAnfragen).toEqual([])
  expect(ausgabenAnfragen).toEqual([])
})
