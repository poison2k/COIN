import { expect, test, type Page } from '@playwright/test'
import { ADMIN, richteApiEin, scrolltNichtHorizontal, SEITEN, type ApiZustand, type SeitenFall } from './hilfen/api.js'
import { zuKleineKlickflaechen } from './hilfen/pruefungen.js'
import { AUSGABE, COIN, richteFormularApiEin } from './hilfen/formulare.js'

// Feature design-fundament, AK-15, AK-23, AK-31, AK-32, AK-33, AK-34 (ADR-0037 Punkt 4): kein horizontales Scrollen bei
// 360/768/1280 px, Seitenränder und Inhaltsbreite der Shell, Umbruch des Seitenkopfs, Tabellen scrollen im Container,
// Klickflächen ≥ 40 × 40 px. API und IdP sind gemockt, alle Daten synthetisch.

let api: ApiZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

const seite = (name: string): SeitenFall => SEITEN.find((s) => s.name === name)!

async function oeffne(page: Page, fall: SeitenFall, breite: number): Promise<void> {
  await page.setViewportSize({ width: breite, height: 900 })
  api = await richteApiEin(page, fall.als)
  await page.goto(fall.pfad)
  await fall.bereit(page)
}

test.describe('Kein horizontales Scrollen (AK-33)', () => {
  for (const fall of SEITEN) {
    for (const breite of [360, 768, 1280]) {
      test(`${fall.name} bei ${breite} px`, async ({ page }) => {
        await oeffne(page, fall, breite)

        await scrolltNichtHorizontal(page)
      })
    }
  }

  test('mit geöffnetem Mobilmenü bei 360 px', async ({ page }) => {
    await oeffne(page, seite('start'), 360)

    await page.getByRole('button', { name: 'Seitenleiste ein-/ausblenden' }).click()
    await expect(page.getByRole('dialog', { name: 'Seitenleiste' })).toBeVisible()

    await scrolltNichtHorizontal(page)
  })
})

test.describe('Inhaltscontainer und Seitenränder (AK-32)', () => {
  /** Abstand des h1 zum linken und rechten Innenrand von main sowie Breite des Containers (erstes Kind von main). */
  async function masse(page: Page) {
    return page.evaluate(() => {
      const main = document.querySelector('main#inhalt') as HTMLElement
      const h1 = main.querySelector('h1') as HTMLElement
      const container = main.firstElementChild as HTMLElement
      const m = main.getBoundingClientRect()
      const c = container.getBoundingClientRect()
      return {
        h1Links: h1.getBoundingClientRect().left - m.left,
        containerBreite: c.width,
        abstandLinks: c.left - m.left,
        abstandRechts: m.right - c.right,
      }
    })
  }

  for (const [breite, rand] of [
    [360, 16],
    [768, 24],
    [1280, 32],
  ] as const) {
    test(`setzt bei ${breite} px einen Seitenrand von ${rand} px (h1 zu main)`, async ({ page }) => {
      await oeffne(page, seite('katalog'), breite)

      expect(Math.round((await masse(page)).h1Links)).toBe(rand)
    })
  }

  test('begrenzt den Container bei 1280 px auf höchstens 72rem und zentriert ihn', async ({ page }) => {
    await oeffne(page, seite('katalog'), 1280)

    const m = await masse(page)
    expect(m.containerBreite).toBeLessThanOrEqual(72 * 16)
    expect(Math.abs(m.abstandLinks - m.abstandRechts)).toBeLessThanOrEqual(1)
  })

  test('begrenzt und zentriert den Container auch bei eingeklappter Seitenleiste (1280 px)', async ({ page }) => {
    await oeffne(page, seite('katalog'), 1280)
    await page.getByRole('button', { name: 'Seitenleiste ein-/ausblenden' }).click()
    await expect(page.locator('[data-slot="sidebar"][data-state]')).toHaveAttribute('data-state', 'collapsed')

    await expect
      .poll(async () => {
        const m = await masse(page)
        return m.containerBreite <= 72 * 16 && Math.abs(m.abstandLinks - m.abstandRechts) <= 1 && m.abstandLinks > 0
      })
      .toBe(true)
  })
})

test.describe('Seitenkopf (AK-23)', () => {
  test('bricht die Aktion bei 360 px unter den Titel um', async ({ page }) => {
    await oeffne(page, seite('katalog'), 360)

    const titel = await page.getByRole('heading', { level: 1, name: 'Katalog' }).boundingBox()
    const aktion = await page.getByRole('link', { name: 'Coin hinzufügen' }).boundingBox()
    expect(aktion!.y).toBeGreaterThanOrEqual(titel!.y + titel!.height - 1)
    await scrolltNichtHorizontal(page)
  })

  test('stellt die Aktion bei 1280 px neben den Titel', async ({ page }) => {
    await oeffne(page, seite('katalog'), 1280)

    const titel = await page.getByRole('heading', { level: 1, name: 'Katalog' }).boundingBox()
    const aktion = await page.getByRole('link', { name: 'Coin hinzufügen' }).boundingBox()
    expect(aktion!.x).toBeGreaterThan(titel!.x + titel!.width)
  })
})

test.describe('Tabellen (AK-15)', () => {
  // formulare-detailseiten K8: Benutzer erscheinen bei 360 px als Karten (ADR-0041); abgedeckt in tabellen.spec.ts.
  for (const name of ['katalog', 'bausteine']) {
    test(`lässt Tabellen auf „${name}“ bei 360 px in ihrem Container scrollen`, async ({ page }) => {
      await oeffne(page, seite(name), 360)

      const tabellen = await page.getByRole('table').evaluateAll((liste) =>
        liste.map((t) => {
          const huelle = t.parentElement as HTMLElement
          return { overflowX: getComputedStyle(huelle).overflowX, breiter: t.scrollWidth > huelle.clientWidth }
        }),
      )
      expect(tabellen.length).toBeGreaterThan(0)
      expect(tabellen.filter((t) => t.breiter && !['auto', 'scroll'].includes(t.overflowX))).toEqual([])
      await scrolltNichtHorizontal(page)
    })
  }
})

test.describe('Kopfzeile bei 360 px (AK-31)', () => {
  test('zeigt angemeldet „Abmelden“ und „Farbschema wählen“ im Viewport', async ({ page }) => {
    await oeffne(page, seite('start'), 360)

    await expect(page.locator('header').getByRole('button', { name: 'Abmelden' })).toBeInViewport()
    await expect(page.locator('header').getByRole('button', { name: 'Farbschema wählen' })).toBeInViewport()
  })

  test('zeigt anonym „Anmelden“ und „Farbschema wählen“ im Viewport', async ({ page }) => {
    await oeffne(page, seite('start-anonym'), 360)

    await expect(page.locator('header').getByRole('button', { name: 'Anmelden' })).toBeInViewport()
    await expect(page.locator('header').getByRole('button', { name: 'Farbschema wählen' })).toBeInViewport()
  })

  test('nennt Name und Rolle bei 360 px weiterhin für Screenreader', async ({ page }) => {
    await oeffne(page, seite('start'), 360)

    await expect(page.locator('header')).toContainText(`Angemeldet als ${ADMIN.name}`)
    await expect(page.locator('header')).toContainText('Rolle: Administrator')
  })
})

test.describe('Klickflächen ≥ 40 × 40 px (AK-34)', () => {
  for (const breite of [360, 1280]) {
    test(`in header bei ${breite} px`, async ({ page }) => {
      await oeffne(page, seite('start'), breite)

      expect(await zuKleineKlickflaechen(page.locator('header'))).toEqual([])
    })
  }

  test('in der Hauptnavigation bei 1280 px', async ({ page }) => {
    await oeffne(page, seite('start'), 1280)

    expect(await zuKleineKlickflaechen(page.getByRole('navigation', { name: 'Hauptnavigation' }))).toEqual([])
  })

  test('im Mobilmenü bei 360 px', async ({ page }) => {
    await oeffne(page, seite('start'), 360)
    await page.getByRole('button', { name: 'Seitenleiste ein-/ausblenden' }).click()
    const dialog = page.getByRole('dialog', { name: 'Seitenleiste' })
    await expect(dialog).toBeVisible()

    expect(await zuKleineKlickflaechen(dialog)).toEqual([])
  })

  test('für die Aktion im Seitenkopf des Katalogs', async ({ page }) => {
    await oeffne(page, seite('katalog'), 1280)

    const box = await page.getByRole('link', { name: 'Coin hinzufügen' }).boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(40)
    expect(box!.width).toBeGreaterThanOrEqual(40)
  })

  test('auf der 404-Seite (Leerzustand)', async ({ page }) => {
    await oeffne(page, seite('nicht-gefunden'), 1280)

    expect(await zuKleineKlickflaechen(page.locator('main'))).toEqual([])
  })

  for (const breite of [360, 1280]) {
    test(`auf der Bausteinseite bei ${breite} px`, async ({ page }) => {
      test.slow()
      await oeffne(page, seite('bausteine'), breite)

      expect(await zuKleineKlickflaechen(page.locator('main'))).toEqual([])
    })
  }
})

// ---------- formulare-detailseiten, AK-38: kein horizontales Scrollen mit Fehlern, Zusammenfassung, Dialog ----------

test.describe('Formulare und Detailseiten ohne horizontales Scrollen (formulare-detailseiten, AK-38)', () => {
  const FORMULARE = [
    { pfad: '/coins/neu', h1: 'Coin hinzufügen', absenden: 'Coin anlegen' },
    { pfad: `/coins/${COIN.id}/ausgaben/neu`, h1: 'Ausgabe erfassen', absenden: 'Ausgabe speichern' },
  ]

  for (const breite of [360, 768, 1280]) {
    for (const { pfad, h1, absenden } of FORMULARE) {
      test(`${pfad} mit Fehlern und Zusammenfassung bei ${breite} px`, async ({ page }) => {
        await page.setViewportSize({ width: breite, height: 900 })
        api = await richteFormularApiEin(page, ADMIN)
        await page.goto(pfad)
        await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible()

        await page.getByRole('button', { name: absenden }).click()
        await expect(page.getByRole('alert').filter({ hasText: 'Bitte die markierten Eingaben prüfen.' })).toBeVisible()

        await scrolltNichtHorizontal(page)
      })
    }

    test(`Ausgabe-Seite mit geöffnetem Storno-Dialog bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 })
      api = await richteFormularApiEin(page, ADMIN)
      await page.goto(`/coins/${COIN.id}/ausgaben/${AUSGABE.id}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      await page
        .getByRole('main')
        .getByRole('button', { name: /stornieren/i })
        .click()
      await expect(page.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })).toBeVisible()

      await scrolltNichtHorizontal(page)
    })

    test(`Verlassen-Warnung bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 })
      api = await richteFormularApiEin(page, ADMIN)
      await page.goto('/coins/neu')
      await page.getByLabel(/^Name/).fill('Coin Neu')
      await page.getByRole('link', { name: 'Abbrechen' }).click()
      await expect(page.getByRole('alertdialog', { name: 'Ungespeicherte Änderungen' })).toBeVisible()

      await scrolltNichtHorizontal(page)
    })
  }

  for (const breite of [360, 1280]) {
    test(`Klickflächen auf der Ausgabe-Seite bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 })
      api = await richteFormularApiEin(page, ADMIN)
      await page.goto(`/coins/${COIN.id}/ausgaben/${AUSGABE.id}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      expect(await zuKleineKlickflaechen(page.getByRole('main'))).toEqual([])
    })

    test(`Klickflächen auf „Ausgabe erfassen“ bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 })
      api = await richteFormularApiEin(page, ADMIN)
      await page.goto(`/coins/${COIN.id}/ausgaben/neu`)
      await expect(page.getByRole('button', { name: 'Ausgabe speichern' })).toBeVisible()

      expect(await zuKleineKlickflaechen(page.getByRole('main'))).toEqual([])
    })
  }
})
