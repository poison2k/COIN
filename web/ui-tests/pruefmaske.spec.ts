import { expect, test, type Page } from '@playwright/test'
import { richteApiEin, scrolltNichtHorizontal, setzeTheme, type ApiZustand } from './hilfen/api.js'
import {
  BETRACHTER,
  COIN,
  coinFeld,
  ergebnisRegion,
  ICON,
  kontrast,
  mockePruefung,
  NUMMER,
  nummernFeld,
  pruefenKnopf,
  pruefePerEnter,
  SACHBEARBEITER,
  UEBERSCHRIFT,
  waehleCoin,
  type Ergebnis,
  type PruefZustand,
} from './hilfen/uebersicht.js'

// Feature startseite-listen-pruefung, AK-19 bis AK-24 (Abschnitt 4.3, ADR-0043 Punkt 3, F4; UI-Test mit gemockter API):
// zentrierte Spalte ≤ 45rem, Coin und Nummer ab 768 px nebeneinander, großes Nummernfeld. Kernkriterium AK-21: Nach einer
// Prüfung (per Enter oder per Klick) liegt der Fokus im Nummernfeld und der Inhalt ist markiert; ohne weiteren Klick
// folgt die nächste Nummer. Vier Ergebnisse über Text und Icon unterscheidbar (nicht über Farbe), Ergebniskarte mit
// großer, kontrastreicher h2 und Rahmen in der Statusfarbe.

let api: ApiZustand
let pruefung: PruefZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

async function oeffne(page: Page, { breite = 1280, als = BETRACHTER, theme = 'light' as 'light' | 'dark' } = {}) {
  await page.setViewportSize({ width: breite, height: 900 })
  await setzeTheme(page, theme)
  api = await richteApiEin(page, als)
  pruefung = await mockePruefung(page)
  await page.goto('/pruefung')
  await expect(page.getByRole('heading', { level: 1, name: 'Zertifikat prüfen' })).toBeVisible()
}

/** Ist der Inhalt des Nummernfelds vollständig markiert? */
async function vollstaendigMarkiert(page: Page): Promise<boolean> {
  return nummernFeld(page).evaluate((el) => {
    const feld = el as HTMLInputElement
    return feld.value.length > 0 && feld.selectionStart === 0 && feld.selectionEnd === feld.value.length
  })
}

// ---------- AK-21: Kernkriterium ----------

test.describe('Nächste Nummer ohne Mausklick (AK-21)', () => {
  test('lässt nach Enter den Fokus im Nummernfeld und markiert den ganzen Inhalt', async ({ page }) => {
    await oeffne(page)
    await waehleCoin(page)
    await nummernFeld(page).fill(NUMMER.gueltig)

    await nummernFeld(page).press('Enter')

    await expect(page.getByRole('heading', { level: 2, name: UEBERSCHRIFT.gueltig })).toBeVisible()
    await expect(nummernFeld(page)).toBeFocused()
    await expect.poll(() => vollstaendigMarkiert(page)).toBe(true)
  })

  test('prüft nach Enter ohne weiteren Klick die nächste Nummer mit derselben coinId', async ({ page }) => {
    await oeffne(page)
    await waehleCoin(page)
    await nummernFeld(page).fill(NUMMER.gueltig)
    await nummernFeld(page).press('Enter')
    await expect(page.getByRole('heading', { level: 2, name: UEBERSCHRIFT.gueltig })).toBeVisible()
    await expect.poll(() => vollstaendigMarkiert(page)).toBe(true)

    await page.keyboard.type(NUMMER.nichtGefunden)
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { level: 2, name: UEBERSCHRIFT.nichtGefunden })).toBeVisible()
    expect(pruefung.anfragen).toHaveLength(2)
    expect(pruefung.anfragen[1].body.hologrammnummer?.replace(/[\s-]/g, '')).toBe(
      NUMMER.nichtGefunden.replace(/[\s-]/g, ''),
    )
    expect(pruefung.anfragen[1].body.coinId).toBe(COIN.id)
    expect(pruefung.anfragen[0].body.coinId).toBe(COIN.id)
  })

  test('legt nach einem Mausklick auf „Prüfen“ den Fokus ins Nummernfeld und markiert den Inhalt', async ({ page }) => {
    await oeffne(page)
    await waehleCoin(page)
    await nummernFeld(page).fill(NUMMER.gueltig)

    await pruefenKnopf(page).click()

    await expect(page.getByRole('heading', { level: 2, name: UEBERSCHRIFT.gueltig })).toBeVisible()
    await expect(nummernFeld(page)).toBeFocused()
    await expect.poll(() => vollstaendigMarkiert(page)).toBe(true)
  })

  test('prüft nach einem Mausklick ohne weiteren Klick die nächste Nummer per Tastatur', async ({ page }) => {
    await oeffne(page)
    await waehleCoin(page)
    await nummernFeld(page).fill(NUMMER.gueltig)
    await pruefenKnopf(page).click()
    await expect(page.getByRole('heading', { level: 2, name: UEBERSCHRIFT.gueltig })).toBeVisible()

    await page.keyboard.type(NUMMER.storniert)
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { level: 2, name: UEBERSCHRIFT.storniert })).toBeVisible()
    expect(pruefung.anfragen).toHaveLength(2)
    expect(pruefung.anfragen[1].body.hologrammnummer?.replace(/[\s-]/g, '')).toBe(
      NUMMER.storniert.replace(/[\s-]/g, ''),
    )
    expect(pruefung.anfragen[1].body.coinId).toBe(COIN.id)
  })

  test('ersetzt beim Tippen die markierte alte Nummer vollständig (F4)', async ({ page }) => {
    await oeffne(page)
    await nummernFeld(page).fill(NUMMER.gueltig)
    await nummernFeld(page).press('Enter')
    await expect(page.getByRole('heading', { level: 2, name: UEBERSCHRIFT.gueltig })).toBeVisible()

    await page.keyboard.type('XY 99')

    await expect(nummernFeld(page)).toHaveValue('XY 99')
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0)
  })

  test('verschiebt den Fokus nie auf die Ergebniskarte', async ({ page }) => {
    await oeffne(page)
    await nummernFeld(page).fill(NUMMER.gueltig)

    await pruefenKnopf(page).click()

    await expect(page.getByRole('heading', { level: 2, name: UEBERSCHRIFT.gueltig })).toBeVisible()
    expect(await ergebnisRegion(page).evaluate((r) => r.contains(document.activeElement))).toBe(false)
  })
})

// ---------- AK-22: Fokus nach Feldfehler und Alarm ----------

test.describe('Fokus nach Feldfehler und Alarm (AK-22)', () => {
  test('legt nach „Prüfen“ mit leerer Nummer den Fokus ins Nummernfeld', async ({ page }) => {
    await oeffne(page)

    await pruefenKnopf(page).click()

    await expect(nummernFeld(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(nummernFeld(page)).toBeFocused()
  })

  test('legt nach einem Serverfehler den Fokus ins Nummernfeld', async ({ page }) => {
    await oeffne(page)
    pruefung.naechste = { status: 500, body: { title: 'Fehler', status: 500 } }
    await nummernFeld(page).fill(NUMMER.gueltig)

    await pruefenKnopf(page).click()

    await expect(page.getByRole('alert')).toContainText(
      'Die Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.',
    )
    await expect(nummernFeld(page)).toBeFocused()
  })

  test('legt nach 429 den Fokus ins Nummernfeld und sperrt „Prüfen“', async ({ page }) => {
    await oeffne(page)
    pruefung.naechste = {
      status: 429,
      headers: { 'Retry-After': '30', 'Cache-Control': 'no-store' },
      body: { title: 'Zu viele Prüfungen', status: 429, code: 'zu_viele_pruefungen' },
    }
    await nummernFeld(page).fill(NUMMER.gueltig)

    await pruefenKnopf(page).click()

    await expect(page.getByRole('alert')).toContainText('Sie haben in kurzer Zeit zu viele Prüfungen durchgeführt.')
    await expect(nummernFeld(page)).toBeFocused()
    await expect(pruefenKnopf(page)).toHaveAttribute('aria-disabled', 'true')
  })

  test('zeigt Alarme oberhalb der Ergebnis-Live-Region', async ({ page }) => {
    await oeffne(page)
    pruefung.naechste = { status: 500, body: { title: 'Fehler', status: 500 } }
    await nummernFeld(page).fill(NUMMER.gueltig)
    await nummernFeld(page).press('Enter')

    const alarm = (await page.getByRole('alert').boundingBox())!
    const region = (await ergebnisRegion(page).boundingBox())!
    expect(alarm.y).toBeLessThanOrEqual(region.y)
  })
})

// ---------- AK-23: vier Ergebnisse über Text und Icon ----------

const ERGEBNISSE = Object.keys(UEBERSCHRIFT) as Ergebnis[]

test.describe('Vier Ergebnisse ohne Farbwahrnehmung unterscheidbar (AK-23)', () => {
  for (const ergebnis of ERGEBNISSE) {
    test(`${ergebnis}: genau eine h2 mit dem Text aus 4.3 und genau ein passendes Icon (aria-hidden)`, async ({
      page,
    }) => {
      await oeffne(page)

      await pruefePerEnter(page, ergebnis)

      const region = ergebnisRegion(page)
      await expect(region.getByRole('heading', { level: 2 })).toHaveCount(1)
      await expect(region.getByRole('heading', { level: 2 })).toHaveText(UEBERSCHRIFT[ergebnis])
      for (const [art, klasse] of Object.entries(ICON)) {
        await expect(region.locator(`svg.${klasse}`), klasse).toHaveCount(art === ergebnis ? 1 : 0)
      }
      await expect(region.locator(`svg.${ICON[ergebnis]}`)).toHaveAttribute('aria-hidden', 'true')
    })
  }

  test('zeigt für die vier Ergebnisse paarweise verschiedene Texte und Icons', async ({ page }) => {
    await oeffne(page)
    const gesehen: Array<{ text: string; icon: string }> = []

    for (const ergebnis of ERGEBNISSE) {
      await pruefePerEnter(page, ergebnis)
      const region = ergebnisRegion(page)
      gesehen.push({
        text: (await region.getByRole('heading', { level: 2 }).textContent())?.trim() ?? '',
        icon: await region.evaluate((r) =>
          [...r.querySelectorAll('svg[aria-hidden="true"]')]
            .flatMap((svg) => [...svg.classList].filter((k) => k.startsWith('lucide-')))
            .sort()
            .join(' '),
        ),
      })
    }

    expect(new Set(gesehen.map((g) => g.text)).size).toBe(4)
    expect(new Set(gesehen.map((g) => g.icon)).size).toBe(4)
  })
})

// ---------- AK-24: Ergebniskarte ----------

test.describe('Ergebniskarte (AK-24)', () => {
  for (const ergebnis of ERGEBNISSE) {
    test(`${ergebnis}: h2 mindestens 20 px groß`, async ({ page }) => {
      await oeffne(page)

      await pruefePerEnter(page, ergebnis)

      const groesse = await page
        .getByRole('heading', { level: 2, name: UEBERSCHRIFT[ergebnis] })
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
      expect(groesse).toBeGreaterThanOrEqual(20)
    })

    test(`${ergebnis}: Rahmen der Karte in der Statusfarbe der Überschrift`, async ({ page }) => {
      await oeffne(page)

      await pruefePerEnter(page, ergebnis)

      const passt = await page.getByRole('heading', { level: 2, name: UEBERSCHRIFT[ergebnis] }).evaluate((h2) => {
        const farbe = getComputedStyle(h2).color
        for (let e = h2.parentElement; e && e.getAttribute('role') !== 'status'; e = e.parentElement) {
          const s = getComputedStyle(e)
          const rundum = ['Top', 'Right', 'Bottom', 'Left'].every(
            (seite) => parseFloat(s.getPropertyValue(`border-${seite.toLowerCase()}-width`)) >= 2,
          )
          if (rundum && s.borderTopColor === farbe) return true
        }
        return false
      })
      expect(passt).toBe(true)
    })

    for (const theme of ['light', 'dark'] as const) {
      test(`${ergebnis}: Kontrast der h2 zu ihrer Fläche mindestens 4,5:1 (${theme})`, async ({ page }) => {
        await oeffne(page, { theme })

        await pruefePerEnter(page, ergebnis)

        expect(
          await kontrast(page.getByRole('heading', { level: 2, name: UEBERSCHRIFT[ergebnis] })),
        ).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  test('nennt die geprüfte Nummer unverändert als „Geprüfte Nummer: {Anzeigeform}“', async ({ page }) => {
    await oeffne(page)
    await nummernFeld(page).fill('  ab 12-43 ')

    await nummernFeld(page).press('Enter')

    await expect(ergebnisRegion(page)).toContainText('Geprüfte Nummer: AB 12-43')
  })
})

// ---------- AK-19: Aufbau ----------

test.describe('Aufbau der Seite (AK-19)', () => {
  test('hat genau ein h1 und vor einer Prüfung keine h2', async ({ page }) => {
    await oeffne(page)

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveCount(0)
  })

  test('begrenzt die Inhaltsspalte bei 1280 px auf 45rem und zentriert sie im Inhaltsbereich', async ({ page }) => {
    await oeffne(page)

    const masse = await page.evaluate(() => {
      const main = document.querySelector('main') as HTMLElement
      const container = main.firstElementChild as HTMLElement
      const h1 = main.querySelector('h1') as HTMLElement
      const region = main.querySelector('[role="status"][aria-live="polite"]') as HTMLElement
      let spalte: HTMLElement | null = h1.parentElement
      while (spalte && !spalte.contains(region)) spalte = spalte.parentElement
      const s = (spalte as HTMLElement).getBoundingClientRect()
      const c = container.getBoundingClientRect()
      const stil = getComputedStyle(container)
      const innenLinks = c.left + parseFloat(stil.paddingLeft)
      const innenRechts = c.right - parseFloat(stil.paddingRight)
      return { breite: s.width, links: s.left - innenLinks, rechts: innenRechts - s.right }
    })
    expect(masse.breite).toBeLessThanOrEqual(45 * 16 + 0.5)
    expect(masse.links).toBeGreaterThan(0)
    expect(Math.abs(masse.links - masse.rechts)).toBeLessThanOrEqual(1)
  })

  for (const breite of [360, 768, 1280]) {
    test(`scrollt bei ${breite} px nicht horizontal, auch mit Ergebnis`, async ({ page }) => {
      await oeffne(page, { breite, als: SACHBEARBEITER })

      await pruefePerEnter(page, 'gueltig')

      await scrolltNichtHorizontal(page)
    })
  }
})

// ---------- AK-20: Formular ----------

test.describe('Formular (AK-20)', () => {
  for (const breite of [768, 1280]) {
    test(`stellt bei ${breite} px „Coin (optional)“ links neben „Hologrammnummer“`, async ({ page }) => {
      await oeffne(page, { breite })

      const coin = (await coinFeld(page).boundingBox())!
      const nummer = (await nummernFeld(page).boundingBox())!
      expect(Math.abs(coin.y + coin.height - (nummer.y + nummer.height))).toBeLessThanOrEqual(1)
      expect(coin.x + coin.width).toBeLessThanOrEqual(nummer.x)
    })
  }

  test('stellt bei 360 px „Coin (optional)“ über „Hologrammnummer“', async ({ page }) => {
    await oeffne(page, { breite: 360 })

    const coin = (await coinFeld(page).boundingBox())!
    const nummer = (await nummernFeld(page).boundingBox())!
    expect(nummer.y).toBeGreaterThanOrEqual(coin.y + coin.height)
  })

  test('erreicht per Tab Coin, Hologrammnummer und Prüfen in dieser Reihenfolge', async ({ page }) => {
    await oeffne(page)
    await coinFeld(page).focus()

    await page.keyboard.press('Tab')
    await expect(nummernFeld(page)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(pruefenKnopf(page)).toBeFocused()
  })

  test('erreicht mit gewähltem Coin per Tab „Auswahl entfernen“ vor der Hologrammnummer', async ({ page }) => {
    await oeffne(page)
    await waehleCoin(page)
    await coinFeld(page).focus()

    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Auswahl entfernen' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(nummernFeld(page)).toBeFocused()
  })

  test('hat ein Nummernfeld von mindestens 48 px Höhe', async ({ page }) => {
    await oeffne(page)

    expect((await nummernFeld(page).boundingBox())!.height).toBeGreaterThanOrEqual(48)
  })

  test('nennt „(Pflichtfeld)“ im Namen und den Hilfetext in der Beschreibung des Nummernfelds', async ({ page }) => {
    await oeffne(page)

    await expect(nummernFeld(page)).toHaveAccessibleName(/\(Pflichtfeld\)/)
    await expect(nummernFeld(page)).toHaveAccessibleDescription(
      /Leerzeichen und Bindestriche sind erlaubt\. Groß- und Kleinschreibung spielt keine Rolle\./,
    )
  })
})
