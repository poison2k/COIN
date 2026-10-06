import { describe, expect, it } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import * as benutzerModul from '../index'
import { hatBerechtigung, ROLLEN_ANZEIGE, type Benutzer } from '../index'

// Feature rollen-benutzerverwaltung, AK-23 (ersetzt die Tests zu darfKatalogSchreiben aus anmeldung-keycloak,
// AK-19/AK-33): Sichtbarkeit nur über berechtigungen aus /api/me, nie über Rollennamen.

describe('hatBerechtigung', () => {
  it('liefert false für null (nicht angemeldet oder nicht geladen)', () => {
    expect(hatBerechtigung(null, 'coins.read')).toBe(false)
  })

  it.each(['audit.read', 'coins.read', 'coins.write', 'users.manage'] as const)(
    'liefert true für %s beim Administrator',
    (berechtigung) => {
      expect(hatBerechtigung(ME.admin, berechtigung)).toBe(true)
    },
  )

  it.each(['users.manage', 'audit.read'] as const)('liefert false für %s beim Sachbearbeiter', (berechtigung) => {
    expect(hatBerechtigung(ME.sachbearbeiter, berechtigung)).toBe(false)
  })

  it('liefert true für coins.write beim Sachbearbeiter', () => {
    expect(hatBerechtigung(ME.sachbearbeiter, 'coins.write')).toBe(true)
  })

  it('liefert false für coins.write beim Betrachter', () => {
    expect(hatBerechtigung(ME.betrachter, 'coins.write')).toBe(false)
  })

  it.each(['audit.read', 'coins.read', 'coins.write', 'users.manage'] as const)(
    'liefert false für %s ohne Rolle',
    (berechtigung) => {
      expect(hatBerechtigung(ME.keine, berechtigung)).toBe(false)
    },
  )

  it('richtet sich nach berechtigungen und nicht nach der Rolle', () => {
    const betrachterMitSchreibrecht: Benutzer = { ...ME.betrachter, berechtigungen: ['coins.read', 'coins.write'] }
    const adminOhneRechte: Benutzer = { ...ME.admin, berechtigungen: [] }

    expect(hatBerechtigung(betrachterMitSchreibrecht, 'coins.write')).toBe(true)
    expect(hatBerechtigung(adminOhneRechte, 'users.manage')).toBe(false)
  })
})

describe('darfKatalogSchreiben', () => {
  it('wird nicht mehr exportiert (AK-23)', () => {
    expect('darfKatalogSchreiben' in benutzerModul).toBe(false)
  })
})

describe('ROLLEN_ANZEIGE', () => {
  it.each([
    ['Administrator', 'Administrator'],
    ['Sachbearbeiter', 'Sachbearbeiter'],
    ['Betrachter', 'Betrachter'],
    ['keine', 'Keine Rolle'],
  ] as const)('zeigt %s als „%s“', (rolle, text) => {
    expect(ROLLEN_ANZEIGE[rolle]).toBe(text)
  })

  it('enthält genau die vier Rollen', () => {
    expect(Object.keys(ROLLEN_ANZEIGE).sort()).toEqual(['Administrator', 'Betrachter', 'Sachbearbeiter', 'keine'])
  })
})
