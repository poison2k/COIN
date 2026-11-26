import { expect, test, type Locator, type Page } from '@playwright/test'
import { erwarteKeineAxeVerstoesse } from './hilfen/pruefungen.js'
import {
  ADMIN,
  AUSGABE,
  BETRACHTER,
  COIN,
  oeffne,
  richteFormularApiEin,
  tabBis,
  type SchreibZustand,
} from './hilfen/formulare.js'

// Feature formulare-detailseiten, AK-17, AK-18, AK-28 und AK-37 (Dialoge) (UI-Test mit gemockter API): Stornieren
// (Historie und Ausgabe-Seite), Deaktivieren und „Auf Standardvorlage zurücksetzen“ senden erst nach Bestätigung;
// „Abbrechen“ und Escape senden nichts und geben den Fokus zurück; Pflichtgrund beim Storno; Ladezustand.

let api: SchreibZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

const DETAIL = `/coins/${COIN.id}`
const AUSGABE_SEITE = `${DETAIL}/ausgaben/${AUSGABE.id}`

interface Fall {
  name: string
  pfad: string
  h1: string
  ausloeser: (page: Page) => Locator
  titel: string
  bestaetigen: string
  /** Endung des Pfads der schreibenden Anfrage. */
  ziel: RegExp
  grund: boolean
  eigeneVorlage?: boolean
}

const FAELLE: Fall[] = [
  {
    name: 'Stornieren in der Historie',
    pfad: `${DETAIL}?reiter=ausgaben`,
    h1: COIN.name,
    ausloeser: (page) =>
      page.getByRole('button', { name: `Ausgabe von Exemplar Nr. ${AUSGABE.exemplarNummer} stornieren` }),
    titel: 'Ausgabe stornieren?',
    bestaetigen: 'Stornieren',
    ziel: /\/storno$/,
    grund: true,
  },
  {
    name: 'Stornieren auf der Ausgabe-Seite',
    pfad: AUSGABE_SEITE,
    h1: `Ausgabe von Exemplar Nr. ${AUSGABE.exemplarNummer}`,
    ausloeser: (page) => page.getByRole('main').getByRole('button', { name: /stornieren/i }),
    titel: 'Ausgabe stornieren?',
    bestaetigen: 'Stornieren',
    ziel: /\/storno$/,
    grund: true,
  },
  {
    name: 'Deaktivieren',
    pfad: '/benutzerverwaltung',
    h1: 'Benutzerverwaltung',
    ausloeser: (page) => page.getByRole('button', { name: `${BETRACHTER.name} deaktivieren` }),
    titel: 'Benutzer deaktivieren?',
    bestaetigen: 'Deaktivieren',
    ziel: /\/status$/,
    grund: false,
  },
  {
    name: 'Auf Standardvorlage zurücksetzen',
    pfad: `${DETAIL}?reiter=vorlage`,
    h1: COIN.name,
    ausloeser: (page) => page.getByRole('button', { name: 'Auf Standardvorlage zurücksetzen' }),
    titel: 'Auf Standardvorlage zurücksetzen?',
    bestaetigen: 'Zurücksetzen',
    ziel: /\/zuruecksetzen$/,
    grund: false,
    eigeneVorlage: true,
  },
]

for (const fall of FAELLE) {
  test.describe(fall.name, () => {
    async function start(page: Page, verzoegerung = 0) {
      api = await richteFormularApiEin(page, ADMIN, { eigeneVorlage: fall.eigeneVorlage, verzoegerung })
      await oeffne(page, fall.pfad, fall.h1)
      await expect(fall.ausloeser(page)).toBeVisible()
    }

    const dialog = (page: Page) => page.getByRole('alertdialog', { name: fall.titel })
    const gesendet = () => api.schreiben.filter((a) => fall.ziel.test(a.pfad))

    test('öffnet einen alertdialog mit Titel und Beschreibung (AK-18)', async ({ page }) => {
      await start(page)

      await fall.ausloeser(page).click()

      await expect(dialog(page)).toBeVisible()
      const beschreibung = await dialog(page).evaluate((el) => {
        const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
        return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
      })
      expect(beschreibung.trim().length).toBeGreaterThan(0)
    })

    test('stellt den Bestätigungsbutton gefährlich dar (AK-18)', async ({ page }) => {
      await start(page)
      await fall.ausloeser(page).click()

      const knopf = dialog(page).getByRole('button', { name: fall.bestaetigen, exact: true })
      await expect(knopf).toHaveClass(/\bbg-destructive\b/)
    })

    test('„Abbrechen“ sendet nichts und gibt den Fokus an den Auslöser zurück (AK-17)', async ({ page }) => {
      await start(page)
      await tabBis(page, fall.ausloeser(page))
      await page.keyboard.press('Enter')
      await expect(dialog(page)).toBeVisible()

      await dialog(page).getByRole('button', { name: 'Abbrechen' }).click()

      await expect(dialog(page)).toHaveCount(0)
      await expect(fall.ausloeser(page)).toBeFocused()
      expect(gesendet()).toEqual([])
    })

    test('Escape sendet nichts und gibt den Fokus an den Auslöser zurück (AK-17)', async ({ page }) => {
      await start(page)
      await tabBis(page, fall.ausloeser(page))
      await page.keyboard.press('Enter')
      await expect(dialog(page)).toBeVisible()

      await page.keyboard.press('Escape')

      await expect(dialog(page)).toHaveCount(0)
      await expect(fall.ausloeser(page)).toBeFocused()
      expect(gesendet()).toEqual([])
    })

    test('sendet erst nach Bestätigung genau einen Request (AK-17)', async ({ page }) => {
      await start(page)
      await fall.ausloeser(page).click()
      if (fall.grund)
        await dialog(page)
          .getByLabel(/^Grund/)
          .fill('Doppelt erfasst')
      expect(gesendet()).toEqual([])

      await dialog(page).getByRole('button', { name: fall.bestaetigen, exact: true }).click()

      await expect(dialog(page)).toHaveCount(0)
      expect(gesendet()).toHaveLength(1)
    })

    test('zeigt während der Anfrage den Ladezustand und schließt nicht (AK-17)', async ({ page }) => {
      await start(page, 1500)
      await fall.ausloeser(page).click()
      if (fall.grund)
        await dialog(page)
          .getByLabel(/^Grund/)
          .fill('Doppelt erfasst')
      const knopf = dialog(page).getByRole('button', { name: fall.bestaetigen, exact: true })

      await knopf.click()
      await expect(knopf).toHaveAttribute('aria-busy', 'true')
      await page.keyboard.press('Escape')

      await expect(dialog(page)).toBeVisible()
      await expect(dialog(page)).toHaveCount(0, { timeout: 5000 })
    })

    if (fall.grund) {
      test('verlangt einen Grund: ohne Grund Feldfehler und kein Request (AK-17)', async ({ page }) => {
        await start(page)
        await fall.ausloeser(page).click()

        await dialog(page).getByRole('button', { name: fall.bestaetigen, exact: true }).click()

        await expect(dialog(page).getByLabel(/^Grund/)).toHaveAttribute('aria-invalid', 'true')
        await expect(dialog(page).getByText('Bitte einen Grund für das Storno angeben.')).toBeVisible()
        expect(gesendet()).toEqual([])
      })
    }

    for (const theme of ['light', 'dark'] as const) {
      test(`axe mit geöffnetem Dialog (${theme}) ohne serious/critical (AK-37)`, async ({ page }) => {
        api = await richteFormularApiEin(page, ADMIN, { eigeneVorlage: fall.eigeneVorlage, theme })
        await oeffne(page, fall.pfad, fall.h1)
        await fall.ausloeser(page).click()
        await expect(dialog(page)).toBeVisible()

        await erwarteKeineAxeVerstoesse(page)
      })
    }
  })
}

test.describe('Ausgabe-Seite nach dem Storno (AK-28)', () => {
  test('zeigt „storniert“, den Verlaufseintrag und die Meldung mit Fokus; Aktionen entfallen', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, AUSGABE_SEITE, `Ausgabe von Exemplar Nr. ${AUSGABE.exemplarNummer}`)
    await page
      .getByRole('main')
      .getByRole('button', { name: /stornieren/i })
      .click()
    const dialog = page.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })
    await dialog.getByLabel(/^Grund/).fill('Doppelt erfasst')

    await dialog.getByRole('button', { name: 'Stornieren', exact: true }).click()

    // nacharbeiten-audit-filter K2: role="status" am Container, fokussiert wird das Banner darin (ADR-0047).
    const meldung = page
      .getByRole('status')
      .filter({ hasText: 'Die Ausgabe wurde storniert.' })
      .locator('[data-slot="alert"]')
    await expect(meldung).toBeVisible()
    await expect(meldung).toBeFocused()
    await expect(page.getByRole('main').getByRole('button', { name: /stornieren/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Hologrammnummer/ })).toHaveCount(0)
    await expect(page.getByRole('listitem').filter({ hasText: 'Ausgabe storniert' })).toBeVisible()
    const download = page.getByRole('button', { name: /Zertifikat.*herunterladen/ })
    const gesperrt = await download.evaluate(
      (el) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true',
    )
    expect(gesperrt).toBe(true)
  })
})
