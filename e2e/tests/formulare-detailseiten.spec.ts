import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { meldeAn, meldeAnInNeuemKontext } from './hilfen/anmeldung'

// Systemtest formulare-detailseiten (Entwurf Abschnitt 8; AK-11, AK-17, AK-20 bis AK-23, AK-27, AK-28, AK-37, AK-38)
// gegen echten Systemtest-Keycloak (5184), echte API (5182) und Wegwerf-Datenbank: Der Administrator legt per Tastatur
// einen Coin an (erst mit Fehler, dann erfolgreich), erfasst eine Ausgabe (landet auf „Ausgaben“) und storniert sie auf
// der Ausgabe-Seite über den Dialog mit Grund (Verlauf zeigt das Storno). Der Betrachter sieht Kennzahlen und Reiter
// ohne Aktionen. axe auf allen Reitern bei 360 und 1280 px, kein horizontales Scrollen. Alle Werte synthetisch.

const WEB = 'http://localhost:5183'
const DETAIL_URL = new RegExp(`^${WEB}/coins/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
const BETRACHTER = { email: 'betrachter@test.local', name: 'Test Betrachter', rolle: 'Betrachter' }

function eindeutig(praefix: string): string {
  return `${praefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

/** Drückt Tab, bis `ziel` fokussiert ist. */
async function tabBis(page: Page, ziel: Locator, max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await ziel.evaluate((el) => el === document.activeElement).catch(() => false)) return
    await page.keyboard.press('Tab')
  }
  await expect(ziel).toBeFocused()
}

/** Stellt wiederholbar her, dass der Testbenutzer aktiv ist und die Rolle hat (wie coin-ausgaben.spec.ts). */
async function mitRolle(
  page: Page,
  browser: Browser,
  konto: { email: string; name: string; rolle: string },
): Promise<void> {
  const erste = await meldeAnInNeuemKontext(browser, konto.email)
  await erste.kontext.close()

  await page.goto('/benutzerverwaltung')
  await page.getByRole('searchbox', { name: 'Benutzer suchen' }).fill(konto.email)
  await page.getByRole('button', { name: 'Suchen' }).click()
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

test('Formulare und Detailseiten: Anlegen per Tastatur, Erfassen, Storno mit Dialog, Rollen und axe je Reiter', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000)
  const coinName = eindeutig('Systemtest Formular')
  const empfaenger = `Testperson ${eindeutig('Formular')}`
  let detailPfad = ''
  let ausgabePfad = ''

  await test.step('1. Administrator legt per Tastatur einen Coin an: erst mit Fehler, dann erfolgreich', async () => {
    await meldeAn(page, 'admin@test.local')
    await mitRolle(page, browser, BETRACHTER)
    await page.goto('/coins/neu')
    await expect(page.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeVisible()

    await tabBis(page, page.getByLabel(/^Name/))
    await page.keyboard.type(coinName)
    await tabBis(page, page.getByLabel(/^Auflage/))
    await page.keyboard.type('5')
    await page.keyboard.press('Enter')

    await expect(page.getByLabel(/^Herausgeber/)).toBeFocused()
    await expect(page.getByLabel(/^Herausgeber/)).toHaveAttribute('aria-invalid', 'true')
    await expect(page).toHaveURL(/\/coins\/neu$/)

    await page.keyboard.type('Systemtest Herausgeber')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(DETAIL_URL)
    await expect(page.getByRole('status').filter({ hasText: 'Coin wurde angelegt.' })).toBeVisible()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    detailPfad = new URL(page.url()).pathname
  })

  await test.step('2. Kopf mit Aktionen und Kennzahlen; Ausgabe erfassen landet auf „Ausgaben“', async () => {
    await expect(page.getByRole('heading', { level: 1, name: coinName })).toBeVisible()
    await expect(page.getByText('Exemplare verfügbar', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Kennzahlen' }).locator('dl')).toHaveText(
      /Auflage\s*5\s*Ausgegeben\s*0\s*Verfügbar\s*5/,
    )
    await expect(page.getByRole('tab', { name: 'Exemplare' })).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('link', { name: 'Ausgabe erfassen' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Ausgabe erfassen' })).toBeVisible()
    await tabBis(page, page.getByLabel(/^Name des Empfängers/))
    await page.keyboard.type(empfaenger)
    await tabBis(page, page.getByLabel(/^Gelegenheit/))
    await page.keyboard.type('Systemtest Gelegenheit')
    await tabBis(page, page.getByLabel(/^Begründung/))
    await page.keyboard.type('Systemtest Begründung')
    await tabBis(page, page.getByLabel(/^Ausgebende Stelle oder Person/))
    await page.keyboard.type('Dienststelle Beispiel')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(`${WEB}${detailPfad}`)
    await expect(page.getByRole('status').filter({ hasText: 'Exemplar Nr. 1 wurde ausgegeben.' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Ausgaben' })).toHaveAttribute('aria-selected', 'true')
    const link = page
      .getByRole('table', { name: 'Ausgabehistorie' })
      .getByRole('link', { name: /^Ausgabe C[0-9]{4,}-0001 anzeigen$/ })
    await link.click()
    await expect(page).toHaveURL(new RegExp(`^${WEB}${detailPfad}/ausgaben/[0-9a-f-]{36}$`))
    ausgabePfad = new URL(page.url()).pathname
  })

  await test.step('3. Storno auf der Ausgabe-Seite über den Dialog mit Grund; Verlauf zeigt das Storno', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 1' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Verlauf' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Ausgabe erfasst' })).toBeVisible()
    const stornieren = page.getByRole('main').getByRole('button', { name: /stornieren/i })

    await stornieren.click()
    const dialog = page.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })
    await dialog.getByRole('button', { name: 'Stornieren', exact: true }).click()
    await expect(dialog.getByLabel(/^Grund/)).toHaveAttribute('aria-invalid', 'true')
    await dialog.getByLabel(/^Grund/).fill('Systemtest Storno Formular')
    await dialog.getByRole('button', { name: 'Stornieren', exact: true }).click()

    await expect(dialog).toHaveCount(0)
    // nacharbeiten-audit-filter K2: role="status" am Container, fokussiert wird das Banner darin (ADR-0047).
    const meldung = page
      .getByRole('status')
      .filter({ hasText: 'Die Ausgabe wurde storniert.' })
      .locator('[data-slot="alert"]')
    await expect(meldung).toBeVisible()
    await expect(meldung).toBeFocused()
    await expect(page.getByRole('listitem').filter({ hasText: 'Ausgabe storniert' })).toContainText(
      'Grund: Systemtest Storno Formular',
    )
    await expect(page.getByRole('main').getByRole('button', { name: /stornieren/i })).toHaveCount(0)
  })

  await test.step('4. Betrachter sieht Kennzahlen und Reiter, aber keine Aktionen', async () => {
    const betrachter = await meldeAnInNeuemKontext(browser, BETRACHTER.email)
    try {
      const bt = betrachter.page
      const ausgabenAbrufe: string[] = []
      bt.on('request', (r) => {
        if (/\/api\/coins\/[^/]+\/ausgaben/.test(new URL(r.url()).pathname)) ausgabenAbrufe.push(r.url())
      })
      await bt.goto(detailPfad)
      await expect(bt.getByRole('heading', { level: 1, name: coinName })).toBeVisible()

      await expect(bt.getByRole('region', { name: 'Kennzahlen' })).toBeVisible()
      await expect(bt.getByRole('tab')).toHaveText(['Stammdaten', 'Exemplare'])
      await expect(bt.getByRole('button', { name: 'Auflage ändern' })).toHaveCount(0)
      await expect(bt.getByRole('link', { name: 'Bearbeiten' })).toHaveCount(0)
      await expect(bt.getByRole('link', { name: 'Ausgabe erfassen' })).toHaveCount(0)
      await expect(bt.locator('body')).not.toContainText(empfaenger)
      expect(ausgabenAbrufe).toEqual([])
    } finally {
      await betrachter.kontext.close()
    }
  })

  await test.step('5. axe auf allen Reitern und der Ausgabe-Seite bei 360 und 1280 px, kein horizontales Scrollen', async () => {
    const befunde: string[] = []
    const ziele = [
      ...['stammdaten', 'exemplare', 'ausgaben', 'vorlage'].map((r) => `${detailPfad}?reiter=${r}`),
      ausgabePfad,
    ]
    for (const ziel of ziele) {
      for (const breite of [1280, 360]) {
        await page.setViewportSize({ width: breite, height: 900 })
        await page.goto(ziel)
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
        await expect(page.getByRole('status').filter({ hasText: /wird geladen/ })).toHaveCount(0)
        befunde.push(...(await axeVerstoesse(page)).map((v) => `${ziel} ${breite} px: ${v}`))
        const scrollen = await horizontalesScrollen(page)
        if (scrollen) befunde.push(`${ziel} ${breite} px: ${scrollen}`)
      }
    }

    expect(befunde).toEqual([])
  })
})
