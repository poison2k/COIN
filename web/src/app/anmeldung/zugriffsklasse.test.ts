import { describe, expect, it } from 'vitest'
import { ME } from '../../../test/anmeldung'
import { zugriffsklasse } from './zugriffsklasse'

// Feature rollen-benutzerverwaltung Rev. 3, AK-45 (Begriffe in 12.2): Die Zugriffsklasse ist aus dem Benutzerzustand
// abgeleitet: deaktiviert, ohneRolle (angemeldet mit rolle „keine“) oder mitRolle. Alle anderen Zustände haben keine.

describe('zugriffsklasse', () => {
  it('liefert „deaktiviert“ für den Zustand deaktiviert', () => {
    expect(zugriffsklasse({ art: 'deaktiviert' })).toBe('deaktiviert')
  })

  it('liefert „ohneRolle“ für angemeldet mit rolle „keine“', () => {
    expect(zugriffsklasse({ art: 'angemeldet', benutzer: ME.keine })).toBe('ohneRolle')
  })

  it.each(['admin', 'sachbearbeiter', 'betrachter'] as const)('liefert „mitRolle“ für angemeldet als %s', (als) => {
    expect(zugriffsklasse({ art: 'angemeldet', benutzer: ME[als] })).toBe('mitRolle')
  })

  it('liefert „mitRolle“ auch für eine Rolle ohne Berechtigungen', () => {
    expect(zugriffsklasse({ art: 'angemeldet', benutzer: { ...ME.betrachter, berechtigungen: [] } })).toBe('mitRolle')
  })

  it('liefert null während der Prüfung', () => {
    expect(zugriffsklasse({ art: 'pruefe' })).toBeNull()
  })

  it('liefert null anonym', () => {
    expect(zugriffsklasse({ art: 'anonym' })).toBeNull()
  })

  it('liefert null ohne Konfiguration', () => {
    expect(zugriffsklasse({ art: 'nichtKonfiguriert' })).toBeNull()
  })

  it('liefert null bei einem Fehler', () => {
    expect(zugriffsklasse({ art: 'fehler', erneutVersuchen: () => {} })).toBeNull()
  })
})
