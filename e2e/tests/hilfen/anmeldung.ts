import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Anmeldung über das echte Keycloak-Formular des Systemtest-Keycloaks (Feature anmeldung-keycloak, Abschnitt 6.4).
// Zugangsdaten kommen aus der Realm-Datei (synthetische Testbenutzer, Passwort ist Testdatum).
// Annahme (Entwurf Abschnitt 8): Das Keycloak-Formular hat die IDs username, password und kc-login.

const REALM_DATEI = fileURLToPath(new URL('../../../infra/keycloak/coin-realm.json', import.meta.url))
const KEYCLOAK_URL = 'http://localhost:5184'

interface RealmBenutzer {
  username: string
  credentials?: Array<{ type: string; value: string }>
}

/** Passwort eines Testbenutzers aus infra/keycloak/coin-realm.json. */
export function passwortVon(email: string): string {
  const realm = JSON.parse(readFileSync(REALM_DATEI, 'utf8')) as { users?: RealmBenutzer[] }
  const benutzer = realm.users?.find((u) => u.username === email)
  const passwort = benutzer?.credentials?.find((c) => c.type === 'password')?.value
  if (!passwort) throw new Error(`Testbenutzer ${email} ohne Passwort in der Realm-Datei.`)
  return passwort
}

/** Füllt das Keycloak-Formular aus (die Seite muss bereits das Formular zeigen). */
export async function fuelleKeycloakFormular(page: Page, email: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`^${KEYCLOAK_URL}/realms/coin/`))
  await page.locator('#username').fill(email)
  await page.locator('#password').fill(passwortVon(email))
  await page.locator('#kc-login').click()
}

/** Meldet sich über „Anmelden“ in der Kopfzeile und das Keycloak-Formular an und wartet auf die Rückkehr. */
export async function meldeAn(page: Page, email: string): Promise<void> {
  await page.goto('/')
  await page.locator('header').getByRole('button', { name: 'Anmelden' }).click()
  await fuelleKeycloakFormular(page, email)
  await expect(page).toHaveURL(/^http:\/\/localhost:5183\//)
  await expect(page.locator('header').getByRole('button', { name: 'Abmelden' })).toBeVisible()
}
