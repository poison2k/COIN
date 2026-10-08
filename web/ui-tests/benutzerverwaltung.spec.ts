import { expect, test, type Locator, type Page, type Request, type Route } from '@playwright/test'

// Feature rollen-benutzerverwaltung, Abschnitt 6.4: Benutzerverwaltung im Browser, API und IdP vollständig gemockt.
// Der IdP ist laut playwright.config.ts http://127.0.0.1:9/realms/coin (unerreichbar). Alle Daten sind synthetisch.

const IDP = 'http://127.0.0.1:9'
const AUTHORITY = `${IDP}/realms/coin`
const CLIENT_ID = 'coin-web'
const USER_SCHLUESSEL = `oidc.user:${AUTHORITY}:${CLIENT_ID}`

type Rolle = 'Administrator' | 'Sachbearbeiter' | 'Betrachter' | 'keine'

interface Me {
  id: string
  name: string
  email: string | null
  rolle: Rolle
  berechtigungen: string[]
}

interface BenutzerEintrag {
  id: string
  name: string
  email: string | null
  rolle: Rolle
  aktiv: boolean
  erstelltAm: string
}

interface AuditEintrag {
  id: string
  zeitpunkt: string
  akteur: { id: string; name: string } | null
  benutzer: { id: string; name: string }
  art: 'Rolle' | 'Status'
  alt: string
  neu: string
}

const ADMIN: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a001',
  name: 'Test Administrator',
  email: 'admin@test.local',
  rolle: 'Administrator',
  berechtigungen: ['audit.read', 'coins.read', 'coins.write', 'users.manage'],
}
const BETRACHTER: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a003',
  name: 'Test Betrachter',
  email: 'betrachter@test.local',
  rolle: 'Betrachter',
  berechtigungen: ['coins.read'],
}

const TEXTE = {
  deaktiviert:
    'Ihr Benutzerkonto ist deaktiviert. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.',
  letzterAdmin: 'Der letzte aktive Administrator kann weder herabgestuft noch deaktiviert werden.',
  eigenesKonto: 'Das eigene Konto kann nicht geändert werden.',
  /** katalog-seiten, AK-10. */
  ohneBerechtigung:
    'Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.',
} as const

const ENGLISCH =
  /\b(Sign ?in|Sign ?out|Log ?in|Log ?out|Loading|Error|Forbidden|Access denied|Deactivate|Reactivate|Users?|Search|Previous|Next|Page|Role|Cancel|Confirm|Close|Select|Active|Inactive|No entries|Back|Home)\b/

function eintrag(teil: Partial<BenutzerEintrag> & Pick<BenutzerEintrag, 'id' | 'name'>): BenutzerEintrag {
  return { email: null, rolle: 'keine', aktiv: true, erstelltAm: '2026-10-05T12:00:00+00:00', ...teil }
}

function auditEintrag(nr: number, teil: Partial<AuditEintrag> = {}): AuditEintrag {
  return {
    id: `0199a1b2-0000-7000-8000-${String(nr).padStart(12, 'c')}`,
    zeitpunkt: '2026-10-05T12:34:56+00:00',
    akteur: { id: ADMIN.id, name: ADMIN.name },
    benutzer: { id: '0199a1b2-0000-7000-8000-00000000b001', name: `Person ${String(nr).padStart(3, '0')}` },
    art: 'Rolle',
    alt: 'keine',
    neu: 'Betrachter',
    ...teil,
  }
}

/** Nicht gemockte Aufrufe an API oder IdP; jeder Eintrag lässt den Test scheitern. */
let ungemockt: string[] = []
/** Zustand der gemockten Benutzer-API. */
let benutzer: BenutzerEintrag[] = []
let audit: AuditEintrag[] = []
/** Aufgezeichnete PUT-Aufrufe auf /api/benutzer/{id}/rolle|status. */
let puts: Array<{ pfad: string; body: unknown }> = []
/** Aufgezeichnete GET /api/benutzer (Query). */
let listenAbrufe: URLSearchParams[] = []
/** Einmalige Überschreibung der nächsten PUT-Antwort (z. B. 409). */
let naechstePutAntwort: { status: number; body: object } | null = null
/** Hält PUT-Antworten zurück, bis das Promise erfüllt ist (Rev. 3, AK-48/AK-49: Zustand „während der Anfrage“). */
let putSperre: Promise<void> | null = null
/** Hält GET /api/benutzer zurück, bis das Promise erfüllt ist (katalog-seiten, AK-26: Fokus beim Blättern). */
let listenSperre: Promise<void> | null = null
/** Aufgezeichnete GET /api/audit (Query). */
let auditAbrufe: URLSearchParams[] = []
/** Hält GET /api/audit zurück, bis das Promise erfüllt ist (QA Runde 2, H3: Fokus beim Blättern im Audit-Log). */
let auditSperre: Promise<void> | null = null
/** Seiten, auf die GET /api/benutzer bzw. GET /api/audit mit 500 antworten (QA Runde 3, H-a: Ladefehler beim Blättern). */
let benutzerFehlerSeiten: number[] = []
let auditFehlerSeiten: number[] = []

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

function seite<T>(alle: T[], query: URLSearchParams) {
  const nr = Number(query.get('seite') ?? '1')
  const groesse = Number(query.get('groesse') ?? '25')
  return { eintraege: alle.slice((nr - 1) * groesse, nr * groesse), gesamt: alle.length, seite: nr, groesse }
}

/** Meldet sich an (User im sessionStorage) und mockt /api/me; 'deaktiviert' = 403 benutzer_deaktiviert. */
async function meldeAnAls(page: Page, me: Me | 'deaktiviert'): Promise<void> {
  const name = me === 'deaktiviert' ? 'Test Administrator' : me.name
  const jetzt = Math.floor(Date.now() / 1000)
  const user = {
    id_token: idToken(name),
    session_state: null,
    access_token: 'ui-access-token-1',
    refresh_token: 'ui-refresh-token-1',
    token_type: 'Bearer',
    scope: 'openid profile email',
    profile: { iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-1', iat: jetzt, exp: jetzt + 300, name },
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
    (route) =>
      me === 'deaktiviert'
        ? json(
            route,
            403,
            {
              title: 'Kein Zugriff',
              status: 403,
              code: 'benutzer_deaktiviert',
              detail: 'Ihr Benutzerkonto ist deaktiviert.',
            },
            'application/problem+json',
          )
        : json(route, 200, me),
  )
}

/** Mockt GET /api/benutzer, PUT /api/benutzer/{id}/rolle|status und GET /api/audit auf dem Zustand oben. */
async function mockeBenutzerApi(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/benutzer',
    async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const query = new URL(route.request().url()).searchParams
      listenAbrufe.push(query)
      if (listenSperre) await listenSperre
      if (benutzerFehlerSeiten.includes(Number(query.get('seite') ?? '1'))) {
        return json(route, 500, { title: 'Interner Fehler', status: 500 }, 'application/problem+json')
      }
      const suche = (query.get('suche') ?? '').trim().toLowerCase()
      const treffer = benutzer
        .filter((b) => !suche || b.name.toLowerCase().includes(suche) || (b.email ?? '').includes(suche))
        .sort((a, b) => a.name.localeCompare(b.name))
      return json(route, 200, seite(treffer, query))
    },
  )
  await page.route(
    (url) => /^\/api\/benutzer\/[^/]+\/(rolle|status)$/.test(url.pathname),
    async (route: Route) => {
      const request: Request = route.request()
      if (request.method() !== 'PUT') return route.fallback()
      const pfad = new URL(request.url()).pathname
      const body = request.postDataJSON() as { rolle?: Rolle; aktiv?: boolean }
      puts.push({ pfad, body })
      if (putSperre) await putSperre
      if (naechstePutAntwort) {
        const antwort = naechstePutAntwort
        naechstePutAntwort = null
        return json(route, antwort.status, antwort.body, 'application/problem+json')
      }
      const [, , , id, art] = pfad.split('/')
      const index = benutzer.findIndex((b) => b.id === id)
      if (index < 0) return json(route, 404, { title: 'Benutzer nicht gefunden', status: 404 })
      benutzer[index] =
        art === 'rolle'
          ? { ...benutzer[index], rolle: body.rolle as Rolle }
          : { ...benutzer[index], aktiv: !!body.aktiv }
      return json(route, 200, benutzer[index])
    },
  )
  await page.route(
    (url) => url.pathname === '/api/audit',
    async (route) => {
      const query = new URL(route.request().url()).searchParams
      auditAbrufe.push(query)
      if (auditSperre) await auditSperre
      if (auditFehlerSeiten.includes(Number(query.get('seite') ?? '1'))) {
        return json(route, 500, { title: 'Interner Fehler', status: 500 }, 'application/problem+json')
      }
      return json(route, 200, seite(audit, query))
    },
  )
}

function konflikt(code: 'letzter_administrator' | 'eigenes_konto') {
  return { status: 409, body: { title: 'Änderung nicht möglich', status: 409, code } }
}

function sidebar(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Hauptnavigation' })
}

function rollenAuswahl(page: Page, name: string): Locator {
  return page.getByRole('combobox', { name: `Rolle von ${name}` })
}

/** Drückt Tab, bis das Element den Fokus hat. */
async function tabBis(page: Page, ziel: Locator, max = 40): Promise<void> {
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

/** Wählt in einer geöffneten Auswahlliste per Pfeiltasten die Option und bestätigt mit Enter. */
async function waehleOptionPerTastatur(page: Page, option: string): Promise<void> {
  const ziel = page.getByRole('option', { name: option, exact: true })
  await expect(ziel).toBeVisible()
  for (let i = 0; i < 8; i++) {
    const getroffen = await ziel.evaluate(
      (el) =>
        el === document.activeElement ||
        el.hasAttribute('data-highlighted') ||
        document.activeElement?.getAttribute('aria-activedescendant') === el.id,
    )
    if (getroffen) break
    await page.keyboard.press('ArrowDown')
  }
  await page.keyboard.press('Enter')
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

/** Hält die nächsten Abrufe der Benutzerliste zurück; der Aufruf der Rückgabe gibt sie frei. */
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

/** Hält die nächsten Abrufe des Audit-Logs zurück; der Aufruf der Rückgabe gibt sie frei. */
function sperreAudit(): () => void {
  let freigeben!: () => void
  auditSperre = new Promise<void>((aufloesen) => {
    freigeben = aufloesen
  })
  return () => {
    auditSperre = null
    freigeben()
  }
}

/** Synthetische Benutzer „Person 001“ … für mehrere Seiten der Liste. */
function vieleBenutzer(anzahl: number): BenutzerEintrag[] {
  return Array.from({ length: anzahl }, (_, i) =>
    eintrag({
      id: `0199a1b2-0000-7000-8000-${String(i + 1).padStart(12, 'd')}`,
      name: `Person ${String(i + 1).padStart(3, '0')}`,
    }),
  )
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
  puts = []
  listenAbrufe = []
  naechstePutAntwort = null
  putSperre = null
  listenSperre = null
  auditAbrufe = []
  auditSperre = null
  benutzerFehlerSeiten = []
  auditFehlerSeiten = []
  benutzer = [
    eintrag({ id: ADMIN.id, name: ADMIN.name, email: ADMIN.email, rolle: 'Administrator' }),
    eintrag({ id: '0199a1b2-0000-7000-8000-00000000b001', name: 'Anna Probe', email: 'anna@test.local' }),
    eintrag({
      id: '0199a1b2-0000-7000-8000-00000000b002',
      name: 'Bert Beispiel',
      email: 'bert@test.local',
      rolle: 'Administrator',
    }),
  ]
  audit = [auditEintrag(1, { akteur: null, benutzer: { id: ADMIN.id, name: ADMIN.name }, neu: 'Administrator' })]
  await page.route(
    (url) => istApi(url) || url.origin === IDP,
    async (route: Route) => {
      ungemockt.push(`${route.request().method()} ${route.request().url()}`)
      await route.abort('failed')
    },
  )
  // Seit katalog-seiten (AK-1, Entscheidung F7) im Seiten-Format.
  await page.route(
    (url) => url.pathname === '/api/coins',
    (route) => json(route, 200, { eintraege: [], gesamt: 0, seite: 1, groesse: 25 }),
  )
  await mockeBenutzerApi(page)
})

test.afterEach(() => {
  expect(ungemockt, 'Nicht gemockte API-/IdP-Aufrufe').toEqual([])
})

// ---------- AK-24, AK-25 ----------

test('Sidebar zeigt „Benutzerverwaltung“ für den Administrator', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/')

  await expect(sidebar(page).getByRole('link', { name: 'Benutzerverwaltung' })).toBeVisible()
})

test('Sidebar zeigt „Benutzerverwaltung“ nicht für den Betrachter', async ({ page }) => {
  await meldeAnAls(page, BETRACHTER)
  await page.goto('/')
  await expect(page.locator('header').getByRole('button', { name: 'Abmelden' })).toBeVisible()

  await expect(sidebar(page).getByRole('link', { name: 'Katalog', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Benutzerverwaltung' })).toHaveCount(0)
})

// katalog-seiten, AK-11 (Entscheidung F1): bisher Weiterleitung zur Startseite.
test('Direktaufruf von /benutzerverwaltung als Betrachter führt zu „Kein Zugriff“ mit Grund keine Berechtigung', async ({
  page,
}) => {
  await meldeAnAls(page, BETRACHTER)
  await page.goto('/benutzerverwaltung')

  await expect(page).toHaveURL('/kein-zugriff?grund=berechtigung')
  await expect(page.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeVisible()
  await expect(page.getByText(TEXTE.ohneBerechtigung)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Benutzerverwaltung' })).toHaveCount(0)
  await expect(page.getByRole('main').getByRole('button', { name: 'Erneut prüfen' })).toHaveCount(0)
})

// ---------- AK-26, AK-27, AK-35: Tastatur ----------

test('Tastatur: Suche per Enter, Rolle per Tastatur wählen, im Dialog bestätigen', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  await expect(page.getByRole('table', { name: 'Benutzer' })).toBeVisible()

  const suche = page.getByRole('searchbox', { name: 'Benutzer suchen' })
  await tabBis(page, suche)
  await page.keyboard.type('anna')
  await page.keyboard.press('Enter')
  await expect.poll(() => listenAbrufe.at(-1)?.get('suche')).toBe('anna')
  await expect(page.getByRole('status').filter({ hasText: '1 Benutzer gefunden' })).toBeVisible()

  const auswahl = rollenAuswahl(page, 'Anna Probe')
  await tabBis(page, auswahl)
  await page.keyboard.press('Enter')
  await waehleOptionPerTastatur(page, 'Betrachter')

  const dialog = page.getByRole('alertdialog', { name: 'Rolle ändern?' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Rolle von Anna Probe: Keine Rolle → Betrachter')
  await expect(dialog.getByRole('button', { name: 'Abbrechen' })).toBeFocused()
  await tabBis(page, dialog.getByRole('button', { name: 'Rolle ändern' }), 4)
  await page.keyboard.press('Enter')

  await expect
    .poll(() => puts)
    .toEqual([{ pfad: `/api/benutzer/${benutzer[1].id}/rolle`, body: { rolle: 'Betrachter' } }])
  await expect(
    page.getByRole('status').filter({ hasText: 'Die Rolle von Anna Probe wurde auf Betrachter geändert.' }),
  ).toBeVisible()
  await expect(auswahl).toBeFocused()
  await expect(auswahl).toContainText('Betrachter')
})

test('Tastatur: Escape im Dialog sendet nichts, setzt die Auswahl zurück und fokussiert das Select', async ({
  page,
}) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  const auswahl = rollenAuswahl(page, 'Anna Probe')
  await expect(auswahl).toBeVisible()

  await tabBis(page, auswahl)
  await page.keyboard.press('Enter')
  await waehleOptionPerTastatur(page, 'Sachbearbeiter')
  await expect(page.getByRole('alertdialog', { name: 'Rolle ändern?' })).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(auswahl).toContainText('Keine Rolle')
  await expect(auswahl).toBeFocused()
  expect(puts).toEqual([])
})

// ---------- AK-30: Fehler ----------

test('409 letzter_administrator erscheint als Alarm an der Tabelle', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  naechstePutAntwort = konflikt('letzter_administrator')
  await page.goto('/benutzerverwaltung')

  await rollenAuswahl(page, 'Bert Beispiel').click()
  await page.getByRole('option', { name: 'Betrachter', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Rolle ändern' }).click()

  await expect(page.getByRole('alert').filter({ hasText: TEXTE.letzterAdmin })).toBeVisible()
  await expect(rollenAuswahl(page, 'Bert Beispiel')).toContainText('Administrator')
})

test('409 eigenes_konto erscheint als Alarm an der Tabelle', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  naechstePutAntwort = konflikt('eigenes_konto')
  await page.goto('/benutzerverwaltung')

  await rollenAuswahl(page, 'Bert Beispiel').click()
  await page.getByRole('option', { name: 'Betrachter', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Rolle ändern' }).click()

  await expect(page.getByRole('alert').filter({ hasText: TEXTE.eigenesKonto })).toBeVisible()
})

// ---------- AK-28 ----------

test('Deaktivieren über den Dialog sendet {"aktiv":false} und zeigt „Deaktiviert“ und „Reaktivieren“', async ({
  page,
}) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')

  await page.getByRole('button', { name: 'Anna Probe deaktivieren' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Benutzer deaktivieren?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Abbrechen' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Deaktivieren' }).click()

  await expect.poll(() => puts.map((p) => p.body)).toEqual([{ aktiv: false }])
  const zeile = page.getByRole('row').filter({ hasText: 'Anna Probe' })
  await expect(zeile.getByText('Deaktiviert', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Anna Probe reaktivieren' })).toBeVisible()
})

test('nach dem Deaktivieren liegt der Fokus auf „{Name} reaktivieren“', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')

  await page.getByRole('button', { name: 'Anna Probe deaktivieren' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Benutzer deaktivieren?' })
  await dialog.getByRole('button', { name: 'Deaktivieren' }).click()

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Anna Probe reaktivieren' })).toBeFocused()
})

test('nach dem Reaktivieren liegt der Fokus auf „{Name} deaktivieren“', async ({ page }) => {
  benutzer[1] = { ...benutzer[1], aktiv: false }
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')

  const reaktivieren = page.getByRole('button', { name: 'Anna Probe reaktivieren' })
  await tabBis(page, reaktivieren)
  await page.keyboard.press('Enter')

  await expect.poll(() => puts.map((p) => p.body)).toEqual([{ aktiv: true }])
  await expect(page.getByRole('button', { name: 'Anna Probe deaktivieren' })).toBeFocused()
})

test('eigene Zeile: Select und Status-Button sind gesperrt und mit „(Sie)“ gekennzeichnet', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')

  await expect(rollenAuswahl(page, 'Test Administrator')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Test Administrator deaktivieren' })).toBeDisabled()
  await expect(page.getByRole('row').filter({ hasText: 'Test Administrator' })).toContainText('(Sie)')
})

// ---------- AK-31: Audit-Tab ----------

test('Audit-Tab: Pfeiltaste wechselt den Tab, Einträge werden angezeigt', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  const tabBenutzer = page.getByRole('tab', { name: 'Benutzer' })
  await expect(tabBenutzer).toBeVisible()

  await tabBis(page, tabBenutzer)
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Audit-Log' })).toBeFocused()
  await page.keyboard.press('Enter')

  const tabelle = page.getByRole('table', { name: 'Audit-Log' })
  await expect(tabelle).toBeVisible()
  await expect(tabelle).toContainText('System (Bootstrap)')
  await expect(tabelle).toContainText('Keine Rolle')
})

test('Audit-Tab: Blättern auf Seite 2', async ({ page }) => {
  audit = Array.from({ length: 30 }, (_, i) => auditEintrag(i + 1))
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  await page.getByRole('tab', { name: 'Audit-Log' }).click()
  await expect(page.getByText('Seite 1 von 2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Vorherige Seite' })).toBeDisabled()

  await page.getByRole('button', { name: 'Nächste Seite' }).click()

  await expect(page.getByText('Seite 2 von 2')).toBeVisible()
  await expect(page.getByRole('table', { name: 'Audit-Log' })).toContainText('Person 026')
  await expect(page.getByRole('button', { name: 'Nächste Seite' })).toBeDisabled()
})

// ---------- katalog-seiten, AK-26 (WCAG 2.4.3): Fokus beim Blättern der Benutzerliste ----------

test('Benutzer: Enter auf „Nächste Seite“ mit verzögerter Antwort: Fokus bleibt während des Ladens im Blättern', async ({
  page,
}) => {
  benutzer = [benutzer[0], ...vieleBenutzer(59)]
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  await expect(page.getByText('Seite 1 von 3')).toBeVisible()
  const freigeben = sperreListe()
  await page.getByRole('button', { name: 'Nächste Seite' }).focus()

  await page.keyboard.press('Enter')
  await expect.poll(() => listenAbrufe.some((q) => q.get('seite') === '2')).toBe(true)
  await page.waitForTimeout(150)

  try {
    expect(await fokusOrt(page)).toMatch(/^Seitennavigation: /)
  } finally {
    freigeben()
  }
})

test('Benutzer: Enter auf „Nächste Seite“ mit verzögerter Antwort: nach dem Laden liegt der Fokus auf „Nächste Seite“', async ({
  page,
}) => {
  benutzer = [benutzer[0], ...vieleBenutzer(59)]
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  await expect(page.getByText('Seite 1 von 3')).toBeVisible()
  const freigeben = sperreListe()
  await page.getByRole('button', { name: 'Nächste Seite' }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => listenAbrufe.some((q) => q.get('seite') === '2')).toBe(true)
  await page.waitForTimeout(150)

  freigeben()

  await expect(page.getByText('Seite 2 von 3')).toBeVisible()
  expect(await fokusOrt(page)).toBe('Seitennavigation: Nächste Seite')
})

test('Benutzer: Enter auf „Nächste Seite“ zur letzten Seite: Fokus bleibt im Blättern, nicht auf body', async ({
  page,
}) => {
  benutzer = [benutzer[0], ...vieleBenutzer(29)]
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  await expect(page.getByText('Seite 1 von 2')).toBeVisible()
  await page.getByRole('button', { name: 'Nächste Seite' }).focus()

  await page.keyboard.press('Enter')

  await expect(page.getByText('Seite 2 von 2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nächste Seite' })).toBeDisabled()
  expect(await fokusOrt(page)).toMatch(/^Seitennavigation: /)
})

// ---------- QA Runde 2 (H3), WCAG 2.4.3: Fokus beim Blättern im Audit-Log ----------

test('Audit: Enter auf „Nächste Seite“ mit verzögerter Antwort: Fokus bleibt während des Ladens im Blättern', async ({
  page,
}) => {
  audit = Array.from({ length: 60 }, (_, i) => auditEintrag(i + 1))
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  await page.getByRole('tab', { name: 'Audit-Log' }).click()
  await expect(page.getByText('Seite 1 von 3')).toBeVisible()
  const freigeben = sperreAudit()
  await page.getByRole('button', { name: 'Nächste Seite' }).focus()

  await page.keyboard.press('Enter')
  await expect.poll(() => auditAbrufe.some((q) => q.get('seite') === '2')).toBe(true)
  await page.waitForTimeout(150)

  try {
    expect(await fokusOrt(page)).toMatch(/^Seitennavigation: /)
  } finally {
    freigeben()
  }
})

test('Audit: Enter auf „Nächste Seite“ mit verzögerter Antwort: nach dem Laden liegt der Fokus auf „Nächste Seite“', async ({
  page,
}) => {
  audit = Array.from({ length: 60 }, (_, i) => auditEintrag(i + 1))
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  await page.getByRole('tab', { name: 'Audit-Log' }).click()
  await expect(page.getByText('Seite 1 von 3')).toBeVisible()
  const freigeben = sperreAudit()
  await page.getByRole('button', { name: 'Nächste Seite' }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => auditAbrufe.some((q) => q.get('seite') === '2')).toBe(true)
  await page.waitForTimeout(150)

  freigeben()

  await expect(page.getByText('Seite 2 von 3')).toBeVisible()
  expect(await fokusOrt(page)).toBe('Seitennavigation: Nächste Seite')
})

test('Audit: Enter auf „Nächste Seite“ zur letzten Seite: Fokus bleibt im Blättern, nicht auf body', async ({
  page,
}) => {
  audit = Array.from({ length: 30 }, (_, i) => auditEintrag(i + 1))
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  await page.getByRole('tab', { name: 'Audit-Log' }).click()
  await expect(page.getByText('Seite 1 von 2')).toBeVisible()
  await page.getByRole('button', { name: 'Nächste Seite' }).focus()

  await page.keyboard.press('Enter')

  await expect(page.getByText('Seite 2 von 2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nächste Seite' })).toBeDisabled()
  expect(await fokusOrt(page)).toMatch(/^Seitennavigation: /)
})

// ---------- QA Runde 3 (H-a): Ladefehler beim Blättern – Fokus fällt nicht auf body ----------

/** Wo der Fokus liegt: „body“, „main“ oder „außerhalb von main: …“. */
async function fokusBereich(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'body'
    return el.closest('main') ? 'main' : `außerhalb von main: ${el.tagName}`
  })
}

test('Benutzer: Ladefehler nach Enter auf „Nächste Seite“: der Fokus bleibt im Hauptbereich und fällt nicht auf body', async ({
  page,
}) => {
  benutzer = [benutzer[0], ...vieleBenutzer(59)]
  benutzerFehlerSeiten = [2]
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  await expect(page.getByText('Seite 1 von 3')).toBeVisible()
  await page.getByRole('button', { name: 'Nächste Seite' }).focus()

  await page.keyboard.press('Enter')

  await expect(page.getByRole('alert').filter({ hasText: 'Benutzer konnten nicht geladen werden.' })).toBeVisible()
  await page.waitForTimeout(150)
  expect(await fokusBereich(page)).toBe('main')
})

test('Audit: Ladefehler nach Enter auf „Nächste Seite“: der Fokus bleibt im Hauptbereich und fällt nicht auf body', async ({
  page,
}) => {
  audit = Array.from({ length: 60 }, (_, i) => auditEintrag(i + 1))
  auditFehlerSeiten = [2]
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  await page.getByRole('tab', { name: 'Audit-Log' }).click()
  await expect(page.getByText('Seite 1 von 3')).toBeVisible()
  await page.getByRole('button', { name: 'Nächste Seite' }).focus()

  await page.keyboard.press('Enter')

  await expect(page.getByRole('alert').filter({ hasText: 'Audit-Log konnte nicht geladen werden.' })).toBeVisible()
  await page.waitForTimeout(150)
  expect(await fokusBereich(page)).toBe('main')
})

// ---------- AK-35: sichtbarer Fokus, deutsche Texte ----------

test('sichtbarer Fokus an Suche, Suchen-Button, Select, Status-Button und Tabs', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  await expect(page.getByRole('table', { name: 'Benutzer' })).toBeVisible()

  const ziele = [
    page.getByRole('tab', { name: 'Benutzer' }),
    page.getByRole('searchbox', { name: 'Benutzer suchen' }),
    page.getByRole('button', { name: 'Suchen' }),
    rollenAuswahl(page, 'Anna Probe'),
    page.getByRole('button', { name: 'Anna Probe deaktivieren' }),
  ]
  for (const ziel of ziele) {
    await tabBis(page, ziel)
    expect(await hatSichtbarenFokus(ziel)).toBe(true)
  }
})

test('Benutzerverwaltung samt Dialogen und Audit-Tab enthält keine englischen Texte', async ({ page }) => {
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  await expect(page.getByRole('table', { name: 'Benutzer' })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)

  await rollenAuswahl(page, 'Anna Probe').click()
  await expect(page.getByRole('option').first()).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)
  await page.getByRole('option', { name: 'Betrachter', exact: true }).click()
  await expect(page.getByRole('alertdialog', { name: 'Rolle ändern?' })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)
  await page.getByRole('button', { name: 'Abbrechen' }).click()

  await page.getByRole('button', { name: 'Anna Probe deaktivieren' }).click()
  await expect(page.getByRole('alertdialog', { name: 'Benutzer deaktivieren?' })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)
  await page.getByRole('button', { name: 'Abbrechen' }).click()

  await page.getByRole('tab', { name: 'Audit-Log' }).click()
  await expect(page.getByRole('table', { name: 'Audit-Log' })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)
})

test('auf schmalem Bildschirm sind Überschrift, Tabs und Suche erreichbar', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 })
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')

  await expect(page.getByRole('heading', { level: 1, name: 'Benutzerverwaltung' })).toBeInViewport()
  await expect(page.getByRole('tab', { name: 'Audit-Log' })).toBeInViewport()
  await expect(page.getByRole('searchbox', { name: 'Benutzer suchen' })).toBeVisible()
  // Die Seite selbst scrollt nicht waagerecht; breite Tabellen scrollen in ihrem Container.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

// ---------- AK-32 ----------

test('/api/me mit 403 benutzer_deaktiviert führt auf „Kein Zugriff“ mit Deaktiviert-Text', async ({ page }) => {
  await meldeAnAls(page, 'deaktiviert')
  await page.goto('/benutzerverwaltung')

  await expect(page).toHaveURL('/kein-zugriff')
  await expect(page.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeVisible()
  await expect(page.getByText(TEXTE.deaktiviert)).toBeVisible()
  await expect(page.locator('header').getByRole('button', { name: 'Abmelden' })).toBeVisible()
  await expect(page.locator('header')).not.toContainText('Test Administrator')
})

// ---------- Rev. 3, AK-41 bis AK-43: „Erneut prüfen“ auf /kein-zugriff ----------

const REV3 = {
  weiterhinDeaktiviert: 'Ihr Benutzerkonto ist weiterhin deaktiviert.',
  weiterhinKeineRolle: 'Ihrem Benutzerkonto ist weiterhin keine Rolle zugewiesen.',
  keineRolle: 'Ihrem Konto ist aber noch keine Rolle zugewiesen',
  speichert: 'Änderung wird gespeichert …',
} as const

const NEU: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a004',
  name: 'Test Neu',
  email: 'neu@test.local',
  rolle: 'keine',
  berechtigungen: [],
}

/**
 * Meldet an wie `meldeAnAls` und liefert einen Umschalter für die Antwort von /api/me (z. B. Reaktivierung durch einen
 * Administrator in einer anderen Sitzung). Die spätere Route hat Vorrang vor der aus `meldeAnAls`.
 */
async function meldeAnVeraenderlich(page: Page, start: Me | 'deaktiviert') {
  let aktuell: Me | 'deaktiviert' = start
  await meldeAnAls(page, start)
  await page.route(
    (url) => url.pathname === '/api/me',
    (route) =>
      aktuell === 'deaktiviert'
        ? json(
            route,
            403,
            {
              title: 'Kein Zugriff',
              status: 403,
              code: 'benutzer_deaktiviert',
              detail: 'Ihr Benutzerkonto ist deaktiviert.',
            },
            'application/problem+json',
          )
        : json(route, 200, aktuell),
  )
  return (neu: Me | 'deaktiviert') => {
    aktuell = neu
  }
}

test('/kein-zugriff (deaktiviert): „Erneut prüfen“ per Tastatur, sichtbarer Fokus, nach Reaktivierung zur Startseite', async ({
  page,
}) => {
  const setzeMe = await meldeAnVeraenderlich(page, 'deaktiviert')
  await page.goto('/kein-zugriff')
  await expect(page.getByText(TEXTE.deaktiviert)).toBeVisible()
  const erneutPruefen = page.getByRole('main').getByRole('button', { name: 'Erneut prüfen' })
  await expect(erneutPruefen).toBeVisible()

  await tabBis(page, erneutPruefen)
  expect(await hatSichtbarenFokus(erneutPruefen)).toBe(true)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: REV3.weiterhinDeaktiviert })).toBeVisible()
  await expect(erneutPruefen).toBeFocused()

  setzeMe(BETRACHTER)
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeVisible()
  await expect(page.locator('header')).toContainText('Test Betrachter')
})

test('/kein-zugriff (keine Rolle): „Erneut prüfen“ meldet „weiterhin keine Rolle“, nach Rollenvergabe zur Startseite', async ({
  page,
}) => {
  const setzeMe = await meldeAnVeraenderlich(page, NEU)
  await page.goto('/kein-zugriff')
  await expect(page.getByText(REV3.keineRolle)).toBeVisible()
  const erneutPruefen = page.getByRole('main').getByRole('button', { name: 'Erneut prüfen' })
  await expect(erneutPruefen).toBeVisible()

  await tabBis(page, erneutPruefen)
  expect(await hatSichtbarenFokus(erneutPruefen)).toBe(true)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: REV3.weiterhinKeineRolle })).toBeVisible()
  await expect(erneutPruefen).toBeFocused()

  setzeMe({ ...BETRACHTER, id: NEU.id, name: NEU.name, email: NEU.email })
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeVisible()
})

test('/kein-zugriff mit „Erneut prüfen“ und Meldung enthält keine englischen Texte', async ({ page }) => {
  await meldeAnVeraenderlich(page, 'deaktiviert')
  await page.goto('/kein-zugriff')
  const erneutPruefen = page.getByRole('main').getByRole('button', { name: 'Erneut prüfen' })
  await expect(erneutPruefen).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)

  await erneutPruefen.click()

  await expect(page.getByRole('status').filter({ hasText: REV3.weiterhinDeaktiviert })).toBeVisible()
  expect(await alleTexte(page)).not.toMatch(ENGLISCH)
})

test('/kein-zugriff mit „Erneut prüfen“ ist auf schmalem Bildschirm erreichbar', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 })
  await meldeAnVeraenderlich(page, 'deaktiviert')
  await page.goto('/kein-zugriff')

  await expect(page.getByRole('main').getByRole('button', { name: 'Erneut prüfen' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

// ---------- Rev. 3, AK-48, AK-49: Dialog während der Anfrage ----------

test('Dialog „Deaktivieren“ mit verzögerter Antwort: Fokus bleibt, Hinweis sichtbar, zweites Enter sendet nichts', async ({
  page,
}) => {
  let freigeben!: () => void
  putSperre = new Promise<void>((aufloesen) => {
    freigeben = aufloesen
  })
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  const ausloeser = page.getByRole('button', { name: 'Anna Probe deaktivieren' })
  await tabBis(page, ausloeser)
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('alertdialog', { name: 'Benutzer deaktivieren?' })
  await expect(dialog.getByRole('button', { name: 'Abbrechen' })).toBeFocused()
  const bestaetigen = dialog.getByRole('button', { name: 'Deaktivieren' })
  await tabBis(page, bestaetigen, 4)

  await page.keyboard.press('Enter')
  await expect.poll(() => puts.length).toBe(1)

  await expect(dialog.getByRole('status').filter({ hasText: REV3.speichert })).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-busy', 'true')
  await expect(bestaetigen).toBeFocused()
  await expect(bestaetigen).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  expect(puts).toHaveLength(1)
  await expect(dialog).toBeVisible()

  freigeben()

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Anna Probe reaktivieren' })).toBeFocused()
  expect(puts).toHaveLength(1)
})

test('Dialog „Rolle ändern“ mit verzögerter Antwort: Fokus bleibt, Hinweis sichtbar, Doppelklick sendet einmal', async ({
  page,
}) => {
  let freigeben!: () => void
  putSperre = new Promise<void>((aufloesen) => {
    freigeben = aufloesen
  })
  await meldeAnAls(page, ADMIN)
  await page.goto('/benutzerverwaltung')
  await rollenAuswahl(page, 'Anna Probe').click()
  await page.getByRole('option', { name: 'Betrachter', exact: true }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Rolle ändern?' })
  const bestaetigen = dialog.getByRole('button', { name: 'Rolle ändern' })

  await bestaetigen.dblclick()
  await expect.poll(() => puts.length).toBe(1)

  await expect(dialog.getByRole('status').filter({ hasText: REV3.speichert })).toBeVisible()
  await expect(bestaetigen).toBeFocused()
  await page.waitForTimeout(300)
  expect(puts).toHaveLength(1)

  freigeben()

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(puts).toHaveLength(1)
})
