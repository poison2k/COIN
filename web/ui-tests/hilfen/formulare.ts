import { expect, type Locator, type Page, type Route } from '@playwright/test'
import { ADMIN, AUSGABE, BETRACHTER, COIN, richteApiEin, setzeTheme, type ApiZustand, type Me } from './api.js'

// Gemeinsame Mocks und Prüfhilfen für die UI-Tests des Features formulare-detailseiten (Abschnitt 8): ergänzt die
// Lese-Mocks aus api.ts um die schreibenden Endpunkte (Coin anlegen/bearbeiten, Auflage, Ausgabe erfassen, Storno,
// Hologrammnummer, Vorlage hochladen/zurücksetzen, Benutzerstatus, Startseite). Alle Daten sind synthetisch
// („Testperson A“, „Dienststelle Beispiel“). Registriert nach `richteApiEin`, daher mit Vorrang; GET-Aufrufe derselben
// Pfade fallen an die Lese-Mocks durch.

export { ADMIN, AUSGABE, BETRACHTER, COIN }

/** Sachbearbeiter wie in der Rechtematrix (coins.read/write, issues.read/write). */
export const SACHBEARBEITER: Me = {
  id: '0199a1b2-0000-7000-8000-00000000a002',
  name: 'Test Sachbearbeiter',
  email: 'sachbearbeiter@test.local',
  rolle: 'Sachbearbeiter',
  berechtigungen: ['coins.read', 'coins.write', 'issues.read', 'issues.write'],
}

/** Id des per POST angelegten Coins. */
export const NEUER_COIN_ID = '0199a1b2-0000-7000-8000-0000000000f9'

/** Eine gespeicherte Anfrage an einen schreibenden Endpunkt. */
export interface Schreibanfrage {
  methode: string
  pfad: string
  body: unknown
}

export interface SchreibZustand extends ApiZustand {
  schreiben: Schreibanfrage[]
}

export interface SchreibOptionen {
  /** Verzögerung der schreibenden Antworten in ms (Ladezustand, Doppelklick). */
  verzoegerung?: number
  /** Eigene Vorlage (Version 1 aktiv) statt Standardvorlage (für „Auf Standardvorlage zurücksetzen“). */
  eigeneVorlage?: boolean
  /** Theme vor dem Laden setzen. */
  theme?: 'light' | 'dark'
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

function bodyVon(route: Route): unknown {
  const roh = route.request().postData()
  if (roh === null) return null
  try {
    return JSON.parse(roh)
  } catch {
    return '[multipart]'
  }
}

/** 1 × 1 px PNG (transparent) als Antwort auf den Bildabruf. */
const KLEINES_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

/** Synthetisches Motivbild für das Dateifeld „Neues Motivbild“ (Kopf eines PNG, Inhalt prüft nur der Server). */
export const MOTIV_PNG = {
  name: 'motiv.png',
  mimeType: 'image/png',
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
}

const VERSION_1 = {
  version: 1,
  groesseBytes: 48211,
  hochgeladenAm: '2026-10-09T09:00:00+00:00',
  hochgeladenVon: { id: ADMIN.id, name: ADMIN.name },
  aktiv: true,
}

/**
 * Richtet Lese-Mocks (`richteApiEin`) und schreibende Mocks ein und liefert den Zustand mit allen schreibenden
 * Anfragen. Muss vor `page.goto` laufen.
 */
export async function richteFormularApiEin(
  page: Page,
  me: Me | null,
  { verzoegerung = 0, eigeneVorlage = false, theme }: SchreibOptionen = {},
): Promise<SchreibZustand> {
  if (theme) await setzeTheme(page, theme)
  const basis = await richteApiEin(page, me)
  const zustand: SchreibZustand = Object.assign(basis, { schreiben: [] as Schreibanfrage[] })
  const warte = () => (verzoegerung > 0 ? new Promise((r) => setTimeout(r, verzoegerung)) : Promise.resolve())

  /** Registriert einen schreibenden Mock; andere Methoden fallen an die Lese-Mocks durch. */
  async function schreibend(
    methode: string,
    pfad: (p: string) => boolean,
    antwort: (route: Route, body: unknown) => Promise<void>,
  ) {
    await page.route(
      (url) => pfad(url.pathname),
      async (route) => {
        if (route.request().method() !== methode) return route.fallback()
        const body = bodyVon(route)
        zustand.schreiben.push({ methode, pfad: new URL(route.request().url()).pathname, body })
        zustand.aufrufe.push(`${methode} ${new URL(route.request().url()).pathname}`)
        await warte()
        return antwort(route, body)
      },
    )
  }

  await schreibend(
    'POST',
    (p) => p === '/api/coins',
    (route, body) =>
      json(route, 201, {
        ...COIN,
        ...(body as object),
        id: NEUER_COIN_ID,
        bildUrl: null,
        erstelltAm: '2026-10-08T09:00:00+00:00',
      }),
  )
  await page.route(
    (url) => url.pathname === `/api/coins/${NEUER_COIN_ID}` || url.pathname.startsWith(`/api/coins/${NEUER_COIN_ID}/`),
    (route) => {
      const pfad = new URL(route.request().url()).pathname
      zustand.aufrufe.push(`${route.request().method()} ${pfad}`)
      if (pfad.endsWith('/exemplare')) {
        return json(route, 200, {
          kennzahlen: { auflage: null, ausgegeben: 0, verfuegbar: 0 },
          eintraege: [],
          gesamt: 0,
          seite: 1,
          groesse: 25,
        })
      }
      if (pfad.endsWith('/ausgaben')) return json(route, 200, { eintraege: [], gesamt: 0, seite: 1, groesse: 25 })
      if (pfad.endsWith('/zertifikatsvorlage'))
        return json(route, 200, { quelle: 'standard', aktiveVersion: null, versionen: [] })
      return json(route, 200, { ...COIN, id: NEUER_COIN_ID, name: 'Coin Neu', auflage: null })
    },
  )
  await schreibend(
    'PUT',
    (p) => p === `/api/coins/${COIN.id}`,
    (route, body) => json(route, 200, { ...COIN, ...(body as object) }),
  )
  // Motivbild ersetzen auf „Coin bearbeiten“ (PUT multipart) und Abruf des neuen Bilds (GET, kleines PNG).
  await page.route(
    (url) => url.pathname === `/api/coins/${COIN.id}/bild`,
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      zustand.aufrufe.push(`GET /api/coins/${COIN.id}/bild`)
      return route.fulfill({ status: 200, contentType: 'image/png', body: KLEINES_PNG })
    },
  )
  await schreibend(
    'PUT',
    (p) => p === `/api/coins/${COIN.id}/bild`,
    (route) => json(route, 200, { ...COIN, bildUrl: `/api/coins/${COIN.id}/bild?v=bbbbbbbbbbbbbbbb` }),
  )
  await schreibend(
    'PUT',
    (p) => p === `/api/coins/${COIN.id}/auflage`,
    (route, body) => json(route, 200, { ...COIN, auflage: (body as { auflage: number }).auflage }),
  )
  await schreibend(
    'POST',
    (p) => p === `/api/coins/${COIN.id}/ausgaben`,
    (route, body) =>
      json(route, 201, {
        ...AUSGABE,
        id: '0199a1b2-0000-7000-8000-0000000000e2',
        exemplarNummer: 2,
        zertifikatsnummer: 'C0042-0002',
        hologrammnummer: null,
        empfaenger: {
          name: (body as { empfaengerName: string }).empfaengerName,
          dienstgrad: null,
          dienststelle: null,
        },
      }),
  )
  await schreibend(
    'POST',
    (p) => p === `/api/coins/${COIN.id}/ausgaben/${AUSGABE.id}/storno`,
    (route, body) =>
      json(route, 200, {
        ...AUSGABE,
        storno: {
          am: '2026-10-08T10:00:00+00:00',
          von: { id: ADMIN.id, name: ADMIN.name },
          grund: (body as { grund: string }).grund,
        },
      }),
  )
  await schreibend(
    'PUT',
    (p) => p === `/api/coins/${COIN.id}/ausgaben/${AUSGABE.id}/hologrammnummer`,
    (route, body) =>
      json(route, 200, {
        ...AUSGABE,
        hologrammnummer: (body as { hologrammnummer: string }).hologrammnummer.toUpperCase(),
      }),
  )
  if (eigeneVorlage) {
    await page.route(
      (url) => url.pathname === `/api/coins/${COIN.id}/zertifikatsvorlage`,
      (route) =>
        route.request().method() === 'GET'
          ? json(route, 200, { quelle: 'eigene', aktiveVersion: 1, versionen: [VERSION_1] })
          : route.fallback(),
    )
  }
  await schreibend(
    'POST',
    (p) => p === `/api/coins/${COIN.id}/zertifikatsvorlage/versionen`,
    (route) => json(route, 201, { quelle: 'eigene', aktiveVersion: 1, versionen: [VERSION_1] }),
  )
  await schreibend(
    'POST',
    (p) => p === `/api/coins/${COIN.id}/zertifikatsvorlage/zuruecksetzen`,
    (route) =>
      json(route, 200, { quelle: 'standard', aktiveVersion: null, versionen: [{ ...VERSION_1, aktiv: false }] }),
  )
  await schreibend(
    'PUT',
    (p) => /^\/api\/benutzer\/[^/]+\/(status|rolle)$/.test(p),
    (route, body) =>
      json(route, 200, {
        id: BETRACHTER.id,
        name: BETRACHTER.name,
        email: BETRACHTER.email,
        rolle: 'Betrachter',
        aktiv: (body as { aktiv?: boolean }).aktiv ?? true,
        erstelltAm: '2026-10-02T08:00:00Z',
      }),
  )
  return zustand
}

/** Öffnet eine Seite mit Viewport und wartet auf das h1. */
export async function oeffne(page: Page, pfad: string, h1: string | RegExp, breite = 1280): Promise<void> {
  await page.setViewportSize({ width: breite, height: 900 })
  await page.goto(pfad)
  await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible()
}

/** Drückt Tab, bis `ziel` fokussiert ist (höchstens `max` Schritte). */
export async function tabBis(page: Page, ziel: Locator, max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await ziel.evaluate((el) => el === document.activeElement).catch(() => false)) return
    await page.keyboard.press('Tab')
  }
  await expect(ziel).toBeFocused()
}

/** Prüft, dass das Element nicht von der Aktionsleiste (letztes sticky Element) verdeckt wird. */
export async function nichtVerdeckt(feld: Locator, leiste: Locator): Promise<void> {
  const f = await feld.boundingBox()
  const l = await leiste.boundingBox()
  expect(f, 'Feld ohne Bounding-Box').not.toBeNull()
  expect(l, 'Aktionsleiste ohne Bounding-Box').not.toBeNull()
  const ueberlappt = f!.y + f!.height > l!.y && f!.y < l!.y + l!.height
  expect(
    ueberlappt,
    `Feld (y ${Math.round(f!.y)}–${Math.round(f!.y + f!.height)}) liegt unter der Aktionsleiste (y ${Math.round(l!.y)})`,
  ).toBe(false)
}

/** Tabellencontainer und Dokument scrollen nicht horizontal (AK-30). */
export async function keineAbgeschnitteneTabelle(page: Page): Promise<void> {
  const befunde = await page.evaluate(() => {
    const ergebnisse: string[] = []
    for (const tabelle of document.querySelectorAll('main table')) {
      const huelle = tabelle.parentElement as HTMLElement
      if (huelle.scrollWidth > huelle.clientWidth + 0.5) {
        ergebnisse.push(
          `${tabelle.querySelector('caption')?.textContent ?? 'Tabelle'}: ${huelle.scrollWidth} > ${huelle.clientWidth}`,
        )
      }
    }
    if (document.documentElement.scrollWidth > window.innerWidth) {
      ergebnisse.push(`Dokument: ${document.documentElement.scrollWidth} > ${window.innerWidth}`)
    }
    return ergebnisse
  })
  expect(befunde).toEqual([])
}
