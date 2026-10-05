import { describe, expect, it } from 'vitest'

// AK-22 (Feature anmeldung-keycloak): Nur oidc-client-ts und react-oidc-context als Auth-Bibliotheken.

const roh = import.meta.glob<string>('/package.json', { query: '?raw', import: 'default', eager: true })[
  '/package.json'
]
const paket = JSON.parse(roh) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
const alle = { ...paket.dependencies, ...paket.devDependencies }

describe('Abhängigkeiten für die Anmeldung', () => {
  it('enthält oidc-client-ts ^3.5.0 als dependency', () => {
    expect(paket.dependencies?.['oidc-client-ts']).toBe('^3.5.0')
  })

  it('enthält react-oidc-context ^3.3.1 als dependency', () => {
    expect(paket.dependencies?.['react-oidc-context']).toBe('^3.3.1')
  })

  it('enthält keine @stack-lib-Pakete und kein srts-netlayer', () => {
    expect(Object.keys(alle).filter((name) => name.startsWith('@stack-lib/') || name === 'srts-netlayer')).toEqual([])
  })

  it('enthält keine weitere Auth-Bibliothek', () => {
    const verdaechtig = /oidc|oauth|auth0|keycloak|msal|jwt/i
    expect(
      Object.keys(alle)
        .filter((name) => verdaechtig.test(name))
        .sort(),
    ).toEqual(['oidc-client-ts', 'react-oidc-context'])
  })
})
