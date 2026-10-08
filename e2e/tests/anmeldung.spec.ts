import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { fuelleKeycloakFormular, meldeAn } from './hilfen/anmeldung'

// Systemtests Anmeldung (Feature anmeldung-keycloak, AK-37) gegen echten Systemtest-Keycloak (5184),
// echte API (5182) und Wegwerf-Datenbank. Testbenutzer sind synthetisch (infra/keycloak/coin-realm.json).
// Feature katalog-seiten: Das Formular liegt auf /coins/neu; /coins zeigt statt des Anmeldehinweises bzw. des Hinweises
// „Coins erfassen können nur …“ nur mit coins.write den Link „Coin hinzufügen“. Coins werden über die Suche gefunden.

const MOTIV_PNG = fileURLToPath(new URL('../fixtures/motiv.png', import.meta.url))

function eindeutig(praefix: string): string {
  return `${praefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

test('(a) anonym zeigt /coins die Liste mit geladenem Vorschaubild, aber weder Formular noch „Coin hinzufügen“', async ({
  page,
  browser,
}) => {
  // Vorbereitung als Admin: Coin mit Bild anlegen.
  const name = eindeutig('Systemtest Anonym sichtbar')
  await meldeAn(page, 'admin@test.local')
  await page.goto('/coins/neu')
  await page.getByLabel(/^Name/).fill(name)
  await page.getByLabel(/^Herausgeber/).fill('Systemtest Herausgeber')
  await page.getByLabel(/^Motivbild/).setInputFiles(MOTIV_PNG)
  await page.getByRole('button', { name: 'Coin anlegen' }).click()
  await expect(page.getByText('Coin wurde angelegt.')).toBeVisible()

  // Prüfung in einem neuen, anonymen Browser-Kontext.
  const anonymKontext = await browser.newContext({ baseURL: 'http://localhost:5183', locale: 'de-DE' })
  const anonym = await anonymKontext.newPage()
  try {
    await anonym.goto('/coins')
    await expect(anonym.getByRole('table')).toBeVisible()
    await expect(anonym.getByRole('link', { name: 'Coin hinzufügen' })).toHaveCount(0)
    await anonym.getByRole('searchbox', { name: 'Coins suchen' }).fill(name)
    await anonym.getByRole('button', { name: 'Suchen' }).click()

    const zeile = anonym.getByRole('row').filter({ has: anonym.getByRole('cell', { name, exact: true }) })
    await expect(zeile).toHaveCount(1)
    const bild = zeile.getByRole('img', { name: `Motiv: ${name}` })
    await expect(bild).toBeVisible()
    await expect.poll(() => bild.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
    await expect(anonym.getByRole('button', { name: 'Coin anlegen' })).toHaveCount(0)
    await expect(anonym.getByRole('link', { name: 'Coin hinzufügen' })).toHaveCount(0)
    await expect(anonym).toHaveURL(/^http:\/\/localhost:5183\/coins(\?|$)/)
  } finally {
    await anonymKontext.close()
  }
})

test('(b) Admin meldet sich an, sieht seinen Namen, meldet sich ab und muss sich danach erneut am Formular anmelden', async ({
  page,
}) => {
  await meldeAn(page, 'admin@test.local')
  await expect(page.locator('header')).toContainText('Test Administrator')

  await page.locator('header').getByRole('button', { name: 'Abmelden' }).click()

  await expect(page).toHaveURL('http://localhost:5183/abgemeldet')
  await expect(page.getByRole('heading', { level: 1, name: 'Abgemeldet' })).toBeVisible()
  await page.goto('/coins')
  await expect(page.locator('header').getByRole('button', { name: 'Anmelden' })).toBeVisible()
  await page.locator('header').getByRole('button', { name: 'Anmelden' }).click()
  // SSO-Sitzung ist beendet: Keycloak zeigt wieder das Formular statt direkt zurückzuleiten.
  await expect(page.locator('#username')).toBeVisible()
  await expect(page.locator('#kc-login')).toBeVisible()
})

test('(c) neu@test.local landet auf „Kein Zugriff“ und sieht über „Zum Coin-Katalog“ die Liste ohne Formular', async ({
  page,
}) => {
  await page.goto('/coins')
  await page.locator('header').getByRole('button', { name: 'Anmelden' }).click()
  await fuelleKeycloakFormular(page, 'neu@test.local')

  await expect(page).toHaveURL('http://localhost:5183/kein-zugriff')
  await expect(page.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeVisible()
  await expect(page.getByText(/Sie sind als Test Neu angemeldet/)).toBeVisible()

  await page.getByRole('main').getByRole('link', { name: 'Zum Coin-Katalog' }).click()

  await expect(page).toHaveURL('http://localhost:5183/coins')
  await expect(page.getByRole('table').or(page.getByText('Noch keine Coins erfasst.'))).toBeVisible()
  await expect(page.getByRole('link', { name: 'Coin hinzufügen' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Coin anlegen' })).toHaveCount(0)
})
