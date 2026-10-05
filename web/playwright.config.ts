import { defineConfig, devices } from '@playwright/test'

/**
 * UI-Tests der App-Shell (Feature frontend-grundgeruest, ADR-0011, AK-23).
 *
 * Startet den Vite-Dev-Server auf Port 5193 (nie wiederverwendet; ist der Port belegt, bricht der Lauf ab).
 * Backend und Docker werden nicht benötigt: Die API wird in den Tests per `page.route` gemockt.
 * Der Proxy zeigt absichtlich auf ein unerreichbares Ziel, damit nie eine echte API angesprochen wird.
 * Ports: Dev 5173, e2e 5183, UI-Tests 5193.
 */
const WEB_URL = 'http://localhost:5193'

export default defineConfig({
  testDir: './ui-tests',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    locale: 'de-DE',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5193 --strictPort',
    url: WEB_URL,
    env: { VITE_API_PROXY_TARGET: 'http://127.0.0.1:9' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
