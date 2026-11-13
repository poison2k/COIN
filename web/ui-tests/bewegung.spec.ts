import { expect, test, type Locator } from '@playwright/test'
import { richteApiEin, SEITEN, type ApiZustand } from './hilfen/api.js'

// Feature design-fundament, AK-8 (ADR-0035 Punkt 10): Bei prefers-reduced-motion: reduce sind animation-duration und
// transition-duration aller Elemente ≤ 0,01 ms. Stichprobe: Icons des Theme-Umschalters, Sidebar und Mobilmenü (Sheet).

test.use({ reducedMotion: 'reduce' })

let api: ApiZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

const START = SEITEN.find((s) => s.name === 'start')!

/** Längste Animations- und Übergangsdauer (ms) des Elements und seiner Nachfahren. */
async function laengsteDauer(bereich: Locator): Promise<number> {
  return bereich.evaluate((wurzel) => {
    const inMs = (wert: string) =>
      Math.max(
        0,
        ...wert
          .split(',')
          .map((t) => t.trim())
          .map((t) => (t.endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000)),
      )
    const elemente = [wurzel, ...wurzel.querySelectorAll('*')]
    return Math.max(
      0,
      ...elemente.flatMap((el) => {
        const s = getComputedStyle(el)
        return [inMs(s.animationDuration), inMs(s.transitionDuration)]
      }),
    )
  })
}

test('verkürzt Übergänge am Theme-Umschalter und seinen Icons auf höchstens 0,01 ms', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  api = await richteApiEin(page, START.als)
  await page.goto('/')
  await START.bereit(page)

  expect(await laengsteDauer(page.getByRole('button', { name: 'Farbschema wählen' }))).toBeLessThanOrEqual(0.01)
})

test('verkürzt Übergänge der Desktop-Seitenleiste auf höchstens 0,01 ms', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  api = await richteApiEin(page, START.als)
  await page.goto('/')
  await START.bereit(page)

  expect(await laengsteDauer(page.locator('[data-slot="sidebar"]'))).toBeLessThanOrEqual(0.01)
})

test('verkürzt Animationen und Übergänge des Mobilmenüs (Sheet) auf höchstens 0,01 ms', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  api = await richteApiEin(page, START.als)
  await page.goto('/')
  await START.bereit(page)

  await page.getByRole('button', { name: 'Seitenleiste ein-/ausblenden' }).click()
  const dialog = page.getByRole('dialog', { name: 'Seitenleiste' })
  await expect(dialog).toBeVisible()

  expect(await laengsteDauer(dialog)).toBeLessThanOrEqual(0.01)
})

test('verkürzt Übergänge auf der ganzen Startseite auf höchstens 0,01 ms', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  api = await richteApiEin(page, START.als)
  await page.goto('/')
  await START.bereit(page)

  expect(await laengsteDauer(page.locator('body'))).toBeLessThanOrEqual(0.01)
})
