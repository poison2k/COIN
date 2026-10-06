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

// Feature rollen-benutzerverwaltung, AK-23: Rechte kommen nur aus `berechtigungen` (/api/me). Kein Produktivcode
// vergleicht Rollennamen, um Rechte abzuleiten. Erlaubt nur dort, wo die Rolle angezeigt bzw. ausgewählt wird oder
// der Router „ohne Rolle“ von „ohne Berechtigung“ unterscheidet.

const quellen = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
const ERLAUBT = ['/src/features/rolle-zuweisen/', '/src/pages/kein-zugriff/', '/src/app/router/']
/** `rolle ===`, `rolle !==` bzw. `=== x.rolle` (auch mit Optional Chaining). */
const ROLLENVERGLEICH = /\brolle\s*[!=]==|[!=]==\s*[\w$?.]*\brolle\b/

describe('Keine Rechte aus Rollennamen (AK-23)', () => {
  it('findet Quelldateien unter src', () => {
    expect(Object.keys(quellen).length).toBeGreaterThan(20)
  })

  it('enthält außerhalb von rolle-zuweisen, kein-zugriff und app/router keinen Vergleich mit rolle', () => {
    const treffer = Object.entries(quellen)
      .filter(([pfad]) => !/\.test\.tsx?$/.test(pfad))
      .filter(([pfad]) => !ERLAUBT.some((praefix) => pfad.startsWith(praefix)))
      .flatMap(([pfad, inhalt]) =>
        inhalt
          .split('\n')
          .map((zeile, i) => ({ zeile, nr: i + 1 }))
          .filter(({ zeile }) => ROLLENVERGLEICH.test(zeile))
          .map(({ zeile, nr }) => `${pfad}:${nr}: ${zeile.trim()}`),
      )

    expect(treffer).toEqual([])
  })

  it('enthält in Produktivcode keinen Aufruf von darfKatalogSchreiben mehr', () => {
    const treffer = Object.entries(quellen)
      .filter(([pfad]) => !/\.test\.tsx?$/.test(pfad))
      .filter(([, inhalt]) => inhalt.includes('darfKatalogSchreiben'))
      .map(([pfad]) => pfad)

    expect(treffer).toEqual([])
  })
})
