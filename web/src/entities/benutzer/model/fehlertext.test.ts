import { describe, expect, it } from 'vitest'
import { aenderungFehlertext as fehlertext } from './fehlertext'
import { aenderungFehlertext as ausIndex } from '../index'

// Feature rollen-benutzerverwaltung, AK-30: Fehlertexte aus dem code der Antwort (nicht aus dem Text).
// Rev. 3, AK-50: einmal in entities/benutzer für Rolle und Status (vorher je Feature in rolle-zuweisen und
// benutzer-status-aendern; dessen Fälle sind hier enthalten), zusätzlich 403 benutzer_deaktiviert.

const ALLGEMEIN = 'Die Änderung konnte nicht gespeichert werden. Bitte später erneut versuchen.'

describe('aenderungFehlertext (Rolle und Status)', () => {
  it('meldet letzter_administrator', () => {
    expect(fehlertext({ art: 'konflikt', code: 'letzter_administrator' })).toBe(
      'Der letzte aktive Administrator kann weder herabgestuft noch deaktiviert werden.',
    )
  })

  it('meldet eigenes_konto', () => {
    expect(fehlertext({ art: 'konflikt', code: 'eigenes_konto' })).toBe('Das eigene Konto kann nicht geändert werden.')
  })

  it('meldet 404', () => {
    expect(fehlertext({ art: 'nichtGefunden' })).toBe('Der Benutzer wurde nicht gefunden.')
  })

  it('meldet 403 keine_berechtigung', () => {
    expect(fehlertext({ art: 'keinZugriff', grund: 'keineBerechtigung' })).toBe(
      'Sie sind nicht berechtigt, Benutzer zu verwalten.',
    )
  })

  it('meldet einen 409 ohne bekannten code allgemein', () => {
    expect(fehlertext({ art: 'konflikt', code: null })).toBe(ALLGEMEIN)
  })

  it('meldet einen unbekannten code allgemein', () => {
    expect(fehlertext({ art: 'konflikt', code: 'unbekannt' })).toBe(ALLGEMEIN)
  })

  it('meldet einen Server- oder Netzwerkfehler allgemein', () => {
    expect(fehlertext({ art: 'fehler' })).toBe(ALLGEMEIN)
  })

  it('meldet einen Validierungsfehler allgemein', () => {
    expect(fehlertext({ art: 'validierung', fehler: { rolle: ['Bitte eine gültige Rolle wählen.'] } })).toBe(ALLGEMEIN)
  })

  it('meldet 403 benutzer_deaktiviert', () => {
    expect(fehlertext({ art: 'keinZugriff', grund: 'deaktiviert' })).toBe('Ihr Benutzerkonto ist deaktiviert.')
  })

  it('wird über die Public API von entities/benutzer exportiert', () => {
    expect(ausIndex).toBe(fehlertext)
  })
})
