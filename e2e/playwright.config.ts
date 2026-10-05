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
 */
const API_URL = 'http://localhost:5182'
const WEB_URL = 'http://localhost:5183'

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
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
      timeout: 180_000,
      stdout: 'pipe',
      // POSIX: SIGTERM an das Startskript, das API und Container stoppt. Windows: hartes Beenden, Ryuk räumt auf.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    {
      command: 'npm run dev -- --port 5183 --strictPort',
      cwd: '../web',
      url: WEB_URL,
      env: { VITE_API_PROXY_TARGET: API_URL },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
