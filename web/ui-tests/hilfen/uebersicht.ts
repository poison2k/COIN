import { crc32, deflateSync } from 'node:zlib'
import { expect, type Locator, type Page, type Route } from '@playwright/test'
import { filtereAudit } from './aenderungsprotokoll.js'
import { ADMIN, BETRACHTER, COIN, richteApiEin, setzeTheme, type ApiZustand, type Me } from './api.js'

// Gemeinsame Mocks und Messhilfen für die UI-Tests des Features startseite-listen-pruefung (Abschnitt 9, 11): die
// Startseiten-Fälle aus 11.2, Katalog mit vielen Coins, leer und mit Fehler, Prüfung mit allen vier Ergebnissen,
// Audit-Log mit Benutzerfilter. Baut auf `richteApiEin` auf (Catch-all, Anmeldung, Lese-Mocks); die hier registrierten
// Routen kommen später und haben deshalb Vorrang. Alle Daten sind synthetisch („Testperson A“, „Dienststelle Beispiel“).

export { ADMIN, BETRACHTER, COIN }

export const SACHBEARBEITER: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a002',
  name: 'Test Sachbearbeiter',
  email: 'sachbearbeiter@test.local',
  rolle: 'Sachbearbeiter',
  berechtigungen: ['coins.read', 'coins.write', 'issues.read', 'issues.write'],
}

export const OHNE_ROLLE: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a004',
  name: 'Test Neu',
  email: 'neu@test.local',
  rolle: 'keine',
  berechtigungen: [],
}

function json(route: Route, status: number, body: unknown, contentType = 'application/json') {
  return route.fulfill({ status, contentType, body: JSON.stringify(body) })
}

function problem(route: Route, status: number, zusatz: Record<string, unknown> = {}) {
  return json(route, status, { type: 'about:blank', title: 'Fehler', status, ...zusatz }, 'application/problem+json')
}

function seite<T>(alle: T[], url: URL) {
  const nr = Number(url.searchParams.get('seite') ?? '1')
  const groesse = Number(url.searchParams.get('groesse') ?? '25')
  return { eintraege: alle.slice((nr - 1) * groesse, nr * groesse), gesamt: alle.length, seite: nr, groesse }
}

// ---------- synthetisches PNG (keine Datei im Repository) ----------

function chunk(typ: string, daten: Buffer): Buffer {
  const laenge = Buffer.alloc(4)
  laenge.writeUInt32BE(daten.length)
  const typUndDaten = Buffer.concat([Buffer.from(typ, 'ascii'), daten])
  const pruefsumme = Buffer.alloc(4)
  pruefsumme.writeUInt32BE(crc32(typUndDaten))
  return Buffer.concat([laenge, typUndDaten, pruefsumme])
}

/** PNG mit `breite` × `hoehe` Pixeln in einer Farbe (RGBA, ohne Metadaten). */
export function erzeugePng(breite: number, hoehe: number, rgba: [number, number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(breite, 0)
  ihdr.writeUInt32BE(hoehe, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const zeile = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: breite }, () => rgba).flat())])
  const roh = Buffer.concat(Array.from({ length: hoehe }, () => zeile))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(roh)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const LOGO_BEREITSTELLER = erzeugePng(160, 96, [20, 60, 120, 255])
const LOGO_SOFTWARE = erzeugePng(192, 96, [120, 40, 20, 255])
const MOTIV = erzeugePng(64, 64, [180, 140, 40, 255])

// ---------- Startseite (11.2) ----------

export type BlockArt = 'kopf' | 'infotext' | 'kennzahlen' | 'neueste' | 'meistausgegeben'

export const KOPF_TITEL = 'Testverband Gedenkmünzen'
const KOPF_UNTERTITEL = 'Synthetischer Untertitel für die Gestaltungsprüfung'
const INFOTEXT =
  'C.O.I.N. verwaltet die Gedenk-Coins der Bundeswehr: den Katalog der Coins, ihre nummerierten Exemplare und die **Echtheitszertifikate**.'

export const LOGOS = {
  bereitsteller: {
    url: '/api/startseite/logos/bereitsteller?v=0123456789abcdef',
    alternativtext: 'Wappen des Testverbands',
    breite: 160,
    hoehe: 96,
  },
  software: {
    url: '/api/startseite/logos/software?v=fedcba9876543210',
    alternativtext: 'Logo der Testsoftware',
    breite: 192,
    hoehe: 96,
  },
}

function neuerCoin(n: number) {
  return {
    id: `0199a1b2-0000-7000-8000-${String(n).padStart(12, '0')}`,
    name: `Coin Neu ${n}`,
    herausgeber: `Herausgeber ${n}`,
    bildUrl: n % 2 === 0 ? `/api/coins/${String(n).padStart(12, '0')}/bild?v=aaaaaaaaaaaaaaaa` : null,
  }
}

function topCoin(n: number, ausgegeben: number) {
  return {
    id: `0199a1b2-0000-7000-8000-${String(n).padStart(12, '9')}`,
    name: `Coin Top ${n}`,
    herausgeber: `Herausgeber ${n}`,
    ausgegeben,
  }
}

export function block(art: BlockArt, leer = false): Record<string, unknown> {
  switch (art) {
    case 'kopf':
      return {
        art,
        titel: KOPF_TITEL,
        untertitel: KOPF_UNTERTITEL,
        logoBereitsteller: LOGOS.bereitsteller,
        logoSoftware: LOGOS.software,
      }
    case 'infotext':
      return { art, text: INFOTEXT }
    case 'kennzahlen':
      return { art, coins: 14, exemplare: 1250, ausgegeben: 1234, verfuegbar: 16 }
    case 'neueste':
      return { art, eintraege: leer ? [] : Array.from({ length: 6 }, (_, i) => neuerCoin(i + 1)) }
    case 'meistausgegeben':
      return {
        art,
        eintraege: leer ? [] : [topCoin(1, 1234), topCoin(2, 87), topCoin(3, 12), topCoin(4, 5), topCoin(5, 1)],
      }
  }
}

/** Ein Fall aus Abschnitt 11.2. */
export interface StartseitenFall {
  name: string
  beschreibung: string
  /** Aktive Blöcke in Reihenfolge (ohne `kopf` steht die Begrüßung oben). */
  bloecke: BlockArt[]
  /** Leere Listen (Fall 5). */
  leer?: boolean
  /** Anmeldezustand; `null` = anonym. */
  als: Me | null
  /** Aktiver öffentlicher Kopf (für anonyme Besucher, Fall 6). */
  kopfAktiv?: boolean
}

export const STARTSEITEN_FAELLE: readonly StartseitenFall[] = [
  {
    name: 'fall1-alle',
    beschreibung: 'alle fünf Blöcke in Standardreihenfolge',
    bloecke: ['kopf', 'infotext', 'kennzahlen', 'neueste', 'meistausgegeben'],
    als: BETRACHTER,
  },
  {
    name: 'fall2-ohne-kennzahlen-infotext',
    beschreibung: 'ohne Kennzahlen und Infotext',
    bloecke: ['kopf', 'neueste', 'meistausgegeben'],
    als: BETRACHTER,
  },
  {
    name: 'fall3-getrennte-paare',
    beschreibung: 'getrennte Paarblöcke',
    bloecke: ['kopf', 'neueste', 'kennzahlen', 'meistausgegeben'],
    als: BETRACHTER,
  },
  {
    name: 'fall4-kennzahlen-meistausgegeben',
    beschreibung: 'nur Kennzahlen und Meistausgegebene, ohne Kopf',
    bloecke: ['kennzahlen', 'meistausgegeben'],
    als: BETRACHTER,
  },
  {
    name: 'fall5-nur-neueste-leer',
    beschreibung: 'nur Neueste, leer',
    bloecke: ['neueste'],
    leer: true,
    als: BETRACHTER,
  },
  {
    name: 'fall6-anonym-kopf',
    beschreibung: 'anonym mit aktivem Kopf',
    bloecke: ['kopf'],
    als: null,
    kopfAktiv: true,
  },
]

export interface StartseitenOptionen {
  /** Antwort von GET /api/startseite: Blöcke oder ein HTTP-Status für den Fehlerfall. */
  bloecke?: BlockArt[] | number
  leer?: boolean
  kopfAktiv?: boolean
}

export interface StartseitenZustand {
  /** Anzahl der Aufrufe von GET /api/startseite. */
  readonly abrufe: number
  /** Ab jetzt antwortet GET /api/startseite erfolgreich (für „Erneut versuchen“). */
  fehlerBeheben: () => void
}

/** Überschreibt GET /api/startseite, /kopf und die Logos (nach `richteApiEin`). */
export async function mockeStartseite(page: Page, optionen: StartseitenOptionen): Promise<StartseitenZustand> {
  const zustand = { abrufe: 0 }
  let fehlerOffen = typeof optionen.bloecke === 'number'
  await page.route(
    (url) => url.pathname === '/api/startseite' || url.pathname === '/api/startseite/kopf',
    async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/kopf')) {
        const kopf = optionen.kopfAktiv ? { ...block('kopf'), aktiv: true, position: 1 } : { aktiv: false, position: 1 }
        return json(route, 200, kopf)
      }
      zustand.abrufe++
      if (typeof optionen.bloecke === 'number' && fehlerOffen) {
        return problem(route, optionen.bloecke)
      }
      const arten = Array.isArray(optionen.bloecke)
        ? optionen.bloecke
        : ['infotext', 'kennzahlen', 'neueste', 'meistausgegeben']
      return json(route, 200, { bloecke: (arten as BlockArt[]).map((art) => block(art, optionen.leer)) })
    },
  )
  await page.route(
    (url) => url.pathname.startsWith('/api/startseite/logos/'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: route.request().url().includes('software') ? LOGO_SOFTWARE : LOGO_BEREITSTELLER,
      }),
  )
  await page.route(
    (url) => /^\/api\/coins\/[^/]+\/bild$/.test(url.pathname),
    (route) => route.fulfill({ status: 200, contentType: 'image/png', body: MOTIV }),
  )
  return {
    get abrufe() {
      return zustand.abrufe
    },
    fehlerBeheben() {
      fehlerOffen = false
    },
  }
}

/** Startseite für einen Fall öffnen (Viewport, Theme, Mocks, goto) und warten, bis sie geladen ist. */
export async function oeffneStartseitenFall(
  page: Page,
  fall: StartseitenFall,
  { breite, theme = 'light' }: { breite: number; theme?: 'light' | 'dark' },
): Promise<ApiZustand> {
  await page.setViewportSize({ width: breite, height: 900 })
  await setzeTheme(page, theme)
  const api = await richteApiEin(page, fall.als)
  await mockeStartseite(page, { bloecke: fall.bloecke.filter(Boolean), leer: fall.leer, kopfAktiv: fall.kopfAktiv })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Zum Katalog' })).toBeVisible()
  await warteAufBilder(page)
  return api
}

/** Wartet, bis alle Bilder in main vollständig geladen sind. */
export async function warteAufBilder(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator('main img')
        .evaluateAll((bilder) =>
          bilder.every((b) => (b as HTMLImageElement).complete && (b as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true)
}

/**
 * Misst das Startseiten-Raster (AK-2): Je Block das Zellenelement (größter Vorfahr des Block-Ankers, der keinen anderen
 * Block enthält und nicht den Link „Zum Katalog“), gruppiert nach gleicher oberer Kante (± 1 px) in Zeilen. Anker:
 * Regionen der Blöcke und die h1 (Kopf bzw. Begrüßung). Rasterränder: das Element, das alle Zellen und „Zum Katalog“
 * enthält (die Seite). Liefert Zellen und Zeilen mit Rändern in px.
 */
export async function messeRaster(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement
    const zumKatalog = [...main.querySelectorAll('a')].find(
      (a) => a.textContent?.trim() === 'Zum Katalog',
    ) as HTMLElement
    const kandidaten = [
      ...main.querySelectorAll<HTMLElement>('h1'),
      ...main.querySelectorAll<HTMLElement>('section[aria-labelledby], section[aria-label]'),
    ].filter((el) => !el.closest('[hidden]'))
    // Liegt ein Anker in einem anderen (z. B. h1 in einem Kopf-Abschnitt), zählt nur der äußere.
    const anker = kandidaten.filter((a) => !kandidaten.some((b) => b !== a && b.contains(a)))
    const name = (el: HTMLElement) =>
      el.tagName === 'H1' || el.querySelector('h1')
        ? `h1 ${(el.tagName === 'H1' ? el : (el.querySelector('h1') as HTMLElement)).textContent?.trim()}`
        : (el.getAttribute('aria-label') ??
          document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent?.trim() ??
          '')
    const zellen = anker.map((a) => {
      let zelle: HTMLElement = a
      for (let e = a.parentElement; e && e !== main; e = e.parentElement) {
        if (e.contains(zumKatalog)) break
        if (anker.some((b) => b !== a && e.contains(b))) break
        zelle = e
      }
      const r = zelle.getBoundingClientRect()
      return { name: name(a), links: r.left, rechts: r.right, oben: r.top, unten: r.bottom, hoehe: r.height }
    })
    let seite: HTMLElement | null = zumKatalog.parentElement
    while (seite && !anker.every((a) => seite!.contains(a))) seite = seite.parentElement
    const s = (seite ?? main).getBoundingClientRect()
    const sortiert = [...zellen].sort((a, b) => a.oben - b.oben || a.links - b.links)
    const zeilen: Array<typeof zellen> = []
    for (const zelle of sortiert) {
      const zeile = zeilen.find((z) => Math.abs(z[0].oben - zelle.oben) <= 1)
      if (zeile) zeile.push(zelle)
      else zeilen.push([zelle])
    }
    return { raster: { links: s.left, rechts: s.right }, zellen, zeilen }
  })
}

// ---------- Katalog ----------

export function katalogCoin(n: number, teil: Record<string, unknown> = {}) {
  return {
    id: `0199a1b2-0000-7000-8000-${String(n).padStart(12, 'c')}`,
    name: `Katalogcoin ${String(n).padStart(3, '0')}`,
    herausgeber: `Herausgeber ${((n - 1) % 4) + 1}`,
    auflage: n % 3 === 0 ? null : 100 + n,
    beschreibung: null,
    erstelltAm: '2026-10-05T12:00:00+00:00',
    bildUrl: n % 4 === 1 ? `/api/coins/${String(n).padStart(12, 'c')}/bild?v=aaaaaaaaaaaaaaaa` : null,
    ...teil,
  }
}

export interface KatalogZustand {
  abrufe: URL[]
  /** Ab jetzt antworten die Abrufe erfolgreich (für „Erneut versuchen“; der Dev-Server lädt im StrictMode doppelt). */
  fehlerBeheben: () => void
}

/** Überschreibt GET /api/coins: Liste (Suche, Seiten), leer oder Fehler (einmalig bzw. dauerhaft). */
export async function mockeKatalog(
  page: Page,
  {
    coins = Array.from({ length: 30 }, (_, i) => katalogCoin(i + 1)),
    fehler = 0,
  }: { coins?: unknown[]; fehler?: number } = {},
): Promise<KatalogZustand> {
  let offeneFehler = fehler
  const zustand: KatalogZustand = { abrufe: [], fehlerBeheben: () => (offeneFehler = 0) }
  await page.route(
    (url) => url.pathname === '/api/coins',
    async (route) => {
      const url = new URL(route.request().url())
      zustand.abrufe.push(url)
      if (offeneFehler > 0) {
        offeneFehler--
        return problem(route, 500)
      }
      const suche = (url.searchParams.get('suche') ?? '').toLowerCase()
      const alle = (coins as Array<{ name: string; herausgeber: string }>).filter(
        (c) => !suche || c.name.toLowerCase().includes(suche) || c.herausgeber.toLowerCase().includes(suche),
      )
      return json(route, 200, seite(alle, url))
    },
  )
  await page.route(
    (url) => /^\/api\/coins\/[^/]+\/bild$/.test(url.pathname),
    (route) => route.fulfill({ status: 200, contentType: 'image/png', body: MOTIV }),
  )
  // Detailseite eines Katalog-Coins (nach Zeilen- bzw. Kartenklick): Coin, leere Exemplare/Ausgaben, Standardvorlage.
  // Andere Ids fallen an die Mocks aus `richteApiEin` durch.
  const katalogIds = new Set((coins as Array<{ id: string }>).map((c) => c.id))
  await page.route(
    (url) => /^\/api\/coins\/[^/]+(\/exemplare|\/ausgaben|\/zertifikatsvorlage)?$/.test(url.pathname),
    async (route) => {
      const url = new URL(route.request().url())
      const [, , , id, teil] = url.pathname.split('/')
      const coin = (coins as Array<{ id: string; auflage: number | null }>).find((c) => c.id === id)
      if (!katalogIds.has(id) || !coin) return route.fallback()
      if (!teil) return json(route, 200, coin)
      if (teil === 'exemplare') {
        return json(route, 200, {
          kennzahlen: { auflage: coin.auflage, ausgegeben: 0, verfuegbar: coin.auflage ?? 0 },
          ...seite([], url),
        })
      }
      if (teil === 'ausgaben') return json(route, 200, seite([], url))
      return json(route, 200, { quelle: 'standard', aktiveVersion: null, versionen: [] })
    },
  )
  return zustand
}

/** Ein Element des Ansichtsumschalters. */
export function ansichtsKnopf(page: Page, name: 'Tabelle' | 'Karten'): Locator {
  return page.getByRole('group', { name: 'Ansicht' }).getByRole('button', { name, exact: true })
}

// ---------- Prüfung ----------

export type Ergebnis = 'gueltig' | 'storniert' | 'falscherCoin' | 'nichtGefunden'

/** Nummern, auf die der Mock mit dem jeweiligen Ergebnis antwortet. */
export const NUMMER: Record<Ergebnis, string> = {
  gueltig: 'AB 12-43',
  storniert: 'ST 55-01',
  falscherCoin: 'FC 77-02',
  nichtGefunden: 'NF 00-00',
}

export const UEBERSCHRIFT: Record<Ergebnis, string> = {
  gueltig: 'Zertifikat gültig',
  storniert: 'Ausgabe storniert, Zertifikat ungültig',
  falscherCoin: 'Die Nummer gehört nicht zu diesem Coin.',
  nichtGefunden: 'Nummer nicht gefunden. Das Zertifikat kann nicht bestätigt werden.',
}

export const ICON: Record<Ergebnis, string> = {
  gueltig: 'lucide-circle-check',
  storniert: 'lucide-ban',
  falscherCoin: 'lucide-triangle-alert',
  nichtGefunden: 'lucide-search-x',
}

export interface PruefAnfrage {
  pfad: string
  body: { hologrammnummer?: string; coinId?: string | null }
}

export interface PruefZustand {
  anfragen: PruefAnfrage[]
  /** Nächste Antwort überschreiben (z. B. 429 oder 500). */
  naechste: { status: number; headers?: Record<string, string>; body: unknown } | null
}

/** Überschreibt POST /api/pruefung(/mit-empfaenger) mit den vier Ergebnissen nach der Nummer (sonst „nicht gefunden“). */
export async function mockePruefung(page: Page): Promise<PruefZustand> {
  const zustand: PruefZustand = { anfragen: [], naechste: null }
  const normal = (s: string) => s.replace(/[\s-]/g, '').toUpperCase()
  await page.route(
    (url) => url.pathname === '/api/pruefung' || url.pathname === '/api/pruefung/mit-empfaenger',
    async (route) => {
      const url = new URL(route.request().url())
      const body = (route.request().postDataJSON() ?? {}) as PruefAnfrage['body']
      zustand.anfragen.push({ pfad: url.pathname, body })
      if (zustand.naechste) {
        const { status, headers, body: antwort } = zustand.naechste
        zustand.naechste = null
        return route.fulfill({
          status,
          headers: { 'Content-Type': 'application/problem+json', ...headers },
          body: JSON.stringify(antwort),
        })
      }
      const eingabe = normal(body.hologrammnummer ?? '')
      const ergebnis = (Object.entries(NUMMER).find(([, n]) => normal(n) === eingabe)?.[0] ??
        'nichtGefunden') as Ergebnis
      if (ergebnis === 'falscherCoin' || ergebnis === 'nichtGefunden')
        return json(route, 200, { ergebnis, datensatz: null })
      const storniert = ergebnis === 'storniert'
      const datensatz: Record<string, unknown> = {
        coin: { id: COIN.id, name: COIN.name },
        exemplarNummer: storniert ? 13 : 12,
        zertifikatsnummer: storniert ? 'C0042-0013' : 'C0042-0012',
        hologrammnummer: NUMMER[ergebnis],
        datum: '2026-10-01',
        status: storniert ? 'storniert' : 'aktiv',
        storniertAm: storniert ? '2026-10-08' : null,
      }
      if (url.pathname.endsWith('/mit-empfaenger')) {
        Object.assign(datensatz, {
          ausgabeId: '0199a1b2-0000-7000-8000-0000000000e1',
          empfaenger: { name: 'Testperson A', dienstgrad: 'Hauptmann', dienststelle: 'Dienststelle Beispiel' },
          gelegenheit: 'Truppenbesuch',
          begruendung: 'Herausragende Leistung',
          ausgebendeStelle: 'Kommandeur Beispiel',
        })
      }
      return json(route, 200, { ergebnis, datensatz })
    },
  )
  return zustand
}

export const nummernFeld = (page: Page) => page.getByLabel(/^Hologrammnummer/)
export const coinFeld = (page: Page) => page.getByRole('combobox', { name: /^Coin \(optional\)/ })
export const pruefenKnopf = (page: Page) => page.getByRole('button', { name: 'Prüfen', exact: true })

/** Live-Region der Prüfung (dauerhaft vorhanden, aria-live="polite"). */
export function ergebnisRegion(page: Page): Locator {
  return page.locator('[role="status"][aria-live="polite"]')
}

/** Prüft eine Nummer per Enter und wartet auf das Ergebnis. */
export async function pruefePerEnter(page: Page, ergebnis: Ergebnis): Promise<void> {
  await nummernFeld(page).fill(NUMMER[ergebnis])
  await nummernFeld(page).press('Enter')
  await expect(page.getByRole('heading', { level: 2, name: UEBERSCHRIFT[ergebnis] })).toBeVisible()
}

/** Wählt den Test-Coin in „Coin (optional)“. */
export async function waehleCoin(page: Page): Promise<void> {
  await coinFeld(page).click()
  await coinFeld(page).fill('Gestaltung')
  await page.getByRole('option', { name: new RegExp(`^${COIN.name}`) }).click()
  await expect(page.getByRole('button', { name: 'Auswahl entfernen' })).toBeVisible()
}

// ---------- Audit-Log ----------

export interface AuditZustand {
  abrufe: URL[]
  suchen: URL[]
  /** Ab jetzt antworten die Abrufe erfolgreich (für „Erneut versuchen“; der Dev-Server lädt im StrictMode doppelt). */
  fehlerBeheben: () => void
}

const AUDIT_BENUTZER = [
  { id: BETRACHTER.id, name: BETRACHTER.name },
  { id: ADMIN.id, name: ADMIN.name },
]

/** Überschreibt GET /api/audit (mit benutzerId-Filter, optional leer oder Fehler) und die Benutzersuche des Filters. */
export async function mockeAudit(
  page: Page,
  { leer = false, fehler = 0 }: { leer?: boolean; fehler?: number } = {},
): Promise<AuditZustand> {
  let offeneFehler = fehler
  const zustand: AuditZustand = { abrufe: [], suchen: [], fehlerBeheben: () => (offeneFehler = 0) }
  const eintraege = leer
    ? []
    : [
        {
          id: '0199a1b2-0000-7000-8000-00000000b001',
          zeitpunkt: '2026-10-03T09:00:00Z',
          akteur: { id: ADMIN.id, name: ADMIN.name },
          benutzer: AUDIT_BENUTZER[0],
          art: 'Rolle',
          alt: 'keine',
          neu: 'Betrachter',
        },
        {
          id: '0199a1b2-0000-7000-8000-00000000b002',
          zeitpunkt: '2026-01-31T23:05:09Z',
          akteur: null,
          benutzer: AUDIT_BENUTZER[1],
          art: 'Rolle',
          alt: 'keine',
          neu: 'Administrator',
        },
      ]
  await page.route(
    (url) => url.pathname === '/api/audit',
    async (route) => {
      const url = new URL(route.request().url())
      zustand.abrufe.push(url)
      if (offeneFehler > 0) {
        offeneFehler--
        return problem(route, 500)
      }
      // nacharbeiten-audit-filter (K1): Filter von/bis/aktion/benutzerId wie die API.
      return json(route, 200, seite(filtereAudit(eintraege, url.searchParams), url))
    },
  )
  await page.route(
    (url) => url.pathname === '/api/benutzer' && url.searchParams.get('groesse') === '20',
    async (route) => {
      const url = new URL(route.request().url())
      zustand.suchen.push(url)
      const suche = (url.searchParams.get('suche') ?? '').toLowerCase()
      const treffer = [
        {
          id: BETRACHTER.id,
          name: BETRACHTER.name,
          email: BETRACHTER.email,
          rolle: 'Betrachter',
          aktiv: true,
          erstelltAm: '2026-10-02T08:00:00Z',
        },
        {
          id: ADMIN.id,
          name: ADMIN.name,
          email: ADMIN.email,
          rolle: 'Administrator',
          aktiv: true,
          erstelltAm: '2026-10-01T08:00:00Z',
        },
        {
          id: '0199a1b2-0000-7000-8000-00000000a009',
          name: 'Testperson A',
          email: 'testperson@test.local',
          rolle: 'keine',
          aktiv: true,
          erstelltAm: '2026-10-04T08:00:00Z',
        },
      ].filter((b) => !suche || b.name.toLowerCase().includes(suche))
      return json(route, 200, seite(treffer, url))
    },
  )
  return zustand
}

/** Benutzerverwaltung öffnen und auf den Reiter „Audit-Log“ wechseln. */
export async function oeffneAuditLog(page: Page): Promise<void> {
  await page.goto('/benutzerverwaltung')
  await expect(page.getByRole('heading', { level: 1, name: 'Benutzerverwaltung' })).toBeVisible()
  await page.getByRole('tab', { name: 'Änderungsprotokoll' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Änderungsprotokoll' })).toBeVisible()
}

/** Kontrast der Textfarbe eines Elements zum Hintergrund des nächsten deckenden Vorfahren (WCAG). */
export async function kontrast(element: Locator): Promise<number> {
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
