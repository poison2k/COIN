import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'
import { ME } from '../../../test/anmeldung'
import * as schutzModul from './schutz'
import { erfordertAnmeldung, erfordertBerechtigung, type SchutzKontext } from './schutz'

// AK-28: Guard-Funktionen für Routen, die Anmeldung bzw. eine Berechtigung verlangen.
// Feature rollen-benutzerverwaltung, AK-25: erfordertBerechtigung ersetzt erfordertRolle; der SchutzKontext kennt
// deaktivierte Benutzer (403 benutzer_deaktiviert auf /api/me, benutzer ist dann null).

function kontext(teil: {
  status: SchutzKontext['anmeldung']['status']
  benutzer?: SchutzKontext['benutzer']
  deaktiviert?: boolean
}) {
  const anmelden = vi.fn()
  const k: SchutzKontext = {
    anmeldung: { status: teil.status, anmelden },
    benutzer: teil.benutzer ?? null,
    deaktiviert: teil.deaktiviert ?? false,
  }
  return { kontext: k, anmelden }
}

function geworfen(aufruf: () => void): unknown {
  try {
    aufruf()
  } catch (fehler) {
    return fehler
  }
  throw new Error('Es wurde nichts geworfen.')
}

/** Ziel einer geworfenen Weiterleitung. */
function weiterleitungsziel(fehler: unknown): string | undefined {
  expect(isRedirect(fehler)).toBe(true)
  return (fehler as { options: { to?: string } }).options.to
}

/** Optionen einer geworfenen Weiterleitung (Ziel, Suchparameter, replace). */
function weiterleitung(fehler: unknown): { to?: string; search?: unknown; replace?: boolean } {
  expect(isRedirect(fehler)).toBe(true)
  return (fehler as { options: { to?: string; search?: unknown; replace?: boolean } }).options
}

/** Erwartete Weiterleitung für „mit Rolle, ohne Berechtigung“ (katalog-seiten, AK-9 bis AK-11, Entscheidung F1). */
const KEINE_BERECHTIGUNG = { to: '/kein-zugriff', search: { grund: 'berechtigung' }, replace: true }

describe('erfordertAnmeldung', () => {
  it('lässt angemeldete Benutzer durch', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: ME.keine })

    expect(() => erfordertAnmeldung(k, '/kein-zugriff')).not.toThrow()
  })

  it('startet für Anonyme die Anmeldung mit dem Rückkehrziel', () => {
    const { kontext: k, anmelden } = kontext({ status: 'anonym' })

    geworfen(() => erfordertAnmeldung(k, '/kein-zugriff?x=1'))

    expect(anmelden).toHaveBeenCalledWith('/kein-zugriff?x=1')
  })

  it('bricht für Anonyme die Navigation ab', () => {
    const { kontext: k } = kontext({ status: 'anonym' })

    expect(() => erfordertAnmeldung(k, '/kein-zugriff')).toThrow()
  })

  it('bricht ohne konfigurierte Anmeldung die Navigation ab, ohne eine Anmeldung zu starten', () => {
    const { kontext: k, anmelden } = kontext({ status: 'nichtKonfiguriert' })

    geworfen(() => erfordertAnmeldung(k, '/kein-zugriff'))

    expect(anmelden).not.toHaveBeenCalled()
  })
})

describe('erfordertBerechtigung', () => {
  it('lässt Benutzer mit der Berechtigung durch', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: ME.admin })

    expect(() => erfordertBerechtigung('users.manage')(k, '/benutzerverwaltung')).not.toThrow()
  })

  it('richtet sich nach berechtigungen und nicht nach dem Rollennamen', () => {
    const { kontext: k } = kontext({
      status: 'angemeldet',
      benutzer: { ...ME.betrachter, berechtigungen: ['coins.read', 'users.manage'] },
    })

    expect(() => erfordertBerechtigung('users.manage')(k, '/benutzerverwaltung')).not.toThrow()
  })

  // katalog-seiten, AK-11 (Entscheidung F1): bisher Weiterleitung zur Startseite.
  it('leitet einen Administrator ohne die Berechtigung in berechtigungen nach /kein-zugriff?grund=berechtigung', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: { ...ME.admin, berechtigungen: [] } })

    const fehler = geworfen(() => erfordertBerechtigung('users.manage')(k, '/benutzerverwaltung'))

    expect(weiterleitung(fehler)).toMatchObject(KEINE_BERECHTIGUNG)
  })

  it('leitet den Betrachter für users.manage nach /kein-zugriff?grund=berechtigung', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: ME.betrachter })

    const fehler = geworfen(() => erfordertBerechtigung('users.manage')(k, '/benutzerverwaltung'))

    expect(weiterleitung(fehler)).toMatchObject(KEINE_BERECHTIGUNG)
  })

  it('leitet den Sachbearbeiter für users.manage nach /kein-zugriff?grund=berechtigung', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: ME.sachbearbeiter })

    const fehler = geworfen(() => erfordertBerechtigung('users.manage')(k, '/benutzerverwaltung'))

    expect(weiterleitung(fehler)).toMatchObject(KEINE_BERECHTIGUNG)
  })

  it('startet für Benutzer mit Rolle ohne die Berechtigung keine Anmeldung', () => {
    const { kontext: k, anmelden } = kontext({ status: 'angemeldet', benutzer: ME.betrachter })

    geworfen(() => erfordertBerechtigung('users.manage')(k, '/benutzerverwaltung'))

    expect(anmelden).not.toHaveBeenCalled()
  })

  it('leitet Benutzer ohne Rolle nach /kein-zugriff', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: ME.keine })

    const fehler = geworfen(() => erfordertBerechtigung('users.manage')(k, '/benutzerverwaltung'))

    expect(weiterleitungsziel(fehler)).toBe('/kein-zugriff')
  })

  it('leitet deaktivierte Benutzer nach /kein-zugriff', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: null, deaktiviert: true })

    const fehler = geworfen(() => erfordertBerechtigung('users.manage')(k, '/benutzerverwaltung'))

    expect(weiterleitungsziel(fehler)).toBe('/kein-zugriff')
  })

  it('startet für deaktivierte Benutzer keine erneute Anmeldung', () => {
    const { kontext: k, anmelden } = kontext({ status: 'angemeldet', benutzer: null, deaktiviert: true })

    geworfen(() => erfordertBerechtigung('users.manage')(k, '/benutzerverwaltung'))

    expect(anmelden).not.toHaveBeenCalled()
  })

  it('startet für Anonyme die Anmeldung mit dem Rückkehrziel', () => {
    const { kontext: k, anmelden } = kontext({ status: 'anonym' })

    geworfen(() => erfordertBerechtigung('users.manage')(k, '/benutzerverwaltung'))

    expect(anmelden).toHaveBeenCalledWith('/benutzerverwaltung')
  })

  it('bricht für Anonyme die Navigation ab', () => {
    const { kontext: k } = kontext({ status: 'anonym' })

    expect(() => erfordertBerechtigung('users.manage')(k, '/benutzerverwaltung')).toThrow()
  })
})

// ---------- katalog-seiten, AK-9: /coins/neu verlangt coins.write ----------

describe("erfordertBerechtigung('coins.write')", () => {
  it.each(['admin', 'sachbearbeiter'] as const)('lässt %s durch', (als) => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: ME[als] })

    expect(() => erfordertBerechtigung('coins.write')(k, '/coins/neu')).not.toThrow()
  })

  it('leitet den Betrachter nach /kein-zugriff?grund=berechtigung mit replace', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: ME.betrachter })

    const fehler = geworfen(() => erfordertBerechtigung('coins.write')(k, '/coins/neu'))

    expect(weiterleitung(fehler)).toMatchObject(KEINE_BERECHTIGUNG)
  })

  it('leitet Benutzer ohne Rolle nach /kein-zugriff ohne Grund', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: ME.keine })

    const fehler = geworfen(() => erfordertBerechtigung('coins.write')(k, '/coins/neu'))

    expect(weiterleitungsziel(fehler)).toBe('/kein-zugriff')
    expect(weiterleitung(fehler).search).toBeUndefined()
  })

  it('leitet deaktivierte Benutzer nach /kein-zugriff ohne Grund', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: null, deaktiviert: true })

    const fehler = geworfen(() => erfordertBerechtigung('coins.write')(k, '/coins/neu'))

    expect(weiterleitungsziel(fehler)).toBe('/kein-zugriff')
    expect(weiterleitung(fehler).search).toBeUndefined()
  })

  it('startet für Anonyme die Anmeldung mit dem Rückkehrziel /coins/neu', () => {
    const { kontext: k, anmelden } = kontext({ status: 'anonym' })

    geworfen(() => erfordertBerechtigung('coins.write')(k, '/coins/neu'))

    expect(anmelden).toHaveBeenCalledWith('/coins/neu')
  })

  it('leitet ohne konfigurierte Anmeldung zur Startseite, ohne eine Anmeldung zu starten', () => {
    const { kontext: k, anmelden } = kontext({ status: 'nichtKonfiguriert' })

    const fehler = geworfen(() => erfordertBerechtigung('coins.write')(k, '/coins/neu'))

    expect(weiterleitungsziel(fehler)).toBe('/')
    expect(anmelden).not.toHaveBeenCalled()
  })

  it('richtet sich nach berechtigungen: ein Betrachter mit coins.write wird durchgelassen', () => {
    const { kontext: k } = kontext({
      status: 'angemeldet',
      benutzer: { ...ME.betrachter, berechtigungen: ['coins.read', 'coins.write'] },
    })

    expect(() => erfordertBerechtigung('coins.write')(k, '/coins/neu')).not.toThrow()
  })
})

describe('erfordertRolle', () => {
  it('gibt es nicht mehr (AK-25)', () => {
    expect('erfordertRolle' in schutzModul).toBe(false)
  })
})
