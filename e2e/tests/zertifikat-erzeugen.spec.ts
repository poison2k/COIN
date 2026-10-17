import { readFile } from 'node:fs/promises'
import { expect, test, type Browser, type Download, type Page } from '@playwright/test'
import { meldeAn, meldeAnInNeuemKontext } from './hilfen/anmeldung'
import { istZip, wordTexte, zipEintraege } from './hilfen/docx'

// Systemtest zertifikat-erzeugen (AK-33, Entwurf Abschnitt 8) gegen echten Systemtest-Keycloak (5184), echte API (5182)
// und Wegwerf-Datenbank: Sachbearbeiter erfasst eine Ausgabe und lädt das Zertifikat herunter (Historie und
// Ausgabe-Seite); die Datei ist ein DOCX mit Empfängername und Nummer und ohne Platzhalter. Nach dem Storno ist der
// Button gesperrt; der Betrachter sieht keinen Button und erhält auf der Ausgabe-Seite „Kein Zugriff“.
// Testbenutzer und Werte sind synthetisch; die Specs teilen sich die Datenbank (workers: 1).

const WEB = 'http://localhost:5183'
const DETAIL_URL = new RegExp(`^${WEB}/coins/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
const NUMMER = /^C[0-9]{4,}-0001$/
const TEXT_KEINE_BERECHTIGUNG =
  'Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.'

const SACHBEARBEITER = { email: 'sachbearbeiter@test.local', name: 'Test Sachbearbeiter', rolle: 'Sachbearbeiter' }
const BETRACHTER = { email: 'betrachter@test.local', name: 'Test Betrachter', rolle: 'Betrachter' }

function eindeutig(praefix: string): string {
  return `${praefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Stellt wiederholbar her, dass der Testbenutzer angelegt, aktiv und mit der Rolle ist (wie coin-ausgaben.spec.ts). */
async function mitRolle(
  page: Page,
  browser: Browser,
  konto: { email: string; name: string; rolle: string },
): Promise<void> {
  const erste = await meldeAnInNeuemKontext(browser, konto.email)
  await erste.kontext.close()

  await page.goto('/benutzerverwaltung')
  await page.getByRole('searchbox', { name: 'Benutzer suchen' }).fill(konto.email)
  await page.getByRole('button', { name: 'Suchen' }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 Benutzer gefunden' })).toBeVisible()
  const auswahl = page.getByRole('combobox', { name: `Rolle von ${konto.name}` })
  await expect(auswahl).toBeVisible()
  if (!(await auswahl.textContent())?.includes(konto.rolle)) {
    await auswahl.click()
    await page.getByRole('option', { name: konto.rolle, exact: true }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Rolle ändern?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Rolle ändern' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: `Die Rolle von ${konto.name} wurde auf ${konto.rolle} geändert.` }),
    ).toBeVisible()
  }
  const reaktivieren = page.getByRole('button', { name: `${konto.name} reaktivieren` })
  if (await reaktivieren.isVisible()) {
    await reaktivieren.click()
    await expect(page.getByRole('button', { name: `${konto.name} deaktivieren` })).toBeVisible()
  }
  await expect(auswahl).toContainText(konto.rolle)
}

/** Sucht im Katalog nach dem Namen (genau ein Treffer erwartet) und öffnet die Detailseite. */
async function oeffneUeberSuche(page: Page, name: string): Promise<void> {
  await page.goto('/coins')
  await page.getByRole('searchbox', { name: 'Coins suchen' }).fill(name)
  await page.getByRole('button', { name: 'Suchen' }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 Coin gefunden' })).toBeVisible()
  await page.getByRole('link', { name, exact: true }).click()
  await expect(page).toHaveURL(DETAIL_URL)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

/** Prüft die heruntergeladene Datei: ZIP, word/document.xml wohlgeformt, Name und Nummer enthalten, kein „{{“. */
async function pruefeZertifikat(page: Page, download: Download, nummer: string, empfaenger: string): Promise<void> {
  expect(download.suggestedFilename()).toBe(`Zertifikat_${nummer}.docx`)
  const pfad = await download.path()
  const daten = await readFile(pfad)
  expect(istZip(daten), 'Die Datei ist kein ZIP.').toBe(true)

  const eintraege = zipEintraege(daten)
  const dokument = eintraege.get('word/document.xml')
  expect(dokument, 'word/document.xml fehlt.').toBeDefined()
  const xml = dokument!.toString('utf8')
  const parserFehler = await page.evaluate(
    (text) => new DOMParser().parseFromString(text, 'application/xml').getElementsByTagName('parsererror').length,
    xml,
  )
  expect(parserFehler, 'word/document.xml ist nicht wohlgeformt.').toBe(0)

  const text = wordTexte(xml)
  expect(text).toContain(empfaenger)
  expect(text).toContain(nummer)
  expect(text).not.toContain('{{')
}

test('Sachbearbeiter lädt das Zertifikat einer Ausgabe herunter; nach Storno gesperrt, Betrachter ohne Zugriff', async ({
  page,
  browser,
}) => {
  // Langer Fluss mit fünf Anmeldungen und zwei Downloads; beim ersten Test eines Laufs sind Keycloak und Vite noch kalt.
  test.setTimeout(120_000)
  const coinName = eindeutig('Systemtest Zertifikat')
  const empfaenger = `Jürgen Öztürk-Weiß ${eindeutig('Zx')}`
  let detailPfad = ''
  let nummer = ''
  let ausgabePfad = ''

  await test.step('1. Admin vergibt die Rollen Sachbearbeiter und Betrachter', async () => {
    await meldeAn(page, 'admin@test.local')
    await mitRolle(page, browser, SACHBEARBEITER)
    await mitRolle(page, browser, BETRACHTER)
  })

  const sachbearbeiter = await meldeAnInNeuemKontext(browser, SACHBEARBEITER.email)
  try {
    const sb = sachbearbeiter.page

    await test.step('2. Sachbearbeiter legt einen Coin mit Auflage 5 an und erfasst eine Ausgabe', async () => {
      await sb.goto('/coins/neu')
      await sb.getByLabel(/^Name/).fill(coinName)
      await sb.getByLabel(/^Herausgeber/).fill('Systemtest Herausgeber')
      await sb.getByLabel(/^Auflage/).fill('5')
      await sb.getByRole('button', { name: 'Coin anlegen' }).click()
      await expect(sb).toHaveURL(DETAIL_URL)
      detailPfad = new URL(sb.url()).pathname

      await sb.getByRole('link', { name: 'Ausgabe erfassen' }).click()
      await expect(sb.getByRole('heading', { level: 1, name: 'Ausgabe erfassen' })).toBeVisible()
      await sb.getByLabel(/^Name des Empfängers/).fill(empfaenger)
      await sb.getByLabel(/^Gelegenheit/).fill('Systemtest Gelegenheit')
      await sb.getByLabel(/^Begründung/).fill('Systemtest Begründung')
      await sb.getByLabel(/^Ausgebende Stelle oder Person/).fill('Systemtest Kommandeur')
      await sb.getByRole('button', { name: 'Ausgabe speichern' }).click()
      await expect(sb).toHaveURL(`${WEB}${detailPfad}`)
    })

    await test.step('3. Historie zeigt die Nummer; der Download liefert ein DOCX mit Name und Nummer', async () => {
      const historie = sb.getByRole('table', { name: 'Ausgabehistorie' })
      const zeile = historie.getByRole('row').nth(1)
      await expect(zeile).toContainText(empfaenger)
      const link = zeile.getByRole('link', { name: /^Ausgabe C[0-9]{4,}-0001 anzeigen$/ })
      await expect(link).toBeVisible()
      nummer = (await link.textContent())?.trim() ?? ''
      expect(nummer).toMatch(NUMMER)

      const download = sb.waitForEvent('download')
      await zeile.getByRole('button', { name: `Zertifikat ${nummer} herunterladen` }).click()
      await pruefeZertifikat(sb, await download, nummer, empfaenger)
    })

    await test.step('4. Über den Link zur Ausgabe-Seite, Download dort', async () => {
      await sb
        .getByRole('table', { name: 'Ausgabehistorie' })
        .getByRole('link', { name: `Ausgabe ${nummer} anzeigen` })
        .click()
      await expect(sb).toHaveURL(new RegExp(`^${WEB}${detailPfad}/ausgaben/[0-9a-f-]{36}$`))
      ausgabePfad = new URL(sb.url()).pathname
      await expect(sb.getByRole('heading', { level: 1, name: 'Ausgabe von Exemplar Nr. 1' })).toBeVisible()
      await expect(sb.locator('body')).toContainText(nummer)

      const download = sb.waitForEvent('download')
      await sb.getByRole('button', { name: /Zertifikat.*herunterladen/ }).click()
      await pruefeZertifikat(sb, await download, nummer, empfaenger)
    })

    await test.step('5. Nach dem Storno ist der Button gesperrt', async () => {
      await sb.goto(detailPfad)
      await sb.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 1 stornieren' }).click()
      const dialog = sb.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })
      await dialog.getByLabel(/^Grund/).fill('Systemtest Storno')
      await dialog.getByRole('button', { name: 'Stornieren' }).click()
      await expect(dialog).toHaveCount(0)

      await expect(
        sb.getByRole('button', { name: `Zertifikat ${nummer} herunterladen (nicht möglich, Ausgabe storniert)` }),
      ).toBeDisabled()

      await sb.goto(ausgabePfad)
      await expect(sb.getByRole('button', { name: /Zertifikat.*herunterladen/ })).toBeDisabled()
      await expect(sb.getByText('Für stornierte Ausgaben kann kein Zertifikat heruntergeladen werden.')).toBeVisible()
    })
  } finally {
    await sachbearbeiter.kontext.close()
  }

  await test.step('6. Betrachter: kein Button, Ausgabe-Seite „Kein Zugriff“', async () => {
    const betrachter = await meldeAnInNeuemKontext(browser, BETRACHTER.email)
    try {
      const bt = betrachter.page
      const abrufe: string[] = []
      bt.on('request', (r) => {
        if (/\/api\/coins\/[^/]+\/ausgaben/.test(new URL(r.url()).pathname)) abrufe.push(r.url())
      })

      await oeffneUeberSuche(bt, coinName)
      await expect(bt.getByRole('button', { name: /Zertifikat/ })).toHaveCount(0)

      await bt.goto(ausgabePfad)
      await expect(bt).toHaveURL(`${WEB}/kein-zugriff?grund=berechtigung`)
      await expect(bt.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeVisible()
      await expect(bt.getByText(TEXT_KEINE_BERECHTIGUNG)).toBeVisible()
      expect(abrufe).toEqual([])
    } finally {
      await betrachter.kontext.close()
    }
  })
})
