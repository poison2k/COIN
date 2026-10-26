import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { mockeStartseiteStandard } from './startseite-mocks.js'

// Feature coin-ausgaben, Abschnitt 8 (UI-Tests): Detailseite mit Exemplaren und Ausgabehistorie, „Ausgabe erfassen“,
// Storno und Berechtigungsstufen im Browser. API und IdP sind vollständig gemockt; alle Daten sind synthetisch.

const IDP = 'http://127.0.0.1:9'
const AUTHORITY = `${IDP}/realms/coin`
const CLIENT_ID = 'coin-web'
const USER_SCHLUESSEL = `oidc.user:${AUTHORITY}:${CLIENT_ID}`

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
  id: '0199a1b2-0000-7000-8000-0000000000c1',
  name: 'Coin Ausgabetest',
  herausgeber: 'Herausgeber Test',
  auflage: 150 as number | null,
  beschreibung: null,
  erstelltAm: '2026-10-05T12:00:00+00:00',
  bildUrl: null,
}

const ENGLISCH =
  /\b(Loading|Error|Forbidden|Not Found|Not found|Previous|Next|Page|Cancel|Back|Save|Submit|Recipient|Reason|Occasion|Available|Issued|Issues|History|Required|Close|Edition)\b/

let ungemockt: string[] = []
let apiAufrufe: string[] = []
let ausgaben: Ausgabe[] = []
let auflage: number | null = 150
let posts: unknown[] = []
let stornos: unknown[] = []
let naechsterPost: { status: number; body: object } | null = null
let zaehler = 0

function heuteInBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

function ausgabeNr(nr: number, teil: Partial<Ausgabe> = {}): Ausgabe {
  return {
    id: `0199a1b2-0000-7000-8000-${String(nr).padStart(12, 'e')}`,
    exemplarNummer: nr,
    empfaenger: { name: `Empfänger ${nr}`, dienstgrad: 'Hauptmann', dienststelle: 'Beispielbataillon 1' },
    datum: '2026-10-01',
    gelegenheit: 'Truppenbesuch',
    begruendung: 'Herausragende Leistung',
    ausgebendeStelle: 'Kommandeur',
    erfasstAm: `2026-10-0${Math.min(nr, 7)}T09:00:00+00:00`,
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

async function meldeAnAls(page: Page, me: Me | null): Promise<void> {
  if (me) {
    const jetzt = Math.floor(Date.now() / 1000)
    const idToken = `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url({ iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-1', name: me.name, iat: jetzt, exp: jetzt + 300 })}.`
    const user = {
      id_token: idToken,
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
  }
  await page.route(
    (url) => url.pathname === '/api/me',
    (route) => (me ? json(route, 200, me) : problem(route, 401, { title: 'Nicht angemeldet' })),
  )
}

const aktiv = (nr: number) => ausgaben.some((a) => a.exemplarNummer === nr && a.storno === null)

async function mockeApi(page: Page, me: () => Me | null): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}`,
    async (route) => {
      apiAufrufe.push(`GET ${new URL(route.request().url()).pathname}`)
      return json(route, 200, { ...COIN, auflage })
    },
  )
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}/exemplare`,
    async (route) => {
      const url = new URL(route.request().url())
      apiAufrufe.push(`GET ${url.pathname}${url.search}`)
      const status = url.searchParams.get('status')
      const seite = Number(url.searchParams.get('seite') ?? '1')
      const alle = Array.from({ length: auflage ?? 0 }, (_, i) => ({
        nummer: i + 1,
        status: aktiv(i + 1) ? 'ausgegeben' : 'verfuegbar',
      }))
      const ausgegeben = alle.filter((e) => e.status === 'ausgegeben').length
      const gefiltert = status ? alle.filter((e) => e.status === status) : alle
      return json(route, 200, {
        kennzahlen: { auflage, ausgegeben, verfuegbar: (auflage ?? 0) - ausgegeben },
        eintraege: gefiltert.slice((seite - 1) * 25, seite * 25),
        gesamt: gefiltert.length,
        seite,
        groesse: 25,
      })
    },
  )
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}/ausgaben`,
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      apiAufrufe.push(`${request.method()} ${url.pathname}${url.search}`)
      if (request.method() === 'GET') {
        const seite = Number(url.searchParams.get('seite') ?? '1')
        return json(route, 200, {
          eintraege: ausgaben.slice((seite - 1) * 25, seite * 25),
          gesamt: ausgaben.length,
          seite,
          groesse: 25,
        })
      }
      const daten = request.postDataJSON() as Record<string, unknown>
      posts.push(daten)
      if (naechsterPost) {
        const antwort = naechsterPost
        naechsterPost = null
        return problem(route, antwort.status, antwort.body)
      }
      const gewuenscht = typeof daten.exemplarNummer === 'number' ? daten.exemplarNummer : null
      const nummer = gewuenscht ?? Array.from({ length: auflage ?? 0 }, (_, i) => i + 1).find((nr) => !aktiv(nr))!
      zaehler++
      const ich = me()!
      const neu = ausgabeNr(nummer, {
        id: `0199a1b2-0000-7000-8000-${String(100 + zaehler).padStart(12, 'f')}`,
        empfaenger: {
          name: String(daten.empfaengerName),
          dienstgrad: (daten.empfaengerDienstgrad as string | null) ?? null,
          dienststelle: (daten.empfaengerDienststelle as string | null) ?? null,
        },
        datum: String(daten.datum),
        gelegenheit: String(daten.gelegenheit),
        begruendung: String(daten.begruendung),
        ausgebendeStelle: String(daten.ausgebendeStelle),
        erfasstAm: '2026-10-08T09:30:00+00:00',
        erfasstVon: { id: ich.id, name: ich.name },
      })
      ausgaben.unshift(neu)
      return json(route, 201, neu)
    },
  )
  await page.route(
    (url) => /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+\/storno$/.test(url.pathname),
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      apiAufrufe.push(`POST ${url.pathname}`)
      const daten = request.postDataJSON() as { grund: string }
      stornos.push(daten)
      const ausgabe = ausgaben.find((a) => a.id === url.pathname.split('/')[5])
      if (!ausgabe) return problem(route, 404, { title: 'Ausgabe nicht gefunden' })
      if (ausgabe.storno) {
        return problem(route, 409, {
          title: 'Ausgabe nicht möglich',
          code: 'bereits_storniert',
          detail: 'Diese Ausgabe ist bereits storniert.',
        })
      }
      const ich = me()!
      ausgabe.storno = { am: '2026-10-08T10:00:00+00:00', von: { id: ich.id, name: ich.name }, grund: daten.grund }
      return json(route, 200, ausgabe)
    },
  )
}

test.beforeEach(async ({ page }) => {
  ungemockt = []
  apiAufrufe = []
  ausgaben = [ausgabeNr(2), ausgabeNr(1)]
  auflage = 150
  posts = []
  stornos = []
  naechsterPost = null
  zaehler = 0
  await page.route(
    (url) => url.pathname === '/api' || url.pathname.startsWith('/api/') || url.origin === IDP,
    async (route: Route) => {
      ungemockt.push(`${route.request().method()} ${route.request().url()}`)
      await route.abort('failed')
    },
  )
  // startseite (9.7): `/` ruft jetzt GET /api/startseite bzw. …/kopf auf; Standardantworten statt Catch-all.
  await mockeStartseiteStandard(page)
})

test.afterEach(() => {
  expect(ungemockt, 'Nicht gemockte API-/IdP-Aufrufe').toEqual([])
})

async function starteAls(page: Page, me: Me | null): Promise<void> {
  await mockeApi(page, () => me)
  await meldeAnAls(page, me)
}

async function tabBis(page: Page, ziel: Locator, max = 80): Promise<void> {
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

function kennzahlen(page: Page): Locator {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Exemplare' }) })
    .locator('dl')
}

// ---------- Sachbearbeiter: Erfassen per Tastatur ----------

test('Sachbearbeiter erfasst eine Ausgabe nur per Tastatur und landet auf der Detailseite mit Meldung', async ({
  page,
}) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  await expect(page.getByRole('table', { name: 'Exemplare' })).toBeVisible()
  await expect(kennzahlen(page)).toContainText('150')

  const erfassen = page.getByRole('link', { name: 'Ausgabe erfassen' })
  await tabBis(page, erfassen)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/coins/${COIN.id}/ausgaben/neu$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Ausgabe erfassen' })).toBeVisible()
  await expect(page.getByText('Verfügbar: 148 von 150')).toBeVisible()

  await tabBis(page, page.getByLabel(/^Name des Empfängers/))
  await page.keyboard.type('Erika Beispiel')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Oberleutnant')
  await tabBis(page, page.getByLabel(/^Gelegenheit/))
  await page.keyboard.type('Verabschiedung')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Langjährige Verdienste')
  await tabBis(page, page.getByLabel(/^Ausgebende Stelle oder Person/))
  await page.keyboard.type('Kommandeur Beispielbataillon 1')
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(new RegExp(`/coins/${COIN.id}$`))
  expect(posts).toEqual([
    {
      exemplarNummer: null,
      empfaengerName: 'Erika Beispiel',
      empfaengerDienstgrad: 'Oberleutnant',
      empfaengerDienststelle: null,
      datum: heuteInBerlin(),
      gelegenheit: 'Verabschiedung',
      begruendung: 'Langjährige Verdienste',
      ausgebendeStelle: 'Kommandeur Beispielbataillon 1',
    },
  ])
  await expect(page.getByRole('status').filter({ hasText: 'Exemplar Nr. 3 wurde ausgegeben.' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: COIN.name })).toBeFocused()
  const historie = page.getByRole('table', { name: 'Ausgabehistorie' })
  await expect(historie.getByRole('row').nth(1)).toContainText('Erika Beispiel')
  await expect(kennzahlen(page)).toHaveText(/Auflage\s*150\s*Ausgegeben\s*3\s*Verfügbar\s*147/)
})

test('nach dem Erfassen führt „Zurück“ nicht auf das ausgefüllte Formular', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  await page.getByRole('link', { name: 'Ausgabe erfassen' }).click()
  await page.getByLabel(/^Name des Empfängers/).fill('Erika Beispiel')
  await page.getByLabel(/^Gelegenheit/).fill('Verabschiedung')
  await page.getByLabel(/^Begründung/).fill('Verdienste')
  await page.getByLabel(/^Ausgebende Stelle oder Person/).fill('Kommandeur')
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Exemplar Nr. 3 wurde ausgegeben.' })).toBeVisible()

  await page.goBack()

  await expect(page).not.toHaveURL(/\/ausgaben\/neu$/)
})

test('die Meldung nach dem Erfassen erscheint nach dem Neuladen nicht wieder', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}/ausgaben/neu`)
  await page.getByLabel(/^Name des Empfängers/).fill('Erika Beispiel')
  await page.getByLabel(/^Gelegenheit/).fill('Verabschiedung')
  await page.getByLabel(/^Begründung/).fill('Verdienste')
  await page.getByLabel(/^Ausgebende Stelle oder Person/).fill('Kommandeur')
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()
  await expect(page.getByText('Exemplar Nr. 3 wurde ausgegeben.')).toBeVisible()

  await page.reload()

  await expect(page.getByRole('table', { name: 'Exemplare' })).toBeVisible()
  await expect(page.getByText('Exemplar Nr. 3 wurde ausgegeben.')).toHaveCount(0)
})

test('Radio-Gruppe per Pfeiltaste: „Bestimmte Nummer“ aktiviert das Feld, die Nummer geht in den POST', async ({
  page,
}) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}/ausgaben/neu`)
  const naechste = page.getByRole('radio', { name: 'Nächstes freies Exemplar' })
  await tabBis(page, naechste)
  expect(await hatSichtbarenFokus(naechste)).toBe(true)

  await page.keyboard.press('ArrowDown')

  await expect(page.getByRole('radio', { name: 'Bestimmte Nummer' })).toBeChecked()
  const nummer = page.getByLabel(/^Exemplar-Nummer/)
  await expect(nummer).toBeEnabled()
  await nummer.fill('42')
  await page.getByLabel(/^Name des Empfängers/).fill('Erika Beispiel')
  await page.getByLabel(/^Gelegenheit/).fill('Verabschiedung')
  await page.getByLabel(/^Begründung/).fill('Verdienste')
  await page.getByLabel(/^Ausgebende Stelle oder Person/).fill('Kommandeur')
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()
  await expect(page.getByText('Exemplar Nr. 42 wurde ausgegeben.')).toBeVisible()
  expect((posts[0] as { exemplarNummer: unknown }).exemplarNummer).toBe(42)
})

test('Pflichtfelder: leeres Absenden sendet nichts und fokussiert das erste fehlerhafte Feld', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}/ausgaben/neu`)

  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()

  await expect(page.getByLabel(/^Name des Empfängers/)).toBeFocused()
  await expect(page.getByLabel(/^Name des Empfängers/)).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Name des Empfängers ist erforderlich.')).toBeVisible()
  expect(posts).toEqual([])
})

// ---------- 409-Fälle ----------

test('409 exemplar_ausgegeben erscheint am Feld „Exemplar-Nummer“, Eingaben bleiben erhalten', async ({ page }) => {
  naechsterPost = {
    status: 409,
    body: {
      title: 'Ausgabe nicht möglich',
      code: 'exemplar_ausgegeben',
      detail: 'Exemplar Nr. 2 ist bereits ausgegeben.',
    },
  }
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}/ausgaben/neu`)
  await page.getByRole('radio', { name: 'Bestimmte Nummer' }).click()
  await page.getByLabel(/^Exemplar-Nummer/).fill('2')
  await page.getByLabel(/^Name des Empfängers/).fill('Erika Beispiel')
  await page.getByLabel(/^Gelegenheit/).fill('Verabschiedung')
  await page.getByLabel(/^Begründung/).fill('Verdienste')
  await page.getByLabel(/^Ausgebende Stelle oder Person/).fill('Kommandeur')

  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()

  await expect(page.getByLabel(/^Exemplar-Nummer/)).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Exemplar Nr. 2 ist bereits ausgegeben.')).toBeVisible()
  await expect(page.getByLabel(/^Name des Empfängers/)).toHaveValue('Erika Beispiel')
  await expect(page).toHaveURL(/\/ausgaben\/neu$/)
})

test('409 kein_exemplar_frei erscheint als Alarm', async ({ page }) => {
  naechsterPost = {
    status: 409,
    body: {
      title: 'Ausgabe nicht möglich',
      code: 'kein_exemplar_frei',
      detail: 'Alle Exemplare dieses Coins sind ausgegeben.',
    },
  }
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}/ausgaben/neu`)
  await page.getByLabel(/^Name des Empfängers/).fill('Erika Beispiel')
  await page.getByLabel(/^Gelegenheit/).fill('Verabschiedung')
  await page.getByLabel(/^Begründung/).fill('Verdienste')
  await page.getByLabel(/^Ausgebende Stelle oder Person/).fill('Kommandeur')

  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()

  await expect(
    page.getByRole('alert').filter({ hasText: 'Alle Exemplare dieses Coins sind ausgegeben.' }),
  ).toBeVisible()
})

test('ohne Auflage zeigt die Erfassen-Seite statt des Formulars den Hinweis und „Zurück zum Coin“', async ({
  page,
}) => {
  auflage = null
  ausgaben = []
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}/ausgaben/neu`)

  await expect(
    page.getByText(
      'Für diesen Coin ist keine Auflage erfasst. Ausgaben sind erst nach dem Festlegen der Auflage möglich.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ausgabe speichern' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Zurück zum Coin' })).toBeVisible()
})

// ---------- Storno per Tastatur ----------

test('Storno per Tastatur: Dialog mit Grund und Datenschutz-Hinweis, danach Meldung, Historie und Kennzahlen', async ({
  page,
}) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  await expect(page.getByRole('table', { name: 'Ausgabehistorie' })).toBeVisible()
  const stornieren = page.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 2 stornieren' })

  await tabBis(page, stornieren)
  expect(await hatSichtbarenFokus(stornieren)).toBe(true)
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })
  await expect(dialog).toBeVisible()
  const grund = dialog.getByLabel(/^Grund/)
  await expect(grund).toHaveAccessibleDescription(/Bitte keine Personendaten in den Grund schreiben\./)
  await grund.focus()
  expect(await hatSichtbarenFokus(grund)).toBe(true)
  await page.keyboard.type('Falsches Exemplar erfasst')
  await tabBis(page, dialog.getByRole('button', { name: 'Stornieren' }), 5)
  await page.keyboard.press('Enter')

  await expect(dialog).toHaveCount(0)
  const meldung = page.getByRole('status').filter({ hasText: 'Ausgabe von Exemplar Nr. 2 wurde storniert.' })
  await expect(meldung).toBeVisible()
  await expect(meldung).toBeFocused()
  expect(stornos).toEqual([{ grund: 'Falsches Exemplar erfasst' }])
  await expect(page.getByRole('table', { name: 'Ausgabehistorie' })).toContainText(
    /storniert am \d{2}\.\d{2}\.\d{4} von Test Sachbearbeiter: Falsches Exemplar erfasst/,
  )
  await expect(kennzahlen(page)).toHaveText(/Ausgegeben\s*1\s*Verfügbar\s*149/)
})

test('Storno-Dialog: leerer Grund sendet nichts, Escape bricht ab und gibt den Fokus zurück', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  const stornieren = page.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 1 stornieren' })
  await stornieren.click()
  const dialog = page.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })

  await dialog.getByRole('button', { name: 'Stornieren' }).click()
  await expect(dialog.getByText('Bitte einen Grund für das Storno angeben.')).toBeVisible()
  expect(stornos).toEqual([])

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(stornieren).toBeFocused()
})

test('Storno-Dialog: 409 bereits_storniert erscheint im Dialog', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  await page.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 1 stornieren' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })
  // Zwischenzeitlich anderswo storniert.
  ausgaben[1].storno = { am: '2026-10-08T09:59:00+00:00', von: { id: 'x', name: 'Test Admin' }, grund: 'Parallel' }

  await dialog.getByLabel(/^Grund/).fill('Falsch')
  await dialog.getByRole('button', { name: 'Stornieren' }).click()

  await expect(dialog.getByRole('alert')).toContainText('Diese Ausgabe ist bereits storniert.')
})

// ---------- Auflage ändern ----------

test('Auflage ändern: Dialog mit vorbelegtem Feld, nach Erfolg neue Kennzahlen und Meldung', async ({ page }) => {
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}/auflage`,
    async (route) => {
      const daten = route.request().postDataJSON() as { auflage: number }
      auflage = daten.auflage
      return json(route, 200, { ...COIN, auflage })
    },
  )
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  await page.getByRole('button', { name: 'Auflage ändern' }).click()
  const dialog = page.getByRole('dialog', { name: 'Auflage ändern' })
  await expect(dialog.getByLabel(/^Auflage/)).toHaveValue('150')

  await dialog.getByLabel(/^Auflage/).fill('200')
  await dialog.getByRole('button', { name: 'Speichern' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Auflage wurde geändert.' })).toBeVisible()
  await expect(kennzahlen(page)).toHaveText(/Auflage\s*200/)
})

// ---------- Betrachter und anonym ----------

test('Betrachter: Kennzahlen und Status, keine Historie, kein Request auf …/ausgaben, keine Empfängerdaten', async ({
  page,
}) => {
  await starteAls(page, BETRACHTER)
  await page.goto(`/coins/${COIN.id}`)

  await expect(page.getByRole('table', { name: 'Exemplare' })).toBeVisible()
  await expect(kennzahlen(page)).toHaveText(/Ausgegeben\s*2\s*Verfügbar\s*148/)
  await expect(page.getByRole('table', { name: 'Exemplare' }).getByRole('row').nth(1)).toContainText('ausgegeben')
  await expect(page.getByRole('heading', { level: 2, name: 'Ausgabehistorie' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ausgabe erfassen' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Auflage ändern' })).toHaveCount(0)
  await page.waitForTimeout(200)
  expect(apiAufrufe.filter((a) => a.includes('/ausgaben'))).toEqual([])
  expect(await alleTexte(page)).not.toContain('Empfänger 1')
})

test('Betrachter: Direktaufruf der Erfassen-Seite führt zu „Kein Zugriff“', async ({ page }) => {
  await starteAls(page, BETRACHTER)
  await page.goto(`/coins/${COIN.id}/ausgaben/neu`)

  await expect(page).toHaveURL(/\/kein-zugriff\?grund=berechtigung$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeVisible()
  expect(apiAufrufe.filter((a) => a.includes('/ausgaben'))).toEqual([])
})

test('anonym: Detailseite ohne Exemplare und ohne Requests auf …/exemplare oder …/ausgaben', async ({ page }) => {
  await starteAls(page, null)
  await page.goto(`/coins/${COIN.id}`)

  await expect(page.getByRole('heading', { level: 1, name: COIN.name })).toBeVisible()
  await page.waitForTimeout(200)
  await expect(page.getByRole('heading', { level: 2, name: 'Exemplare' })).toHaveCount(0)
  expect(apiAufrufe).toEqual([`GET /api/coins/${COIN.id}`])
})

// ---------- Filter und Blättern in der URL ----------

test('Filter „Status“ und Blättern stehen in URL und Request', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  await expect(page.getByRole('table', { name: 'Exemplare' })).toBeVisible()

  await page.getByRole('button', { name: 'Nächste Seite' }).first().click()
  await expect(page).toHaveURL(/[?&]seite=2/)
  await expect.poll(() => apiAufrufe.some((a) => /\/exemplare\?.*seite=2/.test(a))).toBe(true)

  const filter = page.getByRole('combobox', { name: 'Status' })
  await filter.click()
  await page.getByRole('option', { name: 'Ausgegeben' }).click()

  await expect(page).toHaveURL(/[?&]status=ausgegeben/)
  await expect(page).not.toHaveURL(/[?&]seite=2/)
  await expect.poll(() => apiAufrufe.some((a) => /\/exemplare\?.*status=ausgegeben/.test(a))).toBe(true)
})

test('Filter und Seite aus der URL werden beim Laden übernommen, ungültige Werte gelten als „Alle“ bzw. Seite 1', async ({
  page,
}) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}?status=unsinn&seite=0`)
  await expect(page.getByRole('table', { name: 'Exemplare' })).toBeVisible()

  const abruf = apiAufrufe.find((a) => a.includes('/exemplare'))!
  expect(abruf).not.toMatch(/status=/)
  expect(abruf).toMatch(/seite=1/)
})

// ---------- Sichtbarer Fokus, deutsche Texte, schmaler Bildschirm ----------

test('sichtbarer Fokus an Filter, „Ausgabe erfassen“, „Auflage ändern“ und „Stornieren“', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  await expect(page.getByRole('table', { name: 'Ausgabehistorie' })).toBeVisible()

  for (const ziel of [
    page.getByRole('combobox', { name: 'Status' }),
    page.getByRole('link', { name: 'Ausgabe erfassen' }),
    page.getByRole('button', { name: 'Auflage ändern' }),
    page.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 1 stornieren' }),
  ]) {
    await tabBis(page, ziel)
    expect(await hatSichtbarenFokus(ziel)).toBe(true)
  }
})

test('sichtbarer Fokus am Feld „Grund“ im Storno-Dialog', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  const stornieren = page.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 1 stornieren' })
  await tabBis(page, stornieren)
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })
  await expect(dialog).toBeVisible()

  const grund = dialog.getByLabel(/^Grund/)
  await tabBis(page, grund)

  expect(await hatSichtbarenFokus(grund)).toBe(true)
})

test('sichtbarer Fokus am Feld „Auflage“ im Dialog „Auflage ändern“', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  const oeffnen = page.getByRole('button', { name: 'Auflage ändern' })
  await tabBis(page, oeffnen)
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Auflage ändern' })
  await expect(dialog).toBeVisible()

  const auflage = dialog.getByLabel(/^Auflage/)
  await tabBis(page, auflage)

  expect(await hatSichtbarenFokus(auflage)).toBe(true)
})

test('Detailseite, Erfassen-Seite und beide Dialoge enthalten keine englischen Texte', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN.id}`)
  await expect(page.getByRole('table', { name: 'Ausgabehistorie' })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)

  await page.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 1 stornieren' }).click()
  await expect(page.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Auflage ändern' }).click()
  await expect(page.getByRole('dialog', { name: 'Auflage ändern' })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)
  await page.keyboard.press('Escape')

  await page.goto(`/coins/${COIN.id}/ausgaben/neu`)
  await expect(page.getByRole('button', { name: 'Ausgabe speichern' })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)
})

test('schmaler Bildschirm: Detail- und Erfassen-Seite ohne waagerechtes Scrollen der Seite', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await starteAls(page, SACHBEARBEITER)

  await page.goto(`/coins/${COIN.id}`)
  await expect(page.getByRole('heading', { level: 2, name: 'Ausgabehistorie' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ausgabe erfassen' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.goto(`/coins/${COIN.id}/ausgaben/neu`)
  await expect(page.getByRole('button', { name: 'Ausgabe speichern' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
