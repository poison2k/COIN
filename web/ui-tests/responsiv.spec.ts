import { expect, test, type Page } from '@playwright/test'
import { ADMIN, richteApiEin, scrolltNichtHorizontal, SEITEN, type ApiZustand, type SeitenFall } from './hilfen/api.js'
import { zuKleineKlickflaechen } from './hilfen/pruefungen.js'
import { AUSGABE, COIN, richteFormularApiEin } from './hilfen/formulare.js'
import {
  ansichtsKnopf,
  BETRACHTER,
  mockeAudit,
  mockeKatalog,
  mockePruefung,
  oeffneAuditLog,
  oeffneStartseitenFall,
  pruefePerEnter,
  SACHBEARBEITER,
  STARTSEITEN_FAELLE,
  UEBERSCHRIFT,
  type Ergebnis,
} from './hilfen/uebersicht.js'

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

// ---------- startseite-listen-pruefung, AK-41: Zustände dieses Laufs ohne horizontales Scrollen, Klickflächen ----------

const BREITEN = [360, 768, 1280] as const

test.describe('Startseite, Katalog, Prüfmaske und Audit-Log ohne horizontales Scrollen (AK-41)', () => {
  for (const fall of STARTSEITEN_FAELLE) {
    for (const breite of BREITEN) {
      test(`Startseite ${fall.name} bei ${breite} px`, async ({ page }) => {
        api = await oeffneStartseitenFall(page, fall, { breite })

        await scrolltNichtHorizontal(page)
      })
    }
  }

  const KATALOG: ReadonlyArray<
    [string, { coins?: unknown[]; fehler?: number; karten?: boolean; pfad?: string }, RegExp]
  > = [
    ['Tabelle', {}, /gefunden/],
    ['Karten', { karten: true }, /gefunden/],
    ['leer', { coins: [] }, /Noch keine Coins erfasst/],
    ['kein Treffer', { pfad: '/coins?suche=gibtesnicht' }, /Keine Coins gefunden/],
    ['Fehler', { fehler: 5 }, /Coins konnten nicht geladen werden/],
  ]
  for (const [name, zustand, bereit] of KATALOG) {
    for (const breite of BREITEN) {
      test(`Katalog ${name} bei ${breite} px`, async ({ page }) => {
        await page.setViewportSize({ width: breite, height: 900 })
        api = await richteApiEin(page, ADMIN)
        await mockeKatalog(page, { coins: zustand.coins, fehler: zustand.fehler })
        await page.goto(zustand.pfad ?? '/coins')
        await expect(page.getByRole('main').getByText(bereit).first()).toBeVisible()
        if (zustand.karten) {
          await ansichtsKnopf(page, 'Karten').click()
          await expect(page.getByRole('main').getByRole('list', { name: 'Coins' })).toBeVisible()
        }

        await scrolltNichtHorizontal(page)
      })
    }
  }

  for (const ergebnis of Object.keys(UEBERSCHRIFT) as Ergebnis[]) {
    for (const breite of BREITEN) {
      test(`Prüfmaske ${ergebnis} (Sachbearbeiter) bei ${breite} px`, async ({ page }) => {
        await page.setViewportSize({ width: breite, height: 900 })
        api = await richteApiEin(page, SACHBEARBEITER)
        await mockePruefung(page)
        await page.goto('/pruefung')

        await pruefePerEnter(page, ergebnis)

        await scrolltNichtHorizontal(page)
      })
    }
  }

  for (const [name, leer] of [
    ['mit aktivem Filter', false],
    ['leer', true],
  ] as const) {
    for (const breite of BREITEN) {
      test(`Audit-Log ${name} bei ${breite} px`, async ({ page }) => {
        await page.setViewportSize({ width: breite, height: 900 })
        api = await richteApiEin(page, ADMIN)
        await mockeAudit(page, { leer })
        await oeffneAuditLog(page)
        const panel = page.getByRole('tabpanel', { name: 'Audit-Log' })
        if (leer) {
          await expect(panel.getByRole('heading', { level: 3, name: 'Noch keine Einträge.' })).toBeVisible()
        } else {
          const feld = panel.getByRole('combobox', { name: /^Benutzer/ })
          await feld.click()
          await feld.pressSequentially('Betr')
          await page.getByRole('option', { name: BETRACHTER.name }).click()
          await expect(panel.getByRole('list', { name: 'Aktive Filter' })).toBeVisible()
        }

        await scrolltNichtHorizontal(page)
      })
    }
  }
})

test.describe('Klickflächen ≥ 40 × 40 px auf Startseite, Katalog und Prüfmaske (AK-41)', () => {
  for (const breite of [360, 1280]) {
    test(`auf der Startseite (alle Blöcke, einschließlich Startseiten-Links) bei ${breite} px`, async ({ page }) => {
      api = await oeffneStartseitenFall(page, STARTSEITEN_FAELLE[0], { breite })

      expect(await zuKleineKlickflaechen(page.getByRole('main'))).toEqual([])
    })

    test(`im Katalog mit Ansichtsumschalter und Kartenlinks bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 })
      api = await richteApiEin(page, ADMIN)
      await mockeKatalog(page)
      await page.goto('/coins')
      await ansichtsKnopf(page, 'Karten').click()
      await expect(page.getByRole('main').getByRole('list', { name: 'Coins' })).toBeVisible()

      expect(await zuKleineKlickflaechen(page.getByRole('main'))).toEqual([])
    })

    test(`auf der Prüfmaske mit Ergebnis bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 })
      api = await richteApiEin(page, SACHBEARBEITER)
      await mockePruefung(page)
      await page.goto('/pruefung')
      await pruefePerEnter(page, 'gueltig')

      expect(await zuKleineKlickflaechen(page.getByRole('main'))).toEqual([])
    })
  }
})
