import { expect, test, type Browser, type Page } from '@playwright/test'
import { meldeAn, meldeAnInNeuemKontext } from './hilfen/anmeldung'

// Systemtest katalog-seiten (AK-28) gegen echten Systemtest-Keycloak (5184), echte API (5182) und Wegwerf-Datenbank.
// Testbenutzer sind synthetisch (infra/keycloak/coin-realm.json). Die Tests eines Laufs teilen sich die Datenbank:
// Coins bekommen eindeutige Namen und werden über die Suche gefunden, nicht über die erste Seite.

const WEB = 'http://localhost:5183'
const BETRACHTER_EMAIL = 'betrachter@test.local'
const BETRACHTER_NAME = 'Test Betrachter'
const TEXT_KEINE_BERECHTIGUNG =
  'Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.'
const PLATZHALTER = 'Dieser Bereich wird in einer späteren Version ergänzt.'
const DETAIL_URL = new RegExp(`^${WEB}/coins/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

function eindeutig(praefix: string): string {
  return `${praefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Legt als angemeldeter Berechtigter über /coins/neu einen Coin an und wartet auf die Detailseite. */
async function legeCoinAn(page: Page, daten: { name: string; herausgeber: string; auflage?: string }): Promise<string> {
  await page.goto('/coins/neu')
  await page.getByLabel(/^Name/).fill(daten.name)
  await page.getByLabel(/^Herausgeber/).fill(daten.herausgeber)
  if (daten.auflage !== undefined) await page.getByLabel(/^Auflage/).fill(daten.auflage)
  await page.getByRole('button', { name: 'Coin anlegen' }).click()
  await expect(page).toHaveURL(DETAIL_URL)
  return new URL(page.url()).pathname
}

/** Sucht im Katalog nach dem Namen (genau ein Treffer erwartet). */
async function sucheImKatalog(page: Page, name: string): Promise<void> {
  await page.goto('/coins')
  await page.getByRole('searchbox', { name: 'Coins suchen' }).fill(name)
  await page.getByRole('button', { name: 'Suchen' }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 Coin gefunden' })).toBeVisible()
}

/** Wählt in der Benutzerverwaltung die Rolle des Betrachters und bestätigt den Dialog. */
async function waehleRolle(page: Page, rolle: string): Promise<void> {
  await page.getByRole('combobox', { name: `Rolle von ${BETRACHTER_NAME}` }).click()
  await page.getByRole('option', { name: rolle, exact: true }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Rolle ändern?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Rolle ändern' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: `Die Rolle von ${BETRACHTER_NAME} wurde auf ${rolle} geändert.` }),
  ).toBeVisible()
}

/**
 * Stellt wiederholbar her, dass betrachter@test.local angelegt, aktiv und mit der Rolle „Betrachter“ ist
 * (wie benutzerverwaltung.spec.ts). Der Admin muss in `page` angemeldet sein.
 */
async function betrachterMitRolle(page: Page, browser: Browser): Promise<void> {
  const erste = await meldeAnInNeuemKontext(browser, BETRACHTER_EMAIL)
  await erste.kontext.close()

  await page.goto('/benutzerverwaltung')
  await page.getByRole('searchbox', { name: 'Benutzer suchen' }).fill(BETRACHTER_EMAIL)
  await page.getByRole('button', { name: 'Suchen' }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 Benutzer gefunden' })).toBeVisible()
  const auswahl = page.getByRole('combobox', { name: `Rolle von ${BETRACHTER_NAME}` })
  await expect(auswahl).toBeVisible()
  if (!(await auswahl.textContent())?.includes('Betrachter')) await waehleRolle(page, 'Betrachter')
  const reaktivieren = page.getByRole('button', { name: `${BETRACHTER_NAME} reaktivieren` })
  if (await reaktivieren.isVisible()) {
    await reaktivieren.click()
    await expect(page.getByRole('button', { name: `${BETRACHTER_NAME} deaktivieren` })).toBeVisible()
  }
  await expect(auswahl).toContainText('Betrachter')
}

test('(1)+(2) Admin legt über „Coin hinzufügen“ einen Coin an, landet auf der Detailseite und findet ihn per Suche', async ({
  page,
}) => {
  const name = eindeutig('Systemtest Katalogseiten')
  await meldeAn(page, 'admin@test.local')

  // 1. Katalog → „Coin hinzufügen“ → Formular → Detailseite mit Meldung, Stammdaten und „Verleihungen“.
  await page.goto('/coins')
  await expect(page.getByRole('heading', { level: 1, name: 'Katalog' })).toBeVisible()
  await page.getByRole('link', { name: 'Coin hinzufügen' }).click()
  await expect(page).toHaveURL(`${WEB}/coins/neu`)
  await page.getByLabel(/^Name/).fill(name)
  await page.getByLabel(/^Herausgeber/).fill('Systemtest Herausgeber')
  await page.getByLabel(/^Auflage/).fill('1250')
  await page.getByRole('button', { name: 'Coin anlegen' }).click()

  await expect(page).toHaveURL(DETAIL_URL)
  const detailPfad = new URL(page.url()).pathname
  await expect(page.getByRole('status').filter({ hasText: 'Coin wurde angelegt.' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.locator('dl')).toContainText('Systemtest Herausgeber')
  await expect(page.locator('dl')).toContainText('1.250')
  await expect(page.getByText('Kein Motivbild vorhanden.')).toBeVisible()
  const verleihungen = page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: 'Verleihungen' }) })
  await expect(verleihungen).toContainText(PLATZHALTER)

  // 2. Die Suche im Katalog findet genau diesen Coin; ein Klick auf den Namen öffnet die Detailseite.
  await sucheImKatalog(page, name)
  await page.getByRole('link', { name, exact: true }).click()
  await expect(page).toHaveURL(`${WEB}${detailPfad}`)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByText('Coin wurde angelegt.')).toHaveCount(0)
})

test('(3) Betrachter sieht den Katalog ohne „Coin hinzufügen“; /coins/neu endet auf „Kein Zugriff“ ohne POST', async ({
  page,
  browser,
}) => {
  await meldeAn(page, 'admin@test.local')
  await betrachterMitRolle(page, browser)

  const sitzung = await meldeAnInNeuemKontext(browser, BETRACHTER_EMAIL)
  try {
    const betrachter = sitzung.page
    let posts = 0
    betrachter.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/coins') posts++
    })

    await betrachter.goto('/coins')
    await expect(betrachter.getByRole('heading', { level: 1, name: 'Katalog' })).toBeVisible()
    await expect(betrachter.getByRole('table').or(betrachter.getByText('Noch keine Coins erfasst.'))).toBeVisible()
    await expect(betrachter.getByRole('link', { name: 'Coin hinzufügen' })).toHaveCount(0)
    await expect(betrachter.getByRole('button', { name: 'Coin anlegen' })).toHaveCount(0)
    await expect(betrachter.getByLabel(/^Name/)).toHaveCount(0)

    await betrachter.goto('/coins/neu')

    await expect(betrachter).toHaveURL(`${WEB}/kein-zugriff?grund=berechtigung`)
    await expect(betrachter.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeVisible()
    await expect(betrachter.getByText(TEXT_KEINE_BERECHTIGUNG)).toBeVisible()
    await expect(betrachter.getByRole('button', { name: 'Coin anlegen' })).toHaveCount(0)
    expect(posts).toBe(0)
  } finally {
    await sitzung.kontext.close()
  }
})

test('(4) anonym zeigt /coins die Liste ohne „Coin hinzufügen“, die Detailseite ist lesbar', async ({ page, browser }) => {
  const name = eindeutig('Systemtest Anonym Detail')
  await meldeAn(page, 'admin@test.local')
  const detailPfad = await legeCoinAn(page, { name, herausgeber: 'Systemtest Herausgeber', auflage: '7' })

  const anonymKontext = await browser.newContext({ baseURL: WEB, locale: 'de-DE' })
  try {
    const anonym = await anonymKontext.newPage()
    await anonym.goto('/coins')
    await expect(anonym.getByRole('table')).toBeVisible()
    await expect(anonym.locator('header').getByRole('button', { name: 'Anmelden' })).toBeVisible()
    await expect(anonym.getByRole('link', { name: 'Coin hinzufügen' })).toHaveCount(0)

    await sucheImKatalog(anonym, name)
    await anonym.getByRole('link', { name, exact: true }).click()

    await expect(anonym).toHaveURL(`${WEB}${detailPfad}`)
    await expect(anonym.getByRole('heading', { level: 1, name })).toBeVisible()
    await expect(anonym.locator('dl')).toContainText('Systemtest Herausgeber')
    await expect(
      anonym.locator('section').filter({ has: anonym.getByRole('heading', { level: 2, name: 'Verleihungen' }) }),
    ).toContainText(PLATZHALTER)
  } finally {
    await anonymKontext.close()
  }
})
