import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { mockeStartseiteStandard } from './startseite-mocks.js'

// Feature zertifikatsvorlagen, Abschnitt 9 (UI-Tests): „Coin bearbeiten“ mit Stammdaten, Motivbild und
// Zertifikatsvorlage, Downloads und Uploads im Browser, Zurücksetzen per Tastatur, Berechtigungsstufen.
// API und IdP sind vollständig gemockt; alle Daten sind synthetisch.

const IDP = 'http://127.0.0.1:9'
const AUTHORITY = `${IDP}/realms/coin`
const CLIENT_ID = 'coin-web'
const USER_SCHLUESSEL = `oidc.user:${AUTHORITY}:${CLIENT_ID}`
const ACCESS_TOKEN = 'ui-access-token-vorlagen'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

test.use({ timezoneId: 'Europe/Berlin' })

interface Me {
  id: string
  name: string
  email: string | null
  rolle: 'Administrator' | 'Sachbearbeiter' | 'Betrachter' | 'keine'
  berechtigungen: string[]
}

interface Version {
  version: number
  groesseBytes: number
  hochgeladenAm: string
  hochgeladenVon: { id: string; name: string }
  aktiv: boolean
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

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000f1'
const BEARBEITEN = `/coins/${COIN_ID}/bearbeiten`

const ENGLISCH =
  /\b(Loading|Error|Forbidden|Not Found|Not found|Edit|Save|Cancel|Back|Submit|Upload|Download|Template|Version history|Reset|Size|Uploaded|Active|Choose file|No file chosen|Close|Required)\b/

let ungemockt: string[] = []
let apiAufrufe: string[] = []
let coin = neuerCoin()
let versionen: Version[] = []
let aktiveVersion: number | null = null
let puts: unknown[] = []
let uploadsMitToken: boolean[] = []
let downloadsMitToken: string[] = []
let naechsterUpload: { status: number; body: object } | null = null

function neuerCoin() {
  return {
    id: COIN_ID,
    name: 'Coin Vorlagentest',
    herausgeber: 'Herausgeber Test',
    auflage: 150 as number | null,
    beschreibung: null as string | null,
    erstelltAm: '2026-10-05T12:00:00+00:00',
    bildUrl: null as string | null,
  }
}

function status() {
  return {
    quelle: aktiveVersion === null ? 'standard' : 'eigene',
    aktiveVersion,
    versionen: versionen.map((v) => ({ ...v, aktiv: v.version === aktiveVersion })),
  }
}

function json(route: Route, statusCode: number, body: unknown, contentType = 'application/json') {
  return route.fulfill({ status: statusCode, contentType, body: JSON.stringify(body) })
}

function problem(route: Route, statusCode: number, body: object) {
  return json(route, statusCode, { status: statusCode, ...body }, 'application/problem+json')
}

function docx(route: Route, dateiname: string) {
  return route.fulfill({
    status: 200,
    contentType: DOCX,
    headers: { 'Content-Disposition': `attachment; filename="${dateiname}"`, 'Cache-Control': 'no-store' },
    body: Buffer.from(`PK-synthetisch-${dateiname}`),
  })
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
      access_token: ACCESS_TOKEN,
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

async function mockeApi(page: Page, me: () => Me | null): Promise<void> {
  const mitToken = (route: Route) => route.request().headers()['authorization'] === `Bearer ${ACCESS_TOKEN}`
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN_ID}`,
    async (route) => {
      const request = route.request()
      apiAufrufe.push(`${request.method()} ${new URL(request.url()).pathname}`)
      if (request.method() === 'PUT') {
        const daten = request.postDataJSON() as typeof coin
        puts.push(daten)
        coin = {
          ...coin,
          name: daten.name,
          herausgeber: daten.herausgeber,
          auflage: daten.auflage,
          beschreibung: daten.beschreibung,
        }
        return json(route, 200, coin)
      }
      return json(route, 200, coin)
    },
  )
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN_ID}/exemplare`,
    async (route) =>
      json(route, 200, {
        kennzahlen: { auflage: coin.auflage, ausgegeben: 0, verfuegbar: coin.auflage ?? 0 },
        eintraege: Array.from({ length: Math.min(coin.auflage ?? 0, 25) }, (_, i) => ({
          nummer: i + 1,
          status: 'verfuegbar',
        })),
        gesamt: coin.auflage ?? 0,
        seite: 1,
        groesse: 25,
      }),
  )
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN_ID}/ausgaben`,
    async (route) => json(route, 200, { eintraege: [], gesamt: 0, seite: 1, groesse: 25 }),
  )
  await page.route(
    (url) => url.pathname === '/api/zertifikatsvorlagen/standard',
    async (route) => {
      apiAufrufe.push('GET /api/zertifikatsvorlagen/standard')
      downloadsMitToken.push(`standard:${mitToken(route)}:${new URL(route.request().url()).search}`)
      return docx(route, 'zertifikatsvorlage-standard.docx')
    },
  )
  await page.route(
    (url) => url.pathname.startsWith(`/api/coins/${COIN_ID}/zertifikatsvorlage`),
    async (route) => {
      const request = route.request()
      const pfad = new URL(request.url()).pathname.slice(`/api/coins/${COIN_ID}/zertifikatsvorlage`.length)
      apiAufrufe.push(`${request.method()} …/zertifikatsvorlage${pfad}`)
      if (request.method() === 'GET' && pfad === '') return json(route, 200, status())
      if (request.method() === 'GET' && pfad === '/datei') {
        downloadsMitToken.push(`aktiv:${mitToken(route)}`)
        return docx(
          route,
          `zertifikatsvorlage-${COIN_ID}-${aktiveVersion === null ? 'standard' : `v${aktiveVersion}`}.docx`,
        )
      }
      const version = /^\/versionen\/(\d+)\/datei$/.exec(pfad)
      if (request.method() === 'GET' && version) {
        downloadsMitToken.push(`v${version[1]}:${mitToken(route)}`)
        return docx(route, `zertifikatsvorlage-${COIN_ID}-v${version[1]}.docx`)
      }
      if (request.method() === 'POST' && pfad === '/versionen') {
        uploadsMitToken.push(mitToken(route))
        if (naechsterUpload) {
          const antwort = naechsterUpload
          naechsterUpload = null
          return problem(route, antwort.status, antwort.body)
        }
        const neu = Math.max(0, ...versionen.map((v) => v.version)) + 1
        const ich = me()!
        versionen.unshift({
          version: neu,
          groesseBytes: 48000 + neu,
          hochgeladenAm: `2026-10-09T0${neu}:15:00+00:00`,
          hochgeladenVon: { id: ich.id, name: ich.name },
          aktiv: true,
        })
        aktiveVersion = neu
        return json(route, 201, status())
      }
      if (request.method() === 'POST' && pfad === '/zuruecksetzen') {
        aktiveVersion = null
        return json(route, 200, status())
      }
      return problem(route, 404, { title: 'Nicht gefunden' })
    },
  )
}

test.beforeEach(async ({ page }) => {
  ungemockt = []
  apiAufrufe = []
  coin = neuerCoin()
  versionen = []
  aktiveVersion = null
  puts = []
  uploadsMitToken = []
  downloadsMitToken = []
  naechsterUpload = null
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

const vorlagenDatei = { name: 'urkunde.docx', mimeType: DOCX, buffer: Buffer.from('PK-synthetische-vorlage') }

async function ladeVorlageHoch(page: Page): Promise<void> {
  await page.getByLabel('Word-Vorlage (.docx)').setInputFiles(vorlagenDatei)
  await page.getByRole('button', { name: 'Vorlage hochladen' }).click()
}

// ---------- „Coin hinzufügen“: Standardvorlage ----------

test('Sachbearbeiter lädt auf „Coin hinzufügen“ die Standardvorlage herunter', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto('/coins/neu')
  await expect(page.getByRole('heading', { level: 2, name: 'Zertifikatsvorlage' })).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Standardvorlage herunterladen' }).click()

  expect((await download).suggestedFilename()).toBe('zertifikatsvorlage-standard.docx')
  expect(downloadsMitToken).toEqual(['standard:true:'])
})

// ---------- Detailseite → Bearbeiten → Stammdaten per Tastatur ----------

test('Sachbearbeiter ändert die Stammdaten per Tastatur und landet auf der Detailseite mit Meldung', async ({
  page,
}) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(`/coins/${COIN_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Coin Vorlagentest' })).toBeVisible()

  const bearbeiten = page.getByRole('link', { name: 'Bearbeiten' })
  await tabBis(page, bearbeiten)
  expect(await hatSichtbarenFokus(bearbeiten)).toBe(true)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`${BEARBEITEN}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Coin bearbeiten' })).toBeVisible()

  await tabBis(page, page.getByLabel(/^Name/))
  await page.keyboard.press('Control+A')
  await page.keyboard.type('Coin Vorlagentest Neu')
  await tabBis(page, page.getByLabel(/^Beschreibung/))
  await page.keyboard.type('Neue Beschreibung')
  await tabBis(page, page.getByRole('button', { name: 'Änderungen speichern' }))
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(new RegExp(`/coins/${COIN_ID}$`))
  expect(puts).toEqual([
    { name: 'Coin Vorlagentest Neu', herausgeber: 'Herausgeber Test', auflage: 150, beschreibung: 'Neue Beschreibung' },
  ])
  const h1 = page.getByRole('heading', { level: 1, name: 'Coin Vorlagentest Neu' })
  await expect(h1).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: 'Änderungen wurden gespeichert.' })).toBeVisible()
})

// ---------- Upload, zweite Version, Ablehnung ----------

test('Sachbearbeiter lädt eine Vorlage hoch und sieht Version 1 aktiv mit Tabelle', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(BEARBEITEN)
  await expect(page.getByText('Aktiv: Standardvorlage')).toBeVisible()
  await expect(page.getByText('Es wurde noch keine eigene Vorlage hochgeladen.')).toBeVisible()

  await ladeVorlageHoch(page)

  await expect(
    page.getByRole('status').filter({ hasText: 'Version 1 wurde hochgeladen und ist jetzt aktiv.' }),
  ).toBeVisible()
  await expect(page.getByText('Aktiv: eigene Vorlage, Version 1')).toBeVisible()
  const tabelle = page.getByRole('table', { name: 'Versionen der Zertifikatsvorlage' })
  await expect(tabelle.getByRole('row')).toHaveCount(2)
  await expect(tabelle).toContainText('Test Sachbearbeiter')
  await expect(tabelle).toContainText('aktiv')
  expect(uploadsMitToken).toEqual([true])
  await expect(page.getByLabel('Word-Vorlage (.docx)')).toHaveValue('')
})

test('Ein zweiter Upload macht Version 2 aktiv, Version 1 bleibt in der Tabelle', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(BEARBEITEN)
  await ladeVorlageHoch(page)
  await expect(page.getByText('Aktiv: eigene Vorlage, Version 1')).toBeVisible()

  await ladeVorlageHoch(page)

  await expect(page.getByText('Aktiv: eigene Vorlage, Version 2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Version 2 herunterladen' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Version 1 herunterladen' })).toBeVisible()
})

test('Eine abgelehnte Vorlage zeigt alle Meldungen als Liste im Alarm mit Fokus', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(BEARBEITEN)
  await expect(page.getByText('Aktiv: Standardvorlage')).toBeVisible()
  naechsterUpload = {
    status: 400,
    body: {
      title: 'Eingaben ungültig',
      errors: {
        datei: [
          'Es fehlen Pflichtplatzhalter: {{Zertifikat.Nummer}}.',
          'Unbekannte Platzhalter: {{Empfaenger.Nam}}. Erlaubt sind nur die Platzhalter aus der Standardvorlage.',
        ],
      },
    },
  }

  await ladeVorlageHoch(page)

  const alarm = page.getByRole('alert').filter({ hasText: 'Die Vorlage wurde nicht übernommen:' })
  await expect(alarm).toBeVisible()
  await expect(alarm.getByRole('listitem')).toHaveText([
    'Es fehlen Pflichtplatzhalter: {{Zertifikat.Nummer}}.',
    'Unbekannte Platzhalter: {{Empfaenger.Nam}}. Erlaubt sind nur die Platzhalter aus der Standardvorlage.',
  ])
  await expect(alarm).toBeFocused()
  await expect(page.getByText('Aktiv: Standardvorlage')).toBeVisible()
})

test('Clientseitig abgelehnte Datei (falsche Endung) sendet keinen Upload', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(BEARBEITEN)
  await expect(page.getByText('Aktiv: Standardvorlage')).toBeVisible()

  await page
    .getByLabel('Word-Vorlage (.docx)')
    .setInputFiles({ name: 'urkunde.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') })
  await page.getByRole('button', { name: 'Vorlage hochladen' }).click()

  await expect(page.getByText('Die Datei ist kein Word-Dokument im Format .docx.')).toBeVisible()
  expect(uploadsMitToken).toEqual([])
})

// ---------- Downloads ----------

test('Aktuelle Vorlage und einzelne Versionen werden mit Token und richtigem Dateinamen heruntergeladen', async ({
  page,
}) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(BEARBEITEN)
  await ladeVorlageHoch(page)
  await expect(page.getByText('Aktiv: eigene Vorlage, Version 1')).toBeVisible()

  const aktuell = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Aktuelle Vorlage herunterladen' }).click()
  expect((await aktuell).suggestedFilename()).toBe(`zertifikatsvorlage-${COIN_ID}-v1.docx`)

  const version = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Version 1 herunterladen' }).click()
  expect((await version).suggestedFilename()).toBe(`zertifikatsvorlage-${COIN_ID}-v1.docx`)

  expect(downloadsMitToken).toEqual(['aktiv:true', 'v1:true'])
})

test('„Aktuelle Vorlage herunterladen“ nutzt den Dateinamen aus Content-Disposition, nicht den aus dem Status', async ({
  page,
}) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(BEARBEITEN)
  await ladeVorlageHoch(page)
  await expect(page.getByText('Aktiv: eigene Vorlage, Version 1')).toBeVisible()
  // Inzwischen hat jemand anderes Version 2 hochgeladen; der angezeigte Status ist noch Version 1.
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN_ID}/zertifikatsvorlage/datei`,
    (route) => docx(route, `zertifikatsvorlage-${COIN_ID}-v2.docx`),
  )

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Aktuelle Vorlage herunterladen' }).click()

  expect((await download).suggestedFilename()).toBe(`zertifikatsvorlage-${COIN_ID}-v2.docx`)
})

// ---------- Zurücksetzen per Tastatur ----------

test('Zurücksetzen auf die Standardvorlage per Tastatur mit Dialog', async ({ page }) => {
  versionen = [
    {
      version: 1,
      groesseBytes: 48001,
      hochgeladenAm: '2026-10-09T08:00:00+00:00',
      hochgeladenVon: { id: SACHBEARBEITER.id, name: SACHBEARBEITER.name },
      aktiv: true,
    },
  ]
  aktiveVersion = 1
  await starteAls(page, SACHBEARBEITER)
  await page.goto(BEARBEITEN)
  await expect(page.getByText('Aktiv: eigene Vorlage, Version 1')).toBeVisible()

  const ausloeser = page.getByRole('button', { name: 'Auf Standardvorlage zurücksetzen' })
  await tabBis(page, ausloeser)
  expect(await hatSichtbarenFokus(ausloeser)).toBe(true)
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('alertdialog', { name: 'Auf Standardvorlage zurücksetzen?' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(
    'Die eigene Vorlage bleibt als Version gespeichert. Künftig wird die Standardvorlage verwendet.',
  )
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(ausloeser).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  const bestaetigen = dialog.getByRole('button', { name: 'Zurücksetzen' })
  await tabBis(page, bestaetigen, 10)
  expect(await hatSichtbarenFokus(bestaetigen)).toBe(true)
  await page.keyboard.press('Enter')

  const meldung = page.getByRole('status').filter({ hasText: 'Die Standardvorlage ist jetzt aktiv.' })
  await expect(meldung).toBeVisible()
  await expect(meldung).toBeFocused()
  await expect(page.getByText('Aktiv: Standardvorlage')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Version 1 herunterladen' })).toBeVisible()
  await expect(ausloeser).toHaveCount(0)
})

// ---------- Barrierefreiheit: sichtbarer Fokus, deutsche Texte, schmaler Viewport ----------

test('Dateifelder, Download- und Tabellen-Buttons sind per Tab erreichbar und sichtbar fokussiert', async ({
  page,
}) => {
  versionen = [
    {
      version: 1,
      groesseBytes: 48001,
      hochgeladenAm: '2026-10-09T08:00:00+00:00',
      hochgeladenVon: { id: SACHBEARBEITER.id, name: SACHBEARBEITER.name },
      aktiv: true,
    },
  ]
  aktiveVersion = 1
  await starteAls(page, SACHBEARBEITER)
  await page.goto(BEARBEITEN)
  await expect(page.getByText('Aktiv: eigene Vorlage, Version 1')).toBeVisible()

  for (const ziel of [
    page.getByLabel(/^Neues Motivbild/),
    page.getByRole('button', { name: 'Aktuelle Vorlage herunterladen' }),
    page.getByRole('button', { name: 'Standardvorlage herunterladen' }),
    page.getByRole('button', { name: 'Version 1 herunterladen' }),
    page.getByLabel('Word-Vorlage (.docx)'),
    page.getByRole('button', { name: 'Vorlage hochladen' }),
  ]) {
    await tabBis(page, ziel)
    expect(await hatSichtbarenFokus(ziel), await ziel.evaluate((el) => el.outerHTML.slice(0, 80))).toBe(true)
  }
})

test('„Coin bearbeiten“ hat genau ein h1 und keine englischen Texte', async ({ page }) => {
  await starteAls(page, SACHBEARBEITER)
  await page.goto(BEARBEITEN)
  await expect(page.getByText('Aktiv: Standardvorlage')).toBeVisible()

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)
})

test('„Coin bearbeiten“ passt auf einen schmalen Viewport ohne waagerechtes Scrollen der Seite', async ({ page }) => {
  versionen = [
    {
      version: 1,
      groesseBytes: 48001,
      hochgeladenAm: '2026-10-09T08:00:00+00:00',
      hochgeladenVon: { id: SACHBEARBEITER.id, name: SACHBEARBEITER.name },
      aktiv: true,
    },
  ]
  aktiveVersion = 1
  await page.setViewportSize({ width: 375, height: 800 })
  await starteAls(page, SACHBEARBEITER)
  await page.goto(BEARBEITEN)
  await expect(page.getByText('Aktiv: eigene Vorlage, Version 1')).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByRole('button', { name: 'Vorlage hochladen' })).toBeVisible()
})

// ---------- Betrachter und anonym ----------

test('Betrachter sieht kein „Bearbeiten“, landet beim Direktaufruf auf „Kein Zugriff“ und lädt keine Vorlagen', async ({
  page,
}) => {
  await starteAls(page, BETRACHTER)
  await page.goto(`/coins/${COIN_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Coin Vorlagentest' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Exemplare' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Bearbeiten' })).toHaveCount(0)

  await page.goto(BEARBEITEN)

  await expect(page.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeVisible()
  await expect(page.getByRole('button', { name: /herunterladen|hochladen/ })).toHaveCount(0)
  expect(apiAufrufe.filter((a) => a.includes('zertifikatsvorlage'))).toEqual([])
})

test('Anonym gibt es auf der Detailseite keinen Link „Bearbeiten“ und keine Vorlagen-Requests', async ({ page }) => {
  await starteAls(page, null)
  await page.goto(`/coins/${COIN_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Coin Vorlagentest' })).toBeVisible()

  await expect(page.getByRole('link', { name: 'Bearbeiten' })).toHaveCount(0)
  expect(apiAufrufe.filter((a) => a.includes('zertifikatsvorlage'))).toEqual([])
})
