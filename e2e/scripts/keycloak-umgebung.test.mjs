// Tests für die Keycloak-Erweiterung der reinen Hilfsfunktionen in scripts/e2e-umgebung.mjs
// (Feature anmeldung-keycloak, Abschnitt 6.4, ADR-0015, AK-37). Alle Werte sind synthetisch.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as umgebung from './e2e-umgebung.mjs'

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const CS = 'Host=localhost;Port=49153;Database=coin_e2e;Username=test;Password=zufallsPasswort123'

function api(basis = {}) {
  return umgebung.baueApiUmgebung(basis, CS)
}

function schluessel(env, praefix) {
  const norm = (n) => n.replace(/:|__/g, '_').toLowerCase()
  return Object.keys(env).filter((k) => norm(k).startsWith(norm(praefix)))
}

describe('Konstanten für den Systemtest-Keycloak', () => {
  test('Keycloak läuft auf dem festen Port 5184', () => {
    assert.equal(umgebung.E2E_KEYCLOAK_PORT, 5184)
  })

  test('Keycloak-URL ist http://localhost:5184', () => {
    assert.equal(umgebung.E2E_KEYCLOAK_URL, 'http://localhost:5184')
  })

  test('Authority ist http://localhost:5184/realms/coin', () => {
    assert.equal(umgebung.E2E_OIDC_AUTHORITY, 'http://localhost:5184/realms/coin')
  })

  test('Client-Id ist coin-web', () => {
    assert.equal(umgebung.E2E_OIDC_CLIENT_ID, 'coin-web')
  })

  test('Keycloak-Image hat denselben exakten Tag wie compose.yaml', () => {
    const compose = readFileSync(path.join(WURZEL, 'compose.yaml'), 'utf8')
    const tag = /quay\.io\/keycloak\/keycloak:\d+\.\d+\.\d+/.exec(compose)
    assert.ok(tag, 'compose.yaml enthält kein Keycloak-Image mit exaktem Tag')
    assert.equal(umgebung.KEYCLOAK_IMAGE, tag[0])
  })

  test('Realm-Datei ist infra/keycloak/coin-realm.json und existiert', () => {
    assert.equal(path.resolve(umgebung.REALM_DATEI), path.join(WURZEL, 'infra', 'keycloak', 'coin-realm.json'))
    assert.ok(existsSync(umgebung.REALM_DATEI))
  })
})

describe('baueKeycloakUmgebung', () => {
  test('setzt KC_HOSTNAME auf http://localhost:5184', () => {
    assert.equal(umgebung.baueKeycloakUmgebung().KC_HOSTNAME, 'http://localhost:5184')
  })

  test('legt keinen Bootstrap-Admin der Keycloak-Konsole an', () => {
    assert.deepEqual(schluessel(umgebung.baueKeycloakUmgebung(), 'KC_BOOTSTRAP_ADMIN'), [])
  })
})

describe('baueApiUmgebung – OIDC', () => {
  test('setzt Oidc__Authority auf den Systemtest-Keycloak', () => {
    assert.equal(api().Oidc__Authority, 'http://localhost:5184/realms/coin')
  })

  test('setzt Oidc__Audience auf coin-api', () => {
    assert.equal(api().Oidc__Audience, 'coin-api')
  })

  test('setzt Oidc__ClientId auf coin-web', () => {
    assert.equal(api().Oidc__ClientId, 'coin-web')
  })

  test('setzt Bootstrap__AdminEmails__0 auf admin@test.local', () => {
    assert.equal(api().Bootstrap__AdminEmails__0, 'admin@test.local')
  })

  test('überschreibt ein geerbtes Oidc__Authority (z. B. Dev-Keycloak 8180)', () => {
    const env = api({ Oidc__Authority: 'http://localhost:8180/realms/coin' })
    assert.deepEqual(schluessel(env, 'Oidc__Authority'), ['Oidc__Authority'])
    assert.equal(env.Oidc__Authority, 'http://localhost:5184/realms/coin')
  })

  test('entfernt geerbte Oidc-Variablen in anderer Schreibweise', () => {
    const env = api({ 'oidc:authority': 'http://boese.example', OIDC__AUDIENCE: 'fremd', Oidc__Weiteres: 'x' })
    assert.deepEqual(schluessel(env, 'Oidc_').sort(), ['Oidc__Audience', 'Oidc__Authority', 'Oidc__ClientId'])
  })

  test('entfernt geerbte Bootstrap-Variablen bis auf den einen Admin', () => {
    const env = api({ Bootstrap__AdminEmails__0: 'fremd@example.invalid', 'bootstrap:adminemails:1': 'zweit@example.invalid' })
    assert.deepEqual(schluessel(env, 'Bootstrap_'), ['Bootstrap__AdminEmails__0'])
    assert.equal(env.Bootstrap__AdminEmails__0, 'admin@test.local')
  })

  test('entfernt geerbte Frontend-Variablen', () => {
    const env = api({ Frontend__Ursprung: 'http://localhost:5173', 'frontend:ursprung': 'x' })
    assert.deepEqual(schluessel(env, 'Frontend_'), [])
  })

  test('entfernt geerbte Authentication-Variablen', () => {
    const env = api({
      Authentication__Schemes__Bearer__ValidAudiences__0: 'fremd',
      'authentication:schemes:bearer:authority': 'http://boese.example',
    })
    assert.deepEqual(schluessel(env, 'Authentication_'), [])
  })

  test('übernimmt weiterhin übrige Variablen unverändert', () => {
    assert.equal(api({ PATH: '/usr/bin' }).PATH, '/usr/bin')
  })
})
