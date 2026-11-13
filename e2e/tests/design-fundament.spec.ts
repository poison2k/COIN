import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { meldeAn } from './hilfen/anmeldung'

// Systemtest design-fundament (AK-33, AK-41, ADR-0037 Punkt 5) gegen echten Systemtest-Keycloak (5184), echte API (5182)
// und Wegwerf-Datenbank: Der Administrator legt einen Coin und eine Ausgabe an. Danach meldet axe auf den Hauptseiten
// mit echten Daten keine Verstöße der Stufe serious/critical, und bei 360 px scrollt keine Seite horizontal – jeweils
// hell und dunkel. Alle Werte sind synthetisch; die Specs teilen sich die Datenbank (workers: 1).

const WEB = 'http://localhost:5183'
const DETAIL_URL = new RegExp(`^${WEB}/coins/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

function eindeutig(praefix: string): string {
  return `${praefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** axe mit WCAG 2.0/2.1 A und AA; nur Regel-Id, Selektor und Hilfe-URL in der Ausgabe (keine Seiteninhalte). */
async function axeVerstoesse(page: Page): Promise<string[]> {
  const ergebnis = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return ergebnis.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}) ${n.target.join(' ')} – ${v.helpUrl}`))
}

async function scrollbreite(page: Page): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
}

test('Hauptseiten mit echten Daten: axe ohne serious/critical und kein horizontales Scrollen bei 360 px, hell und dunkel', async ({
  page,
}) => {
  // Anmeldung, Anlegen und 7 Seiten × 2 Themes × 2 Breiten mit axe.
  test.setTimeout(240_000)
  const coinName = eindeutig('Systemtest Gestaltung')
  const empfaenger = `Testperson ${eindeutig('Gestaltung')}`
  let detailPfad = ''
  let ausgabePfad = ''

  await test.step('1. Administrator meldet sich an und legt Coin und Ausgabe an', async () => {
    await meldeAn(page, 'admin@test.local')
    await page.goto('/coins/neu')
    await page.getByLabel(/^Name/).fill(coinName)
    await page.getByLabel(/^Herausgeber/).fill('Systemtest Herausgeber')
    await page.getByLabel(/^Auflage/).fill('5')
    await page.getByRole('button', { name: 'Coin anlegen' }).click()
    await expect(page).toHaveURL(DETAIL_URL)
    detailPfad = new URL(page.url()).pathname

    await page.getByRole('link', { name: 'Ausgabe erfassen' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Ausgabe erfassen' })).toBeVisible()
    await page.getByLabel(/^Name des Empfängers/).fill(empfaenger)
    await page.getByLabel(/^Gelegenheit/).fill('Systemtest Gelegenheit')
    await page.getByLabel(/^Begründung/).fill('Systemtest Begründung')
    await page.getByLabel(/^Ausgebende Stelle oder Person/).fill('Systemtest Dienststelle')
    await page.getByRole('button', { name: 'Ausgabe speichern' }).click()
    await expect(page).toHaveURL(`${WEB}${detailPfad}`)

    await page
      .getByRole('table', { name: 'Ausgabehistorie' })
      .getByRole('link', { name: /^Ausgabe C[0-9]{4,}-0001 anzeigen$/ })
      .click()
    await expect(page).toHaveURL(new RegExp(`^${WEB}${detailPfad}/ausgaben/[0-9a-f-]{36}$`))
    ausgabePfad = new URL(page.url()).pathname
  })

  const seiten = () => [
    { pfad: '/', h1: /.+/ },
    { pfad: '/coins', h1: 'Katalog' },
    { pfad: detailPfad, h1: coinName },
    { pfad: ausgabePfad, h1: 'Ausgabe von Exemplar Nr. 1' },
    { pfad: '/pruefung', h1: 'Zertifikat prüfen' },
    { pfad: '/benutzerverwaltung', h1: 'Benutzerverwaltung' },
    { pfad: '/verwaltung/startseite', h1: 'Startseite verwalten' },
  ]

  for (const theme of ['light', 'dark'] as const) {
    await test.step(`2. Hauptseiten im Farbschema ${theme}`, async () => {
      await page.evaluate((wert) => localStorage.setItem('coin-theme', wert), theme)
      const befunde: string[] = []

      for (const { pfad, h1 } of seiten()) {
        await page.setViewportSize({ width: 1280, height: 900 })
        await page.goto(pfad)
        await expect(page.getByRole('heading', { level: 1, name: h1 }).first()).toBeVisible()
        await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`))
        await expect(page.getByRole('status').filter({ hasText: /wird geladen/ })).toHaveCount(0)
        befunde.push(...(await axeVerstoesse(page)).map((v) => `${pfad} 1280 px: ${v}`))

        await page.setViewportSize({ width: 360, height: 800 })
        await expect(page.getByRole('heading', { level: 1, name: h1 }).first()).toBeVisible()
        befunde.push(...(await axeVerstoesse(page)).map((v) => `${pfad} 360 px: ${v}`))
        const masse = await scrollbreite(page)
        if (masse.scrollWidth > masse.innerWidth) {
          befunde.push(`${pfad} 360 px: horizontales Scrollen (${masse.scrollWidth} > ${masse.innerWidth})`)
        }
      }

      expect(befunde).toEqual([])
    })
  }
})
