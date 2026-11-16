import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { meldeAn, meldeAnInNeuemKontext } from './hilfen/anmeldung'

// Systemtest startseite-listen-pruefung (Entwurf Abschnitt 9; AK-2, AK-13, AK-21, AK-23, AK-26, AK-40, AK-41) gegen
// echten Systemtest-Keycloak (5184), echte API (5182) und Wegwerf-Datenbank: Der Administrator legt zwei Coins an,
// erfasst zwei Ausgaben mit Hologrammnummern und schaltet auf /verwaltung/startseite „Kennzahlen“ und „Infotext“ aus;
// `/` zeigt keine Lücke. Im Katalog bleibt die Ansicht „Karten“ nach dem Neuladen. Der Betrachter prüft auf /pruefung
// beide Nummern direkt hintereinander nur per Tastatur und sieht „Zertifikat gültig“ ohne Empfängerdaten. axe und
// 360-px-Overflow auf allen drei Seiten, hell und dunkel. Danach (afterAll, auch nach Fehlern) stellt der Administrator
// die Standardblöcke der Startseite wieder her, damit startseite.spec.ts unverändert startet. Alle Werte synthetisch.

const WEB = 'http://localhost:5183'
const ADMIN_EMAIL = 'admin@test.local'
const BETRACHTER = { email: 'betrachter@test.local', name: 'Test Betrachter', rolle: 'Betrachter' }
const DETAIL_URL = new RegExp(`^${WEB}/coins/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

test.describe.configure({ mode: 'serial' })

function eindeutig(praefix: string): string {
  return `${praefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Nur Buchstaben und Ziffern, damit die Nummer gültig bleibt. */
function hologrammnummer(praefix: string): string {
  return `${praefix} ${`${Date.now()}`.slice(-6)}${Math.floor(Math.random() * 90 + 10)}`
}

async function axeVerstoesse(page: Page): Promise<string[]> {
  const ergebnis = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return ergebnis.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}) ${n.target.join(' ')} – ${v.helpUrl}`))
}

async function horizontalesScrollen(page: Page): Promise<string | null> {
  const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }))
  return m.s > m.i ? `horizontales Scrollen (${m.s} > ${m.i})` : null
}

/** Stellt wiederholbar her, dass der Testbenutzer aktiv ist und die Rolle hat (wie formulare-detailseiten.spec.ts). */
async function mitRolle(page: Page, browser: Browser, konto: typeof BETRACHTER): Promise<void> {
  const erste = await meldeAnInNeuemKontext(browser, konto.email)
  await erste.kontext.close()

  await page.goto('/benutzerverwaltung')
  await page.getByRole('searchbox', { name: 'Benutzer suchen' }).fill(konto.email)
  await page.getByRole('button', { name: 'Suchen', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 Benutzer gefunden' })).toBeVisible()
  const auswahl = page.getByRole('combobox', { name: `Rolle von ${konto.name}` })
  await expect(auswahl).toBeVisible()
  if (!(await auswahl.textContent())?.includes(konto.rolle)) {
    await auswahl.click()
    await page.getByRole('option', { name: konto.rolle, exact: true }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Rolle ändern?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Rolle ändern' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: `Die Rolle von ${konto.name} wurde auf ${konto.rolle} geändert.` }),
    ).toBeVisible()
  }
  const reaktivieren = page.getByRole('button', { name: `${konto.name} reaktivieren` })
  if (await reaktivieren.isVisible()) {
    await reaktivieren.click()
    await expect(page.getByRole('button', { name: `${konto.name} deaktivieren` })).toBeVisible()
  }
  await expect(auswahl).toContainText(konto.rolle)
}

async function legeCoinAn(page: Page, name: string): Promise<string> {
  await page.goto('/coins/neu')
  await page.getByLabel(/^Name/).fill(name)
  await page.getByLabel(/^Herausgeber/).fill('Systemtest Herausgeber Übersicht')
  await page.getByLabel(/^Auflage/).fill('5')
  await page.getByRole('button', { name: 'Coin anlegen' }).click()
  await expect(page).toHaveURL(DETAIL_URL)
  return new URL(page.url()).pathname
}

async function erfasseAusgabe(page: Page, detailPfad: string, nummer: string): Promise<void> {
  await page.goto(`${detailPfad}/ausgaben/neu`)
  await expect(page.getByRole('heading', { level: 1, name: 'Ausgabe erfassen' })).toBeVisible()
  await page.getByLabel(/^Name des Empfängers/).fill(`Testperson ${eindeutig('Übersicht')}`)
  await page.getByLabel(/^Gelegenheit/).fill('Systemtest Gelegenheit')
  await page.getByLabel(/^Begründung/).fill('Systemtest Begründung')
  await page.getByLabel(/^Ausgebende Stelle oder Person/).fill('Systemtest Dienststelle Beispiel')
  await page.getByLabel(/^Hologrammnummer/).fill(nummer)
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'wurde ausgegeben.' })).toBeVisible()
}

async function oeffneVerwaltung(page: Page): Promise<void> {
  await page.goto('/verwaltung/startseite')
  await expect(page.getByRole('heading', { level: 1, name: 'Startseite verwalten' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Kopfbereich anzeigen' })).toBeVisible()
}

async function speichern(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Die Startseite wurde gespeichert.' })).toBeVisible()
}

/** Schaltet die Blöcke Infotext und Kennzahlen wie in der Standardkonfiguration ein (idempotent). */
async function stelleBloeckeWiederHer(browser: Browser): Promise<void> {
  const admin = await meldeAnInNeuemKontext(browser, ADMIN_EMAIL)
  try {
    await oeffneVerwaltung(admin.page)
    for (const name of ['Infotext', 'Kennzahlen', 'Neueste Coins', 'Meistausgegebene Coins']) {
      await admin.page.getByRole('switch', { name: `${name} anzeigen` }).setChecked(true)
    }
    if (await admin.page.getByRole('button', { name: 'Speichern', exact: true }).isEnabled())
      await speichern(admin.page)
    await admin.page.goto('/')
    await expect(admin.page.getByRole('region', { name: 'Kennzahlen' })).toBeVisible()
    await expect(admin.page.getByRole('region', { name: 'Information' })).toBeVisible()
  } finally {
    await admin.kontext.close()
  }
}

/** Raster-Messung wie im UI-Test (AK-2): Zellen je Block, Zeilen nach oberer Kante, Ränder der Seite. */
async function messeRaster(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement
    const zumKatalog = [...main.querySelectorAll('a')].find(
      (a) => a.textContent?.trim() === 'Zum Katalog',
    ) as HTMLElement
    const kandidaten = [
      ...main.querySelectorAll<HTMLElement>('h1'),
      ...main.querySelectorAll<HTMLElement>('section[aria-labelledby], section[aria-label]'),
    ]
    const anker = kandidaten.filter((a) => !kandidaten.some((b) => b !== a && b.contains(a)))
    const zellen = anker.map((a) => {
      let zelle: HTMLElement = a
      for (let e = a.parentElement; e && e !== main; e = e.parentElement) {
        if (e.contains(zumKatalog) || anker.some((b) => b !== a && e.contains(b))) break
        zelle = e
      }
      const r = zelle.getBoundingClientRect()
      return { links: r.left, rechts: r.right, oben: r.top, unten: r.bottom, hoehe: r.height }
    })
    let seite: HTMLElement | null = zumKatalog.parentElement
    while (seite && !anker.every((a) => seite!.contains(a))) seite = seite.parentElement
    const s = (seite ?? main).getBoundingClientRect()
    const zeilen: Array<typeof zellen> = []
    for (const zelle of [...zellen].sort((a, b) => a.oben - b.oben || a.links - b.links)) {
      const zeile = zeilen.find((z) => Math.abs(z[0].oben - zelle.oben) <= 1)
      if (zeile) zeile.push(zelle)
      else zeilen.push([zelle])
    }
    return { links: s.left, rechts: s.right, zeilen }
  })
}

/** Befunde der Raster-Messung (leer = keine Lücke). */
async function lueckenBefunde(page: Page): Promise<string[]> {
  const { links, rechts, zeilen } = await messeRaster(page)
  const befunde: string[] = []
  zeilen.forEach((zeile, i) => {
    if (Math.abs(zeile[0].links - links) > 1) befunde.push(`Zeile ${i + 1}: linker Rand`)
    if (Math.abs(zeile[zeile.length - 1].rechts - rechts) > 1) befunde.push(`Zeile ${i + 1}: rechter Rand`)
    const hoehen = zeile.map((z) => z.hoehe)
    if (Math.max(...hoehen) - Math.min(...hoehen) > 1) befunde.push(`Zeile ${i + 1}: ungleiche Höhe`)
    if (i > 0) {
      const abstand = Math.min(...zeile.map((z) => z.oben)) - Math.max(...zeilen[i - 1].map((z) => z.unten))
      if (Math.abs(abstand - 24) > 1) befunde.push(`Zeile ${i + 1}: Abstand ${abstand}`)
    }
  })
  return befunde
}

/** Prüft axe und horizontales Scrollen für die aktuelle Seite bei 360 und 1280 px, hell und dunkel. */
async function pruefeAxeUndBreite(page: Page, laden: () => Promise<void>): Promise<string[]> {
  const befunde: string[] = []
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((wert) => localStorage.setItem('coin-theme', wert), theme)
    for (const breite of [360, 1280]) {
      await page.setViewportSize({ width: breite, height: 900 })
      await laden()
      await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`))
      befunde.push(...(await axeVerstoesse(page)).map((v) => `${theme} ${breite}: ${v}`))
      if (breite === 360) {
        const scrollen = await horizontalesScrollen(page)
        if (scrollen) befunde.push(`${theme} ${breite}: ${scrollen}`)
      }
    }
  }
  await page.evaluate(() => localStorage.setItem('coin-theme', 'light'))
  return befunde
}

test.afterAll(async ({ browser }) => {
  await stelleBloeckeWiederHer(browser)
})

let nummern: string[] = []

test('(1) Administrator legt Coins und Ausgaben an und schaltet Kennzahlen und Infotext aus; / zeigt keine Lücke', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000)
  await meldeAn(page, ADMIN_EMAIL)
  await mitRolle(page, browser, BETRACHTER)

  nummern = [hologrammnummer('UE'), hologrammnummer('UF')]
  const coinA = await legeCoinAn(page, eindeutig('Systemtest Übersicht A'))
  const coinB = await legeCoinAn(page, eindeutig('Systemtest Übersicht B'))
  await erfasseAusgabe(page, coinA, nummern[0])
  await erfasseAusgabe(page, coinB, nummern[1])

  await oeffneVerwaltung(page)
  await page.getByRole('switch', { name: 'Kennzahlen anzeigen' }).setChecked(false)
  await page.getByRole('switch', { name: 'Infotext anzeigen' }).setChecked(false)
  await speichern(page)

  for (const breite of [1280, 360]) {
    await page.setViewportSize({ width: breite, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Meistausgegebene Coins' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Kennzahlen' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Information' })).toHaveCount(0)

    expect(await lueckenBefunde(page), `Lücken bei ${breite} px`).toEqual([])
  }

  const befunde = await pruefeAxeUndBreite(page, async () => {
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Neueste Coins' })).toBeVisible()
  })
  expect(befunde).toEqual([])
})

test('(2) Katalog: Ansicht „Karten“ bleibt nach dem Neuladen; axe und 360 px ohne Befund', async ({ page }) => {
  test.setTimeout(180_000)
  await meldeAn(page, ADMIN_EMAIL)
  await page.goto('/coins')
  await expect(page.getByRole('table', { name: 'Coins' })).toBeVisible()
  const ansicht = page.getByRole('group', { name: 'Ansicht' })

  await ansicht.getByRole('button', { name: 'Karten', exact: true }).click()
  await expect(page.getByRole('main').getByRole('list', { name: 'Coins' })).toBeVisible()
  await page.reload()

  await expect(page.getByRole('main').getByRole('list', { name: 'Coins' })).toBeVisible()
  await expect(ansicht.getByRole('button', { name: 'Karten', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('coin-katalog-ansicht'))).toBe('karten')
  expect(page.url()).not.toMatch(/ansicht|karten/)

  const befunde = await pruefeAxeUndBreite(page, async () => {
    await page.goto('/coins')
    await expect(page.getByRole('main').getByRole('list', { name: 'Coins' })).toBeVisible()
  })
  expect(befunde).toEqual([])
})

test('(3) Betrachter prüft beide Nummern nur per Tastatur nacheinander und sieht keine Empfängerdaten', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  expect(nummern, 'Schritt (1) hat keine Nummern erfasst').toHaveLength(2)
  const betrachter = await meldeAnInNeuemKontext(browser, BETRACHTER.email)
  try {
    const page = betrachter.page
    const pruefungen: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/pruefung')) pruefungen.push(new URL(r.url()).pathname)
    })
    await page.goto('/pruefung')
    await expect(page.getByRole('heading', { level: 1, name: 'Zertifikat prüfen' })).toBeVisible()
    const feld = page.getByLabel(/^Hologrammnummer/)

    await feld.focus()
    await page.keyboard.type(nummern[0])
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 2, name: 'Zertifikat gültig' })).toBeVisible()
    await expect(feld).toBeFocused()
    expect(
      await feld.evaluate((el) => {
        const f = el as HTMLInputElement
        return f.selectionStart === 0 && f.selectionEnd === f.value.length
      }),
    ).toBe(true)

    await page.keyboard.type(nummern[1])
    await page.keyboard.press('Enter')
    await expect(page.getByText(`Geprüfte Nummer: ${nummern[1]}`)).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Zertifikat gültig' })).toBeVisible()

    expect(pruefungen).toEqual(['/api/pruefung', '/api/pruefung'])
    const region = page.locator('[role="status"][aria-live="polite"]')
    await expect(region.locator('svg.lucide-circle-check[aria-hidden="true"]')).toHaveCount(1)
    for (const begriff of ['Empfängerdaten', 'Empfänger', 'Gelegenheit', 'Begründung', 'Ausgebende Stelle']) {
      await expect(region.getByText(begriff, { exact: true })).toHaveCount(0)
    }
    await expect(region.getByRole('link', { name: 'Zur Ausgabe' })).toHaveCount(0)
    await expect(region).not.toContainText('Testperson')
    await expect(region).not.toContainText('Grund')

    const befunde = await pruefeAxeUndBreite(page, async () => {
      await page.goto('/pruefung')
      await page.getByLabel(/^Hologrammnummer/).fill(nummern[0])
      await page.getByLabel(/^Hologrammnummer/).press('Enter')
      await expect(page.getByRole('heading', { level: 2, name: 'Zertifikat gültig' })).toBeVisible()
    })
    expect(befunde).toEqual([])
  } finally {
    await betrachter.kontext.close()
  }
})
