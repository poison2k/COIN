import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  mockeProtokoll,
  protokollUrl,
  warteAufProtokoll,
  type ProtokollZustand,
} from './hilfen/aenderungsprotokoll-zustaende.js'
import { richteApiEin, setzeTheme, type ApiZustand, type Me } from './hilfen/api.js'
import {
  ADMIN,
  ansichtsKnopf,
  BETRACHTER,
  KOPF_TITEL,
  mockeKatalog,
  mockePruefung,
  mockeStartseite,
  pruefePerEnter,
  UEBERSCHRIFT,
  warteAufBilder,
  type Ergebnis,
} from './hilfen/uebersicht.js'

// Feature nacharbeiten-audit-filter, AK-34: Screenshots für die Sichtprüfung durch den Developer. Nur mit
// COIN_SCREENSHOTS=1; schreibt nach web/test-results/screenshots-nacharbeiten/<ansicht>_<breite>_<hell|dunkel>.png (per
// web/.gitignore ausgeschlossen, nicht eingecheckt). Ansichten: Katalog Tabelle und Karten, Startseiten-Kopf, Prüfmaske
// mit den vier Ergebnissen und Änderungsprotokoll mit Filtern (dazu leer mit Filter und 400-Feldfehler); jeweils 360,
// 768 und 1280 px, hell und dunkel. Die Kartenvarianten A und B aus 4.5 haben keinen Schalter im Code; für den Vergleich
// erzeugt der Developer die Bilder je Variante mit dieser Spec (Ist-Stand der jeweiligen Umsetzung).
// Aufruf: `COIN_SCREENSHOTS=1 npx playwright test screenshots-nacharbeiten.spec.ts --workers=1`. Playwright leert
// test-results zu Beginn jedes Laufs; die Bilder direkt danach ansehen. Nur synthetische Daten.

const ERZEUGEN = process.env.COIN_SCREENSHOTS === '1'
const BREITEN = [360, 768, 1280] as const
const THEMES = [
  ['light', 'hell'],
  ['dark', 'dunkel'],
] as const

function ablage(): string {
  // rootDir ist web/ui-tests; Ablage unter web/test-results/screenshots-nacharbeiten.
  return path.resolve(test.info().config.rootDir, '..', 'test-results', 'screenshots-nacharbeiten')
}

interface Ansicht {
  name: string
  pfad: string
  als: Me | null
  mocks?: (page: Page) => Promise<unknown>
  zustand: (page: Page) => Promise<void>
}

/**
 * Lädt Bilder mit loading="lazy": scrollt schrittweise bis zum Seitenende und zurück, damit auch Bilder unterhalb des
 * sichtbaren Bereichs laden, bevor `warteAufBilder` auf alle Bilder wartet.
 */
async function scrolleDurchSeite(page: Page): Promise<void> {
  const hoehe = await page.evaluate(() => document.documentElement.scrollHeight)
  const schritt = page.viewportSize()?.height ?? 900
  for (let y = 0; y < hoehe; y += schritt) {
    await page.evaluate((ziel) => window.scrollTo(0, ziel), y)
    await page.waitForTimeout(50)
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await warteAufBilder(page)
  await page.evaluate(() => window.scrollTo(0, 0))
}

const katalogBereit = async (page: Page) => {
  await expect(
    page
      .getByRole('main')
      .getByText(/gefunden/)
      .first(),
  ).toBeVisible()
}

const KATALOG: Ansicht[] = [
  {
    name: 'katalog-tabelle',
    pfad: '/coins',
    als: ADMIN,
    mocks: (page) => mockeKatalog(page),
    zustand: async (page) => {
      await katalogBereit(page)
      await scrolleDurchSeite(page)
    },
  },
  {
    name: 'katalog-karten',
    pfad: '/coins',
    als: ADMIN,
    mocks: (page) => mockeKatalog(page),
    zustand: async (page) => {
      await katalogBereit(page)
      await ansichtsKnopf(page, 'Karten').click()
      await expect(page.getByRole('main').getByRole('list', { name: 'Coins' })).toBeVisible()
      await scrolleDurchSeite(page)
    },
  },
]

const STARTSEITE: Ansicht[] = [
  {
    name: 'startseite-kopf',
    pfad: '/',
    als: BETRACHTER,
    mocks: (page) => mockeStartseite(page, { bloecke: ['kopf', 'infotext', 'kennzahlen'] }),
    zustand: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: KOPF_TITEL })).toBeVisible()
      await warteAufBilder(page)
    },
  },
]

const PRUEFMASKE: Ansicht[] = (Object.keys(UEBERSCHRIFT) as Ergebnis[]).map((ergebnis) => ({
  name: `pruefung-${ergebnis}`,
  pfad: '/pruefung',
  als: BETRACHTER,
  mocks: (page: Page) => mockePruefung(page),
  zustand: async (page: Page) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Zertifikat prüfen' })).toBeVisible()
    await pruefePerEnter(page, ergebnis)
  },
}))

const PROTOKOLL: Ansicht[] = (['alleFilter', 'leerMitFilter', 'feldfehler'] as ProtokollZustand[]).map((zustand) => ({
  name: `aenderungsprotokoll-${zustand}`,
  pfad: protokollUrl(zustand),
  als: ADMIN,
  mocks: async (page: Page) => {
    const protokoll = await mockeProtokoll(page)
    if (zustand === 'feldfehler') {
      protokoll.feldfehler(99, { bis: ['Das Datum „bis“ darf nicht vor dem Datum „von“ liegen.'] })
    }
  },
  zustand: (page: Page) => warteAufProtokoll(page, zustand),
}))

const ANSICHTEN: Ansicht[] = [...KATALOG, ...STARTSEITE, ...PRUEFMASKE, ...PROTOKOLL]

let api: ApiZustand | null = null

test.afterEach(() => {
  if (api) expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
  api = null
})

test.describe('Screenshots Nacharbeiten (AK-34)', () => {
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
