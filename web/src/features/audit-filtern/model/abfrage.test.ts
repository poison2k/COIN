import { describe, expect, it } from 'vitest'
import { abfrageAusSuche, sucheAusAbfrage } from './abfrage'

// Feature nacharbeiten-audit-filter, AK-14 und AK-16 (Abschnitt 4.4, 4.12): Übersetzung zwischen den Suchparametern
// von /benutzerverwaltung (`von`, `bis`, `aktion` kommagetrennt, `benutzer` als GUID, `seite`) und der Abfrage des
// Änderungsprotokolls (`AuditAbfrage`: `{ von?, bis?, aktionen: string[], benutzerId?, seite }`). Seite 1 und leere
// Filter stehen nicht in der URL.

const GUID = '0199a1b2-0000-7000-8000-00000000a003'

describe('abfrageAusSuche', () => {
  it('liefert ohne Suchparameter Seite 1 ohne Filter', () => {
    expect(abfrageAusSuche({})).toEqual({ aktionen: [], seite: 1 })
  })

  it('übernimmt von und bis', () => {
    expect(abfrageAusSuche({ von: '2026-10-01', bis: '2026-10-31' })).toMatchObject({
      von: '2026-10-01',
      bis: '2026-10-31',
    })
  })

  it('zerlegt die kommagetrennten Aktionen in eine Liste', () => {
    expect(abfrageAusSuche({ aktion: 'Rolle,Status' }).aktionen).toEqual(['Rolle', 'Status'])
  })

  it('übernimmt die GUID aus benutzer als benutzerId', () => {
    expect(abfrageAusSuche({ benutzer: GUID }).benutzerId).toBe(GUID)
  })

  it('übernimmt die Seite', () => {
    expect(abfrageAusSuche({ seite: 3 }).seite).toBe(3)
  })
})

describe('sucheAusAbfrage', () => {
  it('lässt ohne Filter auf Seite 1 alle Parameter weg', () => {
    expect(sucheAusAbfrage({ aktionen: [], seite: 1 })).toEqual({})
  })

  it('setzt von und bis', () => {
    expect(sucheAusAbfrage({ von: '2026-10-01', bis: '2026-10-31', aktionen: [], seite: 1 })).toEqual({
      von: '2026-10-01',
      bis: '2026-10-31',
    })
  })

  it('verbindet mehrere Aktionen mit Komma', () => {
    expect(sucheAusAbfrage({ aktionen: ['Rolle', 'Status'], seite: 1 }).aktion).toBe('Rolle,Status')
  })

  it('schreibt die benutzerId als benutzer, nie einen Namen', () => {
    expect(sucheAusAbfrage({ aktionen: [], benutzerId: GUID, seite: 1 })).toEqual({ benutzer: GUID })
  })

  it('setzt die Seite erst ab Seite 2', () => {
    expect(sucheAusAbfrage({ aktionen: [], seite: 2 }).seite).toBe(2)
  })

  it('ist die Umkehrung von abfrageAusSuche', () => {
    const suche = { von: '2026-10-01', bis: '2026-10-31', aktion: 'Status', benutzer: GUID, seite: 2 }

    expect(sucheAusAbfrage(abfrageAusSuche(suche))).toEqual(suche)
  })
})
