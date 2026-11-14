import { expect, type Page, type Route } from '@playwright/test'
import { standardStartseite } from '../startseite-mocks.js'

// Gemeinsame Mocks für die UI-Tests des Features design-fundament (Abschnitt 11.1): angemeldet als Administrator,
// Betrachter, ohne Rolle oder anonym; ein Coin mit Exemplaren, eine Ausgabe, Benutzer, Audit, Startseite und Prüfung.
// Alle Daten sind synthetisch („Testperson A“, „Dienststelle Beispiel“). Nicht gemockte API- und IdP-Aufrufe werden
// abgebrochen und in `ungemockt` gesammelt; die Specs prüfen die Liste im afterEach.

export const WEB = 'http://localhost:5193'
const IDP = 'http://127.0.0.1:9'
const AUTHORITY = `${IDP}/realms/coin`
const CLIENT_ID = 'coin-web'
const USER_SCHLUESSEL = `oidc.user:${AUTHORITY}:${CLIENT_ID}`

export interface Me {
  id: string
  name: string
  email: string | null
  rolle: 'Administrator' | 'Sachbearbeiter' | 'Betrachter' | 'keine'
  berechtigungen: string[]
}

export const ADMIN: Me = {
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

export const BETRACHTER: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a003',
  name: 'Test Betrachter',
  email: 'betrachter@test.local',
  rolle: 'Betrachter',
  berechtigungen: ['coins.read'],
}

export const OHNE_ROLLE: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a004',
  name: 'Test Neu',
  email: 'neu@test.local',
  rolle: 'keine',
  berechtigungen: [],
}

export const COIN = {
  id: '0199a1b2-0000-7000-8000-0000000000f1',
  name: 'Coin Gestaltungstest',
  herausgeber: 'Herausgeber Beispiel',
  auflage: 40,
  beschreibung: 'Synthetischer Coin für die Gestaltungsprüfung.',
  erstelltAm: '2026-10-05T12:00:00+00:00',
  bildUrl: null,
}

export const AUSGABE = {
  id: '0199a1b2-0000-7000-8000-0000000000e1',
  exemplarNummer: 12,
  zertifikatsnummer: 'C0042-0012',
  empfaenger: { name: 'Testperson A', dienstgrad: 'Hauptmann', dienststelle: 'Dienststelle Beispiel' },
  datum: '2026-10-01',
  gelegenheit: 'Truppenbesuch',
  begruendung: 'Herausragende Leistung',
  ausgebendeStelle: 'Kommandeur Beispiel',
  erfasstAm: '2026-10-07T09:00:00+00:00',
  erfasstVon: { id: ADMIN.id, name: ADMIN.name },
  storno: null,
  hologrammnummer: 'AB 12-43',
}

export const HOLOGRAMMNUMMER = 'AB 12-43'

const ANDERE_COINS = Array.from({ length: 7 }, (_, i) => ({
  ...COIN,
  id: `0199a1b2-0000-7000-8000-00000000010${i}`,
  name: `Coin Beispiel ${i + 1}`,
  herausgeber: `Herausgeber ${i + 1}`,
  auflage: i % 2 === 0 ? 100 + i : null,
}))

const BENUTZER = [
  {
    id: ADMIN.id,
    name: ADMIN.name,
    email: ADMIN.email,
    rolle: 'Administrator',
    aktiv: true,
    erstelltAm: '2026-10-01T08:00:00Z',
  },
  {
    id: BETRACHTER.id,
    name: BETRACHTER.name,
    email: BETRACHTER.email,
    rolle: 'Betrachter',
    aktiv: true,
    erstelltAm: '2026-10-02T08:00:00Z',
  },
  {
    id: OHNE_ROLLE.id,
    name: OHNE_ROLLE.name,
    email: OHNE_ROLLE.email,
    rolle: 'keine',
    aktiv: false,
    erstelltAm: '2026-10-03T08:00:00Z',
  },
]

const AUDIT = [
  {
    id: '0199a1b2-0000-7000-8000-00000000b001',
    zeitpunkt: '2026-10-03T09:00:00Z',
    akteur: { id: ADMIN.id, name: ADMIN.name },
    benutzer: { id: BETRACHTER.id, name: BETRACHTER.name },
    art: 'Rolle',
    alt: 'keine',
    neu: 'Betrachter',
  },
  {
    id: '0199a1b2-0000-7000-8000-00000000b002',
    zeitpunkt: '2026-10-01T08:00:00Z',
    akteur: null,
    benutzer: { id: ADMIN.id, name: ADMIN.name },
    art: 'Rolle',
    alt: 'keine',
    neu: 'Administrator',
  },
]

function konfiguration() {
  const standard = standardStartseite()
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
    infotext: { aktiv: true, text: (standard.bloecke[0] as { text: string }).text },
    kennzahlen: { aktiv: true },
    neueste: { aktiv: true, anzahl: 6 },
    meistausgegeben: { aktiv: true, anzahl: 5 },
    daten: {
      kennzahlen: { coins: 8, exemplare: 450, ausgegeben: 1, verfuegbar: 449 },
      neueste: [COIN, ...ANDERE_COINS]
        .slice(0, 6)
        .map(({ id, name, herausgeber }) => ({ id, name, herausgeber, bildUrl: null })),
      meistausgegeben: [{ id: COIN.id, name: COIN.name, herausgeber: COIN.herausgeber, ausgegeben: 1 }],
    },
  }
}

function startseite() {
  return {
    bloecke: [
      { art: 'infotext', text: (standardStartseite().bloecke[0] as { text: string }).text },
      { art: 'kennzahlen', coins: 8, exemplare: 450, ausgegeben: 1, verfuegbar: 449 },
      {
        art: 'neueste',
        eintraege: [COIN, ...ANDERE_COINS]
          .slice(0, 6)
          .map(({ id, name, herausgeber }) => ({ id, name, herausgeber, bildUrl: null })),
      },
      {
        art: 'meistausgegeben',
        eintraege: [{ id: COIN.id, name: COIN.name, herausgeber: COIN.herausgeber, ausgegeben: 1 }],
      },
    ],
  }
}

function json(route: Route, status: number, body: unknown, contentType = 'application/json') {
  return route.fulfill({ status, contentType, body: JSON.stringify(body) })
}

function seite<T>(alle: T[], url: URL) {
  const nr = Number(url.searchParams.get('seite') ?? '1')
  const groesse = Number(url.searchParams.get('groesse') ?? '25')
  return { eintraege: alle.slice((nr - 1) * groesse, nr * groesse), gesamt: alle.length, seite: nr, groesse }
}

function base64Url(objekt: object): string {
  return Buffer.from(JSON.stringify(objekt)).toString('base64url')
}

/** Zustand der Mocks je Test (nicht gemockte Aufrufe, API-Aufrufe). */
export interface ApiZustand {
  ungemockt: string[]
  aufrufe: string[]
}

/**
 * Richtet Catch-all, alle Mocks und (für `me` ≠ null) eine angemeldete Sitzung ein. Muss vor `page.goto` laufen.
 * Später registrierte Routen haben in Playwright Vorrang; deshalb steht der Catch-all zuerst.
 */
export async function richteApiEin(page: Page, me: Me | null): Promise<ApiZustand> {
  const zustand: ApiZustand = { ungemockt: [], aufrufe: [] }

  await page.route(
    (url) => url.pathname === '/api' || url.pathname.startsWith('/api/') || url.origin === IDP,
    async (route) => {
      zustand.ungemockt.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
      await route.abort('failed')
    },
  )

  const merke = (route: Route) => {
    const url = new URL(route.request().url())
    zustand.aufrufe.push(`${route.request().method()} ${url.pathname}`)
    return url
  }
  const recht = (berechtigung: string) => me?.berechtigungen.includes(berechtigung) ?? false
  const ohneRecht = (route: Route) =>
    me === null
      ? json(route, 401, { status: 401, title: 'Nicht angemeldet' }, 'application/problem+json')
      : json(route, 403, { status: 403, title: 'Kein Zugriff', code: 'keine_berechtigung' }, 'application/problem+json')

  await page.route(`${AUTHORITY}/.well-known/openid-configuration`, (route) =>
    json(route, 200, {
      issuer: AUTHORITY,
      authorization_endpoint: `${AUTHORITY}/protocol/openid-connect/auth`,
      token_endpoint: `${AUTHORITY}/protocol/openid-connect/token`,
      end_session_endpoint: `${AUTHORITY}/protocol/openid-connect/logout`,
      jwks_uri: `${AUTHORITY}/protocol/openid-connect/certs`,
    }),
  )

  await page.route(
    (url) => url.pathname === '/api/startseite' || url.pathname === '/api/startseite/kopf',
    async (route) => {
      const url = merke(route)
      if (url.pathname.endsWith('/kopf')) return json(route, 200, { aktiv: false, position: 1 })
      return recht('coins.read') ? json(route, 200, startseite()) : ohneRecht(route)
    },
  )
  await page.route(
    (url) => url.pathname === '/api/startseite/konfiguration',
    async (route) => {
      merke(route)
      return recht('startpage.manage') ? json(route, 200, konfiguration()) : ohneRecht(route)
    },
  )
  await page.route(
    (url) => url.pathname === '/api/coins',
    async (route) => {
      const url = merke(route)
      const suche = (url.searchParams.get('suche') ?? '').toLowerCase()
      const alle = [COIN, ...ANDERE_COINS].filter(
        (c) => !suche || c.name.toLowerCase().includes(suche) || c.herausgeber.toLowerCase().includes(suche),
      )
      return json(route, 200, seite(alle, url))
    },
  )
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}`,
    async (route) => {
      merke(route)
      return json(route, 200, COIN)
    },
  )
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}/exemplare`,
    async (route) => {
      const url = merke(route)
      if (!recht('coins.read')) return ohneRecht(route)
      const status = url.searchParams.get('status')
      const alle = Array.from({ length: COIN.auflage }, (_, i) => ({
        nummer: i + 1,
        status: i + 1 === AUSGABE.exemplarNummer ? 'ausgegeben' : 'verfuegbar',
      })).filter((e) => !status || e.status === status)
      return json(route, 200, {
        kennzahlen: { auflage: COIN.auflage, ausgegeben: 1, verfuegbar: COIN.auflage - 1 },
        ...seite(alle, url),
      })
    },
  )
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}/ausgaben`,
    async (route) => {
      const url = merke(route)
      return recht('issues.read') ? json(route, 200, seite([AUSGABE], url)) : ohneRecht(route)
    },
  )
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}/ausgaben/${AUSGABE.id}`,
    async (route) => {
      merke(route)
      return recht('issues.read') ? json(route, 200, AUSGABE) : ohneRecht(route)
    },
  )
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}/zertifikatsvorlage`,
    async (route) => {
      merke(route)
      return recht('coins.write')
        ? json(route, 200, { quelle: 'standard', aktiveVersion: null, versionen: [] })
        : ohneRecht(route)
    },
  )
  await page.route(
    (url) => url.pathname === '/api/benutzer',
    async (route) => {
      const url = merke(route)
      return recht('users.manage') ? json(route, 200, seite(BENUTZER, url)) : ohneRecht(route)
    },
  )
  await page.route(
    (url) => url.pathname === '/api/audit',
    async (route) => {
      const url = merke(route)
      return recht('audit.read') ? json(route, 200, seite(AUDIT, url)) : ohneRecht(route)
    },
  )
  await page.route(
    (url) => url.pathname === '/api/pruefung' || url.pathname === '/api/pruefung/mit-empfaenger',
    async (route) => {
      const url = merke(route)
      const basis = {
        coin: { id: COIN.id, name: COIN.name },
        exemplarNummer: AUSGABE.exemplarNummer,
        zertifikatsnummer: AUSGABE.zertifikatsnummer,
        hologrammnummer: AUSGABE.hologrammnummer,
        datum: AUSGABE.datum,
        status: 'aktiv',
        storniertAm: null,
      }
      const datensatz = url.pathname.endsWith('/mit-empfaenger')
        ? {
            ...basis,
            ausgabeId: AUSGABE.id,
            empfaenger: AUSGABE.empfaenger,
            gelegenheit: AUSGABE.gelegenheit,
            begruendung: AUSGABE.begruendung,
            ausgebendeStelle: AUSGABE.ausgebendeStelle,
          }
        : basis
      return json(route, 200, { ergebnis: 'gueltig', datensatz })
    },
  )

  if (me) {
    const jetzt = Math.floor(Date.now() / 1000)
    const idToken = `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url({ iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-1', name: me.name, iat: jetzt, exp: jetzt + 3600 })}.`
    const user = {
      id_token: idToken,
      session_state: null,
      access_token: 'ui-access-token-1',
      refresh_token: 'ui-refresh-token-1',
      token_type: 'Bearer',
      scope: 'openid profile email',
      profile: { iss: AUTHORITY, aud: CLIENT_ID, sub: 'sub-ui-1', iat: jetzt, exp: jetzt + 3600, name: me.name },
      expires_at: jetzt + 3600,
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
    (route) =>
      me
        ? json(route, 200, me)
        : json(route, 401, { status: 401, title: 'Nicht angemeldet' }, 'application/problem+json'),
  )

  return zustand
}

/** Setzt das Farbschema vor dem Laden der App (localStorage `coin-theme`). */
export async function setzeTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((wert) => localStorage.setItem('coin-theme', wert), theme)
}

/** Eine Seite aus Abschnitt 11.2 mit Anmeldezustand und Bereitschaftsprüfung. */
export interface SeitenFall {
  name: string
  pfad: string
  als: Me | null
  /** Wartet, bis die Seite vollständig geladen ist (und führt ggf. eine Aktion aus, z. B. die Prüfung). */
  bereit: (page: Page) => Promise<void>
}

const h1 = (name: string | RegExp) => async (page: Page) => {
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

/** Seitenliste für axe, Overflow und Screenshots (Abschnitt 11.2). */
export const SEITEN: readonly SeitenFall[] = [
  { name: 'start-anonym', pfad: '/', als: null, bereit: h1('Willkommen bei C.O.I.N.') },
  {
    name: 'start',
    pfad: '/',
    als: ADMIN,
    bereit: async (page) => {
      await h1('Willkommen bei C.O.I.N.')(page)
      await expect(page.getByText(COIN.name).first()).toBeVisible()
    },
  },
  {
    name: 'katalog',
    pfad: '/coins',
    als: ADMIN,
    bereit: async (page) => {
      await h1('Katalog')(page)
      await expect(page.getByRole('link', { name: COIN.name, exact: true })).toBeVisible()
    },
  },
  { name: 'coin-anlegen', pfad: '/coins/neu', als: ADMIN, bereit: h1('Coin hinzufügen') },
  {
    name: 'coin-detail',
    // formulare-detailseiten (Freigabe 2026-11-14, wie K3): Die Historie steht im Reiter „Ausgaben“; die Seite wird
    // direkt mit diesem Reiter geöffnet, damit `bereit` weiter auf die Empfängerdaten warten kann.
    pfad: `/coins/${COIN.id}?reiter=ausgaben`,
    als: ADMIN,
    bereit: async (page) => {
      await h1(COIN.name)(page)
      await expect(page.getByText(AUSGABE.empfaenger.name).first()).toBeVisible()
    },
  },
  { name: 'coin-bearbeiten', pfad: `/coins/${COIN.id}/bearbeiten`, als: ADMIN, bereit: h1('Coin bearbeiten') },
  {
    name: 'ausgabe-erfassen',
    pfad: `/coins/${COIN.id}/ausgaben/neu`,
    als: ADMIN,
    bereit: async (page) => {
      await h1('Ausgabe erfassen')(page)
      await expect(page.getByRole('button', { name: 'Ausgabe speichern' })).toBeVisible()
    },
  },
  {
    name: 'ausgabe-detail',
    pfad: `/coins/${COIN.id}/ausgaben/${AUSGABE.id}`,
    als: ADMIN,
    bereit: h1(`Ausgabe von Exemplar Nr. ${AUSGABE.exemplarNummer}`),
  },
  {
    name: 'pruefung',
    pfad: '/pruefung',
    als: ADMIN,
    bereit: async (page) => {
      await h1('Zertifikat prüfen')(page)
      await page.getByLabel(/^Hologrammnummer/).fill(HOLOGRAMMNUMMER)
      await page.getByLabel(/^Hologrammnummer/).press('Enter')
      await expect(page.getByRole('heading', { level: 2, name: 'Zertifikat gültig' })).toBeVisible()
    },
  },
  {
    name: 'benutzerverwaltung',
    pfad: '/benutzerverwaltung',
    als: ADMIN,
    bereit: async (page) => {
      await h1('Benutzerverwaltung')(page)
      await expect(page.getByRole('combobox', { name: `Rolle von ${BETRACHTER.name}` })).toBeVisible()
    },
  },
  {
    name: 'startseite-verwaltung',
    pfad: '/verwaltung/startseite',
    als: ADMIN,
    bereit: h1('Startseite verwalten'),
  },
  { name: 'kein-zugriff', pfad: '/kein-zugriff', als: OHNE_ROLLE, bereit: h1('Kein Zugriff') },
  { name: 'abgemeldet', pfad: '/abgemeldet', als: null, bereit: h1('Abgemeldet') },
  {
    name: 'anmeldung-fehlgeschlagen',
    pfad: '/anmeldung/rueckruf?code=ui-test-code&state=unbekannt',
    als: null,
    bereit: h1('Anmeldung fehlgeschlagen'),
  },
  {
    name: 'nicht-gefunden',
    pfad: '/gibt-es-nicht',
    als: ADMIN,
    bereit: async (page) => {
      await expect(page.getByText('Seite nicht gefunden.')).toBeVisible()
    },
  },
  {
    name: 'bausteine',
    pfad: '/entwicklung/bausteine',
    als: null,
    bereit: h1('Bausteinübersicht'),
  },
]

/** Seiten in der App-Shell (alle außer dem Rückruf, der ohne Shell rendert). */
export const SHELL_SEITEN = SEITEN.filter((s) => !s.pfad.startsWith('/anmeldung/rueckruf'))

/** Prüft, dass das Dokument nicht horizontal scrollt (`scrollWidth ≤ innerWidth`). */
export async function scrolltNichtHorizontal(page: Page): Promise<void> {
  const masse = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(masse.scrollWidth, `scrollWidth ${masse.scrollWidth} > innerWidth ${masse.innerWidth}`).toBeLessThanOrEqual(
    masse.innerWidth,
  )
}
