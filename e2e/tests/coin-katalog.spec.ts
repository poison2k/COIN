import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { meldeAn } from './hilfen/anmeldung'

// Systemtests Coin-Katalog (Pilot): zentraler Nutzerfluss über Browser, Vite-Proxy, API und PostgreSQL.
// Testdaten sind synthetisch; Namen erhalten ein eindeutiges Suffix, da sich die Tests eines Laufs die (pro Lauf neue) Datenbank teilen.
// Feature katalog-seiten: Angelegt wird auf /coins/neu, danach geht es zur Detailseite /coins/{id}. In der Liste wird der
// Coin über die Suche gefunden (Paginierung, AK-14).

const MOTIV_PNG = fileURLToPath(new URL('../fixtures/motiv.png', import.meta.url))
const DETAIL_URL = /^http:\/\/localhost:5183\/coins\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function eindeutig(praefix: string): string {
  return `${praefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function fuelleFormular(
  page: Page,
  daten: { name?: string; herausgeber?: string; auflage?: string; bild?: string },
): Promise<void> {
  if (daten.name !== undefined) await page.getByLabel(/^Name/).fill(daten.name)
  if (daten.herausgeber !== undefined) await page.getByLabel(/^Herausgeber/).fill(daten.herausgeber)
  if (daten.auflage !== undefined) await page.getByLabel(/^Auflage/).fill(daten.auflage)
  if (daten.bild !== undefined) await page.getByLabel(/^Motivbild/).setInputFiles(daten.bild)
}

function zeileMit(page: Page, name: string) {
  return page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) })
}

/** Öffnet den Katalog und sucht nach dem Namen. */
async function sucheImKatalog(page: Page, name: string): Promise<void> {
  await page.goto('/coins')
  await page.getByRole('searchbox', { name: 'Coins suchen' }).fill(name)
  await page.getByRole('button', { name: 'Suchen' }).click()
  await expect(page.getByRole('status').filter({ hasText: /\d+ Coins? gefunden/ })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  // Feature anmeldung-keycloak (AK-37): Schreiben nur angemeldet; Anmeldung als Bootstrap-Admin über Keycloak.
  await meldeAn(page, 'admin@test.local')
  await page.goto('/coins/neu')
  await expect(page.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeVisible()
})

test('Coin mit Bild anlegen: Detailseite zeigt das geladene Motivbild, die Liste das Vorschaubild', async ({ page }) => {
  const name = eindeutig('Systemtest Coin mit Bild')
  await fuelleFormular(page, { name, herausgeber: 'Systemtest Herausgeber', auflage: '250', bild: MOTIV_PNG })
  await expect(page.getByRole('img', { name: 'Vorschau des Motivbilds' })).toBeVisible()

  await page.getByRole('button', { name: 'Coin anlegen' }).click()

  await expect(page).toHaveURL(DETAIL_URL)
  await expect(page.getByText('Coin wurde angelegt.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  const motiv = page.getByRole('img', { name: `Motiv: ${name}` })
  await expect(motiv).toBeVisible()
  await expect.poll(() => motiv.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)

  await sucheImKatalog(page, name)
  const zeile = zeileMit(page, name)
  await expect(zeile).toHaveCount(1)
  await expect(zeile.getByRole('cell', { name: 'Systemtest Herausgeber' })).toBeVisible()
  await expect(zeile.getByRole('cell', { name: '250', exact: true })).toBeVisible()

  const vorschaubild = zeile.getByRole('img', { name: `Motiv: ${name}` })
  await expect(vorschaubild).toBeVisible()
  await expect(vorschaubild).toHaveAttribute('loading', 'lazy')
  await expect.poll(() => vorschaubild.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)

  const box = await vorschaubild.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeLessThanOrEqual(64)
  expect(box!.height).toBeLessThanOrEqual(64)
})

test('Coin mit Bild bleibt nach Neuladen der Detailseite mit Motivbild erhalten', async ({ page }) => {
  const name = eindeutig('Systemtest Coin Neuladen')
  await fuelleFormular(page, { name, herausgeber: 'Systemtest Herausgeber', bild: MOTIV_PNG })
  await page.getByRole('button', { name: 'Coin anlegen' }).click()
  await expect(page.getByText('Coin wurde angelegt.')).toBeVisible()

  await page.reload()

  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByText('Coin wurde angelegt.')).toHaveCount(0)
  const motiv = page.getByRole('img', { name: `Motiv: ${name}` })
  await expect(motiv).toBeVisible()
  await expect.poll(() => motiv.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
})

test('Coin ohne Auflage und ohne Bild: Detailseite und Liste zeigen „unbekannt“ und kein Bild', async ({ page }) => {
  const name = eindeutig('Systemtest Coin ohne Auflage')
  await fuelleFormular(page, { name, herausgeber: 'Systemtest Herausgeber' })

  await page.getByRole('button', { name: 'Coin anlegen' }).click()

  await expect(page).toHaveURL(DETAIL_URL)
  await expect(page.locator('dl')).toContainText('unbekannt')
  await expect(page.getByText('Kein Motivbild vorhanden.')).toBeVisible()

  await sucheImKatalog(page, name)
  const zeile = zeileMit(page, name)
  await expect(zeile).toHaveCount(1)
  await expect(zeile.getByText('unbekannt')).toBeVisible()
  await expect(zeile.getByText('Kein Bild')).toBeVisible()
})

test('Pflichtfeld leer: Feldfehler am Namensfeld, nichts wird gesendet', async ({ page }) => {
  let posts = 0
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/coins')) posts++
  })
  await fuelleFormular(page, { herausgeber: 'Systemtest Herausgeber' })

  await page.getByRole('button', { name: 'Coin anlegen' }).click()

  const nameFeld = page.getByLabel(/^Name/)
  await expect(nameFeld).toHaveAttribute('aria-invalid', 'true')
  await expect(nameFeld).toHaveAccessibleDescription(/.+/)
  await expect(page).toHaveURL('http://localhost:5183/coins/neu')
  expect(posts).toBe(0)
})

test('Duplikat: Konfliktmeldung, Eingaben bleiben erhalten, die Seite bleibt stehen', async ({ page }) => {
  const name = eindeutig('Systemtest Duplikat')
  await fuelleFormular(page, { name, herausgeber: 'Systemtest Herausgeber' })
  await page.getByRole('button', { name: 'Coin anlegen' }).click()
  await expect(page.getByText('Coin wurde angelegt.')).toBeVisible()

  await page.goto('/coins/neu')
  await fuelleFormular(page, { name: name.toUpperCase(), herausgeber: 'systemtest herausgeber' })
  await page.getByRole('button', { name: 'Coin anlegen' }).click()

  await expect(page.getByText('Ein Coin mit diesem Namen und Herausgeber existiert bereits.')).toBeVisible()
  await expect(page.getByLabel(/^Name/)).toHaveValue(name.toUpperCase())
  await expect(page).toHaveURL('http://localhost:5183/coins/neu')
  await sucheImKatalog(page, name)
  await expect(zeileMit(page, name)).toHaveCount(1)
})
