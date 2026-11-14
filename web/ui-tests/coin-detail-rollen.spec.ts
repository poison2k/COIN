import { expect, test, type Page } from '@playwright/test'
import { OHNE_ROLLE, scrolltNichtHorizontal, type Me } from './hilfen/api.js'
import { erwarteKeineAxeVerstoesse, zuKleineKlickflaechen } from './hilfen/pruefungen.js'
import {
  ADMIN,
  AUSGABE,
  BETRACHTER,
  COIN,
  SACHBEARBEITER,
  richteFormularApiEin,
  type SchreibZustand,
} from './hilfen/formulare.js'

// Feature formulare-detailseiten, AK-19 bis AK-24, AK-37 und AK-38 (Coin-Detailseite, UI-Test mit gemockter API):
// Kopf mit Status-Chips und Aktionen je Rolle, Region „Kennzahlen“ mit Fortschrittsbalken, Reiter je Berechtigung,
// `?reiter`, Tastatur in der Reiterleiste, axe je Reiter hell/dunkel bei 1280 und 360 px, kein horizontales Scrollen.

let api: SchreibZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

const DETAIL = `/coins/${COIN.id}`

async function oeffneDetail(page: Page, me: Me | null, pfad = DETAIL, breite = 1280, theme?: 'light' | 'dark') {
  await page.setViewportSize({ width: breite, height: 900 })
  api = await richteFormularApiEin(page, me, { theme })
  await page.goto(pfad)
  await expect(page.getByRole('heading', { level: 1, name: COIN.name })).toBeVisible()
}

const AKTIONEN = [
  { rolle: 'button', name: 'Auflage ändern' },
  { rolle: 'link', name: 'Bearbeiten' },
  { rolle: 'link', name: 'Ausgabe erfassen' },
] as const

test.describe('Aktionen und Reiter je Rolle (AK-19, AK-20, AK-22)', () => {
  for (const [name, me] of [
    ['Administrator', ADMIN],
    ['Sachbearbeiter', SACHBEARBEITER],
  ] as const) {
    test(`${name}: Aktionen im Kopf, vier Reiter, Chip „Exemplare verfügbar“`, async ({ page }) => {
      await oeffneDetail(page, me)

      for (const aktion of AKTIONEN) {
        await expect(page.getByRole(aktion.rolle, { name: aktion.name, exact: true })).toHaveCount(1)
      }
      await expect(page.getByRole('tab')).toHaveText(['Stammdaten', 'Exemplare', 'Ausgaben', 'Zertifikatsvorlage'])
      await expect(page.getByText('Exemplare verfügbar', { exact: true })).toBeVisible()
    })
  }

  test('Betrachter: keine Aktionen, Reiter „Stammdaten“ und „Exemplare“, Kennzahlen sichtbar', async ({ page }) => {
    await oeffneDetail(page, BETRACHTER)

    for (const aktion of AKTIONEN) {
      await expect(page.getByRole(aktion.rolle, { name: aktion.name, exact: true })).toHaveCount(0)
    }
    await expect(page.getByRole('tab')).toHaveText(['Stammdaten', 'Exemplare'])
    await expect(page.getByRole('region', { name: 'Kennzahlen' })).toBeVisible()
    await page.waitForTimeout(200)
    expect(api.aufrufe.filter((a) => a.includes('/ausgaben'))).toEqual([])
  })

  for (const [name, me] of [
    ['anonym', null],
    ['ohne Rolle', OHNE_ROLLE],
  ] as const) {
    test(`${name}: keine Aktionen, keine Reiterleiste, keine Kennzahlen, nur GET auf den Coin`, async ({ page }) => {
      await oeffneDetail(page, me)
      await page.waitForTimeout(200)

      for (const aktion of AKTIONEN) {
        await expect(page.getByRole(aktion.rolle, { name: aktion.name, exact: true })).toHaveCount(0)
      }
      await expect(page.getByRole('tablist')).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Kennzahlen' })).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 2, name: 'Stammdaten' })).toBeVisible()
      expect(api.aufrufe.filter((a) => a.startsWith('GET /api/coins/'))).toEqual([`GET /api/coins/${COIN.id}`])
    })
  }
})

test.describe('Kennzahlen (AK-21)', () => {
  test('zeigt Auflage, Ausgegeben, Verfügbar und den Fortschrittsbalken', async ({ page }) => {
    await oeffneDetail(page, BETRACHTER)

    const region = page.getByRole('region', { name: 'Kennzahlen' })
    await expect(region.locator('dl')).toHaveText(/Auflage\s*40\s*Ausgegeben\s*1\s*Verfügbar\s*39/)
    const balken = region.getByRole('progressbar')
    await expect(balken).toHaveAttribute('aria-valuenow', '39')
    await expect(balken).toHaveAttribute('aria-valuemax', '40')
    // 39/40 = 97,5 %: die Rundung legt der Entwurf nicht fest, geprüft wird das Textmuster.
    await expect(balken).toHaveAttribute('aria-valuetext', /^39 von 40 verfügbar \(9[78] %\)$/)
  })

  test('sendet genau einen Request auf …/exemplare', async ({ page }) => {
    await oeffneDetail(page, ADMIN)
    await expect(page.getByRole('table', { name: 'Exemplare' })).toBeVisible()
    await page.waitForTimeout(200)

    expect(api.aufrufe.filter((a) => a.endsWith('/exemplare'))).toHaveLength(1)
  })

  test('stellt die Karten ab 640 px nebeneinander und bei 360 px untereinander', async ({ page }) => {
    await oeffneDetail(page, BETRACHTER, DETAIL, 1280)
    const region = page.getByRole('region', { name: 'Kennzahlen' })
    const begriffe = region.locator('dt')
    // Erst messen, wenn die Kennzahlen geladen sind: Der Ladeplatzhalter wird sonst während der Messung ersetzt.
    await expect(region).not.toHaveAttribute('aria-busy', 'true')
    await expect(begriffe).toHaveCount(3)
    for (const i of [0, 1, 2]) await expect(begriffe.nth(i)).toBeVisible()
    const breit = await Promise.all([0, 1, 2].map(async (i) => (await begriffe.nth(i).boundingBox())!.y))
    expect(Math.max(...breit) - Math.min(...breit)).toBeLessThanOrEqual(2)

    await page.setViewportSize({ width: 360, height: 900 })
    const schmal = await Promise.all([0, 1, 2].map(async (i) => (await begriffe.nth(i).boundingBox())!.y))
    expect(schmal[1]).toBeGreaterThan(schmal[0])
    expect(schmal[2]).toBeGreaterThan(schmal[1])
  })
})

test.describe('Reiter in der URL und per Tastatur (AK-22, AK-23)', () => {
  test('?reiter=ausgaben öffnet die Ausgabehistorie direkt', async ({ page }) => {
    await oeffneDetail(page, ADMIN, `${DETAIL}?reiter=ausgaben`)

    await expect(page.getByRole('tab', { name: 'Ausgaben' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('table', { name: 'Ausgabehistorie' })).toContainText(AUSGABE.empfaenger.name)
  })

  test('ohne ?reiter ist „Exemplare“ offen und die Historie nicht geladen', async ({ page }) => {
    await oeffneDetail(page, ADMIN)
    await expect(page.getByRole('table', { name: 'Exemplare' })).toBeVisible()
    await page.waitForTimeout(200)

    await expect(page.getByRole('tab', { name: 'Exemplare' })).toHaveAttribute('aria-selected', 'true')
    expect(api.aufrufe.filter((a) => a.endsWith('/ausgaben'))).toEqual([])
    await expect(page.getByText(AUSGABE.empfaenger.name)).toHaveCount(0)
  })

  test('ein unbekannter Wert zeigt den Standardreiter ohne Fehler', async ({ page }) => {
    await oeffneDetail(page, ADMIN, `${DETAIL}?reiter=unsinn`)

    await expect(page.getByRole('tab', { name: 'Exemplare' })).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(new RegExp(`/coins/${COIN.id}`))
  })

  test('Pfeiltasten bewegen den Fokus, Enter wählt; Wechsel per replace mit status/seite', async ({ page }) => {
    await oeffneDetail(page, ADMIN, `${DETAIL}?status=verfuegbar&seite=2`)
    await expect(page.getByRole('table', { name: 'Exemplare' })).toBeVisible()
    const laenge = await page.evaluate(() => history.length)

    await page.getByRole('tab', { name: 'Exemplare' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Ausgaben' })).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Exemplare' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')

    await expect(page.getByRole('tab', { name: 'Ausgaben' })).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/reiter=ausgaben/)
    await expect(page).toHaveURL(/status=verfuegbar/)
    await expect(page).toHaveURL(/seite=2/)
    expect(await page.evaluate(() => history.length)).toBe(laenge)
  })

  test('der Statusfilter der Exemplare erscheint als Chip und lässt sich entfernen (AK-24)', async ({ page }) => {
    await oeffneDetail(page, ADMIN, `${DETAIL}?status=verfuegbar&seite=2`)
    const chips = page.getByRole('list', { name: 'Aktive Filter' })
    await expect(chips).toContainText('Status: Verfügbar')

    await page.getByRole('button', { name: 'Filter „Status: Verfügbar“ entfernen' }).click()

    await expect(page).not.toHaveURL(/status=/)
    await expect(page).not.toHaveURL(/seite=2/)
    await expect(page.getByRole('combobox', { name: 'Status' })).toBeFocused()
  })
})

test.describe('axe je Reiter (AK-37) und Breite (AK-38)', () => {
  const REITER = [
    ['stammdaten', 'Stammdaten'],
    ['exemplare', 'Exemplare'],
    ['ausgaben', 'Ausgaben'],
    ['vorlage', 'Zertifikatsvorlage'],
  ] as const

  for (const [wert, name] of REITER) {
    for (const breite of [1280, 360]) {
      for (const theme of ['light', 'dark'] as const) {
        test(`axe: Reiter „${name}“ (${theme}, ${breite} px) ohne serious/critical`, async ({ page }) => {
          test.slow()
          await oeffneDetail(page, ADMIN, `${DETAIL}?reiter=${wert}`, breite, theme)
          await expect(page.getByRole('tabpanel', { name })).toBeVisible()
          await expect(page.getByRole('status').filter({ hasText: /wird geladen/ })).toHaveCount(0)

          await erwarteKeineAxeVerstoesse(page)
        })
      }
    }

    for (const breite of [360, 768, 1280]) {
      test(`Reiter „${name}“ bei ${breite} px ohne horizontales Scrollen`, async ({ page }) => {
        await oeffneDetail(page, ADMIN, `${DETAIL}?reiter=${wert}`, breite)
        await expect(page.getByRole('tabpanel', { name })).toBeVisible()

        await scrolltNichtHorizontal(page)
      })
    }
  }

  test('Klickflächen im Kopf, in der Reiterleiste und in den Reitern ≥ 40 × 40 px (AK-38)', async ({ page }) => {
    await oeffneDetail(page, ADMIN, `${DETAIL}?reiter=ausgaben`, 360)
    await expect(
      page.getByRole('table', { name: 'Ausgabehistorie' }).or(page.getByRole('list', { name: 'Ausgabehistorie' })),
    ).toBeVisible()

    expect(await zuKleineKlickflaechen(page.getByRole('main'))).toEqual([])
    for (const reiter of await page.getByRole('tab').all()) {
      const box = (await reiter.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(40)
      expect(box.width).toBeGreaterThanOrEqual(40)
    }
  })
})
