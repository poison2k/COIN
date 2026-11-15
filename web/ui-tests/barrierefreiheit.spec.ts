import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { richteApiEin, SEITEN, setzeTheme, type ApiZustand, type SeitenFall } from './hilfen/api.js'
import { erwarteKeineAxeVerstoesse } from './hilfen/pruefungen.js'
import { ADMIN, AUSGABE, COIN, richteFormularApiEin } from './hilfen/formulare.js'
import {
  ansichtsKnopf,
  BETRACHTER,
  mockeAudit,
  mockeKatalog,
  mockePruefung,
  oeffneAuditLog,
  oeffneStartseitenFall,
  pruefePerEnter,
  SACHBEARBEITER,
  STARTSEITEN_FAELLE,
  UEBERSCHRIFT,
  type Ergebnis,
} from './hilfen/uebersicht.js'

// Feature design-fundament, AK-28, AK-40, AK-41 (ADR-0037 Punkt 1): axe meldet 0 Verstöße der Stufe serious/critical
// auf allen Seiten aus Abschnitt 11.2 (hell und dunkel bei 1280 px, hell bei 360 px), mit geöffnetem Mobilmenü und auf
// der Bausteinseite mit Dialog und Toast. API und IdP sind gemockt, alle Daten synthetisch.

let api: ApiZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

async function oeffne(page: Page, fall: SeitenFall, theme: 'light' | 'dark', breite: number): Promise<void> {
  await page.setViewportSize({ width: breite, height: 900 })
  await setzeTheme(page, theme)
  api = await richteApiEin(page, fall.als)
  await page.goto(fall.pfad)
  await fall.bereit(page)
  await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`))
}

for (const fall of SEITEN) {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: ${fall.name} (${theme}, 1280 px) ohne serious/critical`, async ({ page }) => {
      test.slow()
      await oeffne(page, fall, theme, 1280)

      await erwarteKeineAxeVerstoesse(page)
    })
  }

  test(`axe: ${fall.name} (light, 360 px) ohne serious/critical`, async ({ page }) => {
    test.slow()
    await oeffne(page, fall, 'light', 360)

    await erwarteKeineAxeVerstoesse(page)
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`axe: geöffnetes Mobilmenü (${theme}, 360 px) ohne serious/critical`, async ({ page }) => {
    await oeffne(
      page,
      SEITEN.find((s) => s.name === 'start')!,
      theme,
      360,
    )

    await page.getByRole('button', { name: 'Seitenleiste ein-/ausblenden' }).click()
    await expect(page.getByRole('dialog', { name: 'Seitenleiste' })).toBeVisible()

    await erwarteKeineAxeVerstoesse(page)
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`axe: Bausteinseite mit geöffnetem Dialog (${theme}) ohne serious/critical`, async ({ page }) => {
    await oeffne(
      page,
      SEITEN.find((s) => s.name === 'bausteine')!,
      theme,
      1280,
    )

    await abschnittsButton(page, /^Dialog\b/).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await erwarteKeineAxeVerstoesse(page)
  })

  test(`axe: Bausteinseite mit sichtbarem Toast (${theme}) ohne serious/critical`, async ({ page }) => {
    await oeffne(
      page,
      SEITEN.find((s) => s.name === 'bausteine')!,
      theme,
      1280,
    )

    await abschnittsButton(page, /^Toast\b/).click()
    const region = page.getByRole('region', { name: 'Benachrichtigungen' })
    await expect(region.getByRole('button', { name: 'Meldung schließen' }).first()).toBeVisible()

    await erwarteKeineAxeVerstoesse(page)
  })
}

/** Erster Button nach der Abschnittsüberschrift (h2) auf der Bausteinseite. */
function abschnittsButton(page: Page, ueberschrift: RegExp) {
  return page
    .getByRole('heading', { level: 2, name: ueberschrift })
    .locator('xpath=following::*[self::button or @role="button"][1]')
}

test.describe('Aktiver Menüpunkt nicht nur über Farbe (AK-28, AK-40)', () => {
  async function stil(page: Page, name: string) {
    return page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('link', { name, exact: true })
      .evaluate((el) => {
        const s = getComputedStyle(el)
        const vor = getComputedStyle(el, '::before')
        const nach = getComputedStyle(el, '::after')
        const balken = [vor, nach].some(
          (p) => p.content !== 'none' && p.content !== 'normal' && parseFloat(p.width) >= 2 && p.display !== 'none',
        )
        return {
          gewicht: Number(s.fontWeight),
          balken:
            balken || parseFloat(s.borderLeftWidth) >= 2 || (s.boxShadow !== 'none' && s.boxShadow.includes('inset')),
        }
      })
  }

  test('hebt den aktiven Eintrag mit Schriftgewicht ≥ 600 hervor, den inaktiven nicht', async ({ page }) => {
    await oeffne(
      page,
      SEITEN.find((s) => s.name === 'katalog')!,
      'light',
      1280,
    )

    expect((await stil(page, 'Katalog')).gewicht).toBeGreaterThanOrEqual(600)
    expect((await stil(page, 'Startseite')).gewicht).toBeLessThan(600)
  })

  test('zeigt am aktiven Eintrag einen Balken, am inaktiven nicht', async ({ page }) => {
    await oeffne(
      page,
      SEITEN.find((s) => s.name === 'katalog')!,
      'light',
      1280,
    )

    expect((await stil(page, 'Katalog')).balken).toBe(true)
    expect((await stil(page, 'Startseite')).balken).toBe(false)
  })
})

test.describe('Links im Fließtext sind unterstrichen (AK-40)', () => {
  for (const name of ['kein-zugriff', 'abgemeldet', 'bausteine', 'start']) {
    test(`unterstreicht Links in Absätzen auf „${name}“`, async ({ page }) => {
      await oeffne(
        page,
        SEITEN.find((s) => s.name === name)!,
        'light',
        1280,
      )

      const ohneUnterstreichung = await page.locator('main p a').evaluateAll((links) =>
        links
          .filter((a) => (a as HTMLElement).offsetParent !== null)
          .filter((a) => !getComputedStyle(a).textDecorationLine.includes('underline'))
          .map((a) => a.textContent?.trim()),
      )
      expect(ohneUnterstreichung).toEqual([])
    })
  }
})

// ---------- formulare-detailseiten, AK-37: Seiten dieses Laufs (360/1280, hell/dunkel), Fehlerzustände, Dialoge ----------

const FORMULAR_SEITEN = [
  { name: 'coin-anlegen', pfad: '/coins/neu', h1: 'Coin hinzufügen', absenden: 'Coin anlegen', leeren: [] as RegExp[] },
  {
    name: 'coin-bearbeiten',
    pfad: `/coins/${COIN.id}/bearbeiten`,
    h1: 'Coin bearbeiten',
    absenden: 'Änderungen speichern',
    leeren: [/^Name/, /^Herausgeber/],
  },
  {
    name: 'ausgabe-erfassen',
    pfad: `/coins/${COIN.id}/ausgaben/neu`,
    h1: 'Ausgabe erfassen',
    absenden: 'Ausgabe speichern',
    leeren: [] as RegExp[],
  },
  {
    name: 'startseite-verwaltung',
    pfad: '/verwaltung/startseite',
    h1: 'Startseite verwalten',
    absenden: 'Speichern',
    leeren: [/^Infotext/],
  },
]

const WEITERE_SEITEN = [
  {
    name: 'ausgabe-detail',
    pfad: `/coins/${COIN.id}/ausgaben/${AUSGABE.id}`,
    h1: `Ausgabe von Exemplar Nr. ${AUSGABE.exemplarNummer}`,
  },
  { name: 'benutzerverwaltung', pfad: '/benutzerverwaltung', h1: 'Benutzerverwaltung' },
]

async function oeffneFormularSeite(page: Page, pfad: string, h1: string, theme: 'light' | 'dark', breite: number) {
  await page.setViewportSize({ width: breite, height: 900 })
  api = await richteFormularApiEin(page, ADMIN, { theme })
  await page.goto(pfad)
  await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`))
}

for (const seite of [...FORMULAR_SEITEN, ...WEITERE_SEITEN]) {
  for (const breite of [360, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`axe (formulare-detailseiten): ${seite.name} (${theme}, ${breite} px) ohne serious/critical`, async ({
        page,
      }) => {
        test.slow()
        await oeffneFormularSeite(page, seite.pfad, seite.h1, theme, breite)

        await erwarteKeineAxeVerstoesse(page)
      })
    }
  }
}

for (const seite of FORMULAR_SEITEN) {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe (formulare-detailseiten): ${seite.name} im Fehlerzustand mit Zusammenfassung (${theme})`, async ({
      page,
    }) => {
      test.slow()
      await oeffneFormularSeite(page, seite.pfad, seite.h1, theme, 1280)
      // Textfeld per Rolle, damit nicht der gleichnamige Schalter (z. B. „Infotext anzeigen“) getroffen wird.
      for (const feld of seite.leeren) await page.getByRole('textbox', { name: feld }).first().fill('')

      await page.getByRole('button', { name: seite.absenden, exact: true }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'Bitte die markierten Eingaben prüfen.' })).toBeVisible()

      await erwarteKeineAxeVerstoesse(page)
    })
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`axe (formulare-detailseiten): geöffnete Verlassen-Warnung (${theme})`, async ({ page }) => {
    await oeffneFormularSeite(page, '/coins/neu', 'Coin hinzufügen', theme, 1280)
    await page.getByLabel(/^Name/).fill('Coin Neu')
    await page.getByRole('link', { name: 'Abbrechen' }).click()
    await expect(page.getByRole('alertdialog', { name: 'Ungespeicherte Änderungen' })).toBeVisible()

    await erwarteKeineAxeVerstoesse(page)
  })
}

// ---------- startseite-listen-pruefung, AK-40 und AK-33: alle Seiten hell/dunkel bei 360 und 1280 px, Zustände ----------

for (const fall of SEITEN) {
  test(`axe (startseite-listen-pruefung): ${fall.name} (dark, 360 px) ohne serious/critical`, async ({ page }) => {
    test.slow()
    await oeffne(page, fall, 'dark', 360)

    await erwarteKeineAxeVerstoesse(page)
  })

  for (const breite of [360, 1280]) {
    test(`axe heading-order (AK-33): ${fall.name} (${breite} px) ohne Befund`, async ({ page }) => {
      await oeffne(page, fall, 'light', breite)

      const ergebnis = await new AxeBuilder({ page }).withRules(['heading-order']).analyze()
      expect(ergebnis.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([])
    })
  }
}

const THEMES_BREITEN = (['light', 'dark'] as const).flatMap((theme) =>
  [360, 1280].map((breite) => [theme, breite] as const),
)

for (const fall of STARTSEITEN_FAELLE) {
  for (const [theme, breite] of THEMES_BREITEN) {
    test(`axe (AK-40): Startseite ${fall.name} (${theme}, ${breite} px) ohne serious/critical`, async ({ page }) => {
      test.slow()
      api = await oeffneStartseitenFall(page, fall, { breite, theme })

      await erwarteKeineAxeVerstoesse(page)
    })
  }
}

const KATALOG_ZUSTAENDE: ReadonlyArray<[string, { coins?: unknown[]; fehler?: number; karten?: boolean }, RegExp]> = [
  ['Tabelle', {}, /gefunden/],
  ['Karten', { karten: true }, /gefunden/],
  ['leer', { coins: [] }, /0 Coins gefunden|Noch keine Coins erfasst/],
  ['Fehler', { fehler: 5 }, /Coins konnten nicht geladen werden/],
]

for (const [name, zustand, bereit] of KATALOG_ZUSTAENDE) {
  for (const [theme, breite] of THEMES_BREITEN) {
    test(`axe (AK-40): Katalog ${name} (${theme}, ${breite} px) ohne serious/critical`, async ({ page }) => {
      test.slow()
      await page.setViewportSize({ width: breite, height: 900 })
      await setzeTheme(page, theme)
      api = await richteApiEin(page, ADMIN)
      await mockeKatalog(page, { coins: zustand.coins, fehler: zustand.fehler })
      await page.goto('/coins')
      await expect(page.getByRole('main').getByText(bereit).first()).toBeVisible()
      if (zustand.karten) {
        await ansichtsKnopf(page, 'Karten').click()
        await expect(page.getByRole('main').getByRole('list', { name: 'Coins' })).toBeVisible()
      }

      await erwarteKeineAxeVerstoesse(page)
    })
  }
}

for (const ergebnis of Object.keys(UEBERSCHRIFT) as Ergebnis[]) {
  for (const [theme, breite] of THEMES_BREITEN) {
    for (const [rolle, me] of [
      ['Betrachter', BETRACHTER],
      ['Sachbearbeiter', SACHBEARBEITER],
    ] as const) {
      test(`axe (AK-40): Prüfmaske ${ergebnis} als ${rolle} (${theme}, ${breite} px) ohne serious/critical`, async ({
        page,
      }) => {
        test.slow()
        await page.setViewportSize({ width: breite, height: 900 })
        await setzeTheme(page, theme)
        api = await richteApiEin(page, me)
        await mockePruefung(page)
        await page.goto('/pruefung')
        await expect(page.getByRole('heading', { level: 1, name: 'Zertifikat prüfen' })).toBeVisible()

        await pruefePerEnter(page, ergebnis)

        await erwarteKeineAxeVerstoesse(page)
      })
    }
  }
}

for (const [name, leer] of [
  ['mit aktivem Filter', false],
  ['leer', true],
] as const) {
  for (const [theme, breite] of THEMES_BREITEN) {
    test(`axe (AK-40): Audit-Log ${name} (${theme}, ${breite} px) ohne serious/critical`, async ({ page }) => {
      test.slow()
      await page.setViewportSize({ width: breite, height: 900 })
      await setzeTheme(page, theme)
      api = await richteApiEin(page, ADMIN)
      await mockeAudit(page, { leer })
      await oeffneAuditLog(page)
      const panel = page.getByRole('tabpanel', { name: 'Audit-Log' })
      if (leer) {
        await expect(panel.getByRole('heading', { level: 3, name: 'Noch keine Einträge.' })).toBeVisible()
      } else {
        const feld = panel.getByRole('combobox', { name: /^Benutzer/ })
        await feld.click()
        await feld.pressSequentially('Betr')
        await page.getByRole('option', { name: BETRACHTER.name }).click()
        await expect(panel.getByRole('list', { name: 'Aktive Filter' })).toBeVisible()
      }

      await erwarteKeineAxeVerstoesse(page)
    })
  }
}
