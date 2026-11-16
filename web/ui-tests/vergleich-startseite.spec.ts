import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { ApiZustand } from './hilfen/api.js'
import { oeffneStartseitenFall, STARTSEITEN_FAELLE } from './hilfen/uebersicht.js'

// Feature startseite-listen-pruefung, F6 und AK-45 („Startseiten-Vergleich, eingecheckt“): je 12 Bilder „vorher“ und
// „nachher“ – die 6 Fälle aus 11.2 bei 1280 und 360 px, hell – nach docs/design/vergleich-startseite/
// <praefix>_<fall>_<breite>.png. Das Präfix kommt aus COIN_VERGLEICH (`vorher` oder `nachher`); ohne die Variable wird
// die Spec übersprungen und schreibt nichts. Dieselbe Spec erzeugt beide Stände, damit sie vergleichbar sind (gleiche
// Mocks, gleicher Viewport, ganze Seite). Nur synthetische Daten ohne Personendaten (Testverband, „Coin Neu n“).
// Aufruf: `COIN_VERGLEICH=vorher npx playwright test vergleich-startseite.spec.ts` (vor dem Umbau) bzw.
// `COIN_VERGLEICH=nachher …` (nach dem Umbau).

const PRAEFIX = process.env.COIN_VERGLEICH
const BREITEN = [1280, 360] as const

function ablage(): string {
  // rootDir ist web/ui-tests; Ablage unter docs/design/vergleich-startseite im Repository.
  return path.resolve(test.info().config.rootDir, '..', '..', 'docs', 'design', 'vergleich-startseite')
}

let api: ApiZustand | null = null

test.afterEach(() => {
  if (api) expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
  api = null
})

test.describe('Startseiten-Vergleich vorher/nachher (F6, AK-45)', () => {
  test.skip(PRAEFIX !== 'vorher' && PRAEFIX !== 'nachher', 'Nur mit COIN_VERGLEICH=vorher oder COIN_VERGLEICH=nachher')

  test('erzeugt genau 12 Bilder je Stand (6 Fälle × 2 Breiten, hell)', () => {
    expect(STARTSEITEN_FAELLE).toHaveLength(6)
    expect(STARTSEITEN_FAELLE.length * BREITEN.length).toBe(12)
  })

  for (const fall of STARTSEITEN_FAELLE) {
    for (const breite of BREITEN) {
      test(`${fall.name}_${breite}`, async ({ page }) => {
        test.slow()
        api = await oeffneStartseitenFall(page, fall, { breite, theme: 'light' })
        await expect(page.locator('html')).toHaveClass(/(^|\s)light(\s|$)/)
        // Ruhiger Zustand: kein Fokusring, keine Animation.
        await page.mouse.move(0, 0)
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

        await page.screenshot({
          path: path.join(ablage(), `${PRAEFIX}_${fall.name}_${breite}.png`),
          fullPage: true,
          animations: 'disabled',
        })
      })
    }
  }
})
