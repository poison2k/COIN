import { readFile } from 'node:fs/promises'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { meldeAn, meldeAnInNeuemKontext } from './hilfen/anmeldung'

// Systemtest zertifikatsvorlagen (AK-35, Entwurf Abschnitt 9) gegen echten Systemtest-Keycloak (5184), echte API (5182)
// und Wegwerf-Datenbank. Die Standardvorlage wird vom Backend erzeugt und im Test heruntergeladen; es liegt keine
// DOCX-Datei im Repository. Testbenutzer sind synthetisch (infra/keycloak/coin-realm.json). Die Specs eines Laufs
// teilen sich die Datenbank (workers: 1): Der Coin bekommt einen eindeutigen Namen und wird über die Suche gefunden.

const WEB = 'http://localhost:5183'
const DOCX_TYP = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const DETAIL_URL = new RegExp(`^${WEB}/coins/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

const SACHBEARBEITER = {
  email: 'sachbearbeiter@test.local',
  name: 'Test Sachbearbeiter',
  rolle: 'Sachbearbeiter',
}
const BETRACHTER = {
  email: 'betrachter@test.local',
  name: 'Test Betrachter',
  rolle: 'Betrachter',
}

function eindeutig(praefix: string): string {
  return `${praefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Stellt wiederholbar her, dass der Testbenutzer angelegt, aktiv und mit der Rolle ist (Muster coin-ausgaben.spec.ts).
 * Der Admin muss in `page` angemeldet sein.
 */
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
  const auswahl = page.getByRole('combobox', {
    name: `Rolle von ${konto.name}`,
  })
  await expect(auswahl).toBeVisible()
  if (!(await auswahl.textContent())?.includes(konto.rolle)) {
    await auswahl.click()
    await page.getByRole('option', { name: konto.rolle, exact: true }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Rolle ändern?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Rolle ändern' }).click()
    await expect(
      page.getByRole('status').filter({
        hasText: `Die Rolle von ${konto.name} wurde auf ${konto.rolle} geändert.`,
      }),
    ).toBeVisible()
  }
  const reaktivieren = page.getByRole('button', {
    name: `${konto.name} reaktivieren`,
  })
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

test('Sachbearbeiter lädt die Standardvorlage herunter und wieder hoch; der Betrachter sieht keine Vorlagen-Bedienelemente', async ({
  page,
  browser,
}) => {
  const coinName = eindeutig('Systemtest Vorlagen')
  let detailPfad = ''
  // Inhalt der heruntergeladenen Standardvorlage; Playwrights Download-Pfad hat keine Endung, deshalb wird die Datei
  // unter ihrem vorgeschlagenen Namen hochgeladen (die clientseitige .docx-Prüfung aus AK-30 bleibt wirksam).
  let standardvorlage = {
    name: '',
    mimeType: DOCX_TYP,
    buffer: Buffer.alloc(0),
  }

  await test.step('1. Admin vergibt die Rollen Sachbearbeiter und Betrachter', async () => {
    await meldeAn(page, 'admin@test.local')
    await mitRolle(page, browser, SACHBEARBEITER)
    await mitRolle(page, browser, BETRACHTER)
  })

  const sachbearbeiter = await meldeAnInNeuemKontext(browser, SACHBEARBEITER.email)
  try {
    const sb = sachbearbeiter.page

    await test.step('2. Sachbearbeiter lädt auf „Coin hinzufügen“ die Standardvorlage herunter und legt einen Coin an', async () => {
      await sb.goto('/coins/neu')
      await expect(sb.getByRole('heading', { level: 2, name: 'Zertifikatsvorlage' })).toBeVisible()
      const download = sb.waitForEvent('download')
      await sb.getByRole('button', { name: 'Standardvorlage herunterladen' }).click()
      const datei = await download
      expect(datei.suggestedFilename()).toBe('zertifikatsvorlage-standard.docx')
      const inhalt = await readFile((await datei.path())!)
      standardvorlage = {
        name: datei.suggestedFilename(),
        mimeType: DOCX_TYP,
        buffer: inhalt,
      }
      // DOCX ist ein ZIP-Paket: Signatur „PK\x03\x04“.
      expect([...inhalt.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])

      await sb.getByLabel(/^Name/).fill(coinName)
      await sb.getByLabel(/^Herausgeber/).fill('Systemtest Herausgeber')
      await sb.getByLabel(/^Auflage/).fill('50')
      await sb.getByRole('button', { name: 'Coin anlegen' }).click()
      await expect(sb).toHaveURL(DETAIL_URL)
      detailPfad = new URL(sb.url()).pathname
    })

    await test.step('3. Über „Bearbeiten“ lädt er die heruntergeladene Datei hoch und sieht Version 1', async () => {
      await oeffneUeberSuche(sb, coinName)
      await sb.getByRole('link', { name: 'Bearbeiten' }).click()
      await expect(sb).toHaveURL(`${WEB}${detailPfad}/bearbeiten`)
      await expect(sb.getByRole('heading', { level: 1, name: 'Coin bearbeiten' })).toBeVisible()
      await expect(sb.getByText('Aktiv: Standardvorlage')).toBeVisible()

      await sb.getByLabel('Word-Vorlage (.docx)').setInputFiles(standardvorlage)
      await sb.getByRole('button', { name: 'Vorlage hochladen' }).click()

      await expect(
        sb.getByRole('status').filter({
          hasText: 'Version 1 wurde hochgeladen und ist jetzt aktiv.',
        }),
      ).toBeVisible()
      await expect(sb.getByText('Aktiv: eigene Vorlage, Version 1')).toBeVisible()
      const tabelle = sb.getByRole('table', {
        name: 'Versionen der Zertifikatsvorlage',
      })
      await expect(tabelle.getByRole('row').nth(1)).toContainText(SACHBEARBEITER.name)
      await expect(tabelle.getByRole('row').nth(1)).toContainText('aktiv')
    })

    await test.step('4. Derselbe Upload noch einmal ergibt Version 2; Version 1 bleibt in der Tabelle', async () => {
      await sb.getByLabel('Word-Vorlage (.docx)').setInputFiles(standardvorlage)
      await sb.getByRole('button', { name: 'Vorlage hochladen' }).click()

      await expect(sb.getByText('Aktiv: eigene Vorlage, Version 2')).toBeVisible()
      await expect(sb.getByRole('button', { name: 'Version 2 herunterladen' })).toBeVisible()
      await expect(sb.getByRole('button', { name: 'Version 1 herunterladen' })).toBeVisible()

      const download = sb.waitForEvent('download')
      await sb.getByRole('button', { name: 'Version 1 herunterladen' }).click()
      expect((await download).suggestedFilename()).toBe(`zertifikatsvorlage-${detailPfad.split('/')[2]}-v1.docx`)
    })

    await test.step('5. Eine in .docx umbenannte Textdatei wird abgelehnt; Version 2 bleibt aktiv', async () => {
      await sb.getByLabel('Word-Vorlage (.docx)').setInputFiles({
        name: 'keine-vorlage.docx',
        mimeType: DOCX_TYP,
        buffer: Buffer.from('Dies ist nur Text und kein Word-Dokument.'),
      })
      await sb.getByRole('button', { name: 'Vorlage hochladen' }).click()

      const alarm = sb.getByRole('alert').filter({ hasText: 'Die Vorlage wurde nicht übernommen:' })
      await expect(alarm).toBeVisible()
      await expect(alarm.getByRole('listitem')).toHaveText(['Die Datei ist kein Word-Dokument im Format .docx.'])
      await expect(sb.getByText('Aktiv: eigene Vorlage, Version 2')).toBeVisible()
    })
  } finally {
    await sachbearbeiter.kontext.close()
  }

  const betrachter = await meldeAnInNeuemKontext(browser, BETRACHTER.email)
  try {
    const bt = betrachter.page

    await test.step('6. Betrachter sieht kein „Bearbeiten“ und landet beim Direktaufruf auf „Kein Zugriff“', async () => {
      await oeffneUeberSuche(bt, coinName)
      await expect(bt.getByRole('table', { name: 'Exemplare' })).toBeVisible()
      await expect(bt.getByRole('link', { name: 'Bearbeiten' })).toHaveCount(0)
      await expect(bt.getByRole('button', { name: /herunterladen|hochladen/ })).toHaveCount(0)

      await bt.goto(`${detailPfad}/bearbeiten`)
      await expect(bt.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeVisible()
      await expect(bt.getByRole('button', { name: /herunterladen|hochladen/ })).toHaveCount(0)
    })
  } finally {
    await betrachter.kontext.close()
  }
})
