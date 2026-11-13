import { expect, test, type Locator, type Page } from '@playwright/test'
import { richteApiEin, scrolltNichtHorizontal, setzeTheme, type ApiZustand } from './hilfen/api.js'

// Feature design-fundament, AK-10 bis AK-12, AK-17, AK-22, AK-24, AK-38 (Abschnitt 9): Bausteinseite
// /entwicklung/bausteine im Browser (Dev-Server): in der Shell, ohne Anmeldung, ohne API-Aufruf, hell und dunkel,
// Größen und Rahmen der Bausteine, Dialog und Toast per Tastatur, nur deutsche Texte.

let api: ApiZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

const ENGLISCH = /\b(Loading|Close|Toggle|More|breadcrumb|Notifications)\b/i

async function oeffne(page: Page, optionen: { breite?: number; theme?: 'light' | 'dark' } = {}): Promise<void> {
  await page.setViewportSize({ width: optionen.breite ?? 1280, height: 900 })
  if (optionen.theme) await setzeTheme(page, optionen.theme)
  api = await richteApiEin(page, null)
  await page.goto('/entwicklung/bausteine')
  await expect(page.getByRole('heading', { level: 1, name: 'Bausteinübersicht' })).toBeVisible()
}

/** Abschnittsnamen der Bausteinseite (Abschnitt 5 und 9); die nächste passende h2 beendet einen Abschnitt. */
const ABSCHNITTE = [
  'Farben',
  'Schrift',
  'Button',
  'Eingabefeld',
  'Textbereich',
  'Auswahl',
  'Checkbox',
  'Formularfeld',
  'Karte',
  'Tabelle',
  'Badge',
  'Status-Chip',
  'Dialog',
  'Hinweisbanner',
  'Leerzustand',
  'Ladeanzeige',
  'Fehlerzustand',
  'Spinner',
  'Toast',
  'Seitenkopf',
  'Brotkrumen',
]

interface Mass {
  name: string
  breite: number
  hoehe: number
  ungueltig: boolean
  gesperrt: boolean
  rahmen: string
}

/** Misst alle Elemente (CSS-Auswahl) zwischen der h2 des Abschnitts und der nächsten Abschnitts-h2. */
async function messeImAbschnitt(page: Page, abschnitt: string, css: string): Promise<Mass[]> {
  return page.evaluate(
    ({ abschnitt, css, alle }) => {
      const passt = (h: Element, name: string) => new RegExp(`^${name}(?![\\w-])`).test(h.textContent?.trim() ?? '')
      const h2s = [...document.querySelectorAll('h2')]
      const start = h2s.find((h) => passt(h, abschnitt))
      if (!start) throw new Error(`Abschnitt ${abschnitt} fehlt`)
      const ende = h2s.slice(h2s.indexOf(start) + 1).find((h) => alle.some((n) => passt(h, n)))
      return [...document.querySelectorAll<HTMLElement>(css)]
        .filter((el) => start.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
        .filter((el) => !ende || el.compareDocumentPosition(ende) & Node.DOCUMENT_POSITION_FOLLOWING)
        .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
        .map((el) => {
          const r = el.getBoundingClientRect()
          return {
            name: (el.textContent?.trim() || el.getAttribute('aria-label') || el.tagName).slice(0, 40),
            breite: r.width,
            hoehe: r.height,
            ungueltig: el.getAttribute('aria-invalid') === 'true',
            gesperrt: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
            rahmen: getComputedStyle(el).borderTopColor,
          }
        })
    },
    { abschnitt, css, alle: ABSCHNITTE },
  )
}

/** Erster Button nach der Abschnittsüberschrift. */
function ersterButton(page: Page, ueberschrift: RegExp): Locator {
  return page
    .getByRole('heading', { level: 2, name: ueberschrift })
    .first()
    .locator('xpath=following::*[self::button or @role="button"][1]')
}

/** Text samt aria-label, title, alt und placeholder aller Elemente. */
async function alleTexte(page: Page): Promise<string> {
  return page.evaluate(() => {
    const attribute = [...document.body.querySelectorAll('*')].flatMap((el) =>
      ['aria-label', 'title', 'alt', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    )
    return [document.body.innerText, ...attribute].join(' ')
  })
}

/** Wert eines CSS-Tokens als berechnete Farbe (rgb/rgba). */
async function tokenFarbe(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('div')
    probe.style.color = `var(--${name})`
    document.body.appendChild(probe)
    const farbe = getComputedStyle(probe).color
    probe.remove()
    return farbe
  }, token)
}

test.describe('Seite (AK-38)', () => {
  test('zeigt die Seite ohne Anmeldung in der Shell', async ({ page }) => {
    await oeffne(page)

    await expect(page.locator('header')).toHaveCount(1)
    await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible()
    await expect(
      page.locator('main#inhalt').getByRole('heading', { level: 1, name: 'Bausteinübersicht' }),
    ).toBeVisible()
  })

  test('löst keinen API-Aufruf aus', async ({ page }) => {
    await oeffne(page)
    await page.waitForLoadState('networkidle')

    expect(api.aufrufe.filter((a) => a !== 'GET /api/me')).toEqual([])
  })

  test('hat keinen Eintrag in der Hauptnavigation', async ({ page }) => {
    await oeffne(page)

    await expect(
      page.getByRole('navigation', { name: 'Hauptnavigation' }).locator('a[href^="/entwicklung"]'),
    ).toHaveCount(0)
  })

  test('zeigt die Abschnitte „Farben“ und „Schrift“ vor den Bausteinen', async ({ page }) => {
    await oeffne(page)

    const namen = await page.getByRole('heading', { level: 2 }).allTextContents()
    const farben = namen.findIndex((n) => /^Farben\b/.test(n.trim()))
    const schrift = namen.findIndex((n) => /^Schrift\b/.test(n.trim()))
    const button = namen.findIndex((n) => /^Button\b/.test(n.trim()))
    expect(farben).toBeGreaterThanOrEqual(0)
    expect(schrift).toBeGreaterThan(farben)
    expect(button).toBeGreaterThan(schrift)
  })

  test('enthält keine englischen Texte', async ({ page }) => {
    await oeffne(page)

    expect(await alleTexte(page)).not.toMatch(ENGLISCH)
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`stellt die Seite im Farbschema ${theme} dar`, async ({ page }) => {
      await oeffne(page, { theme })

      await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`))
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toContain(
        theme === 'dark' ? 'dark' : 'light',
      )
    })
  }

  test('scrollt bei 360 px nicht horizontal', async ({ page }) => {
    await oeffne(page, { breite: 360 })

    await scrolltNichtHorizontal(page)
  })
})

test.describe('Größen und Rahmen (AK-10, AK-11, AK-12, AK-24)', () => {
  test('rendert alle Buttons im Abschnitt „Button“ mindestens 40 × 40 px groß', async ({ page }) => {
    await oeffne(page)

    const masse = await messeImAbschnitt(page, 'Button', 'button, [role="button"]')
    expect(masse.length).toBeGreaterThanOrEqual(7)
    expect(masse.filter((m) => m.breite < 39.5 || m.hoehe < 39.5)).toEqual([])
  })

  for (const [abschnitt, auswahl] of [
    ['Eingabefeld', 'input'],
    ['Textbereich', 'textarea'],
    ['Auswahl', '[role="combobox"]'],
  ] as const) {
    test(`rendert die Felder im Abschnitt „${abschnitt}“ mindestens 40 px hoch`, async ({ page }) => {
      await oeffne(page)

      const hoehen = (await messeImAbschnitt(page, abschnitt, auswahl)).map((m) => m.hoehe)
      expect(hoehen.length).toBeGreaterThan(0)
      expect(hoehen.filter((h) => h < 39.5)).toEqual([])
    })
  }

  test('rahmt Eingabefelder mit --input und mit aria-invalid mit --destructive', async ({ page }) => {
    await oeffne(page)
    const input = await tokenFarbe(page, 'input')
    const destructive = await tokenFarbe(page, 'destructive')

    const rahmen = (await messeImAbschnitt(page, 'Eingabefeld', 'input')).filter((m) => !m.gesperrt)
    expect(rahmen.some((r) => r.ungueltig)).toBe(true)
    expect(rahmen.filter((r) => !r.ungueltig).map((r) => r.rahmen)).toContain(input)
    expect(rahmen.filter((r) => r.ungueltig).map((r) => r.rahmen)).toContain(destructive)
  })

  test('macht die Klickfläche aus Beschriftung und Kästchen mindestens 40 px hoch', async ({ page }) => {
    await oeffne(page)

    const hoehen = await page
      .getByRole('checkbox')
      .evaluateAll((liste) => liste.map((el) => (el.closest('label') ?? el).getBoundingClientRect().height))
    expect(hoehen.length).toBeGreaterThanOrEqual(4)
    expect(hoehen.filter((h) => h < 39.5)).toEqual([])
  })

  test('schaltet eine Checkbox per Klick auf die Beschriftung um', async ({ page }) => {
    await oeffne(page)
    // Die Box über ihren Namen fest ansprechen: Ein Filter auf `checked: false` würde nach dem Klick neu ausgewertet.
    const name = await page
      .getByRole('checkbox', { checked: false, disabled: false })
      .first()
      .evaluate((el) => el.closest('label')?.textContent?.trim() ?? '')
    expect(name).not.toBe('')
    const box = page.getByRole('checkbox', { name, exact: true })
    const label = box.locator('xpath=ancestor::label[1]')

    await label.click({ position: { x: (await label.boundingBox())!.width - 4, y: 4 } })

    await expect(box).toBeChecked()
  })

  test('macht die Links der Brotkrumen mindestens 40 px hoch', async ({ page }) => {
    await oeffne(page)

    const hoehen = await page
      .getByRole('navigation', { name: 'Brotkrumen' })
      .first()
      .getByRole('link')
      .evaluateAll((liste) => liste.map((el) => el.getBoundingClientRect().height))
    expect(hoehen.length).toBeGreaterThan(0)
    expect(hoehen.filter((h) => h < 39.5)).toEqual([])
  })
})

test.describe('Dialog (AK-17)', () => {
  async function oeffneDialog(page: Page): Promise<{ ausloeser: Locator; dialog: Locator }> {
    await oeffne(page)
    const ausloeser = ersterButton(page, /^Dialog\b/)
    await ausloeser.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    return { ausloeser, dialog }
  }

  test('hat den Titel als zugänglichen Namen', async ({ page }) => {
    const { dialog } = await oeffneDialog(page)

    const titel = await dialog.getByRole('heading').first().textContent()
    await expect(dialog).toHaveAccessibleName(titel!.trim())
  })

  test('hält Tab im Dialog', async ({ page }) => {
    const { dialog } = await oeffneDialog(page)

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
  })

  test('schließt mit Escape und setzt den Fokus zurück auf den Auslöser', async ({ page }) => {
    const { ausloeser, dialog } = await oeffneDialog(page)

    await page.keyboard.press('Escape')

    await expect(dialog).toBeHidden()
    await expect(ausloeser).toBeFocused()
  })

  test('hat einen Button „Schließen“ mit mindestens 40 × 40 px', async ({ page }) => {
    const { dialog } = await oeffneDialog(page)

    const box = await dialog.getByRole('button', { name: 'Schließen' }).boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(39.5)
    expect(box!.height).toBeGreaterThanOrEqual(39.5)
  })

  test('enthält im geöffneten Zustand keine englischen Texte', async ({ page }) => {
    await oeffneDialog(page)

    expect(await alleTexte(page)).not.toMatch(ENGLISCH)
  })
})

test.describe('Toast (AK-22)', () => {
  test('zeigt per Button einen Toast in der Region „Benachrichtigungen“', async ({ page }) => {
    await oeffne(page)

    await ersterButton(page, /^Toast\b/).click()

    const region = page.getByRole('region', { name: 'Benachrichtigungen' })
    await expect(region.getByRole('button', { name: 'Meldung schließen' }).first()).toBeVisible()
  })

  test('macht „Meldung schließen“ mindestens 40 × 40 px groß', async ({ page }) => {
    await oeffne(page)
    await ersterButton(page, /^Toast\b/).click()

    const box = await page
      .getByRole('region', { name: 'Benachrichtigungen' })
      .getByRole('button', { name: 'Meldung schließen' })
      .first()
      .boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(39.5)
    expect(box!.height).toBeGreaterThanOrEqual(39.5)
  })

  test('schließt den Toast über „Meldung schließen“', async ({ page }) => {
    await oeffne(page)
    await ersterButton(page, /^Toast\b/).click()
    const region = page.getByRole('region', { name: 'Benachrichtigungen' })
    const schliessen = region.getByRole('button', { name: 'Meldung schließen' })
    await expect(schliessen.first()).toBeVisible()
    const vorher = await schliessen.count()

    await schliessen.first().click()

    await expect(schliessen).toHaveCount(vorher - 1)
  })

  test('scrollt mit sichtbarem Toast bei 360 px nicht horizontal', async ({ page }) => {
    await oeffne(page, { breite: 360 })
    await ersterButton(page, /^Toast\b/).click()
    await expect(
      page
        .getByRole('region', { name: 'Benachrichtigungen' })
        .getByRole('button', { name: 'Meldung schließen' })
        .first(),
    ).toBeVisible()

    await scrolltNichtHorizontal(page)
  })
})
