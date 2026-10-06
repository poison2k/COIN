import { expect, test, type Page } from '@playwright/test'
import { meldeAn, meldeAnInNeuemKontext } from './hilfen/anmeldung'

// Systemtest Benutzerverwaltung (Feature rollen-benutzerverwaltung, AK-37) gegen echten Systemtest-Keycloak (5184),
// echte API (5182) und Wegwerf-Datenbank. Testbenutzer sind synthetisch (infra/keycloak/coin-realm.json).
// Genutzt wird betrachter@test.local, damit neu@test.local ohne Rolle bleibt (anmeldung.spec.ts (c)).
// Wiederholbar im selben Lauf: Hat der Betrachter schon die Rolle „Betrachter“, wird sie zuerst entzogen.

const ZIEL_EMAIL = 'betrachter@test.local'
const ZIEL_NAME = 'Test Betrachter'

async function waehleRolle(page: Page, rolle: string): Promise<void> {
  await page.getByRole('combobox', { name: `Rolle von ${ZIEL_NAME}` }).click()
  await page.getByRole('option', { name: rolle, exact: true }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Rolle ändern?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Rolle ändern' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: `Die Rolle von ${ZIEL_NAME} wurde auf ${rolle} geändert.` }),
  ).toBeVisible()
}

test('Admin weist betrachter@test.local die Rolle Betrachter zu; Audit-Log und Rechte des Betrachters stimmen', async ({
  page,
  browser,
}) => {
  // 1. Der Betrachter meldet sich einmal an und ist damit in C.O.I.N. angelegt.
  const erste = await meldeAnInNeuemKontext(browser, ZIEL_EMAIL)
  await erste.kontext.close()

  // 2. Der Admin öffnet über die Sidebar die Benutzerverwaltung, sucht den Betrachter und weist die Rolle zu.
  await meldeAn(page, 'admin@test.local')
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('link', { name: 'Benutzerverwaltung' })
    .click()
  await expect(page).toHaveURL('http://localhost:5183/benutzerverwaltung')
  await expect(page.getByRole('heading', { level: 1, name: 'Benutzerverwaltung' })).toBeVisible()

  await page.getByRole('searchbox', { name: 'Benutzer suchen' }).fill(ZIEL_EMAIL)
  await page.getByRole('button', { name: 'Suchen' }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 Benutzer gefunden' })).toBeVisible()
  const auswahl = page.getByRole('combobox', { name: `Rolle von ${ZIEL_NAME}` })
  await expect(auswahl).toBeVisible()

  if ((await auswahl.textContent())?.includes('Betrachter')) {
    await waehleRolle(page, 'Keine Rolle')
  }
  await expect(auswahl).toContainText('Keine Rolle')
  await waehleRolle(page, 'Betrachter')
  await expect(auswahl).toContainText('Betrachter')

  // 3. Das Audit-Log zeigt oben den neuen Eintrag.
  await page.getByRole('tab', { name: 'Audit-Log' }).click()
  const tabelle = page.getByRole('table', { name: 'Audit-Log' })
  await expect(tabelle).toBeVisible()
  const ersteZeile = tabelle.getByRole('row').nth(1)
  const zellen = ersteZeile.getByRole('cell')
  await expect(zellen).toHaveCount(6)
  await expect(zellen.nth(0)).toHaveText(/\d{2}\.\d{2}\.\d{4}.*\d{2}:\d{2}/)
  await expect(zellen.nth(1)).toHaveText('Test Administrator')
  await expect(zellen.nth(2)).toHaveText(ZIEL_NAME)
  await expect(zellen.nth(3)).toHaveText('Rolle')
  await expect(zellen.nth(4)).toHaveText('Keine Rolle')
  await expect(zellen.nth(5)).toHaveText('Betrachter')

  // 4. Der Betrachter meldet sich neu an: Katalog lesbar, kein Erfassen, keine Benutzerverwaltung.
  const zweite = await meldeAnInNeuemKontext(browser, ZIEL_EMAIL)
  try {
    const betrachter = zweite.page
    await betrachter.goto('/coins')
    await expect(betrachter.getByRole('table').or(betrachter.getByText('Noch keine Coins erfasst.'))).toBeVisible()
    await expect(betrachter.getByText('Coins erfassen können nur Administratoren und Sachbearbeiter.')).toBeVisible()
    await expect(betrachter.getByRole('button', { name: 'Coin anlegen' })).toHaveCount(0)
    await expect(
      betrachter.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Coin-Liste' }),
    ).toBeVisible()
    await expect(betrachter.getByRole('link', { name: 'Benutzerverwaltung' })).toHaveCount(0)
  } finally {
    await zweite.kontext.close()
  }
})
