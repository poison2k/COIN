import { expect, test, type Page } from '@playwright/test'
import { richteApiEin, SEITEN, setzeTheme, type ApiZustand, type SeitenFall } from './hilfen/api.js'
import { erwarteKeineAxeVerstoesse } from './hilfen/pruefungen.js'

// Feature design-fundament, AK-28, AK-40, AK-41 (ADR-0037 Punkt 1): axe meldet 0 Verstöße der Stufe serious/critical
// auf allen Seiten aus Abschnitt 11.2 (hell und dunkel bei 1280 px, hell bei 360 px), mit geöffnetem Mobilmenü und auf
// der Bausteinseite mit Dialog und Toast. API und IdP sind gemockt, alle Daten synthetisch.

let api: ApiZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

async function oeffne(page: Page, fall: SeitenFall, theme: 'light' | 'dark', breite: number): Promise<void> {
  await page.setViewportSize({ width: breite, height: 900 })
  await setzeTheme(page, theme)
  api = await richteApiEin(page, fall.als)
  await page.goto(fall.pfad)
  await fall.bereit(page)
  await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`))
}

for (const fall of SEITEN) {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: ${fall.name} (${theme}, 1280 px) ohne serious/critical`, async ({ page }) => {
      test.slow()
      await oeffne(page, fall, theme, 1280)

      await erwarteKeineAxeVerstoesse(page)
    })
  }

  test(`axe: ${fall.name} (light, 360 px) ohne serious/critical`, async ({ page }) => {
    test.slow()
    await oeffne(page, fall, 'light', 360)

    await erwarteKeineAxeVerstoesse(page)
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`axe: geöffnetes Mobilmenü (${theme}, 360 px) ohne serious/critical`, async ({ page }) => {
    await oeffne(
      page,
      SEITEN.find((s) => s.name === 'start')!,
      theme,
      360,
    )

    await page.getByRole('button', { name: 'Seitenleiste ein-/ausblenden' }).click()
    await expect(page.getByRole('dialog', { name: 'Seitenleiste' })).toBeVisible()

    await erwarteKeineAxeVerstoesse(page)
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`axe: Bausteinseite mit geöffnetem Dialog (${theme}) ohne serious/critical`, async ({ page }) => {
    await oeffne(
      page,
      SEITEN.find((s) => s.name === 'bausteine')!,
      theme,
      1280,
    )

    await abschnittsButton(page, /^Dialog\b/).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await erwarteKeineAxeVerstoesse(page)
  })

  test(`axe: Bausteinseite mit sichtbarem Toast (${theme}) ohne serious/critical`, async ({ page }) => {
    await oeffne(
      page,
      SEITEN.find((s) => s.name === 'bausteine')!,
      theme,
      1280,
    )

    await abschnittsButton(page, /^Toast\b/).click()
    const region = page.getByRole('region', { name: 'Benachrichtigungen' })
    await expect(region.getByRole('button', { name: 'Meldung schließen' }).first()).toBeVisible()

    await erwarteKeineAxeVerstoesse(page)
  })
}

/** Erster Button nach der Abschnittsüberschrift (h2) auf der Bausteinseite. */
function abschnittsButton(page: Page, ueberschrift: RegExp) {
  return page
    .getByRole('heading', { level: 2, name: ueberschrift })
    .locator('xpath=following::*[self::button or @role="button"][1]')
}

test.describe('Aktiver Menüpunkt nicht nur über Farbe (AK-28, AK-40)', () => {
  async function stil(page: Page, name: string) {
    return page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('link', { name, exact: true })
      .evaluate((el) => {
        const s = getComputedStyle(el)
        const vor = getComputedStyle(el, '::before')
        const nach = getComputedStyle(el, '::after')
        const balken = [vor, nach].some(
          (p) => p.content !== 'none' && p.content !== 'normal' && parseFloat(p.width) >= 2 && p.display !== 'none',
        )
        return {
          gewicht: Number(s.fontWeight),
          balken:
            balken || parseFloat(s.borderLeftWidth) >= 2 || (s.boxShadow !== 'none' && s.boxShadow.includes('inset')),
        }
      })
  }

  test('hebt den aktiven Eintrag mit Schriftgewicht ≥ 600 hervor, den inaktiven nicht', async ({ page }) => {
    await oeffne(
      page,
      SEITEN.find((s) => s.name === 'katalog')!,
      'light',
      1280,
    )

    expect((await stil(page, 'Katalog')).gewicht).toBeGreaterThanOrEqual(600)
    expect((await stil(page, 'Startseite')).gewicht).toBeLessThan(600)
  })

  test('zeigt am aktiven Eintrag einen Balken, am inaktiven nicht', async ({ page }) => {
    await oeffne(
      page,
      SEITEN.find((s) => s.name === 'katalog')!,
      'light',
      1280,
    )

    expect((await stil(page, 'Katalog')).balken).toBe(true)
    expect((await stil(page, 'Startseite')).balken).toBe(false)
  })
})

test.describe('Links im Fließtext sind unterstrichen (AK-40)', () => {
  for (const name of ['kein-zugriff', 'abgemeldet', 'bausteine', 'start']) {
    test(`unterstreicht Links in Absätzen auf „${name}“`, async ({ page }) => {
      await oeffne(
        page,
        SEITEN.find((s) => s.name === name)!,
        'light',
        1280,
      )

      const ohneUnterstreichung = await page.locator('main p a').evaluateAll((links) =>
        links
          .filter((a) => (a as HTMLElement).offsetParent !== null)
          .filter((a) => !getComputedStyle(a).textDecorationLine.includes('underline'))
          .map((a) => a.textContent?.trim()),
      )
      expect(ohneUnterstreichung).toEqual([])
    })
  }
})
