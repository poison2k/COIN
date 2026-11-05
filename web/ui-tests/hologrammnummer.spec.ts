import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { mockeStartseiteStandard } from './startseite-mocks.js'

// Feature hologrammnummer, Abschnitt 9 (UI-Test, gemockte API): Sachbearbeiter erfasst eine Ausgabe mit Nummer
// (Body enthält hologrammnummer), 409 erscheint am Feld; „Hologrammnummer korrigieren“ per Tastatur mit Pflichtgrund
// (Body mit bisherige); stornierte Ausgabe ohne Button. Prüfseite nur per Tastatur: Coin per Combobox, Nummer, Enter →
// die vier Ergebnisse mit Text und Icon; 429 mit Retry-After → Alarm, Button gesperrt. Betrachter fragt nur
// /api/pruefung, Sachbearbeiter …/mit-empfaenger. Sichtbarer Fokus, Kontrast, URL ohne Nummer, schmaler Bildschirm.
// API und IdP sind vollständig gemockt; alle Daten synthetisch.

const IDP = 'http://127.0.0.1:9'
const AUTHORITY = `${IDP}/realms/coin`
const CLIENT_ID = 'coin-web'
const USER_SCHLUESSEL = `oidc.user:${AUTHORITY}:${CLIENT_ID}`
const TOKEN = 'ui-access-token-hologramm'

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
  hologrammnummer: string | null
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
  id: '0199a1b2-0000-7000-8000-0000000000c7',
  name: 'Coin Hologrammtest',
  herausgeber: 'Herausgeber Test',
  auflage: 150,
  beschreibung: null,
  erstelltAm: '2026-10-05T12:00:00+00:00',
  bildUrl: null,
}
const ANDERER = {
  ...COIN,
  id: '0199a1b2-0000-7000-8000-0000000000c8',
  name: 'Coin Andere Serie',
  herausgeber: 'Herausgeber Zwei',
}

const MIT_ID = '0199a1b2-0000-7000-8000-00000000e021'
const STORNO_ID = '0199a1b2-0000-7000-8000-00000000e022'
const EMPFAENGER = 'Erika Prüfbeispiel'

const ENGLISCH =
  /\b(Loading|Error|Forbidden|Not Found|Not found|Back|Certificate|Check|Verify|Search|Select|Clear|No results|Submit|Save|Cancel|Close|Valid|Invalid|Required)\b/

type Ergebnis = 'gueltig' | 'storniert' | 'falscherCoin' | 'nichtGefunden'

let ungemockt: string[] = []
let ausgaben: Ausgabe[] = []
let posts: { pfad: string; body: Record<string, unknown> }[] = []
let puts: { pfad: string; body: Record<string, unknown> }[] = []
let pruefungen: { pfad: string; body: Record<string, unknown> }[] = []
let naechstePruefung: { status: number; body: unknown; headers?: Record<string, string> } | null = null
let naechsterPost: { status: number; body: unknown } | null = null

function ausgabe(id: string, teil: Partial<Ausgabe> = {}): Ausgabe {
  return {
    id,
    exemplarNummer: 12,
    zertifikatsnummer: 'C0042-0012',
    empfaenger: { name: EMPFAENGER, dienstgrad: 'Hauptmann', dienststelle: 'Beispielbataillon 1' },
    datum: '2026-10-01',
    gelegenheit: 'Truppenbesuch',
    begruendung: 'Herausragende Leistung',
    ausgebendeStelle: 'Kommandeur',
    erfasstAm: '2026-10-07T09:00:00+00:00',
    erfasstVon: { id: SACHBEARBEITER.id, name: SACHBEARBEITER.name },
    storno: null,
    hologrammnummer: 'AB 12-43',
    ...teil,
  }
}

function json(
  route: Route,
  status: number,
  body: unknown,
  contentType = 'application/json',
  headers: Record<string, string> = {},
) {
  return route.fulfill({ status, contentType, headers, body: JSON.stringify(body) })
}

function problem(route: Route, status: number, body: object, headers: Record<string, string> = {}) {
  return json(route, status, { status, ...body }, 'application/problem+json', headers)
}

function base64Url(objekt: object): string {
  return Buffer.from(JSON.stringify(objekt)).toString('base64url')
}

async function meldeAnAls(page: Page, me: Me): Promise<void> {
  const jetzt = Math.floor(Date.now() / 1000)
  const idToken = `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url({ iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-h', name: me.name, iat: jetzt, exp: jetzt + 300 })}.`
  const user = {
    id_token: idToken,
    session_state: null,
    access_token: TOKEN,
    refresh_token: 'ui-refresh-token-hologramm',
    token_type: 'Bearer',
    scope: 'openid profile email',
    profile: { iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-h', iat: jetzt, exp: jetzt + 300, name: me.name },
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

function datensatz(a: Ausgabe, mitEmpfaenger: boolean) {
  const basis = {
    coin: { id: COIN.id, name: COIN.name },
    exemplarNummer: a.exemplarNummer,
    zertifikatsnummer: a.zertifikatsnummer,
    hologrammnummer: a.hologrammnummer,
    datum: a.datum,
    status: a.storno ? 'storniert' : 'aktiv',
    storniertAm: a.storno ? a.storno.am.slice(0, 10) : null,
  }
  return mitEmpfaenger
    ? {
        ...basis,
        ausgabeId: a.id,
        empfaenger: a.empfaenger,
        gelegenheit: a.gelegenheit,
        begruendung: a.begruendung,
        ausgebendeStelle: a.ausgebendeStelle,
      }
    : basis
}

const normal = (s: unknown) =>
  String(s ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase()

async function mockeApi(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/coins',
    (route) => {
      const suche = (new URL(route.request().url()).searchParams.get('suche') ?? '').toLowerCase()
      const treffer = [COIN, ANDERER].filter((c) => c.name.toLowerCase().includes(suche))
      return json(route, 200, { eintraege: treffer, gesamt: treffer.length, seite: 1, groesse: 20 })
    },
  )
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
        eintraege: Array.from({ length: 25 }, (_, i) => ({ nummer: i + 1, status: 'verfuegbar' })),
        gesamt: COIN.auflage,
        seite: 1,
        groesse: 25,
      })
    },
  )
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}/ausgaben`,
    async (route) => {
      const request = route.request()
      if (request.method() === 'GET') {
        return json(route, 200, { eintraege: ausgaben, gesamt: ausgaben.length, seite: 1, groesse: 25 })
      }
      const body = request.postDataJSON() as Record<string, unknown>
      posts.push({ pfad: new URL(request.url()).pathname, body })
      if (naechsterPost) {
        const antwort = naechsterPost
        naechsterPost = null
        return problem(route, antwort.status, antwort.body as object)
      }
      const neu = ausgabe('0199a1b2-0000-7000-8000-00000000e099', {
        exemplarNummer: 1,
        zertifikatsnummer: 'C0042-0001',
        hologrammnummer:
          typeof body.hologrammnummer === 'string' && body.hologrammnummer.trim() ? normal(body.hologrammnummer) : null,
      })
      ausgaben.unshift(neu)
      return json(route, 201, neu)
    },
  )
  await page.route(
    (url) => /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+(\/hologrammnummer)?$/.test(url.pathname),
    async (route) => {
      const request = route.request()
      const pfad = new URL(request.url()).pathname
      const gefunden = ausgaben.find((a) => a.id === pfad.split('/')[5])
      if (!pfad.endsWith('/hologrammnummer')) {
        return gefunden ? json(route, 200, gefunden) : problem(route, 404, { title: 'Ausgabe nicht gefunden' })
      }
      const body = request.postDataJSON() as Record<string, unknown>
      puts.push({ pfad, body })
      if (!gefunden) return problem(route, 404, { title: 'Ausgabe nicht gefunden' })
      gefunden.hologrammnummer = String(body.hologrammnummer).trim().toUpperCase()
      return json(route, 200, gefunden)
    },
  )
  await page.route(
    (url) => url.pathname === '/api/pruefung' || url.pathname === '/api/pruefung/mit-empfaenger',
    async (route) => {
      const request = route.request()
      const pfad = new URL(request.url()).pathname
      const body = request.postDataJSON() as Record<string, unknown>
      pruefungen.push({ pfad, body })
      if (naechstePruefung) {
        const antwort = naechstePruefung
        naechstePruefung = null
        return antwort.status === 200
          ? json(route, 200, antwort.body)
          : problem(route, antwort.status, antwort.body as object, antwort.headers)
      }
      const treffer = ausgaben.find(
        (a) => a.hologrammnummer && normal(a.hologrammnummer) === normal(body.hologrammnummer),
      )
      const mitEmpfaenger = pfad.endsWith('/mit-empfaenger')
      if (!treffer) return json(route, 200, { ergebnis: 'nichtGefunden', datensatz: null })
      if (body.coinId && body.coinId !== COIN.id) return json(route, 200, { ergebnis: 'falscherCoin', datensatz: null })
      return json(route, 200, {
        ergebnis: treffer.storno ? 'storniert' : 'gueltig',
        datensatz: datensatz(treffer, mitEmpfaenger),
      })
    },
  )
}

test.beforeEach(async ({ page }) => {
  ungemockt = []
  posts = []
  puts = []
  pruefungen = []
  naechstePruefung = null
  naechsterPost = null
  ausgaben = [
    ausgabe(MIT_ID),
    ausgabe(STORNO_ID, {
      exemplarNummer: 13,
      zertifikatsnummer: 'C0042-0013',
      hologrammnummer: 'CD 56-78',
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
  await mockeStartseiteStandard(page)
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

/** Kontrast zwischen Textfarbe eines Elements und dem ersten nicht transparenten Hintergrund (WCAG 2.1). */
async function kontrast(element: Locator): Promise<number> {
  return element.evaluate((el) => {
    const leinwand = document.createElement('canvas').getContext('2d')!
    const rgba = (farbe: string): [number, number, number, number] => {
      leinwand.clearRect(0, 0, 1, 1)
      leinwand.fillStyle = farbe
      leinwand.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = leinwand.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const hintergrund = (start: Element | null): [number, number, number, number] => {
      for (let e = start; e; e = e.parentElement) {
        const farbe = rgba(getComputedStyle(e).backgroundColor)
        if (farbe[3] > 0.99) return farbe
      }
      return [255, 255, 255, 1]
    }
    const leuchtdichte = ([r, g, b]: number[]) => {
      const kanal = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b)
    }
    const vorne = rgba(getComputedStyle(el).color)
    const hinten = hintergrund(el)
    const gemischt = vorne.slice(0, 3).map((c, i) => c * vorne[3] + hinten[i] * (1 - vorne[3]))
    const [hell, dunkel] = [leuchtdichte(gemischt), leuchtdichte(hinten)].sort((a, b) => b - a)
    return (hell + 0.05) / (dunkel + 0.05)
  })
}

const nummernFeld = (page: Page) => page.getByLabel(/^Hologrammnummer/)
const coinFeld = (page: Page) => page.getByRole('combobox', { name: /^Coin \(optional\)/ })
const pruefenButton = (page: Page) => page.getByRole('button', { name: 'Prüfen' })

const UEBERSCHRIFT: Record<Ergebnis, string> = {
  gueltig: 'Zertifikat gültig',
  storniert: 'Ausgabe storniert, Zertifikat ungültig',
  falscherCoin: 'Die Nummer gehört nicht zu diesem Coin.',
  nichtGefunden: 'Nummer nicht gefunden. Das Zertifikat kann nicht bestätigt werden.',
}
const ICON: Record<Ergebnis, string> = {
  gueltig: 'lucide-circle-check',
  storniert: 'lucide-ban',
  falscherCoin: 'lucide-triangle-alert',
  nichtGefunden: 'lucide-search-x',
}

// ---------- Erfassen mit Nummer ----------

test('Sachbearbeiter erfasst eine Ausgabe mit Hologrammnummer, der Request enthält die Nummer', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}/ausgaben/neu`)
  await expect(page.getByRole('heading', { level: 1, name: 'Ausgabe erfassen' })).toBeVisible()

  await page.getByLabel(/^Name des Empfängers/).fill('Max Beispiel')
  await page.getByLabel(/^Gelegenheit/).fill('Truppenbesuch')
  await page.getByLabel(/^Begründung/).fill('Herausragende Leistung')
  await page.getByLabel(/^Ausgebende Stelle oder Person/).fill('Kommandeur')
  await page.getByLabel(/^Hologrammnummer/).fill('ab 12-34')
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()

  await expect.poll(() => posts.length).toBe(1)
  expect(normal(posts[0].body.hologrammnummer)).toBe('AB1234')
})

test('409 hologrammnummer_vergeben beim Erfassen erscheint am Feld und fokussiert es', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  naechsterPost = {
    status: 409,
    body: {
      title: 'Ausgabe nicht möglich',
      code: 'hologrammnummer_vergeben',
      detail: 'Diese Hologrammnummer ist bereits vergeben. Bitte die Nummer prüfen.',
    },
  }
  await page.goto(`/coins/${COIN.id}/ausgaben/neu`)
  await page.getByLabel(/^Name des Empfängers/).fill('Max Beispiel')
  await page.getByLabel(/^Gelegenheit/).fill('Truppenbesuch')
  await page.getByLabel(/^Begründung/).fill('Herausragende Leistung')
  await page.getByLabel(/^Ausgebende Stelle oder Person/).fill('Kommandeur')
  await page.getByLabel(/^Hologrammnummer/).fill('AB1234')
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()

  await expect(page.getByText('Diese Hologrammnummer ist bereits vergeben.')).toBeVisible()
  await expect(page.getByLabel(/^Hologrammnummer/)).toBeFocused()
  await expect(page.getByLabel(/^Hologrammnummer/)).toHaveAttribute('aria-invalid', 'true')
})

// ---------- Korrigieren ----------

test('Hologrammnummer korrigieren per Tastatur: Grund ist Pflicht, der Request enthält bisherige', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}/ausgaben/${MIT_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 12' })).toBeVisible()

  const button = page.getByRole('button', { name: 'Hologrammnummer korrigieren' })
  await tabBis(page, button)
  expect(await hatSichtbarenFokus(button)).toBe(true)
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Hologrammnummer korrigieren' })
  await expect(dialog).toBeVisible()

  const feld = dialog.getByLabel(/^Hologrammnummer/)
  await expect(feld).toHaveValue('AB 12-43')
  await feld.fill('AB 12-34')
  await page.keyboard.press('Enter')
  await expect(dialog.getByText('Bitte einen Grund für die Korrektur angeben.')).toBeVisible()
  expect(puts).toEqual([])

  await dialog.getByLabel(/^Grund der Korrektur/).fill('Tippfehler bei der Erfassung')
  await dialog.getByRole('button', { name: /Speichern/ }).click()

  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Hologrammnummer gespeichert.' })).toBeVisible()
  expect(puts).toHaveLength(1)
  expect(puts[0].body).toMatchObject({ grund: 'Tippfehler bei der Erfassung', bisherige: 'AB 12-43' })
  await expect(page.getByRole('button', { name: 'Hologrammnummer korrigieren' })).toBeFocused()
})

test('sichtbarer Fokus an Nummernfeld und Grund im Dialog', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}/ausgaben/${MIT_ID}`)
  const button = page.getByRole('button', { name: 'Hologrammnummer korrigieren' })
  await tabBis(page, button)
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Hologrammnummer korrigieren' })

  const feld = dialog.getByLabel(/^Hologrammnummer/)
  await expect(feld).toBeFocused()
  expect(await hatSichtbarenFokus(feld)).toBe(true)
  await page.keyboard.press('Tab')
  const grund = dialog.getByLabel(/^Grund der Korrektur/)
  await expect(grund).toBeFocused()
  expect(await hatSichtbarenFokus(grund)).toBe(true)
})

test('stornierte Ausgabe zeigt die Nummer, aber keinen Button zum Ändern', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}/ausgaben/${STORNO_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 13' })).toBeVisible()

  await expect(page.getByText('CD 56-78')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Hologrammnummer/ })).toHaveCount(0)
})

// ---------- Prüfseite ----------

async function oeffnePruefseite(page: Page, me: Me): Promise<void> {
  await starteAls(page, me)
  await page.goto('/pruefung')
  await expect(page.getByRole('heading', { level: 1, name: 'Zertifikat prüfen' })).toBeVisible()
}

async function pruefeNurPerTastatur(page: Page, nummer: string, coin?: string): Promise<void> {
  if (coin) {
    await tabBis(page, coinFeld(page))
    expect(await hatSichtbarenFokus(coinFeld(page))).toBe(true)
    await page.keyboard.type(coin)
    await expect(page.getByRole('option').first()).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Auswahl entfernen' })).toBeVisible()
  }
  await tabBis(page, nummernFeld(page))
  expect(await hatSichtbarenFokus(nummernFeld(page))).toBe(true)
  await page.keyboard.type(nummer)
  await page.keyboard.press('Enter')
}

const faelle: Array<[Ergebnis, string, string | undefined]> = [
  ['gueltig', 'ab 12-43', 'Hologramm'],
  ['storniert', 'cd 56-78', undefined],
  ['falscherCoin', 'AB1243', 'Andere'],
  ['nichtGefunden', 'ZZ9999', undefined],
]

for (const [ergebnis, nummer, coin] of faelle) {
  test(`Prüfseite nur per Tastatur: Ergebnis „${UEBERSCHRIFT[ergebnis]}“ mit Text und Icon`, async ({ page }) => {
    await oeffnePruefseite(page, BETRACHTER)

    await pruefeNurPerTastatur(page, nummer, coin)

    const ueberschrift = page.getByRole('heading', { level: 2, name: UEBERSCHRIFT[ergebnis] })
    await expect(ueberschrift).toBeVisible()
    const region = page.getByRole('status').filter({ has: ueberschrift })
    await expect(region.locator(`svg.${ICON[ergebnis]}[aria-hidden="true"]`)).toHaveCount(1)
    await expect(nummernFeld(page)).toBeFocused()
  })
}

test('Prüfseite: gewählter Coin geht als coinId in den Request', async ({ page }) => {
  await oeffnePruefseite(page, BETRACHTER)

  await pruefeNurPerTastatur(page, 'AB1243', 'Hologramm')

  await expect.poll(() => pruefungen.length).toBe(1)
  expect(pruefungen[0].body.coinId).toBe(COIN.id)
})

for (const theme of ['light', 'dark'] as const) {
  test(`Prüfseite: Ergebnis-Überschriften haben genügend Kontrast (${theme})`, async ({ page }) => {
    // 1 goto + 4 Reloads mit Kontrastmessung: im Vite-Dev-Modus länger als das Standard-Timeout
    test.slow()
    await page.addInitScript((wert) => localStorage.setItem('coin-theme', wert), theme)
    await oeffnePruefseite(page, BETRACHTER)

    for (const [ergebnis, nummer, coin] of faelle) {
      await page.reload()
      await expect(page.getByRole('heading', { level: 1, name: 'Zertifikat prüfen' })).toBeVisible()
      if (coin) {
        await coinFeld(page).click()
        await coinFeld(page).fill(coin)
        await page.getByRole('option').first().click()
      }
      await nummernFeld(page).fill(nummer)
      await nummernFeld(page).press('Enter')
      const ueberschrift = page.getByRole('heading', { level: 2, name: UEBERSCHRIFT[ergebnis] })
      await expect(ueberschrift).toBeVisible()

      expect(await kontrast(ueberschrift), `${ergebnis} (${theme})`).toBeGreaterThanOrEqual(4.5)
    }
  })
}

test('Prüfseite: 429 mit Retry-After zeigt den Alarm und sperrt den Button', async ({ page }) => {
  await oeffnePruefseite(page, BETRACHTER)
  naechstePruefung = {
    status: 429,
    headers: { 'Retry-After': '30', 'Cache-Control': 'no-store' },
    body: {
      title: 'Zu viele Prüfungen',
      code: 'zu_viele_pruefungen',
      detail:
        'Sie haben in kurzer Zeit zu viele Prüfungen durchgeführt. Bitte warten Sie einen Moment und versuchen Sie es erneut.',
    },
  }

  await nummernFeld(page).fill('AB1243')
  await nummernFeld(page).press('Enter')

  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Sie haben in kurzer Zeit zu viele Prüfungen durchgeführt. Bitte warten Sie 30 Sekunden.' }),
  ).toBeVisible()
  await expect(pruefenButton(page)).toHaveAttribute('aria-disabled', 'true')
  await nummernFeld(page).press('Enter')
  expect(pruefungen).toHaveLength(1)
})

test('Prüfseite: Betrachter fragt nur /api/pruefung und sieht keine Empfänger-Beschriftungen', async ({ page }) => {
  await oeffnePruefseite(page, BETRACHTER)

  await nummernFeld(page).fill('ab 12-43')
  await nummernFeld(page).press('Enter')
  await expect(page.getByRole('heading', { level: 2, name: 'Zertifikat gültig' })).toBeVisible()

  expect(pruefungen.map((p) => p.pfad)).toEqual(['/api/pruefung'])
  await expect(page.getByText(EMPFAENGER)).toHaveCount(0)
  for (const text of ['Empfänger', 'Gelegenheit', 'Begründung', 'Ausgebende Stelle']) {
    await expect(page.getByRole('term').filter({ hasText: new RegExp(`^${text}$`) })).toHaveCount(0)
  }
  await expect(page.getByRole('link', { name: 'Zur Ausgabe' })).toHaveCount(0)
})

test('Prüfseite: Sachbearbeiter fragt …/mit-empfaenger und sieht den Empfänger', async ({ page }) => {
  await oeffnePruefseite(page, SACHBEARBEITER)

  await nummernFeld(page).fill('ab 12-43')
  await nummernFeld(page).press('Enter')
  await expect(page.getByRole('heading', { level: 2, name: 'Zertifikat gültig' })).toBeVisible()

  expect(pruefungen.map((p) => p.pfad)).toEqual(['/api/pruefung/mit-empfaenger'])
  await expect(page.getByText(EMPFAENGER)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Zur Ausgabe' })).toHaveAttribute(
    'href',
    `/coins/${COIN.id}/ausgaben/${MIT_ID}`,
  )
})

test('Prüfseite: die Nummer steht nie in der URL', async ({ page }) => {
  await oeffnePruefseite(page, BETRACHTER)
  const urls: string[] = []
  page.on('framenavigated', (frame) => urls.push(frame.url()))
  page.on('request', (r) => urls.push(r.url()))

  await nummernFeld(page).fill('ab 12-43')
  await nummernFeld(page).press('Enter')
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible()

  expect([page.url(), ...urls].filter((u) => /12-43|AB1243|ab%2012/i.test(u))).toEqual([])
})

test('Prüfseite: über die Sidebar erreichbar', async ({ page }) => {
  await starteAls(page, BETRACHTER)
  await page.goto('/')

  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('link', { name: 'Zertifikat prüfen' })
    .click()

  await expect(page).toHaveURL(/\/pruefung$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Zertifikat prüfen' })).toBeVisible()
})

test('Prüfseite und Dialog enthalten keine englischen Texte', async ({ page }) => {
  await oeffnePruefseite(page, SACHBEARBEITER)
  await nummernFeld(page).fill('ab 12-43')
  await nummernFeld(page).press('Enter')
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)

  await page.goto(`/coins/${COIN.id}/ausgaben/${MIT_ID}`)
  await page.getByRole('button', { name: 'Hologrammnummer korrigieren' }).click()
  await expect(page.getByRole('dialog', { name: 'Hologrammnummer korrigieren' })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)
})

test('schmaler Bildschirm: Prüfseite mit Ergebnis ohne waagerechtes Scrollen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await oeffnePruefseite(page, SACHBEARBEITER)

  await nummernFeld(page).fill('ab 12-43')
  await nummernFeld(page).press('Enter')
  await expect(page.getByRole('heading', { level: 2, name: 'Zertifikat gültig' })).toBeVisible()

  const ueberlauf = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(ueberlauf).toBeLessThanOrEqual(0)
})
