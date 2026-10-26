import { expect, test, type Page, type Route } from '@playwright/test'
import { mockeStartseiteStandard } from './startseite-mocks.js'

// AK-23, AK-24: App-Shell im Browser, API vollständig gemockt (synthetische Testdaten, AK-27).

interface Coin {
  id: string
  name: string
  herausgeber: string
  auflage: number | null
  beschreibung: string | null
  erstelltAm: string
  bildUrl: string | null
}

const TEST_COIN: Coin = {
  id: '0199a1b2-0000-7000-8000-000000000001',
  name: 'Coin Alpha',
  herausgeber: 'Herausgeber Beta',
  auflage: null,
  beschreibung: null,
  erstelltAm: '2026-10-05T12:00:00+00:00',
  bildUrl: null,
}

/** API-Aufrufe ohne passenden Mock; jeder Eintrag lässt den Test scheitern (AK-23). */
let ungemockt: string[] = []

/** Nur echte API-Pfade; Vite-Module wie /src/shared/api/http.ts dürfen nicht abgefangen werden. */
function istApi(url: URL): boolean {
  return url.pathname === '/api' || url.pathname.startsWith('/api/')
}

/** Mockt GET /api/coins mit der angegebenen Liste. Später registrierte Routen haben Vorrang vor dem Catch-all. */
async function mockeCoinListe(page: Page, coins: Coin[]): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/coins',
    async (route: Route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback()
        return
      }
      // Seit katalog-seiten (AK-1, Entscheidung F7) im Seiten-Format.
      const body = { eintraege: coins, gesamt: coins.length, seite: 1, groesse: 25 }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    },
  )
}

test.beforeEach(async ({ page }) => {
  ungemockt = []
  await page.route(istApi, async (route: Route) => {
    ungemockt.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    await route.abort('failed')
  })
  // startseite (9.7): `/` ruft jetzt GET /api/startseite bzw. …/kopf auf; Standardantworten statt Catch-all.
  await mockeStartseiteStandard(page)
})

test.afterEach(() => {
  expect(ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

test('zeigt unter / die Startseite', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Zum Katalog' })).toBeVisible()
})

test('führt über den Sidebar-Eintrag „Katalog“ ohne Neuladen zur Liste mit dem gemockten Coin', async ({ page }) => {
  await mockeCoinListe(page, [TEST_COIN])
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeVisible()
  // Marker im window-Objekt: Er überlebt nur eine clientseitige Navigation, kein Neuladen (AK-14).
  await page.evaluate(() => {
    ;(window as unknown as { ohneNeuladen?: boolean }).ohneNeuladen = true
  })

  await page.getByRole('link', { name: 'Katalog', exact: true }).click()

  await expect(page).toHaveURL(/\/coins$/)
  const zeile = page.getByRole('row').filter({ hasText: 'Coin Alpha' })
  await expect(zeile.getByRole('cell', { name: 'Coin Alpha', exact: true })).toBeVisible()
  await expect(zeile.getByRole('cell', { name: 'Herausgeber Beta', exact: true })).toBeVisible()
  await expect(zeile.getByRole('cell', { name: 'unbekannt', exact: true })).toBeVisible()
  await expect(zeile.getByText('Kein Bild')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { ohneNeuladen?: boolean }).ohneNeuladen)).toBe(true)
})

test('markiert nach der Navigation den Sidebar-Eintrag „Katalog“ als aktiv', async ({ page }) => {
  await mockeCoinListe(page, [])
  await page.goto('/')

  await page.getByRole('link', { name: 'Katalog', exact: true }).click()

  await expect(page.getByRole('link', { name: 'Katalog', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Startseite', exact: true })).not.toHaveAttribute('aria-current', 'page')
})

test('zeigt beim direkten Laden von /coins mit leerer Antwort „Noch keine Coins erfasst.“', async ({ page }) => {
  await mockeCoinListe(page, [])

  await page.goto('/coins')

  await expect(page.getByText('Noch keine Coins erfasst.')).toBeVisible()
})

test('behält das Farbschema „Dunkel“ nach dem Neuladen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeVisible()

  await page.getByRole('button', { name: 'Farbschema wählen' }).click()
  await page.getByRole('menuitem', { name: 'Dunkel' }).click()
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)

  await page.reload()

  await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)
  expect(await page.evaluate(() => localStorage.getItem('coin-theme'))).toBe('dark')
})

test('öffnet auf schmalem Bildschirm die Sidebar als Overlay und schließt es nach der Navigation', async ({ page }) => {
  await mockeCoinListe(page, [])
  await page.setViewportSize({ width: 500, height: 800 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei C.O.I.N.' })).toBeVisible()

  await page.getByRole('button', { name: 'Seitenleiste ein-/ausblenden' }).click()
  const overlay = page.getByRole('dialog', { name: 'Seitenleiste' })
  await expect(overlay).toBeVisible()
  await overlay.getByRole('link', { name: 'Katalog', exact: true }).click()

  await expect(overlay).toBeHidden()
  await expect(page).toHaveURL(/\/coins$/)
  await expect(page.getByText('Noch keine Coins erfasst.')).toBeVisible()
})
