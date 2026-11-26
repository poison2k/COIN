import { expect, type Locator, type Page, type Route } from '@playwright/test'
import { filtereAudit } from './aenderungsprotokoll.js'
import { ADMIN, BETRACHTER, OHNE_ROLLE, richteApiEin, setzeTheme, type ApiZustand } from './api.js'

// Zustände des Änderungsprotokolls für Barrierefreiheit, Responsivität und Screenshots (Feature nacharbeiten-audit-filter,
// AK-32 bis AK-34): alle Filter aktiv, leer mit Filter, 400-Feldfehler und Ladefehler. Baut auf `richteApiEin` auf
// (Catch-all, Anmeldung als Administrator, GET /api/audit/aktionen); GET /api/audit wird hier überschrieben.
// Alle Daten sind synthetisch.

export type ProtokollZustand = 'alleFilter' | 'leerMitFilter' | 'feldfehler' | 'ladefehler'

export const PROTOKOLL_ZUSTAENDE: readonly ProtokollZustand[] = [
  'alleFilter',
  'leerMitFilter',
  'feldfehler',
  'ladefehler',
]

export const BIS_FEHLER = 'Das Datum „bis“ darf nicht vor dem Datum „von“ liegen.'

/** Einträge in Berliner Kalendertagen (Rolle und Status, drei Benutzer). */
export const PROTOKOLL_EINTRAEGE = [
  {
    id: '0199a1b2-0000-7000-8000-00000000d004',
    zeitpunkt: '2026-10-20T08:00:00Z',
    akteur: { id: ADMIN.id, name: ADMIN.name },
    benutzer: { id: BETRACHTER.id, name: BETRACHTER.name },
    art: 'Status',
    alt: 'aktiv',
    neu: 'deaktiviert',
  },
  {
    id: '0199a1b2-0000-7000-8000-00000000d003',
    zeitpunkt: '2026-10-10T08:00:00Z',
    akteur: { id: ADMIN.id, name: ADMIN.name },
    benutzer: { id: BETRACHTER.id, name: BETRACHTER.name },
    art: 'Rolle',
    alt: 'keine',
    neu: 'Betrachter',
  },
  {
    id: '0199a1b2-0000-7000-8000-00000000d002',
    zeitpunkt: '2026-09-15T08:00:00Z',
    akteur: { id: ADMIN.id, name: ADMIN.name },
    benutzer: { id: OHNE_ROLLE.id, name: OHNE_ROLLE.name },
    art: 'Status',
    alt: 'aktiv',
    neu: 'deaktiviert',
  },
  {
    id: '0199a1b2-0000-7000-8000-00000000d001',
    zeitpunkt: '2026-09-01T08:00:00Z',
    akteur: null,
    benutzer: { id: ADMIN.id, name: ADMIN.name },
    art: 'Rolle',
    alt: 'keine',
    neu: 'Administrator',
  },
]

export interface ProtokollMock {
  /** Alle Abrufe von GET /api/audit in Reihenfolge. */
  abrufe: URL[]
  /** Die nächsten `n` Abrufe antworten mit 500. */
  fehler: (n: number) => void
  /** Die nächsten `n` Abrufe antworten mit 400 und den angegebenen Feldfehlern. */
  feldfehler: (n: number, errors: Record<string, string[]>) => void
}

/** Überschreibt GET /api/audit mit den Einträgen oben (Filter wie die API) und zeichnet die Abrufe auf. */
export async function mockeProtokoll(page: Page, eintraege = PROTOKOLL_EINTRAEGE): Promise<ProtokollMock> {
  const abrufe: URL[] = []
  let fehler = 0
  let feldfehler: { n: number; errors: Record<string, string[]> } = { n: 0, errors: {} }
  await page.route(
    (url) => url.pathname === '/api/audit',
    async (route: Route) => {
      const url = new URL(route.request().url())
      abrufe.push(url)
      if (fehler > 0) {
        fehler--
        return route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          body: JSON.stringify({ title: 'Interner Fehler', status: 500 }),
        })
      }
      if (feldfehler.n > 0) {
        feldfehler = { ...feldfehler, n: feldfehler.n - 1 }
        return route.fulfill({
          status: 400,
          contentType: 'application/problem+json',
          body: JSON.stringify({ title: 'Ungültige Anfrage', status: 400, errors: feldfehler.errors }),
        })
      }
      const treffer = filtereAudit(eintraege, url.searchParams)
      const seite = Number(url.searchParams.get('seite') ?? '1')
      const groesse = Number(url.searchParams.get('groesse') ?? '25')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          eintraege: treffer.slice((seite - 1) * groesse, seite * groesse),
          gesamt: treffer.length,
          seite,
          groesse,
        }),
      })
    },
  )
  return {
    abrufe,
    fehler: (n) => (fehler = n),
    feldfehler: (n, errors) => (feldfehler = { n, errors }),
  }
}

export const protokollPanel = (page: Page): Locator => page.getByRole('tabpanel', { name: 'Änderungsprotokoll' })

/** URL je Zustand (Filter stehen in der URL, ADR-0045 Punkt 4). */
export function protokollUrl(zustand: ProtokollZustand): string {
  switch (zustand) {
    case 'alleFilter':
      return `/benutzerverwaltung?reiter=aenderungsprotokoll&von=2026-10-01&bis=2026-10-31&aktion=Rolle,Status&benutzer=${BETRACHTER.id}`
    case 'leerMitFilter':
      return '/benutzerverwaltung?reiter=aenderungsprotokoll&von=2027-01-01'
    case 'feldfehler':
      return '/benutzerverwaltung?reiter=aenderungsprotokoll&von=2026-10-31&bis=2026-10-01'
    case 'ladefehler':
      return '/benutzerverwaltung?reiter=aenderungsprotokoll'
  }
}

/** Wartet, bis der Zustand sichtbar ist. */
export async function warteAufProtokoll(page: Page, zustand: ProtokollZustand): Promise<void> {
  const panel = protokollPanel(page)
  switch (zustand) {
    case 'alleFilter':
      await expect(panel.getByRole('list', { name: 'Aktive Filter' })).toBeVisible()
      await expect(
        panel
          .getByRole('table', { name: 'Änderungsprotokoll' })
          .or(panel.getByRole('list', { name: 'Änderungsprotokoll' })),
      ).toBeVisible()
      break
    case 'leerMitFilter':
      await expect(panel.getByRole('heading', { level: 3, name: 'Keine Einträge für diese Filter.' })).toBeVisible()
      break
    case 'feldfehler':
      await expect(panel.getByLabel(/^Bis/)).toHaveAttribute('aria-invalid', 'true')
      break
    case 'ladefehler':
      await expect(panel.getByRole('alert')).toContainText('Änderungsprotokoll konnte nicht geladen werden.')
      break
  }
}

/** Richtet Anmeldung, Mocks und Theme ein und öffnet den Zustand bei der angegebenen Breite. */
export async function oeffneProtokollZustand(
  page: Page,
  zustand: ProtokollZustand,
  {
    breite = 1280,
    theme = 'light',
    onApi,
  }: {
    breite?: number
    theme?: 'light' | 'dark'
    /** Erhält den API-Zustand sofort (für die Prüfung im afterEach, auch wenn der Zustand nicht erscheint). */
    onApi?: (api: ApiZustand) => void
  } = {},
): Promise<{ api: ApiZustand; protokoll: ProtokollMock }> {
  await page.setViewportSize({ width: breite, height: 900 })
  await setzeTheme(page, theme)
  const api = await richteApiEin(page, ADMIN)
  onApi?.(api)
  const protokoll = await mockeProtokoll(page)
  if (zustand === 'ladefehler') protokoll.fehler(99)
  if (zustand === 'feldfehler') protokoll.feldfehler(99, { bis: [BIS_FEHLER] })
  await page.goto(protokollUrl(zustand))
  await warteAufProtokoll(page, zustand)
  return { api, protokoll }
}
