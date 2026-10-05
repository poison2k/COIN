import { defineConfig, devices } from '@playwright/test'

/**
 * Systemtests für C.O.I.N.
 *
 * Voraussetzungen:
 * - PostgreSQL läuft (z. B. `docker compose up -d` im Repo-Wurzelverzeichnis).
 * - Connection-String `ConnectionStrings:CoinDb` ist per User-Secrets des Projekts Coin.Api
 *   oder per Umgebungsvariable `ConnectionStrings__CoinDb` gesetzt (nie im Repo).
 * - Browser installiert: `npm run install-browser`.
 *
 * Die API läuft im Profil "http" (Development, Port 5172, Migrationen beim Start),
 * das Frontend über den Vite-Dev-Server (Port 5173, Proxy /api → 5172).
 */
const API_URL = 'http://localhost:5172'
const WEB_URL = 'http://localhost:5173'

export default defineConfig({
  testDir: './tests',
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
      command: 'dotnet run --project ../src/Coin.Api --launch-profile http',
      url: `${API_URL}/api/coins`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      cwd: '../web',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
