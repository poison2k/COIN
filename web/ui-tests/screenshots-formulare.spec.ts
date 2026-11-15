import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { ADMIN, AUSGABE, BETRACHTER, COIN, richteFormularApiEin, type SchreibZustand } from './hilfen/formulare.js'

// Feature formulare-detailseiten, AK-41 (F10): Screenshots für die Sichtprüfung durch den Developer. Nur mit
// COIN_SCREENSHOTS=1; schreibt nach web/test-results/screenshots-formulare/<ansicht>_<breite>_<hell|dunkel>.png (per
// web/.gitignore ausgeschlossen, nicht eingecheckt). Ohne die Variable wird die Spec übersprungen und prüft keine
// Dateien. Nur gemockte, synthetische Daten („Testperson A“, „Dienststelle Beispiel“).
// Aufruf nur dieser Spec: `COIN_SCREENSHOTS=1 npx playwright test screenshots-formulare.spec.ts` (sonst überschreibt
// screenshots.spec.ts die eingecheckten Bilder in docs/design/ablage). Playwright leert test-results zu Beginn jedes
// Laufs; die Bilder direkt danach ansehen.

const ERZEUGEN = process.env.COIN_SCREENSHOTS === '1'
const BREITEN = [360, 768, 1280] as const
const THEMES = [
  ['light', 'hell'],
  ['dark', 'dunkel'],
] as const

const DETAIL = `/coins/${COIN.id}`
const AUSGABE_SEITE = `${DETAIL}/ausgaben/${AUSGABE.id}`

function ablage(): string {
  // rootDir ist web/ui-tests; Ablage unter web/test-results/screenshots-formulare.
  return path.resolve(test.info().config.rootDir, '..', 'test-results', 'screenshots-formulare')
}

const h1 = async (page: Page, name: string | RegExp) =>
  expect(page.getByRole('heading', { level: 1, name })).toBeVisible()

async function fehlerzustand(page: Page, absenden: string) {
  await page.getByRole('button', { name: absenden, exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Bitte die markierten Eingaben prüfen.' })).toBeVisible()
}

async function stornoDialog(page: Page) {
  await page
    .getByRole('main')
    .getByRole('button', { name: /stornieren/i })
    .first()
    .click()
  const dialog = page.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })
  await expect(dialog).toBeVisible()
  return dialog
}

interface Ansicht {
  name: string
  pfad: string
  als?: typeof ADMIN
  eigeneVorlage?: boolean
  /** Bringt die Seite in den gewünschten Zustand. */
  zustand: (page: Page) => Promise<void>
}

const ANSICHTEN: Ansicht[] = [
  // Formulare aus 4.2: Fehler- und Erfolgsfall
  {
    name: 'coin-anlegen-fehler',
    pfad: '/coins/neu',
    zustand: async (page) => {
      await h1(page, 'Coin hinzufügen')
      await page.getByLabel(/^Auflage/).fill('abc')
      await fehlerzustand(page, 'Coin anlegen')
    },
  },
  {
    name: 'coin-anlegen-erfolg',
    pfad: '/coins/neu',
    zustand: async (page) => {
      await h1(page, 'Coin hinzufügen')
      await page.getByLabel(/^Name/).fill('Coin Neu')
      await page.getByLabel(/^Herausgeber/).fill('Herausgeber Beispiel')
      await page.getByRole('button', { name: 'Coin anlegen' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Coin wurde angelegt.' })).toBeVisible()
    },
  },
  {
    name: 'coin-bearbeiten-fehler',
    pfad: `${DETAIL}/bearbeiten`,
    zustand: async (page) => {
      await h1(page, 'Coin bearbeiten')
      await page.getByLabel(/^Name/).fill('')
      await page.getByLabel(/^Herausgeber/).fill('')
      await fehlerzustand(page, 'Änderungen speichern')
    },
  },
  {
    name: 'coin-bearbeiten-erfolg',
    pfad: `${DETAIL}/bearbeiten`,
    zustand: async (page) => {
      await h1(page, 'Coin bearbeiten')
      await page.getByRole('button', { name: 'Änderungen speichern' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Änderungen wurden gespeichert.' })).toBeVisible()
    },
  },
  {
    name: 'ausgabe-erfassen-fehler',
    pfad: `${DETAIL}/ausgaben/neu`,
    zustand: async (page) => {
      await h1(page, 'Ausgabe erfassen')
      await fehlerzustand(page, 'Ausgabe speichern')
    },
  },
  {
    name: 'ausgabe-erfassen-erfolg',
    pfad: `${DETAIL}/ausgaben/neu`,
    zustand: async (page) => {
      await h1(page, 'Ausgabe erfassen')
      await page.getByLabel(/^Name des Empfängers/).fill('Testperson A')
      await page.getByLabel(/^Gelegenheit/).fill('Truppenbesuch')
      await page.getByLabel(/^Begründung/).fill('Herausragende Leistung')
      await page.getByLabel(/^Ausgebende Stelle oder Person/).fill('Dienststelle Beispiel')
      await page.getByRole('button', { name: 'Ausgabe speichern' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'wurde ausgegeben.' })).toBeVisible()
    },
  },
  {
    name: 'hologrammnummer-fehler',
    pfad: AUSGABE_SEITE,
    zustand: async (page) => {
      await page.getByRole('button', { name: 'Hologrammnummer korrigieren' }).click()
      const dialog = page.getByRole('dialog', { name: 'Hologrammnummer korrigieren' })
      await dialog.getByLabel(/^Hologrammnummer/).fill('')
      await dialog.getByRole('button', { name: 'Speichern' }).click()
      await expect(dialog.getByRole('alert').filter({ hasText: 'Bitte die markierten Eingaben prüfen.' })).toBeVisible()
    },
  },
  {
    name: 'hologrammnummer-erfolg',
    pfad: AUSGABE_SEITE,
    zustand: async (page) => {
      await page.getByRole('button', { name: 'Hologrammnummer korrigieren' }).click()
      const dialog = page.getByRole('dialog', { name: 'Hologrammnummer korrigieren' })
      await dialog.getByLabel(/^Hologrammnummer/).fill('XY 77')
      await dialog.getByLabel(/^Grund der Korrektur/).fill('Zahlendreher')
      await dialog.getByRole('button', { name: 'Speichern' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Hologrammnummer gespeichert.' })).toBeVisible()
    },
  },
  {
    name: 'vorlage-hochladen-fehler',
    pfad: `${DETAIL}?reiter=vorlage`,
    zustand: async (page) => {
      await page
        .getByLabel(/^Word-Vorlage/)
        .setInputFiles({ name: 'urkunde.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') })
      await page.getByRole('button', { name: 'Vorlage hochladen' }).click()
      await expect(page.getByText('Die Datei ist kein Word-Dokument im Format .docx.')).toBeVisible()
    },
  },
  {
    name: 'vorlage-hochladen-erfolg',
    pfad: `${DETAIL}?reiter=vorlage`,
    zustand: async (page) => {
      await page.getByLabel(/^Word-Vorlage/).setInputFiles({
        name: 'urkunde.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('PK-synthetische-vorlage'),
      })
      await page.getByRole('button', { name: 'Vorlage hochladen' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'wurde hochgeladen' })).toBeVisible()
    },
  },
  {
    name: 'auflage-aendern-fehler',
    pfad: DETAIL,
    zustand: async (page) => {
      await page.getByRole('button', { name: 'Auflage ändern' }).click()
      const dialog = page.getByRole('dialog', { name: 'Auflage ändern' })
      await dialog.getByLabel(/^Auflage/).fill('0')
      await dialog.getByRole('button', { name: 'Speichern' }).click()
      await expect(dialog.getByLabel(/^Auflage/)).toHaveAttribute('aria-invalid', 'true')
    },
  },
  {
    name: 'auflage-aendern-erfolg',
    pfad: DETAIL,
    zustand: async (page) => {
      await page.getByRole('button', { name: 'Auflage ändern' }).click()
      const dialog = page.getByRole('dialog', { name: 'Auflage ändern' })
      await dialog.getByLabel(/^Auflage/).fill('50')
      await dialog.getByRole('button', { name: 'Speichern' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Auflage wurde geändert.' })).toBeVisible()
    },
  },
  {
    name: 'storno-fehler',
    pfad: `${DETAIL}?reiter=ausgaben`,
    zustand: async (page) => {
      const dialog = await stornoDialog(page)
      await dialog.getByRole('button', { name: 'Stornieren', exact: true }).click()
      await expect(dialog.getByLabel(/^Grund/)).toHaveAttribute('aria-invalid', 'true')
    },
  },
  {
    name: 'storno-erfolg',
    pfad: `${DETAIL}?reiter=ausgaben`,
    zustand: async (page) => {
      const dialog = await stornoDialog(page)
      await dialog.getByLabel(/^Grund/).fill('Doppelt erfasst')
      await dialog.getByRole('button', { name: 'Stornieren', exact: true }).click()
      await expect(page.getByRole('status').filter({ hasText: 'wurde storniert.' })).toBeVisible()
    },
  },
  {
    name: 'benutzerverwaltung-fehler',
    pfad: '/benutzerverwaltung',
    zustand: async (page) => {
      await page.route(
        (url) => /^\/api\/benutzer\/[^/]+\/status$/.test(url.pathname),
        (route) =>
          route.fulfill({
            status: 409,
            contentType: 'application/problem+json',
            body: JSON.stringify({ status: 409, title: 'Änderung nicht möglich', code: 'letzter_administrator' }),
          }),
      )
      await page.getByRole('button', { name: `${BETRACHTER.name} deaktivieren` }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: 'Deaktivieren', exact: true }).click()
      await expect(page.getByRole('alert').first()).toBeVisible()
    },
  },
  {
    name: 'benutzerverwaltung-erfolg',
    pfad: '/benutzerverwaltung',
    zustand: async (page) => {
      await page.getByRole('searchbox', { name: 'Benutzer suchen' }).fill('Test')
      await page.getByRole('button', { name: 'Suchen' }).click()
      await expect(page.getByRole('list', { name: 'Aktive Filter' })).toBeVisible()
    },
  },
  {
    name: 'startseite-fehler',
    pfad: '/verwaltung/startseite',
    zustand: async (page) => {
      await page.getByRole('textbox', { name: /^Infotext/ }).fill('')
      await fehlerzustand(page, 'Speichern')
    },
  },
  {
    name: 'startseite-erfolg',
    pfad: '/verwaltung/startseite',
    zustand: async (page) => {
      await page.getByRole('textbox', { name: /^Infotext/ }).fill('Synthetischer Infotext.')
      await page.getByRole('button', { name: 'Speichern', exact: true }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Die Startseite wurde gespeichert.' })).toBeVisible()
    },
  },
  // Coin-Detailseite je Reiter
  ...(['stammdaten', 'exemplare', 'ausgaben', 'vorlage'] as const).map((reiter) => ({
    name: `coin-detail-${reiter}`,
    pfad: `${DETAIL}?reiter=${reiter}`,
    eigeneVorlage: reiter === 'vorlage',
    zustand: async (page: Page) => {
      await h1(page, COIN.name)
      await expect(page.getByRole('tabpanel')).toBeVisible()
    },
  })),
  // Ausgabe-Seite aktiv und storniert
  {
    name: 'ausgabe-aktiv',
    pfad: AUSGABE_SEITE,
    zustand: async (page) => h1(page, `Ausgabe von Exemplar Nr. ${AUSGABE.exemplarNummer}`),
  },
  {
    name: 'ausgabe-storniert',
    pfad: AUSGABE_SEITE,
    zustand: async (page) => {
      const dialog = await stornoDialog(page)
      await dialog.getByLabel(/^Grund/).fill('Doppelt erfasst')
      await dialog.getByRole('button', { name: 'Stornieren', exact: true }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Die Ausgabe wurde storniert.' })).toBeVisible()
    },
  },
  // Bestätigungsdialoge und Verlassen-Warnung
  { name: 'dialog-stornieren', pfad: AUSGABE_SEITE, zustand: async (page) => void (await stornoDialog(page)) },
  {
    name: 'dialog-deaktivieren',
    pfad: '/benutzerverwaltung',
    zustand: async (page) => {
      await page.getByRole('button', { name: `${BETRACHTER.name} deaktivieren` }).click()
      await expect(page.getByRole('alertdialog', { name: 'Benutzer deaktivieren?' })).toBeVisible()
    },
  },
  {
    name: 'dialog-zuruecksetzen',
    pfad: `${DETAIL}?reiter=vorlage`,
    eigeneVorlage: true,
    zustand: async (page) => {
      await page.getByRole('button', { name: 'Auf Standardvorlage zurücksetzen' }).click()
      await expect(page.getByRole('alertdialog', { name: 'Auf Standardvorlage zurücksetzen?' })).toBeVisible()
    },
  },
  {
    name: 'dialog-verlassen',
    pfad: '/coins/neu',
    zustand: async (page) => {
      await page.getByLabel(/^Name/).fill('Coin Neu')
      await page.getByRole('link', { name: 'Abbrechen' }).click()
      await expect(page.getByRole('alertdialog', { name: 'Ungespeicherte Änderungen' })).toBeVisible()
    },
  },
]

let api: SchreibZustand | null = null

test.afterEach(() => {
  if (api) expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
  api = null
})

test.describe('Screenshots Formulare und Detailseiten (AK-41)', () => {
  test.skip(!ERZEUGEN, 'Nur mit COIN_SCREENSHOTS=1')

  for (const ansicht of ANSICHTEN) {
    for (const breite of BREITEN) {
      for (const [theme, bezeichnung] of THEMES) {
        test(`${ansicht.name}_${breite}_${bezeichnung}`, async ({ page }) => {
          test.slow()
          await page.setViewportSize({ width: breite, height: 900 })
          api = await richteFormularApiEin(page, ansicht.als ?? ADMIN, { theme, eigeneVorlage: ansicht.eigeneVorlage })
          await page.goto(ansicht.pfad)
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
          await ansicht.zustand(page)

          await page.screenshot({
            path: path.join(ablage(), `${ansicht.name}_${breite}_${bezeichnung}.png`),
            fullPage: true,
          })
        })
      }
    }
  }
})
