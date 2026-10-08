import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { meldeAn, meldeAnInNeuemKontext } from './hilfen/anmeldung'

// Systemtest coin-ausgaben (AK-33, Entwurf Abschnitt 8) gegen echten Systemtest-Keycloak (5184), echte API (5182) und
// Wegwerf-Datenbank. Testbenutzer sind synthetisch (infra/keycloak/coin-realm.json); neu@test.local bleibt ohne Rolle.
// Die Specs eines Laufs teilen sich die Datenbank (workers: 1): Coin und Empfänger bekommen eindeutige Namen, der Coin
// wird über die Suche gefunden.

const WEB = 'http://localhost:5183'
const DETAIL_URL = new RegExp(`^${WEB}/coins/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
const TEXT_KEINE_BERECHTIGUNG =
  'Ihr Benutzerkonto ist für diese Seite nicht berechtigt. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei Fragen an einen Administrator.'

const SACHBEARBEITER = { email: 'sachbearbeiter@test.local', name: 'Test Sachbearbeiter', rolle: 'Sachbearbeiter' }
const BETRACHTER = { email: 'betrachter@test.local', name: 'Test Betrachter', rolle: 'Betrachter' }

function eindeutig(praefix: string): string {
  return `${praefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Stellt wiederholbar her, dass der Testbenutzer angelegt, aktiv und mit der Rolle ist (wie katalog-seiten.spec.ts).
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

/** Kennzahlen-Liste im Abschnitt „Exemplare“. */
function kennzahlen(page: Page): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: 'Exemplare' }) }).locator('dl')
}

test('Sachbearbeiter erfasst eine Ausgabe, sie erscheint in der Historie; der Betrachter sieht nur den Status', async ({
  page,
  browser,
}) => {
  const coinName = eindeutig('Systemtest Ausgaben')
  const empfaenger = eindeutig('Testempfänger')
  let detailPfad = ''

  await test.step('1. Admin vergibt Rollen und legt einen Coin mit Auflage 150 an', async () => {
    await meldeAn(page, 'admin@test.local')
    await mitRolle(page, browser, SACHBEARBEITER)
    await mitRolle(page, browser, BETRACHTER)

    await page.goto('/coins/neu')
    await page.getByLabel(/^Name/).fill(coinName)
    await page.getByLabel(/^Herausgeber/).fill('Systemtest Herausgeber')
    await page.getByLabel(/^Auflage/).fill('150')
    await page.getByRole('button', { name: 'Coin anlegen' }).click()
    await expect(page).toHaveURL(DETAIL_URL)
    detailPfad = new URL(page.url()).pathname
  })

  const sachbearbeiter = await meldeAnInNeuemKontext(browser, SACHBEARBEITER.email)
  try {
    const sb = sachbearbeiter.page

    await test.step('2. Sachbearbeiter erfasst eine Ausgabe und sieht sie in der Historie', async () => {
      await oeffneUeberSuche(sb, coinName)
      await expect(kennzahlen(sb)).toHaveText(/Auflage\s*150\s*Ausgegeben\s*0\s*Verfügbar\s*150/)
      await expect(sb.getByText('Für diesen Coin wurden noch keine Ausgaben erfasst.')).toBeVisible()

      await sb.getByRole('link', { name: 'Ausgabe erfassen' }).click()
      await expect(sb).toHaveURL(`${WEB}${detailPfad}/ausgaben/neu`)
      await expect(sb.getByRole('heading', { level: 1, name: 'Ausgabe erfassen' })).toBeVisible()
      await expect(sb.getByText('Verfügbar: 150 von 150')).toBeVisible()
      await sb.getByLabel(/^Name des Empfängers/).fill(empfaenger)
      await sb.getByLabel(/^Dienstgrad/).fill('Hauptmann')
      await sb.getByLabel(/^Gelegenheit/).fill('Truppenbesuch')
      await sb.getByLabel(/^Begründung/).fill('Systemtest Begründung')
      await sb.getByLabel(/^Ausgebende Stelle oder Person/).fill('Systemtest Kommandeur')
      await sb.getByRole('button', { name: 'Ausgabe speichern' }).click()

      await expect(sb).toHaveURL(`${WEB}${detailPfad}`)
      await expect(sb.getByRole('status').filter({ hasText: 'Exemplar Nr. 1 wurde ausgegeben.' })).toBeVisible()
      const historie = sb.getByRole('table', { name: 'Ausgabehistorie' })
      await expect(historie.getByRole('row').nth(1)).toContainText(empfaenger)
      await expect(historie.getByRole('row').nth(1)).toContainText(SACHBEARBEITER.name)
      await expect(historie.getByRole('row').nth(1)).toContainText('aktiv')
      await expect(kennzahlen(sb)).toHaveText(/Ausgegeben\s*1\s*Verfügbar\s*149/)
    })

    await test.step('3. Betrachter sieht Kennzahlen und Status, aber keine Empfängerdaten', async () => {
      const betrachter = await meldeAnInNeuemKontext(browser, BETRACHTER.email)
      try {
        const bt = betrachter.page
        const ausgabenAbrufe: string[] = []
        bt.on('request', (r) => {
          if (/\/api\/coins\/[^/]+\/ausgaben/.test(new URL(r.url()).pathname)) ausgabenAbrufe.push(r.url())
        })

        await oeffneUeberSuche(bt, coinName)
        await expect(kennzahlen(bt)).toHaveText(/Ausgegeben\s*1\s*Verfügbar\s*149/)
        await expect(bt.getByRole('table', { name: 'Exemplare' }).getByRole('row').nth(1)).toContainText('ausgegeben')
        await expect(bt.getByRole('heading', { level: 2, name: 'Ausgabehistorie' })).toHaveCount(0)
        await expect(bt.getByRole('link', { name: 'Ausgabe erfassen' })).toHaveCount(0)
        await expect(bt.locator('body')).not.toContainText(empfaenger)
        expect(ausgabenAbrufe).toEqual([])

        await bt.goto(`${detailPfad}/ausgaben/neu`)
        await expect(bt).toHaveURL(`${WEB}/kein-zugriff?grund=berechtigung`)
        await expect(bt.getByRole('heading', { level: 1, name: 'Kein Zugriff' })).toBeVisible()
        await expect(bt.getByText(TEXT_KEINE_BERECHTIGUNG)).toBeVisible()
      } finally {
        await betrachter.kontext.close()
      }
    })

    await test.step('4. Sachbearbeiter storniert die Ausgabe mit Grund', async () => {
      await sb.goto(detailPfad)
      await sb.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 1 stornieren' }).click()
      const dialog = sb.getByRole('alertdialog', { name: 'Ausgabe stornieren?' })
      await expect(dialog).toBeVisible()
      await dialog.getByLabel(/^Grund/).fill('Systemtest Storno')
      await dialog.getByRole('button', { name: 'Stornieren' }).click()

      await expect(dialog).toHaveCount(0)
      await expect(
        sb.getByRole('status').filter({ hasText: 'Ausgabe von Exemplar Nr. 1 wurde storniert.' }),
      ).toBeVisible()
      const zeile = sb.getByRole('table', { name: 'Ausgabehistorie' }).getByRole('row').nth(1)
      await expect(zeile).toContainText(empfaenger)
      await expect(zeile).toContainText(/storniert am \d{2}\.\d{2}\.\d{4} von Test Sachbearbeiter: Systemtest Storno/)
      await expect(sb.getByRole('button', { name: 'Ausgabe von Exemplar Nr. 1 stornieren' })).toHaveCount(0)
      await expect(kennzahlen(sb)).toHaveText(/Ausgegeben\s*0\s*Verfügbar\s*150/)
    })
  } finally {
    await sachbearbeiter.kontext.close()
  }
})
