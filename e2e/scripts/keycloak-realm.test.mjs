// Prüft die lokale Keycloak-Konfiguration als Datei (Feature anmeldung-keycloak, AK-1 bis AK-5).
// Warum hier (node --test) und nicht xUnit: Realm-JSON und compose.yaml sind Infrastruktur-Dateien ohne .NET-Bezug;
// Node liest JSON nativ, die Prüfung läuft ohne Docker in `npm run test:skripte` (AK-38) und dient zugleich den
// Systemtests (gleiche Realm-Datei, gleicher Image-Tag, ADR-0015). Keine zusätzliche Abhängigkeit (kein YAML-Parser:
// der Service-Block wird zeilenweise ausgeschnitten).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const REALM_PFAD = path.join(WURZEL, 'infra', 'keycloak', 'coin-realm.json')
const COMPOSE_PFAD = path.join(WURZEL, 'compose.yaml')

function lese(pfad) {
  assert.ok(existsSync(pfad), `Datei fehlt: ${path.relative(WURZEL, pfad)}`)
  return readFileSync(pfad, 'utf8')
}

function realm() {
  return JSON.parse(lese(REALM_PFAD))
}

function client(r = realm()) {
  const treffer = (r.clients ?? []).filter((c) => c.clientId === 'coin-web')
  assert.equal(treffer.length, 1, 'genau ein Client coin-web erwartet')
  return treffer[0]
}

/** Zeilen des Services `keycloak` aus compose.yaml (bis zum nächsten Service bzw. Top-Level-Schlüssel). */
function keycloakBlock() {
  const zeilen = lese(COMPOSE_PFAD).split(/\r?\n/)
  const start = zeilen.findIndex((z) => /^ {2}keycloak:\s*$/.test(z))
  assert.ok(start >= 0, 'Service keycloak fehlt in compose.yaml')
  const block = []
  for (const zeile of zeilen.slice(start + 1)) {
    if (/^ {0,2}\S/.test(zeile)) break
    block.push(zeile)
  }
  return block.join('\n')
}

function sortiert(liste) {
  return [...(liste ?? [])].sort()
}

const TESTBENUTZER = [
  ['admin@test.local', 'Administrator'],
  ['sachbearbeiter@test.local', 'Sachbearbeiter'],
  ['betrachter@test.local', 'Betrachter'],
  ['neu@test.local', 'Neu'],
]

describe('AK-1: compose.yaml, Service keycloak', () => {
  test('Image ist quay.io/keycloak/keycloak mit exaktem Tag x.y.z (nicht latest)', () => {
    assert.match(keycloakBlock(), /^\s+image:\s*["']?quay\.io\/keycloak\/keycloak:\d+\.\d+\.\d+["']?\s*$/m)
  })

  test('Image-Tag ist mindestens Version 26', () => {
    const tag = /quay\.io\/keycloak\/keycloak:(\d+)\./.exec(keycloakBlock())
    assert.ok(tag, 'kein Keycloak-Image gefunden')
    assert.ok(Number(tag[1]) >= 26, `Version ${tag[1]} < 26`)
  })

  test('command ist start-dev --import-realm', () => {
    assert.match(keycloakBlock(), /command:\s*\[?\s*["']?start-dev["']?\s*,?\s*["']?--import-realm["']?\s*\]?\s*$/m)
  })

  test('Port ist nur 127.0.0.1:8180:8080', () => {
    const ports = [...keycloakBlock().matchAll(/^\s+-\s*["']?([\d.:]+)["']?\s*$/gm)].map((m) => m[1]).filter((p) => /:\d+$/.test(p) && p.split(':').length >= 2)
    assert.deepEqual(ports, ['127.0.0.1:8180:8080'])
  })

  test('KC_HOSTNAME ist http://localhost:8180', () => {
    assert.match(keycloakBlock(), /KC_HOSTNAME["']?\s*[:=]\s*["']?http:\/\/localhost:8180["']?\s*$/m)
  })

  test('Realm-Datei wird read-only nach /opt/keycloak/data/import/ gemountet', () => {
    assert.match(keycloakBlock(), /\.\/infra\/keycloak\/coin-realm\.json:\/opt\/keycloak\/data\/import\/[^:\s"']*:ro\b/)
  })

  test('KC_BOOTSTRAP_ADMIN_USERNAME ist admin', () => {
    assert.match(keycloakBlock(), /KC_BOOTSTRAP_ADMIN_USERNAME["']?\s*[:=]\s*["']?admin["']?\s*$/m)
  })

  test('KC_BOOTSTRAP_ADMIN_PASSWORD kommt als Pflichtwert aus COIN_KEYCLOAK_ADMIN_PASSWORD', () => {
    assert.match(keycloakBlock(), /KC_BOOTSTRAP_ADMIN_PASSWORD["']?\s*[:=]\s*["']?\$\{COIN_KEYCLOAK_ADMIN_PASSWORD:\?/)
  })

  test('.env.example enthält die leere Zeile COIN_KEYCLOAK_ADMIN_PASSWORD=', () => {
    assert.match(lese(path.join(WURZEL, '.env.example')), /^COIN_KEYCLOAK_ADMIN_PASSWORD=$/m)
  })

  test('compose.yaml enthält kein Keycloak-Passwort im Klartext', () => {
    // Jede Variable *PASSWORD im Service muss ihren Wert aus ${…} beziehen (z. B. ${VAR:?Hinweis}), nie im Klartext.
    const zuweisungen = keycloakBlock()
      .split('\n')
      .map((z) => /^\s*-?\s*["']?([A-Z0-9_]*PASSWORD)["']?\s*[:=]\s*["']?(.*?)["']?\s*$/.exec(z))
      .filter((m) => m !== null)
    for (const [, name, wert] of zuweisungen) {
      assert.match(wert, /^\$\{[A-Z0-9_]+(:?[-?][^}]*)?\}$/, `${name} enthält einen Klartextwert`)
    }
  })
})

describe('AK-2: Realm coin', () => {
  test('heißt coin und ist aktiv', () => {
    const r = realm()
    assert.equal(r.realm, 'coin')
    assert.equal(r.enabled, true)
  })

  test('displayName enthält „NUR LOKALE TESTUMGEBUNG“', () => {
    assert.match(String(realm().displayName), /NUR LOKALE TESTUMGEBUNG/)
  })

  for (const schalter of ['registrationAllowed', 'resetPasswordAllowed', 'rememberMe', 'editUsernameAllowed']) {
    test(`${schalter} ist false`, () => {
      assert.equal(realm()[schalter], false)
    })
  }

  test('Anmeldung mit E-Mail erlaubt, doppelte E-Mails verboten, Brute-Force-Schutz an', () => {
    const r = realm()
    assert.equal(r.loginWithEmailAllowed, true)
    assert.equal(r.duplicateEmailsAllowed, false)
    assert.equal(r.bruteForceProtected, true)
  })

  test('Sprache ist nur Deutsch', () => {
    const r = realm()
    assert.equal(r.internationalizationEnabled, true)
    assert.deepEqual(r.supportedLocales, ['de'])
    assert.equal(r.defaultLocale, 'de')
  })

  test('Lebensdauern: Access-Token 300 s, SSO-Idle 1800 s, SSO-Max 28800 s', () => {
    const r = realm()
    assert.equal(r.accessTokenLifespan, 300)
    assert.equal(r.ssoSessionIdleTimeout, 1800)
    assert.equal(r.ssoSessionMaxLifespan, 28800)
  })

  test('Refresh-Tokens werden rotiert und nicht wiederverwendet', () => {
    const r = realm()
    assert.equal(r.revokeRefreshToken, true)
    assert.equal(r.refreshTokenMaxReuse, 0)
  })
})

describe('AK-3: Client coin-web', () => {
  test('ist öffentlich mit Standard-Flow', () => {
    const c = client()
    assert.equal(c.publicClient, true)
    assert.equal(c.standardFlowEnabled, true)
  })

  for (const schalter of ['implicitFlowEnabled', 'directAccessGrantsEnabled', 'serviceAccountsEnabled']) {
    test(`${schalter} ist false`, () => {
      assert.equal(client()[schalter], false)
    })
  }

  test('consentRequired und fullScopeAllowed sind false', () => {
    const c = client()
    assert.equal(c.consentRequired, false)
    assert.equal(c.fullScopeAllowed, false)
  })

  test('PKCE ist S256', () => {
    assert.equal(client().attributes?.['pkce.code.challenge.method'], 'S256')
  })

  test('Redirect-URIs sind genau die Rückrufpfade von 5173 und 5183', () => {
    assert.deepEqual(sortiert(client().redirectUris), [
      'http://localhost:5173/anmeldung/rueckruf',
      'http://localhost:5183/anmeldung/rueckruf',
    ])
  })

  test('Post-Logout-URIs sind genau /abgemeldet auf 5173 und 5183', () => {
    const wert = String(client().attributes?.['post.logout.redirect.uris'] ?? '')
    assert.deepEqual(sortiert(wert.split('##').filter(Boolean)), [
      'http://localhost:5173/abgemeldet',
      'http://localhost:5183/abgemeldet',
    ])
  })

  test('Web-Origins sind genau 5173 und 5183', () => {
    assert.deepEqual(sortiert(client().webOrigins), ['http://localhost:5173', 'http://localhost:5183'])
  })

  test('keine Wildcards in URIs und Origins', () => {
    const c = client()
    const alle = [...(c.redirectUris ?? []), ...(c.webOrigins ?? []), String(c.attributes?.['post.logout.redirect.uris'] ?? '')]
    for (const wert of alle) assert.doesNotMatch(wert, /\*|^\+$/, `Wildcard in ${wert}`)
  })

  test('hat kein Secret', () => {
    const c = client()
    assert.equal(c.secret, undefined)
    assert.notEqual(c.clientAuthenticatorType, 'client-jwt')
  })

  test('Default-Client-Scopes sind genau basic, profile, email und coin-api-audience', () => {
    assert.deepEqual(sortiert(client().defaultClientScopes), ['basic', 'coin-api-audience', 'email', 'profile'])
  })

  test('der Scope roles ist weder Default- noch optionaler Scope', () => {
    const c = client()
    assert.ok(!(c.defaultClientScopes ?? []).includes('roles'))
    assert.ok(!(c.optionalClientScopes ?? []).includes('roles'))
  })

  test('Audience-Mapper coin-api wirkt nur auf das Access-Token', () => {
    const r = realm()
    const mapper = [
      ...(client(r).protocolMappers ?? []),
      ...(r.clientScopes ?? []).filter((s) => s.name === 'coin-api-audience').flatMap((s) => s.protocolMappers ?? []),
    ].filter((m) => m.protocolMapper === 'oidc-audience-mapper')
    assert.equal(mapper.length, 1, 'genau ein Audience-Mapper erwartet')
    const config = mapper[0].config ?? {}
    assert.equal(config['included.custom.audience'], 'coin-api')
    assert.equal(String(config['access.token.claim']), 'true')
    assert.notEqual(String(config['id.token.claim']), 'true')
  })

  test('Client-Scope coin-api-audience ist im Realm definiert', () => {
    assert.ok((realm().clientScopes ?? []).some((s) => s.name === 'coin-api-audience' && s.protocol === 'openid-connect'))
  })
})

describe('AK-4: Testbenutzer', () => {
  test('genau die vier Testbenutzer', () => {
    assert.deepEqual(sortiert((realm().users ?? []).map((u) => u.username)), sortiert(TESTBENUTZER.map(([email]) => email)))
  })

  for (const [email, nachname] of TESTBENUTZER) {
    describe(email, () => {
      const benutzer = () => (realm().users ?? []).find((u) => u.username === email)

      test('Benutzername = E-Mail, aktiv, E-Mail verifiziert', () => {
        const u = benutzer()
        assert.ok(u, `${email} fehlt`)
        assert.equal(u.email, email)
        assert.equal(u.enabled, true)
        assert.equal(u.emailVerified, true)
      })

      test(`Vorname „Test“, Nachname „${nachname}“`, () => {
        const u = benutzer()
        assert.equal(u?.firstName, 'Test')
        assert.equal(u?.lastName, nachname)
      })

      test('Passwort nur-lokal-testpasswort, nicht temporär', () => {
        const passwoerter = (benutzer()?.credentials ?? []).filter((c) => c.type === 'password')
        assert.equal(passwoerter.length, 1)
        assert.equal(passwoerter[0].value, 'nur-lokal-testpasswort')
        assert.equal(passwoerter[0].temporary, false)
      })

      test('Attribut hinweis kennzeichnet ihn als Testbenutzer', () => {
        assert.deepEqual(benutzer()?.attributes?.hinweis, ['Testbenutzer – nur lokal, Passwort ist Testdatum'])
      })

      test('keine Rollen außer den Keycloak-Standardrollen', () => {
        const u = benutzer()
        for (const rolle of u?.realmRoles ?? []) assert.equal(rolle, 'default-roles-coin')
        assert.deepEqual(Object.values(u?.clientRoles ?? {}).flat(), [])
        assert.deepEqual(u?.groups ?? [], [])
      })
    })
  }

  test('der Realm definiert keine eigenen Rollen (nur Keycloak-Standardrollen)', () => {
    const r = realm()
    const standard = new Set(['default-roles-coin', 'offline_access', 'uma_authorization'])
    for (const rolle of r.roles?.realm ?? []) assert.ok(standard.has(rolle.name), `eigene Realm-Rolle ${rolle.name}`)
    assert.deepEqual(r.roles?.client?.['coin-web'] ?? [], [])
  })

  test('infra/keycloak/README.md kennzeichnet die Realm-Datei als Testdaten', () => {
    const readme = lese(path.join(WURZEL, 'infra', 'keycloak', 'README.md'))
    assert.match(readme, /Testdaten/)
    assert.match(readme, /coin-realm\.json/)
  })
})

describe('AK-5: keine Geheimnisse in der Realm-Datei', () => {
  test('enthält weder secret noch privateKey noch "keys" (wie rg -i)', () => {
    assert.doesNotMatch(lese(REALM_PFAD), /secret|privateKey|"keys"/i)
  })

  test('enthält keine Komponenten mit Schlüsselmaterial', () => {
    const r = realm()
    assert.equal(r.components?.['org.keycloak.keys.KeyProvider'], undefined)
  })
})
