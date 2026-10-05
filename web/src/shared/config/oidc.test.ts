import { describe, expect, it } from 'vitest'
import { leseOidcKonfig } from './oidc'

// AK-23: Konfiguration über VITE_OIDC_AUTHORITY und VITE_OIDC_CLIENT_ID.

const AUTHORITY = 'http://idp.coin-test.invalid/realms/coin'

describe('leseOidcKonfig', () => {
  it('liefert Authority und Client-Id aus den Umgebungsvariablen', () => {
    expect(leseOidcKonfig({ VITE_OIDC_AUTHORITY: AUTHORITY, VITE_OIDC_CLIENT_ID: 'coin-web' })).toEqual({
      authority: AUTHORITY,
      clientId: 'coin-web',
    })
  })

  it('liefert null ohne Authority', () => {
    expect(leseOidcKonfig({ VITE_OIDC_CLIENT_ID: 'coin-web' })).toBeNull()
  })

  it('liefert null ohne Client-Id', () => {
    expect(leseOidcKonfig({ VITE_OIDC_AUTHORITY: AUTHORITY })).toBeNull()
  })

  it('liefert null bei leerer Authority', () => {
    expect(leseOidcKonfig({ VITE_OIDC_AUTHORITY: '', VITE_OIDC_CLIENT_ID: 'coin-web' })).toBeNull()
  })

  it('liefert null bei Client-Id nur aus Leerzeichen', () => {
    expect(leseOidcKonfig({ VITE_OIDC_AUTHORITY: AUTHORITY, VITE_OIDC_CLIENT_ID: '   ' })).toBeNull()
  })

  it('liefert null ohne jede Einstellung', () => {
    expect(leseOidcKonfig({})).toBeNull()
  })

  it('liefert null, wenn die Authority keine absolute URL ist', () => {
    expect(leseOidcKonfig({ VITE_OIDC_AUTHORITY: 'realms/coin', VITE_OIDC_CLIENT_ID: 'coin-web' })).toBeNull()
  })
})

describe('AK-23: keine festen Keycloak-Werte in web/src', () => {
  // Alle Quelldateien außer Tests (die Tests selbst enthalten die gesuchten Werte).
  const quellen = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
    query: '?raw',
    import: 'default',
    eager: true,
  })

  it('findet Quelldateien', () => {
    expect(Object.keys(quellen).length).toBeGreaterThan(10)
  })

  it.each(['8180', 'realms/', 'coin-web'])('enthält „%s“ nicht', (wert) => {
    const treffer = Object.entries(quellen)
      .filter(([, inhalt]) => inhalt.includes(wert))
      .map(([datei]) => datei)

    expect(treffer).toEqual([])
  })
})
