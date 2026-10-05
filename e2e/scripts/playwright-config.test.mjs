// Tests für e2e/playwright.config.ts (wird per Node-Type-Stripping geladen).
// Feature e2e-testdatenbank: AK-3, AK-4 (eigene Ports, keine Wiederverwendung), AK-5 (globalSetup).
import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'

let config
let apiServer
let webServer

before(async () => {
  // reuseExistingServer darf auch außerhalb von CI nie true sein.
  delete process.env.CI
  config = (await import('../playwright.config.ts')).default
  const server = Array.isArray(config.webServer) ? config.webServer : [config.webServer]
  apiServer = server.find((s) => String(s.url).startsWith('http://localhost:5182'))
  webServer = server.find((s) => String(s.url).startsWith('http://localhost:5183'))
})

describe('playwright.config.ts', () => {
  test('baseURL der Tests ist http://localhost:5183', () => {
    assert.equal(config.use.baseURL, 'http://localhost:5183')
  })

  test('globalSetup verweist auf global-setup.ts', () => {
    assert.match(String(config.globalSetup), /global-setup\.ts$/)
  })

  test('es gibt genau zwei webServer (API und Web)', () => {
    assert.equal(config.webServer.length, 2)
  })

  test('kein webServer nutzt die Dev-Ports 5172 oder 5173', () => {
    for (const s of config.webServer) {
      assert.doesNotMatch(`${s.url} ${s.command} ${JSON.stringify(s.env ?? {})}`, /517[23]/)
    }
  })

  test('API-webServer startet das Startskript scripts/start-api.mjs', () => {
    assert.ok(apiServer, 'kein webServer mit url http://localhost:5182… gefunden')
    assert.equal(apiServer.command, 'node scripts/start-api.mjs')
  })

  test('API-webServer wartet auf http://localhost:5182/api/coins', () => {
    assert.equal(apiServer?.url, 'http://localhost:5182/api/coins')
  })

  test('API-webServer verwendet nie einen laufenden Server wieder', () => {
    assert.equal(apiServer?.reuseExistingServer, false)
  })

  test('API-webServer hat mindestens 180 s Startzeit (Containerstart und Release-Build)', () => {
    assert.ok((apiServer?.timeout ?? 0) >= 180_000)
  })

  test('API-webServer startet die API nicht mit Launch-Profil', () => {
    assert.doesNotMatch(String(apiServer?.command), /launch-profile/)
  })

  test('Web-webServer läuft auf Port 5183 mit --strictPort', () => {
    assert.ok(webServer, 'kein webServer mit url http://localhost:5183 gefunden')
    assert.match(webServer.command, /--port 5183\b/)
    assert.match(webServer.command, /--strictPort\b/)
  })

  test('Web-webServer leitet /api per VITE_API_PROXY_TARGET an 5182 weiter', () => {
    assert.equal(webServer?.env?.VITE_API_PROXY_TARGET, 'http://localhost:5182')
  })

  test('Web-webServer verwendet nie einen laufenden Server wieder', () => {
    assert.equal(webServer?.reuseExistingServer, false)
  })

  // Feature anmeldung-keycloak (ADR-0015): Vite braucht die Authority des Systemtest-Keycloaks schon beim Start.
  test('Web-webServer setzt VITE_OIDC_AUTHORITY auf den Systemtest-Keycloak (5184)', () => {
    assert.equal(webServer?.env?.VITE_OIDC_AUTHORITY, 'http://localhost:5184/realms/coin')
  })

  test('Web-webServer setzt VITE_OIDC_CLIENT_ID auf coin-web', () => {
    assert.equal(webServer?.env?.VITE_OIDC_CLIENT_ID, 'coin-web')
  })

  test('kein webServer verweist auf den Dev-Keycloak 8180', () => {
    for (const s of config.webServer) {
      assert.doesNotMatch(`${s.url} ${s.command} ${JSON.stringify(s.env ?? {})}`, /8180/)
    }
  })
})
