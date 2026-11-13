import { expect, test, type Locator, type Page } from '@playwright/test'
import { richteApiEin, SEITEN, WEB, type ApiZustand } from './hilfen/api.js'
import { fehlenderFokusIndikator } from './hilfen/pruefungen.js'

// Feature design-fundament, AK-5, AK-26, AK-29, AK-30, AK-42: Bedienung der App-Shell nur per Tastatur als
// Administrator bei 1280 px (Skip-Link, Hauptnavigation, Seitenleiste, Farbschema, Abmelden) und bei 360 px
// (Mobilmenü). Bei jedem Tab-Schritt hat das fokussierte Element einen sichtbaren Fokusindikator (AK-5).

let api: ApiZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

const START = SEITEN.find((s) => s.name === 'start')!

async function oeffneStart(page: Page, breite = 1280): Promise<void> {
  await page.setViewportSize({ width: breite, height: 900 })
  api = await richteApiEin(page, START.als)
  await page.goto('/')
  await START.bereit(page)
}

/** Drückt Tab, bis das Ziel den Fokus hat; prüft bei jedem Schritt den sichtbaren Fokus (AK-5). */
async function tabBis(page: Page, ziel: Locator, maximal = 40): Promise<void> {
  for (let i = 0; i < maximal; i++) {
    await page.keyboard.press('Tab')
    expect(await fehlenderFokusIndikator(page), `Tab-Schritt ${i + 1} ohne sichtbaren Fokus`).toBeNull()
    if (await ziel.evaluate((el) => el === document.activeElement)) return
  }
  throw new Error(`Ziel nach ${maximal} Tab-Schritten nicht erreicht`)
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Hauptnavigation' })
const umschalter = (page: Page) => page.getByRole('button', { name: 'Seitenleiste ein-/ausblenden' })

/** Desktop-Seitenleiste eingeklappt: data-state „collapsed“ und außerhalb des Viewports (offcanvas, D5). */
async function erwarteEingeklappt(page: Page): Promise<void> {
  await expect(page.locator('[data-slot="sidebar"][data-state]')).toHaveAttribute('data-state', 'collapsed')
  await expect(nav(page)).not.toBeInViewport()
}

async function erwarteAusgeklappt(page: Page): Promise<void> {
  await expect(page.locator('[data-slot="sidebar"][data-state]')).toHaveAttribute('data-state', 'expanded')
  await expect(nav(page)).toBeInViewport()
}

test.describe('Skip-Link (AK-26)', () => {
  test('erhält beim ersten Tab den Fokus und ist dann sichtbar', async ({ page }) => {
    await oeffneStart(page)

    await page.keyboard.press('Tab')

    const link = page.getByRole('link', { name: 'Zum Inhalt springen' })
    await expect(link).toBeFocused()
    await expect(link).toBeInViewport()
    const box = await link.boundingBox()
    expect(box!.width).toBeGreaterThan(1)
    expect(box!.height).toBeGreaterThan(1)
    expect(await fehlenderFokusIndikator(page)).toBeNull()
  })

  test('setzt per Enter den Fokus auf main#inhalt', async ({ page }) => {
    await oeffneStart(page)
    await page.keyboard.press('Tab')

    await page.keyboard.press('Enter')

    await expect(page.locator('main#inhalt')).toBeFocused()
  })

  test('lässt die URL beim Aktivieren unverändert', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const katalog = SEITEN.find((s) => s.name === 'katalog')!
    api = await richteApiEin(page, katalog.als)
    await page.goto('/coins?suche=Gestaltung')
    await expect(page.getByRole('heading', { level: 1, name: 'Katalog' })).toBeVisible()
    await page.keyboard.press('Tab')

    await page.keyboard.press('Enter')

    await expect(page.locator('main#inhalt')).toBeFocused()
    expect(page.url()).toBe(`${WEB}/coins?suche=Gestaltung`)
  })

  test('führt nach dem Sprung mit Tab in den Inhalt statt in die Seitenleiste', async ({ page }) => {
    await oeffneStart(page)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')

    await page.keyboard.press('Tab')

    const imInhalt = await page.evaluate(() => document.querySelector('main#inhalt')?.contains(document.activeElement))
    expect(imInhalt).toBe(true)
  })
})

test.describe('Hauptnavigation per Tab und Enter (AK-42)', () => {
  const ZIELE = [
    { name: 'Startseite', start: '/coins', url: `${WEB}/`, h1: 'Willkommen bei C.O.I.N.' },
    { name: 'Katalog', start: '/', url: `${WEB}/coins`, h1: 'Katalog' },
    { name: 'Zertifikat prüfen', start: '/', url: `${WEB}/pruefung`, h1: 'Zertifikat prüfen' },
    { name: 'Benutzerverwaltung', start: '/', url: `${WEB}/benutzerverwaltung`, h1: 'Benutzerverwaltung' },
    { name: 'Startseite verwalten', start: '/', url: `${WEB}/verwaltung/startseite`, h1: 'Startseite verwalten' },
  ]

  for (const ziel of ZIELE) {
    test(`erreicht „${ziel.name}“ nur mit Tab und navigiert mit Enter`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      api = await richteApiEin(page, START.als)
      await page.goto(ziel.start)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const link = nav(page).getByRole('link', { name: ziel.name, exact: true })

      await tabBis(page, link)
      await page.keyboard.press('Enter')

      await expect(page).toHaveURL(ziel.url)
      await expect(page.getByRole('heading', { level: 1, name: ziel.h1 })).toBeVisible()
    })
  }
})

test.describe('Seitenleiste per Tastatur (AK-29, AK-42)', () => {
  test('klappt mit Enter ein und setzt aria-expanded="false"', async ({ page }) => {
    await oeffneStart(page)
    await tabBis(page, umschalter(page))

    await page.keyboard.press('Enter')

    await erwarteEingeklappt(page)
    await expect(umschalter(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(umschalter(page)).toBeFocused()
  })

  test('klappt mit der Leertaste wieder aus und setzt aria-expanded="true"', async ({ page }) => {
    await oeffneStart(page)
    await tabBis(page, umschalter(page))
    await page.keyboard.press('Enter')
    await erwarteEingeklappt(page)

    await page.keyboard.press(' ')

    await erwarteAusgeklappt(page)
    await expect(umschalter(page)).toHaveAttribute('aria-expanded', 'true')
  })

  test('nimmt die Links eingeklappt aus der Tab-Reihenfolge', async ({ page }) => {
    await oeffneStart(page)
    await tabBis(page, umschalter(page))
    await page.keyboard.press('Enter')
    await erwarteEingeklappt(page)

    const besucht: string[] = []
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      besucht.push(
        await page.evaluate(() => {
          const el = document.activeElement
          return el?.closest('[data-slot="sidebar"]') ? `Seitenleiste: ${el.textContent?.trim()}` : ''
        }),
      )
    }
    expect(besucht.filter(Boolean)).toEqual([])
  })

  test('schaltet mit Strg+B um', async ({ page }) => {
    await oeffneStart(page)

    await page.keyboard.press('Control+b')

    await erwarteEingeklappt(page)
  })
})

test.describe('Farbschema und Abmelden per Tastatur (AK-42)', () => {
  test('öffnet „Farbschema wählen“ mit Enter und wählt „Dunkel“ mit Pfeiltasten und Enter', async ({ page }) => {
    await oeffneStart(page)
    const button = page.getByRole('button', { name: 'Farbschema wählen' })
    await tabBis(page, button)

    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    for (let i = 0; i < 3; i++) {
      if ((await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Dunkel') break
      await page.keyboard.press('ArrowDown')
    }
    await expect(page.getByRole('menuitem', { name: 'Dunkel' })).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)
  })

  test('erreicht „Abmelden“ mit Tab', async ({ page }) => {
    await oeffneStart(page)

    await tabBis(page, page.locator('header').getByRole('button', { name: 'Abmelden' }))

    await expect(page.locator('header').getByRole('button', { name: 'Abmelden' })).toBeFocused()
  })
})

test.describe('Mobilmenü per Tastatur bei 360 px (AK-30, AK-42)', () => {
  async function oeffneMenue(page: Page): Promise<Locator> {
    await oeffneStart(page, 360)
    await tabBis(page, umschalter(page))
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Seitenleiste' })
    await expect(dialog).toBeVisible()
    return dialog
  }

  test('öffnet den Dialog „Seitenleiste“ mit deutscher Beschreibung', async ({ page }) => {
    const dialog = await oeffneMenue(page)

    const beschreibung = await dialog.evaluate(
      (el) => document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent ?? '',
    )
    expect(beschreibung.trim()).not.toBe('')
    expect(beschreibung).not.toMatch(/\b(Displays|mobile|Sidebar)\b/)
  })

  test('legt den Fokus in den Dialog und hält Tab darin', async ({ page }) => {
    const dialog = await oeffneMenue(page)

    await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
      expect(await fehlenderFokusIndikator(page)).toBeNull()
    }
  })

  test('schließt mit Escape und setzt den Fokus zurück auf den Button', async ({ page }) => {
    const dialog = await oeffneMenue(page)

    await page.keyboard.press('Escape')

    await expect(dialog).toBeHidden()
    await expect(umschalter(page)).toBeFocused()
  })

  test('navigiert mit Enter auf einem Eintrag und schließt den Dialog', async ({ page }) => {
    const dialog = await oeffneMenue(page)
    const katalog = dialog.getByRole('link', { name: 'Katalog', exact: true })

    await tabBis(page, katalog, 12)
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(`${WEB}/coins`)
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: 'Katalog' })).toBeVisible()
  })
})
