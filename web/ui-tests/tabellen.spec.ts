import { expect, test, type Page } from '@playwright/test'
import { scrolltNichtHorizontal } from './hilfen/api.js'
import {
  ADMIN,
  AUSGABE,
  COIN,
  keineAbgeschnitteneTabelle,
  richteFormularApiEin,
  type SchreibZustand,
} from './hilfen/formulare.js'

// Feature formulare-detailseiten, AK-29 bis AK-34 und AK-38 (Tabellenmuster, ADR-0041, UI-Test mit gemockter API):
// Karten statt Tabelle unterhalb der Kartenbreite (Exemplare, Benutzer, Audit-Log, Vorlagenversionen 768 px;
// Ausgabehistorie 1024 px), keine abgeschnittene Tabelle bei 360 px, Sortierung der Vorlagenversionen, Zeilenklick der
// Historie, Blättern unter den Karten, Tabellenlinks ≥ 40 px.

let api: SchreibZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

const DETAIL = `/coins/${COIN.id}`

interface TabellenFall {
  name: string
  pfad: string
  /** Bereitet die Ansicht vor (z. B. Tab „Audit-Log“ öffnen). */
  vorbereiten?: (page: Page) => Promise<void>
  /** Breite, unterhalb der Karten erscheinen. */
  kartenUnter: number
  eigeneVorlage?: boolean
}

const TABELLEN: TabellenFall[] = [
  { name: 'Exemplare', pfad: DETAIL, kartenUnter: 768 },
  { name: 'Ausgabehistorie', pfad: `${DETAIL}?reiter=ausgaben`, kartenUnter: 1024 },
  { name: 'Benutzer', pfad: '/benutzerverwaltung', kartenUnter: 768 },
  {
    name: 'Änderungsprotokoll',
    pfad: '/benutzerverwaltung',
    kartenUnter: 768,
    vorbereiten: async (page) => {
      await page.getByRole('tab', { name: 'Änderungsprotokoll' }).click()
    },
  },
  { name: 'Versionen der Zertifikatsvorlage', pfad: `${DETAIL}?reiter=vorlage`, kartenUnter: 768, eigeneVorlage: true },
]

async function oeffne(page: Page, fall: TabellenFall, breite: number) {
  await page.setViewportSize({ width: breite, height: 900 })
  api = await richteFormularApiEin(page, ADMIN, { eigeneVorlage: fall.eigeneVorlage })
  await page.goto(fall.pfad)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await fall.vorbereiten?.(page)
}

test.describe('Karten statt Tabelle (AK-30)', () => {
  for (const fall of TABELLEN) {
    for (const breite of [360, 768, 1280]) {
      const karten = breite < fall.kartenUnter
      test(`${fall.name} bei ${breite} px als ${karten ? 'Karten' : 'Tabelle'}`, async ({ page }) => {
        await oeffne(page, fall, breite)

        if (karten) {
          const liste = page.getByRole('list', { name: fall.name, exact: true })
          await expect(liste).toBeVisible()
          await expect(page.getByRole('table', { name: fall.name, exact: true })).toHaveCount(0)
          const karte = liste.getByRole('listitem').first()
          await expect(karte.getByRole('heading', { level: 3 })).toBeVisible()
          await expect(karte.locator('dl')).toBeVisible()
        } else {
          await expect(page.getByRole('table', { name: fall.name, exact: true })).toBeVisible()
          await expect(page.getByRole('list', { name: fall.name, exact: true })).toHaveCount(0)
        }
        await keineAbgeschnitteneTabelle(page)
      })
    }
  }
})

test.describe('Keine abgeschnittene Tabelle bei 360 px (AK-30, AK-38)', () => {
  const SEITEN = [
    { pfad: DETAIL, h1: COIN.name },
    { pfad: `${DETAIL}?reiter=ausgaben`, h1: COIN.name },
    { pfad: `${DETAIL}?reiter=vorlage`, h1: COIN.name },
    { pfad: `${DETAIL}?reiter=stammdaten`, h1: COIN.name },
    { pfad: `${DETAIL}/ausgaben/${AUSGABE.id}`, h1: `Ausgabe von Exemplar Nr. ${AUSGABE.exemplarNummer}` },
    { pfad: '/benutzerverwaltung', h1: 'Benutzerverwaltung' },
    { pfad: '/coins/neu', h1: 'Coin hinzufügen' },
    { pfad: `${DETAIL}/bearbeiten`, h1: 'Coin bearbeiten' },
    { pfad: `${DETAIL}/ausgaben/neu`, h1: 'Ausgabe erfassen' },
    { pfad: '/verwaltung/startseite', h1: 'Startseite verwalten' },
  ]

  for (const { pfad, h1 } of SEITEN) {
    test(`${pfad} bei 360 px`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 900 })
      api = await richteFormularApiEin(page, ADMIN, { eigeneVorlage: true })
      await page.goto(pfad)
      await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible()
      await page.waitForLoadState('networkidle')

      await keineAbgeschnitteneTabelle(page)
    })
  }
})

test('Ausgabehistorie bei 1280 px vollständig ohne horizontales Scrollen (AK-29)', async ({ page }) => {
  await oeffne(page, TABELLEN[1], 1280)
  const tabelle = page.getByRole('table', { name: 'Ausgabehistorie' })
  await expect(tabelle).toBeVisible()

  const masse = await tabelle.evaluate((t) => {
    const huelle = t.parentElement as HTMLElement
    return { scroll: huelle.scrollWidth, sichtbar: huelle.clientWidth }
  })
  expect(masse.scroll).toBeLessThanOrEqual(masse.sichtbar)
  await scrolltNichtHorizontal(page)
})

test.describe('Sortierung der Vorlagenversionen (AK-31)', () => {
  test('sortiert per Tastatur (Enter) im Spaltenkopf „Version“ und zeigt aria-sort', async ({ page }) => {
    await oeffne(page, TABELLEN[4], 1280)
    const kopf = page.getByRole('columnheader', { name: 'Version' })
    await expect(kopf).toHaveAttribute('aria-sort', 'descending')

    await kopf.getByRole('button', { name: 'Version' }).focus()
    await page.keyboard.press('Enter')

    await expect(kopf).toHaveAttribute('aria-sort', 'ascending')
  })

  test('seitenweise Tabellen haben keinen Sortier-Button, nur aria-sort', async ({ page }) => {
    await oeffne(page, TABELLEN[0], 1280)
    const tabelle = page.getByRole('table', { name: 'Exemplare' })

    await expect(tabelle.getByRole('columnheader', { name: 'Nr.' })).toHaveAttribute('aria-sort', 'ascending')
    await expect(tabelle.getByRole('columnheader').getByRole('button')).toHaveCount(0)
  })
})

test.describe('Zeilenklick der Ausgabehistorie (AK-32)', () => {
  test('Klick in eine Zelle öffnet die Ausgabe-Seite', async ({ page }) => {
    await oeffne(page, TABELLEN[1], 1280)
    const zeile = page.getByRole('table', { name: 'Ausgabehistorie' }).getByRole('row').nth(1)

    await zeile.getByRole('cell').filter({ hasText: AUSGABE.gelegenheit }).click()

    await expect(page).toHaveURL(new RegExp(`/coins/${COIN.id}/ausgaben/${AUSGABE.id}$`))
  })

  test('Strg-Klick in eine Zelle navigiert nicht', async ({ page }) => {
    await oeffne(page, TABELLEN[1], 1280)
    const zeile = page.getByRole('table', { name: 'Ausgabehistorie' }).getByRole('row').nth(1)

    await zeile
      .getByRole('cell')
      .filter({ hasText: AUSGABE.gelegenheit })
      .click({ modifiers: ['Control'] })

    await page.waitForTimeout(200)
    await expect(page).toHaveURL(new RegExp(`${DETAIL}\\?reiter=ausgaben$`))
  })

  test('Doppelklick zum Markieren navigiert nicht ein zweites Mal', async ({ page }) => {
    await oeffne(page, TABELLEN[1], 1280)
    const zelle = page
      .getByRole('table', { name: 'Ausgabehistorie' })
      .getByRole('row')
      .nth(1)
      .getByRole('cell')
      .filter({ hasText: AUSGABE.gelegenheit })

    await zelle.evaluate((el) => window.getSelection()?.selectAllChildren(el))
    await zelle.dispatchEvent('click', { detail: 1 })

    await page.waitForTimeout(200)
    await expect(page).toHaveURL(new RegExp(`${DETAIL}\\?reiter=ausgaben$`))
  })

  test('jede Zeile ist per Tastatur über den Link erreichbar; die Zeile hat keinen Tab-Stopp', async ({ page }) => {
    await oeffne(page, TABELLEN[1], 1280)
    const tabelle = page.getByRole('table', { name: 'Ausgabehistorie' })
    const link = tabelle.getByRole('link', { name: `Ausgabe ${AUSGABE.zertifikatsnummer} anzeigen` })

    await link.focus()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(new RegExp(`/ausgaben/${AUSGABE.id}$`))
    await page.goBack()
    await expect(tabelle.locator('tr[tabindex]')).toHaveCount(0)
  })

  test('in der Kartenansicht ist der Titel der Link', async ({ page }) => {
    await oeffne(page, TABELLEN[1], 360)
    const karte = page.getByRole('list', { name: 'Ausgabehistorie' }).getByRole('listitem').first()

    await karte
      .getByRole('heading', { level: 3 })
      .getByRole('link', { name: `Ausgabe ${AUSGABE.zertifikatsnummer} anzeigen` })
      .click()

    await expect(page).toHaveURL(new RegExp(`/ausgaben/${AUSGABE.id}$`))
  })
})

test.describe('Filter-Chips (AK-33)', () => {
  test('Chip-Button ist mindestens 40 × 40 px groß', async ({ page }) => {
    await oeffne(page, { ...TABELLEN[0], pfad: `${DETAIL}?status=ausgegeben` }, 360)
    const knopf = page.getByRole('button', { name: 'Filter „Status: Ausgegeben“ entfernen' })

    const box = (await knopf.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(40)
    expect(box.height).toBeGreaterThanOrEqual(40)
  })

  test('Benutzersuche als Chip; Entfernen lädt ab Seite 1 und fokussiert das Suchfeld', async ({ page }) => {
    await oeffne(page, TABELLEN[2], 1280)
    await page.getByRole('searchbox', { name: 'Benutzer suchen' }).fill('Test')
    await page.getByRole('button', { name: 'Suchen' }).click()
    await expect(page.getByRole('list', { name: 'Aktive Filter' })).toContainText('Suche: Test')

    await page.getByRole('button', { name: 'Filter „Suche: Test“ entfernen' }).click()

    await expect(page.getByRole('list', { name: 'Aktive Filter' })).toHaveCount(0)
    await expect(page.getByRole('searchbox', { name: 'Benutzer suchen' })).toBeFocused()
  })
})

test.describe('Blättern und Links (AK-34, AK-38)', () => {
  test('steht in der Kartenansicht unter den Karten', async ({ page }) => {
    await oeffne(page, TABELLEN[0], 360)
    const liste = page.getByRole('list', { name: 'Exemplare', exact: true })
    const naechste = page.getByRole('button', { name: 'Nächste Seite' })

    expect((await naechste.boundingBox())!.y).toBeGreaterThan((await liste.boundingBox())!.y)
    await expect(page.getByText(/Seite 1 von 2/)).toBeVisible()
  })

  test('Links in der Ausgabehistorie sind mindestens 40 px hoch', async ({ page }) => {
    await oeffne(page, TABELLEN[1], 1280)
    const link = page
      .getByRole('table', { name: 'Ausgabehistorie' })
      .getByRole('link', { name: `Ausgabe ${AUSGABE.zertifikatsnummer} anzeigen` })

    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(40)
  })

  test('Kartenlinks in der Ausgabehistorie sind mindestens 40 px hoch', async ({ page }) => {
    await oeffne(page, TABELLEN[1], 360)
    const link = page
      .getByRole('list', { name: 'Ausgabehistorie' })
      .getByRole('link', { name: `Ausgabe ${AUSGABE.zertifikatsnummer} anzeigen` })

    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(40)
  })
})
