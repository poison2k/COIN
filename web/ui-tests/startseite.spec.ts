import { expect, test, type Locator, type Page, type Request, type Route } from '@playwright/test'
import { mockeStartseiteStandard, STANDARD_INFOTEXT, standardStartseite } from './startseite-mocks.js'

// Feature startseite, Abschnitt 9.4 (UI-Tests mit gemockter API): Standardstartseite, Konfiguration durch den
// Administrator per Tastatur mit Prüfung der Request-Teile, XSS im echten Chromium (Infotext auf / und in der Vorschau,
// Titel auch anonym), Betrachter/Sachbearbeiter ohne Menüpunkt, Fehleranzeigen 400/413/409, ungespeicherte Änderungen,
// sichtbarer Fokus, anonymer Kopfbereich mit Logo, schmaler Viewport. API und IdP sind vollständig gemockt (IdP laut
// playwright.config.ts unerreichbar); alle Daten sind synthetisch.

const IDP = 'http://127.0.0.1:9'
const AUTHORITY = `${IDP}/realms/coin`
const CLIENT_ID = 'coin-web'
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
  berechtigungen: [
    'audit.read',
    'coins.read',
    'coins.write',
    'issues.read',
    'issues.write',
    'startpage.manage',
    'users.manage',
  ],
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

const TEXT_KEINE_BERECHTIGUNG =
  'Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.'

/** 1 × 1 Pixel PNG (gültig, damit das Logo im Browser vollständig lädt). */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const XSS_INFOTEXT = [
  '<script>window.__xss=1</script>',
  '<img src=x onerror="window.__xss=2">',
  '<svg onload="window.__xss=3">',
  '<iframe src="javascript:window.__xss=9"></iframe>',
  '[a](javascript:window.__xss=4)',
  '[b](JAVASCRIPT:window.__xss=5)',
  '[c](java&#x09;script:window.__xss=6)',
  '[d](data:text/html,<script>window.__xss=7</script>)',
  '[e](vbscript:msgbox)',
  '[f](//evil.example)',
  '<a href="javascript:window.__xss=8">g</a>',
  '![x](https://evil.example/x.png)',
  'Sichtbarer Text nach den Nutzlasten',
].join('\n\n')

const XSS_TITEL = '<img src=x onerror="alert(1)"><script>window.__xss=1</script>'

/** Nicht gemockte Aufrufe an API oder IdP; jeder Eintrag lässt den Test scheitern. */
let ungemockt: string[] = []
/** Alle API-Aufrufe („METHODE /pfad“). */
let apiAufrufe: string[] = []
/** Aufgezeichnete PUT-Requests auf die Konfiguration. */
let puts: Request[] = []
/** Aufrufe an evil.example (dürfen nie vorkommen). */
let fremdAufrufe: string[] = []
/** Geöffnete Dialoge (alert/confirm/prompt; dürfen bei XSS nie vorkommen). */
let dialoge: string[] = []
/** Aktueller Stand der gemockten Konfiguration. */
let konfiguration: Record<string, unknown>
/** Antwort von GET /api/startseite. */
let startseite: unknown
/** Antwort von GET /api/startseite/kopf. */
let kopf: unknown
/** Einmalige Antwort auf das nächste PUT (400/413/409). */
let naechsterPut: { status: number; body: object } | null = null

function istApi(url: URL): boolean {
  return url.pathname === '/api' || url.pathname.startsWith('/api/')
}

function base64Url(objekt: object): string {
  return Buffer.from(JSON.stringify(objekt)).toString('base64url')
}

function idToken(name: string): string {
  const jetzt = Math.floor(Date.now() / 1000)
  return `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url({ iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-s', name, iat: jetzt, exp: jetzt + 300 })}.`
}

function json(route: Route, status: number, body: unknown, contentType = 'application/json') {
  return route.fulfill({ status, contentType, body: JSON.stringify(body) })
}

function neuerCoin(n: number) {
  return {
    id: `0199a1b2-0000-7000-8000-${String(n).padStart(12, '0')}`,
    name: `Coin Neu ${n}`,
    herausgeber: `Herausgeber ${n}`,
    bildUrl: null,
  }
}

function topCoin(n: number, ausgegeben: number) {
  return {
    id: `0199a1b2-0000-7000-8000-${String(n).padStart(12, '9')}`,
    name: `Coin Top ${n}`,
    herausgeber: 'H',
    ausgegeben,
  }
}

function standardKonfiguration(): Record<string, unknown> {
  return {
    version: 0,
    standard: true,
    geaendertAm: null,
    geaendertVon: null,
    reihenfolge: ['kopf', 'infotext', 'kennzahlen', 'neueste', 'meistausgegeben'],
    kopf: {
      aktiv: false,
      titel: 'C.O.I.N.',
      untertitel: 'Certified Official Issue Numbering',
      logoBereitsteller: null,
      logoSoftware: null,
    },
    infotext: { aktiv: true, text: STANDARD_INFOTEXT },
    kennzahlen: { aktiv: true },
    neueste: { aktiv: true, anzahl: 6 },
    meistausgegeben: { aktiv: true, anzahl: 5 },
    daten: {
      kennzahlen: { coins: 3, exemplare: 450, ausgegeben: 12, verfuegbar: 438 },
      neueste: Array.from({ length: 12 }, (_, i) => neuerCoin(i + 1)),
      meistausgegeben: [topCoin(1, 7), topCoin(2, 5)],
    },
  }
}

function aktiverKopf(teil: Record<string, unknown> = {}) {
  return {
    aktiv: true,
    position: 1,
    titel: 'Testverband Gedenkmünzen',
    untertitel: 'Untertitel des Testverbands',
    logoBereitsteller: {
      url: '/api/startseite/logos/bereitsteller?v=0123456789abcdef',
      alternativtext: 'Wappen des Testverbands',
      breite: 96,
      hoehe: 96,
    },
    logoSoftware: null,
    ...teil,
  }
}

/** Teile eines multipart/form-data-Requests als Name → Inhalt (Text) und Name → Dateiname. */
function teile(request: Request): { inhalt: Map<string, string>; dateiname: Map<string, string> } {
  const typ = request.headers()['content-type'] ?? ''
  const grenze = /boundary=(.+)$/.exec(typ)?.[1]
  const roh = request.postDataBuffer()?.toString('latin1') ?? ''
  const inhalt = new Map<string, string>()
  const dateiname = new Map<string, string>()
  if (!grenze) return { inhalt, dateiname }
  for (const teil of roh.split(`--${grenze}`)) {
    const trenner = teil.indexOf('\r\n\r\n')
    if (trenner < 0) continue
    const kopfzeilen = teil.slice(0, trenner)
    const name = /name="([^"]+)"/.exec(kopfzeilen)?.[1]
    if (!name) continue
    inhalt.set(name, Buffer.from(teil.slice(trenner + 4).replace(/\r\n$/, ''), 'latin1').toString('utf8'))
    const datei = /filename="([^"]*)"/.exec(kopfzeilen)?.[1]
    if (datei !== undefined) dateiname.set(name, datei)
  }
  return { inhalt, dateiname }
}

/** Mockt /api/me und schreibt einen angemeldeten User in den sessionStorage (vor dem Laden der App). */
async function meldeAnAls(page: Page, me: Me): Promise<void> {
  const jetzt = Math.floor(Date.now() / 1000)
  const user = {
    id_token: idToken(me.name),
    session_state: null,
    access_token: 'ui-access-token-s',
    refresh_token: 'ui-refresh-token-s',
    token_type: 'Bearer',
    scope: 'openid profile email',
    profile: { iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-s', iat: jetzt, exp: jetzt + 300, name: me.name },
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

/** Mockt die Startseiten-API (öffentlicher Kopf, Logos, Startseite, Konfiguration GET/PUT). */
async function mockeStartseitenApi(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith('/api/startseite'),
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      apiAufrufe.push(`${request.method()} ${url.pathname}`)
      if (url.pathname === '/api/startseite/kopf') return json(route, 200, kopf)
      if (url.pathname === '/api/startseite') return json(route, 200, startseite)
      if (url.pathname.startsWith('/api/startseite/logos/')) {
        return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 })
      }
      if (url.pathname === '/api/startseite/konfiguration' && request.method() === 'GET') {
        return json(route, 200, konfiguration)
      }
      if (url.pathname === '/api/startseite/konfiguration' && request.method() === 'PUT') {
        puts.push(request)
        if (naechsterPut) {
          const { status, body } = naechsterPut
          naechsterPut = null
          return json(route, status, body, 'application/problem+json')
        }
        const eingabe = JSON.parse(teile(request).inhalt.get('konfiguration') ?? '{}') as Record<string, unknown>
        konfiguration = {
          ...konfiguration,
          ...eingabe,
          version: (konfiguration.version as number) + 1,
          standard: false,
          geaendertAm: '2026-10-26T09:00:00Z',
          geaendertVon: 'Test Administrator',
          daten: konfiguration.daten,
        }
        return json(route, 200, konfiguration)
      }
      return route.fallback()
    },
  )
}

async function starteAls(page: Page, me: Me | null): Promise<void> {
  await mockeStartseitenApi(page)
  if (me) await meldeAnAls(page, me)
  else
    await page.route(
      (url) => url.pathname === '/api/me',
      (route) => json(route, 401, { title: 'Nicht angemeldet' }),
    )
}

async function tabBis(page: Page, ziel: Locator, max = 120): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    if (await ziel.evaluate((el) => el === document.activeElement)) return
  }
  throw new Error('Element ist per Tab nicht erreichbar.')
}

async function xssWirkungslos(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as unknown as { __xss?: unknown }).__xss)).toBeUndefined()
  expect(dialoge, 'Dialoge').toEqual([])
  expect(fremdAufrufe, 'Aufrufe an evil.example').toEqual([])
}

function sidebar(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Hauptnavigation' })
}

test.beforeEach(async ({ page }) => {
  ungemockt = []
  apiAufrufe = []
  puts = []
  fremdAufrufe = []
  dialoge = []
  naechsterPut = null
  konfiguration = standardKonfiguration()
  startseite = standardStartseite()
  kopf = { aktiv: false, position: 1 }
  await page.route(
    (url) => istApi(url) || url.origin === IDP,
    async (route: Route) => {
      ungemockt.push(`${route.request().method()} ${route.request().url()}`)
      await route.abort('failed')
    },
  )
  await mockeStartseiteStandard(page)
  await page.route(
    (url) => url.hostname.endsWith('evil.example'),
    async (route) => {
      fremdAufrufe.push(route.request().url())
      await route.abort('failed')
    },
  )
  page.on('request', (request) => {
    if (request.url().includes('evil.example')) fremdAufrufe.push(request.url())
  })
  page.on('dialog', async (dialog) => {
    dialoge.push(dialog.message())
    await dialog.dismiss()
  })
})

test.afterEach(() => {
  expect(ungemockt, 'Nicht gemockte API-/IdP-Aufrufe').toEqual([])
})

// ---------- Standardstartseite für Betrachter (AK-1, AK-20, AK-21) ----------

test('Betrachter sieht die Standardstartseite mit h1, Infotext, Kennzahlen und Listen ohne Fehlermeldung', async ({
  page,
}) => {
  startseite = {
    bloecke: [
      { art: 'infotext', text: STANDARD_INFOTEXT },
      { art: 'kennzahlen', coins: 3, exemplare: 450, ausgegeben: 12, verfuegbar: 438 },
      { art: 'neueste', eintraege: [neuerCoin(1)] },
      { art: 'meistausgegeben', eintraege: [topCoin(1, 7)] },
    ],
  }
  await starteAls(page, BETRACHTER)

  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Information' })).toContainText(STANDARD_INFOTEXT)
  await expect(page.getByRole('region', { name: 'Kennzahlen' })).toContainText('450')
  await expect(page.getByRole('link', { name: 'Coin Neu 1' })).toBeVisible()
  await expect(page.getByText('7 ausgegeben')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Zum Katalog' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  // Endpunkte, nicht Aufrufe: Der Dev-Server rendert im StrictMode (Effekte laufen doppelt).
  expect([...new Set(apiAufrufe.filter((a) => a.startsWith('GET /api/startseite')))]).toEqual(['GET /api/startseite'])
})

test('Betrachter: Kennzahlen, Neueste und Meistausgegebene stehen auf breitem Bildschirm nebeneinander', async ({
  page,
}) => {
  await starteAls(page, BETRACHTER)
  await page.setViewportSize({ width: 1280, height: 900 })

  await page.goto('/')

  const kennzahlen = await page.getByRole('region', { name: 'Kennzahlen' }).boundingBox()
  const neueste = await page.getByRole('region', { name: 'Neueste Coins' }).boundingBox()
  expect(kennzahlen && neueste && Math.abs(kennzahlen.y - neueste.y) < 5).toBe(true)
})

test('Betrachter: Blöcke stehen auf schmalem Bildschirm untereinander', async ({ page }) => {
  await starteAls(page, BETRACHTER)
  await page.setViewportSize({ width: 500, height: 900 })

  await page.goto('/')

  const kennzahlen = await page.getByRole('region', { name: 'Kennzahlen' }).boundingBox()
  const neueste = await page.getByRole('region', { name: 'Neueste Coins' }).boundingBox()
  expect(kennzahlen && neueste && neueste.y >= kennzahlen.y + kennzahlen.height - 1).toBe(true)
})

// ---------- Betrachter und Sachbearbeiter (AK-25, AK-26) ----------

for (const [rolle, me] of [
  ['Betrachter', BETRACHTER],
  ['Sachbearbeiter', SACHBEARBEITER],
] as const) {
  test(`${rolle}: kein Menüpunkt „Startseite verwalten“`, async ({ page }) => {
    await starteAls(page, me)

    await page.goto('/')

    await expect(sidebar(page).getByRole('link', { name: 'Katalog', exact: true })).toBeVisible()
    await expect(sidebar(page).getByRole('link', { name: 'Startseite verwalten' })).toHaveCount(0)
  })

  test(`${rolle}: Direktaufruf von /verwaltung/startseite zeigt „Kein Zugriff“ ohne Konfigurationsabruf`, async ({
    page,
  }) => {
    await starteAls(page, me)

    await page.goto('/verwaltung/startseite')

    await expect(page).toHaveURL(/\/kein-zugriff\?grund=berechtigung$/)
    await expect(page.getByText(TEXT_KEINE_BERECHTIGUNG)).toBeVisible()
    expect(apiAufrufe).not.toContain('GET /api/startseite/konfiguration')
  })
}

// ---------- Administrator (AK-8, AK-27, AK-28, AK-31) ----------

test('Administrator: Block aus, Reihenfolge per Tastatur, speichern; danach zeigt / die neue Startseite', async ({
  page,
}) => {
  await starteAls(page, ADMIN)
  await page.goto('/')
  await sidebar(page).getByRole('link', { name: 'Startseite verwalten' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Startseite verwalten' })).toBeVisible()

  // Kennzahlen ausschalten (Leertaste), „Meistausgegebene Coins“ zweimal nach oben (Enter).
  await tabBis(page, page.getByRole('switch', { name: 'Kennzahlen anzeigen' }))
  await page.keyboard.press('Space')
  await expect(page.getByRole('switch', { name: 'Kennzahlen anzeigen' })).toHaveAttribute('aria-checked', 'false')
  await tabBis(page, page.getByRole('button', { name: 'Meistausgegebene Coins nach oben verschieben' }))
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Meistausgegebene Coins nach oben verschieben' })).toBeFocused()
  await expect(
    page.getByRole('status').filter({ hasText: 'Meistausgegebene Coins steht jetzt an Position 3 von 5.' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Speichern' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Die Startseite wurde gespeichert.' })).toBeVisible()
  expect(puts).toHaveLength(1)
  const { inhalt, dateiname } = teile(puts[0])
  expect([...inhalt.keys()]).toEqual(['konfiguration'])
  expect(dateiname.has('konfiguration')).toBe(false)
  const gesendet = JSON.parse(inhalt.get('konfiguration') ?? '{}') as Record<string, unknown>
  expect(gesendet.version).toBe(0)
  expect(gesendet.reihenfolge).toEqual(['kopf', 'infotext', 'meistausgegeben', 'kennzahlen', 'neueste'])
  expect((gesendet.kennzahlen as { aktiv: boolean }).aktiv).toBe(false)
  expect(puts[0].headers()['authorization']).toBe('Bearer ui-access-token-s')

  // Benutzer sehen die Änderung nach dem Neuladen von / (gemockte neue Antwort).
  startseite = {
    bloecke: [
      { art: 'infotext', text: STANDARD_INFOTEXT },
      { art: 'meistausgegeben', eintraege: [topCoin(1, 7)] },
      { art: 'neueste', eintraege: [neuerCoin(1)] },
    ],
  }
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Meistausgegebene Coins' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Kennzahlen' })).toHaveCount(0)
  const reihenfolge = await page
    .getByRole('region')
    .evaluateAll((regionen) =>
      regionen.map((r) => r.getAttribute('aria-label') ?? r.querySelector('h2')?.textContent ?? ''),
    )
  expect(reihenfolge).toEqual(['Information', 'Meistausgegebene Coins', 'Neueste Coins'])
})

test('Administrator: Logo hochladen sendet den Dateiteil logoBereitsteller und den Alternativtext', async ({
  page,
}) => {
  await starteAls(page, ADMIN)
  await page.goto('/verwaltung/startseite')
  await page.getByRole('switch', { name: 'Kopfbereich anzeigen' }).click()

  const auswahl = page.getByLabel('Logo auswählen').first()
  await auswahl.setInputFiles({ name: 'wappen.png', mimeType: 'image/png', buffer: PNG_1X1 })
  await page
    .getByRole('textbox', { name: /^Alternativtext/ })
    .first()
    .fill('Wappen des Testverbands')
  await page.getByRole('button', { name: 'Speichern' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Die Startseite wurde gespeichert.' })).toBeVisible()
  const { inhalt, dateiname } = teile(puts[0])
  expect([...inhalt.keys()].sort()).toEqual(['konfiguration', 'logoBereitsteller'])
  expect(dateiname.get('logoBereitsteller')).toBe('wappen.png')
  const kopfTeil = (JSON.parse(inhalt.get('konfiguration') ?? '{}') as { kopf: Record<string, unknown> }).kopf
  expect(kopfTeil.logoBereitsteller).toEqual({ alternativtext: 'Wappen des Testverbands' })
  expect(kopfTeil.aktiv).toBe(true)
})

test('Administrator: alles per Tastatur bedienbar mit sichtbarem Fokus', async ({ page }) => {
  await starteAls(page, ADMIN)
  await page.goto('/verwaltung/startseite')
  await expect(page.getByRole('heading', { level: 1, name: 'Startseite verwalten' })).toBeVisible()

  for (const ziel of [
    page.getByRole('tab', { name: 'Bearbeiten' }),
    page.getByRole('switch', { name: 'Kopfbereich anzeigen' }),
    page.getByRole('button', { name: 'Kopfbereich nach unten verschieben' }),
    page.getByRole('textbox', { name: /^Infotext/ }),
    page.getByRole('combobox', { name: /Anzahl/ }).first(),
    page.getByRole('button', { name: 'Speichern' }),
  ]) {
    await tabBis(page, ziel)
    const sichtbar = await ziel.evaluate((el) => {
      const stil = getComputedStyle(el)
      const umriss = stil.outlineStyle !== 'none' && parseFloat(stil.outlineWidth) > 0
      const schatten = stil.boxShadow !== 'none' && stil.boxShadow !== ''
      return el.matches(':focus-visible') && (umriss || schatten)
    })
    expect(
      sichtbar,
      `sichtbarer Fokus auf ${(await ziel.getAttribute('aria-label')) ?? (await ziel.textContent())}`,
    ).toBe(true)
  }
})

test('Administrator: Tabs „Bearbeiten“ und „Vorschau“ wechseln per Pfeiltaste', async ({ page }) => {
  await starteAls(page, ADMIN)
  await page.goto('/verwaltung/startseite')

  await tabBis(page, page.getByRole('tab', { name: 'Bearbeiten' }))
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('region', { name: 'Vorschau der Startseite' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
})

// ---------- XSS (AK-24) ----------

test('XSS: Infotext mit Nutzlasten ist auf / wirkungslos', async ({ page }) => {
  startseite = { bloecke: [{ art: 'infotext', text: XSS_INFOTEXT }] }
  await starteAls(page, BETRACHTER)

  await page.goto('/')

  const region = page.getByRole('region', { name: 'Information' })
  await expect(region).toContainText('Sichtbarer Text nach den Nutzlasten')
  await expect(region.locator('script, img, svg, iframe')).toHaveCount(0)
  const hrefs = await region.locator('[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href')))
  expect(hrefs).toEqual([])
  await page.waitForTimeout(300)
  await xssWirkungslos(page)
})

test('XSS: Infotext mit Nutzlasten ist in der Vorschau wirkungslos', async ({ page }) => {
  await starteAls(page, ADMIN)
  await page.goto('/verwaltung/startseite')
  await page.getByRole('textbox', { name: /^Infotext/ }).fill(XSS_INFOTEXT)

  await page.getByRole('tab', { name: 'Vorschau' }).click()

  const vorschau = page.getByRole('region', { name: 'Vorschau der Startseite' })
  await expect(vorschau).toContainText('Sichtbarer Text nach den Nutzlasten')
  await expect(vorschau.locator('script, iframe, svg, [onerror], [onload]')).toHaveCount(0)
  await page.waitForTimeout(300)
  await xssWirkungslos(page)
  expect(puts).toHaveLength(0)
})

test('XSS: Titel mit Nutzlast ist für anonyme Besucher wirkungslos', async ({ page }) => {
  kopf = aktiverKopf({ titel: XSS_TITEL, logoBereitsteller: null })
  await starteAls(page, null)

  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: XSS_TITEL })).toBeVisible()
  await expect(page.locator('main img, main script')).toHaveCount(0)
  await page.waitForTimeout(300)
  await xssWirkungslos(page)
})

// ---------- Fehleranzeigen (AK-30) ----------

test('Administrator: 400 zeigt den Feldfehler am Titel', async ({ page }) => {
  naechsterPut = {
    status: 400,
    body: {
      title: 'Eingaben ungültig',
      status: 400,
      errors: { 'kopf.titel': ['Der Titel darf höchstens 100 Zeichen lang sein.'] },
    },
  }
  await starteAls(page, ADMIN)
  await page.goto('/verwaltung/startseite')
  await page.getByRole('switch', { name: 'Kennzahlen anzeigen' }).click()

  await page.getByRole('button', { name: 'Speichern' }).click()

  const titel = page.getByRole('textbox', { name: /^Titel/ })
  await expect(titel).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Der Titel darf höchstens 100 Zeichen lang sein.')).toBeVisible()
})

test('Administrator: 413 zeigt die Meldung am Logo-Feld', async ({ page }) => {
  naechsterPut = {
    status: 413,
    body: {
      title: 'Datei zu groß',
      status: 413,
      code: 'datei_zu_gross',
      feld: 'logoSoftware',
      detail: 'Das Logo der Software darf höchstens 2 MB groß sein.',
    },
  }
  await starteAls(page, ADMIN)
  await page.goto('/verwaltung/startseite')
  await page.getByRole('switch', { name: 'Kennzahlen anzeigen' }).click()

  await page.getByRole('button', { name: 'Speichern' }).click()

  await expect(page.getByText('Das Logo der Software darf höchstens 2 MB groß sein.')).toBeVisible()
})

test('Administrator: 409 zeigt die Meldung mit „Neu laden“', async ({ page }) => {
  naechsterPut = {
    status: 409,
    body: {
      title: 'Speichern nicht möglich',
      status: 409,
      code: 'startseite_geaendert',
      detail: 'Die Startseite wurde inzwischen geändert. Bitte die Seite neu laden.',
    },
  }
  await starteAls(page, ADMIN)
  await page.goto('/verwaltung/startseite')
  await page.getByRole('switch', { name: 'Kennzahlen anzeigen' }).click()

  await page.getByRole('button', { name: 'Speichern' }).click()

  const meldung = page.getByRole('alert').filter({ hasText: 'Die Startseite wurde inzwischen geändert.' })
  await expect(meldung).toBeVisible()
  await expect(meldung.getByRole('button', { name: 'Neu laden' })).toBeVisible()
})

test('Administrator: Client-Vorprüfung meldet einen leeren Infotext und sendet nichts', async ({ page }) => {
  await starteAls(page, ADMIN)
  await page.goto('/verwaltung/startseite')
  await page.getByRole('textbox', { name: /^Infotext/ }).fill('')

  await page.getByRole('button', { name: 'Speichern' }).click()

  await expect(page.getByRole('alert').filter({ hasText: 'Bitte die markierten Eingaben prüfen.' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: /^Infotext/ })).toBeFocused()
  expect(puts).toHaveLength(0)
})

// ---------- Ungespeicherte Änderungen (AK-32) ----------

test('Administrator: Verlassen mit ungespeicherten Änderungen fragt per AlertDialog nach', async ({ page }) => {
  await starteAls(page, ADMIN)
  await page.goto('/verwaltung/startseite')
  await page.getByRole('switch', { name: 'Kennzahlen anzeigen' }).click()

  await sidebar(page).getByRole('link', { name: 'Startseite', exact: true }).click()

  const dialog = page.getByRole('alertdialog', { name: 'Ungespeicherte Änderungen' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(
    'Die Änderungen an der Startseite sind nicht gespeichert. Seite trotzdem verlassen?',
  )
  await dialog.getByRole('button', { name: 'Bleiben' }).click()
  await expect(page).toHaveURL(/\/verwaltung\/startseite$/)
})

// ---------- Anonym (AK-22, AK-37) ----------

test('Anonym: aktiver Kopf zeigt Titel als h1 und Logo, ohne Request auf /api/startseite und ohne Kennzahlen', async ({
  page,
}) => {
  kopf = aktiverKopf()
  await starteAls(page, null)

  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Testverband Gedenkmünzen' })).toBeVisible()
  const logo = page.getByRole('img', { name: 'Wappen des Testverbands' })
  await expect(logo).toBeVisible()
  expect(
    await logo.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0),
  ).toBe(true)
  await expect(page.getByRole('region', { name: 'Kennzahlen' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Zum Katalog' })).toBeVisible()
  expect(apiAufrufe.filter((a) => a === 'GET /api/startseite')).toEqual([])
  expect(apiAufrufe).toContain('GET /api/startseite/kopf')
})

test('Anonym: inaktiver Kopf zeigt „Willkommen bei C.O.I.N.“', async ({ page }) => {
  await starteAls(page, null)

  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeVisible()
  expect([...new Set(apiAufrufe)]).toEqual(['GET /api/startseite/kopf'])
})

test('Anonym: Logo steht auf breitem Bildschirm links neben dem Titel', async ({ page }) => {
  kopf = aktiverKopf()
  await starteAls(page, null)
  await page.setViewportSize({ width: 1280, height: 900 })

  await page.goto('/')

  const logo = await page.getByRole('img', { name: 'Wappen des Testverbands' }).boundingBox()
  const titel = await page.getByRole('heading', { level: 1 }).boundingBox()
  expect(logo && titel && logo.x + logo.width <= titel.x + 1).toBe(true)
})

test('Anonym: Logo und Titel stehen auf schmalem Bildschirm untereinander', async ({ page }) => {
  kopf = aktiverKopf()
  await starteAls(page, null)
  await page.setViewportSize({ width: 400, height: 900 })

  await page.goto('/')

  const logo = await page.getByRole('img', { name: 'Wappen des Testverbands' }).boundingBox()
  const titel = await page.getByRole('heading', { level: 1 }).boundingBox()
  expect(logo && titel && titel.y >= logo.y + logo.height - 1).toBe(true)
})

test('Anonym: Logos sind höchstens 96 px hoch', async ({ page }) => {
  kopf = aktiverKopf({
    logoBereitsteller: {
      url: '/api/startseite/logos/bereitsteller?v=0123456789abcdef',
      alternativtext: 'Wappen des Testverbands',
      breite: 400,
      hoehe: 480,
    },
  })
  await starteAls(page, null)

  await page.goto('/')

  const logo = await page.getByRole('img', { name: 'Wappen des Testverbands' }).boundingBox()
  expect(logo?.height ?? 0).toBeLessThanOrEqual(96)
})
