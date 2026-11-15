import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { richteApiEin, SEITEN, setzeTheme, type ApiZustand, type Me } from './hilfen/api.js'
import { COIN } from './hilfen/formulare.js'
import {
  ADMIN,
  ansichtsKnopf,
  BETRACHTER,
  mockeAudit,
  mockeKatalog,
  mockePruefung,
  mockeStartseite,
  oeffneAuditLog,
  pruefePerEnter,
  SACHBEARBEITER,
  UEBERSCHRIFT,
  warteAufBilder,
  type Ergebnis,
} from './hilfen/uebersicht.js'

// Feature startseite-listen-pruefung, AK-45: Screenshots für die Sichtprüfung durch den Developer. Nur mit
// COIN_SCREENSHOTS=1; schreibt nach web/test-results/screenshots-uebersicht/<ansicht>_<breite>_<hell|dunkel>.png (per
// web/.gitignore ausgeschlossen, nicht eingecheckt). Jede Seite aus 4.5 im Normalzustand, dazu Startseite leer und
// Fehler, Katalog Tabelle, Karten, leer, kein Treffer und Fehler, Prüfmaske leer und mit jedem der vier Ergebnisse
// (Betrachter und Sachbearbeiter), Audit-Log mit Filter, leer und Fehler; jeweils 360, 768 und 1280 px, hell und dunkel.
// Nur gemockte, synthetische Daten („Testperson A“, „Dienststelle Beispiel“).
// Aufruf nur dieser Spec: `COIN_SCREENSHOTS=1 npx playwright test screenshots-uebersicht.spec.ts` (sonst überschreibt
// screenshots.spec.ts die eingecheckten Bilder in docs/design/ablage). Playwright leert test-results zu Beginn jedes
// Laufs; die Bilder direkt danach ansehen. Die Startseiten-Vergleichsbilder (F6) erzeugt vergleich-startseite.spec.ts.

const ERZEUGEN = process.env.COIN_SCREENSHOTS === '1'
const BREITEN = [360, 768, 1280] as const
const THEMES = [
  ['light', 'hell'],
  ['dark', 'dunkel'],
] as const

function ablage(): string {
  // rootDir ist web/ui-tests; Ablage unter web/test-results/screenshots-uebersicht.
  return path.resolve(test.info().config.rootDir, '..', 'test-results', 'screenshots-uebersicht')
}

interface Ansicht {
  name: string
  pfad: string
  als: Me | null
  /** Zusätzliche Mocks nach `richteApiEin` (haben Vorrang). */
  mocks?: (page: Page) => Promise<unknown>
  /** Bringt die Seite in den gewünschten Zustand. */
  zustand: (page: Page) => Promise<void>
}

const h1 = async (page: Page, name: string | RegExp) =>
  expect(page.getByRole('heading', { level: 1, name })).toBeVisible()

/** Normalzustand jeder Seite aus 4.5 (Seitenliste des Design-Fundaments, Coin-Detail je Reiter). */
const NORMAL: Ansicht[] = [
  ...SEITEN.filter((s) => s.name !== 'coin-detail' && s.name !== 'bausteine').map((s) => ({
    name: s.name,
    pfad: s.pfad,
    als: s.als,
    zustand: s.bereit,
  })),
  ...(['stammdaten', 'exemplare', 'ausgaben', 'vorlage'] as const).map((reiter) => ({
    name: `coin-detail-${reiter}`,
    pfad: `/coins/${COIN.id}?reiter=${reiter}`,
    als: ADMIN,
    zustand: async (page: Page) => {
      await h1(page, COIN.name)
      await expect(page.getByRole('tabpanel')).toBeVisible()
    },
  })),
  {
    name: 'benutzerverwaltung-audit',
    pfad: '/benutzerverwaltung',
    als: ADMIN,
    mocks: (page) => mockeAudit(page),
    zustand: async (page) => {
      await oeffneAuditLog(page)
      await expect(page.getByRole('tabpanel', { name: 'Audit-Log' }).getByRole('table')).toBeVisible()
    },
  },
  {
    name: 'startseite-verwaltung-vorschau',
    pfad: '/verwaltung/startseite',
    als: ADMIN,
    zustand: async (page) => {
      await h1(page, 'Startseite verwalten')
      await page.getByRole('tab', { name: 'Vorschau' }).click()
      await expect(page.getByRole('region', { name: 'Vorschau der Startseite' })).toBeVisible()
    },
  },
]

const STARTSEITE: Ansicht[] = [
  {
    name: 'start-alle-bloecke',
    pfad: '/',
    als: BETRACHTER,
    mocks: (page) =>
      mockeStartseite(page, { bloecke: ['kopf', 'infotext', 'kennzahlen', 'neueste', 'meistausgegeben'] }),
    zustand: async (page) => {
      await expect(page.getByRole('region', { name: 'Kennzahlen' })).toBeVisible()
      await warteAufBilder(page)
    },
  },
  {
    name: 'start-leer',
    pfad: '/',
    als: BETRACHTER,
    mocks: (page) =>
      mockeStartseite(page, { bloecke: ['infotext', 'kennzahlen', 'neueste', 'meistausgegeben'], leer: true }),
    zustand: async (page) => {
      await expect(page.getByRole('region', { name: 'Neueste Coins' })).toBeVisible()
    },
  },
  {
    name: 'start-fehler',
    pfad: '/',
    als: BETRACHTER,
    mocks: (page) => mockeStartseite(page, { bloecke: 500 }),
    zustand: async (page) => {
      await expect(page.getByRole('alert')).toBeVisible()
    },
  },
]

const KATALOG: Ansicht[] = [
  {
    name: 'katalog-tabelle',
    pfad: '/coins',
    als: ADMIN,
    mocks: (page) => mockeKatalog(page),
    zustand: async (page) => {
      await expect(page.getByRole('table', { name: 'Coins' })).toBeVisible()
    },
  },
  {
    name: 'katalog-karten',
    pfad: '/coins',
    als: ADMIN,
    mocks: (page) => mockeKatalog(page),
    zustand: async (page) => {
      await ansichtsKnopf(page, 'Karten').click()
      await expect(page.getByRole('main').getByRole('list', { name: 'Coins' })).toBeVisible()
      await warteAufBilder(page)
    },
  },
  {
    name: 'katalog-leer',
    pfad: '/coins',
    als: ADMIN,
    mocks: (page) => mockeKatalog(page, { coins: [] }),
    zustand: async (page) => {
      await expect(page.getByText('Noch keine Coins erfasst.')).toBeVisible()
    },
  },
  {
    name: 'katalog-kein-treffer',
    pfad: '/coins?suche=gibtesnicht',
    als: ADMIN,
    mocks: (page) => mockeKatalog(page),
    zustand: async (page) => {
      await expect(page.getByText('Keine Coins gefunden.')).toBeVisible()
    },
  },
  {
    name: 'katalog-fehler',
    pfad: '/coins',
    als: ADMIN,
    mocks: (page) => mockeKatalog(page, { fehler: 5 }),
    zustand: async (page) => {
      await expect(page.getByRole('alert').filter({ hasText: 'Coins konnten nicht geladen werden.' })).toBeVisible()
    },
  },
]

const PRUEFMASKE: Ansicht[] = [
  ...(
    [
      ['betrachter', BETRACHTER],
      ['sachbearbeiter', SACHBEARBEITER],
    ] as const
  ).flatMap(([rolle, me]) => [
    {
      name: `pruefung-leer-${rolle}`,
      pfad: '/pruefung',
      als: me,
      mocks: (page: Page) => mockePruefung(page),
      zustand: async (page: Page) => h1(page, 'Zertifikat prüfen'),
    },
    ...(Object.keys(UEBERSCHRIFT) as Ergebnis[]).map((ergebnis) => ({
      name: `pruefung-${ergebnis}-${rolle}`,
      pfad: '/pruefung',
      als: me,
      mocks: (page: Page) => mockePruefung(page),
      zustand: async (page: Page) => pruefePerEnter(page, ergebnis),
    })),
  ]),
]

const AUDIT: Ansicht[] = [
  {
    name: 'audit-filter',
    pfad: '/benutzerverwaltung',
    als: ADMIN,
    mocks: (page) => mockeAudit(page),
    zustand: async (page) => {
      await oeffneAuditLog(page)
      const panel = page.getByRole('tabpanel', { name: 'Audit-Log' })
      const feld = panel.getByRole('combobox', { name: /^Benutzer/ })
      await feld.click()
      await feld.pressSequentially('Betr')
      await page.getByRole('option', { name: BETRACHTER.name }).click()
      await expect(panel.getByRole('list', { name: 'Aktive Filter' })).toBeVisible()
    },
  },
  {
    name: 'audit-leer',
    pfad: '/benutzerverwaltung',
    als: ADMIN,
    mocks: (page) => mockeAudit(page, { leer: true }),
    zustand: async (page) => {
      await oeffneAuditLog(page)
      await expect(page.getByText('Noch keine Einträge.')).toBeVisible()
    },
  },
  {
    name: 'audit-fehler',
    pfad: '/benutzerverwaltung',
    als: ADMIN,
    mocks: (page) => mockeAudit(page, { fehler: 5 }),
    zustand: async (page) => {
      await oeffneAuditLog(page)
      await expect(page.getByRole('tabpanel', { name: 'Audit-Log' }).getByRole('alert')).toBeVisible()
    },
  },
]

const ANSICHTEN: Ansicht[] = [...NORMAL, ...STARTSEITE, ...KATALOG, ...PRUEFMASKE, ...AUDIT]

let api: ApiZustand | null = null

test.afterEach(() => {
  if (api) expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
  api = null
})

test.describe('Screenshots Startseite, Listen und Prüfmaske (AK-45)', () => {
  test.skip(!ERZEUGEN, 'Nur mit COIN_SCREENSHOTS=1')

  for (const ansicht of ANSICHTEN) {
    for (const breite of BREITEN) {
      for (const [theme, bezeichnung] of THEMES) {
        test(`${ansicht.name}_${breite}_${bezeichnung}`, async ({ page }) => {
          test.slow()
          await page.setViewportSize({ width: breite, height: 900 })
          await setzeTheme(page, theme)
          api = await richteApiEin(page, ansicht.als)
          await ansicht.mocks?.(page)
          await page.goto(ansicht.pfad)
          await ansicht.zustand(page)
          await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`))

          await page.screenshot({
            path: path.join(ablage(), `${ansicht.name}_${breite}_${bezeichnung}.png`),
            fullPage: true,
          })
        })
      }
    }
  }
})
