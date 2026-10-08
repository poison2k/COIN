import { defineConfig, devices } from '@playwright/test'

/**
 * Systemtests für C.O.I.N. (Feature e2e-testdatenbank, ADR-0007).
 *
 * Voraussetzungen:
 * - Docker läuft. Compose-DB, `.env` und User-Secrets sind nicht nötig.
 * - Browser installiert: `npm run install-browser`.
 *
 * Jeder Lauf bekommt eine eigene, leere Wegwerf-Datenbank: `scripts/start-api.mjs` startet einen
 * PostgreSQL-Container (Testcontainers) und danach die API in der Umgebung `Testing` ohne
 * Launch-Profil auf Port 5182 (Migrationen beim Start). Das Frontend läuft über den Vite-Dev-Server
 * auf Port 5183 (Proxy /api → 5182). Laufende Server werden nie wiederverwendet; ist ein Port belegt,
 * bricht der Lauf ab. `global-setup.ts` prüft vor dem ersten Test, dass die Datenbank leer ist.
 * Die Entwicklungs-DB und Dev-Server (5172/5173) bleiben unberührt.
 *
 * Anmeldung (anmeldung-keycloak, ADR-0015): `start-api.mjs` startet zusätzlich einen Wegwerf-Keycloak mit
 * dem Realm aus infra/keycloak/coin-realm.json auf dem festen Port 5184. Vite bekommt dessen Authority schon
 * beim Start. Der Dev-Keycloak (8180) bleibt unberührt.
 */
const API_URL = 'http://localhost:5182'
const WEB_URL = 'http://localhost:5183'
const OIDC_AUTHORITY = 'http://localhost:5184/realms/coin'
const OIDC_CLIENT_ID = 'coin-web'

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  // Seriell über alle Dateien: Die Specs teilen sich Wegwerf-DB und Testbenutzer. benutzerverwaltung.spec.ts
  // entzieht/deaktiviert betrachter@test.local, katalog-seiten.spec.ts (3) braucht ihn zugleich als aktiven
  // Betrachter (AK-37 bzw. AK-28 verlangen beide dieses Konto); außerdem prüft benutzerverwaltung.spec.ts die
  // oberste Audit-Zeile, die parallele Rollenvergaben verfälschen würden.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    locale: 'de-DE',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/start-api.mjs',
      url: `${API_URL}/api/coins`,
      reuseExistingServer: false,
      // Container (PostgreSQL, Keycloak) und Release-Build der API.
      timeout: 300_000,
      stdout: 'pipe',
      // POSIX: SIGTERM an das Startskript, das API und Container stoppt. Windows: hartes Beenden, Ryuk räumt auf.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    {
      command: 'npm run dev -- --port 5183 --strictPort',
      cwd: '../web',
      url: WEB_URL,
      env: { VITE_API_PROXY_TARGET: API_URL, VITE_OIDC_AUTHORITY: OIDC_AUTHORITY, VITE_OIDC_CLIENT_ID: OIDC_CLIENT_ID },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
