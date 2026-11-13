import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { richteApiEin, SEITEN, setzeTheme, type ApiZustand } from './hilfen/api.js'

// Feature design-fundament, AK-45 (D7): Screenshots der Hauptseiten für die Sichtprüfung. Nur mit COIN_SCREENSHOTS=1
// werden sie nach docs/design/ablage/<seite>_<breite>_<hell|dunkel>.png geschrieben (6 Seiten × 3 Breiten × 2 Themes
// = 36 Dateien); sonst wird die Erzeugung übersprungen. Nur gemockte, synthetische Daten.

const ERZEUGEN = process.env.COIN_SCREENSHOTS === '1'
const SEITEN_NAMEN = ['start', 'katalog', 'coin-detail', 'pruefung', 'benutzerverwaltung', 'bausteine'] as const
const BREITEN = [360, 768, 1280] as const
const THEMES = [
  ['light', 'hell'],
  ['dark', 'dunkel'],
] as const

function ablage(): string {
  // rootDir ist web/ui-tests; die Ablage liegt im Repository unter docs/design/ablage.
  return path.resolve(test.info().config.rootDir, '..', '..', 'docs', 'design', 'ablage')
}

let api: ApiZustand | null = null

test.afterEach(() => {
  if (api) expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
  api = null
})

test.describe('Screenshots erzeugen (AK-45)', () => {
  test.skip(!ERZEUGEN, 'Nur mit COIN_SCREENSHOTS=1')

  for (const name of SEITEN_NAMEN) {
    for (const breite of BREITEN) {
      for (const [theme, bezeichnung] of THEMES) {
        test(`${name}_${breite}_${bezeichnung}`, async ({ page }) => {
          test.slow()
          const fall = SEITEN.find((s) => s.name === name)!
          await page.setViewportSize({ width: breite, height: 900 })
          await setzeTheme(page, theme)
          api = await richteApiEin(page, fall.als)
          await page.goto(fall.pfad)
          await fall.bereit(page)

          await page.screenshot({ path: path.join(ablage(), `${name}_${breite}_${bezeichnung}.png`), fullPage: true })
        })
      }
    }
  }
})

test.describe('Screenshots im Repository (AK-45)', () => {
  test.skip(ERZEUGEN, 'Wird beim Erzeugen nicht geprüft')

  test('enthält genau die 36 erwarteten Dateien in docs/design/ablage', () => {
    const erwartet = SEITEN_NAMEN.flatMap((name) =>
      BREITEN.flatMap((breite) => THEMES.map(([, bezeichnung]) => `${name}_${breite}_${bezeichnung}.png`)),
    ).sort()
    const vorhanden = existsSync(ablage())
      ? readdirSync(ablage())
          .filter((d) => d.endsWith('.png'))
          .sort()
      : []

    expect(vorhanden).toEqual(erwartet)
  })
})
