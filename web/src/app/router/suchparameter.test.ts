import { describe, expect, it } from 'vitest'
import { benutzerverwaltungSuche } from './suchparameter'

// Feature nacharbeiten-audit-filter, AK-12, AK-14, AK-16 (Abschnitt 4.4 „URL“, ADR-0045 Punkt 4): Suchparameter von
// /benutzerverwaltung. `reiter` nur `aenderungsprotokoll`, `von`/`bis` nur im Format JJJJ-MM-TT (Gültigkeit prüft die
// API), `aktion` kommagetrennt mit Werten aus Buchstaben ohne Doppelte, `benutzer` nur als GUID, `seite` wie im Katalog.
// Ungültige Werte entfallen, die Funktion wirft nie.

const GUID = '0199a1b2-0000-7000-8000-00000000a003'

describe('benutzerverwaltungSuche: reiter (AK-12)', () => {
  it('übernimmt reiter=aenderungsprotokoll', () => {
    expect(benutzerverwaltungSuche({ reiter: 'aenderungsprotokoll' }).reiter).toBe('aenderungsprotokoll')
  })

  it.each(['benutzer', 'audit', 'Aenderungsprotokoll', '', 1])(
    'lässt den unbekannten Reiter %j entfallen',
    (reiter) => {
      expect(benutzerverwaltungSuche({ reiter }).reiter).toBeUndefined()
    },
  )
})

describe('benutzerverwaltungSuche: von und bis (AK-14, AK-16)', () => {
  it('übernimmt von und bis im Format JJJJ-MM-TT', () => {
    expect(benutzerverwaltungSuche({ von: '2026-10-01', bis: '2026-10-31' })).toMatchObject({
      von: '2026-10-01',
      bis: '2026-10-31',
    })
  })

  it('übernimmt ein formal passendes, aber ungültiges Datum (die API prüft es)', () => {
    expect(benutzerverwaltungSuche({ von: '2026-02-30' }).von).toBe('2026-02-30')
  })

  it.each(['2026-1-5', '01.10.2026', 'abc', '2026-10-01T00:00', ' 2026-10-01', 20261001, ''])(
    'lässt von=%j entfallen',
    (von) => {
      expect(benutzerverwaltungSuche({ von }).von).toBeUndefined()
    },
  )

  it.each(['2026-1-5', '01.10.2026', 'abc'])('lässt bis=%j entfallen', (bis) => {
    expect(benutzerverwaltungSuche({ bis }).bis).toBeUndefined()
  })
})

describe('benutzerverwaltungSuche: aktion (AK-14, AK-16)', () => {
  it('übernimmt eine einzelne Aktion', () => {
    expect(benutzerverwaltungSuche({ aktion: 'Status' }).aktion).toBe('Status')
  })

  it('übernimmt mehrere Aktionen kommagetrennt', () => {
    expect(benutzerverwaltungSuche({ aktion: 'Rolle,Status' }).aktion).toBe('Rolle,Status')
  })

  it('entfernt doppelte Aktionen', () => {
    expect(benutzerverwaltungSuche({ aktion: 'Status,Status,Rolle' }).aktion).toBe('Status,Rolle')
  })

  it('lässt einzelne Werte mit anderen Zeichen als Buchstaben entfallen', () => {
    expect(benutzerverwaltungSuche({ aktion: 'Rolle,x-y,1,Status' }).aktion).toBe('Rolle,Status')
  })

  it('lässt aktion ohne gültigen Wert ganz entfallen', () => {
    expect(benutzerverwaltungSuche({ aktion: '1,%,' }).aktion).toBeUndefined()
  })

  it('lässt aktion entfallen, wenn sie keine Zeichenkette ist', () => {
    expect(benutzerverwaltungSuche({ aktion: 42 }).aktion).toBeUndefined()
  })
})

describe('benutzerverwaltungSuche: benutzer (F1)', () => {
  it('übernimmt eine GUID', () => {
    expect(benutzerverwaltungSuche({ benutzer: GUID }).benutzer).toBe(GUID)
  })

  it.each(['Test Betrachter', 'betrachter@test.local', '0199a1b2', `${GUID}x`, ''])(
    'lässt benutzer=%j entfallen (nie Name oder E-Mail)',
    (benutzer) => {
      expect(benutzerverwaltungSuche({ benutzer }).benutzer).toBeUndefined()
    },
  )
})

describe('benutzerverwaltungSuche: seite', () => {
  it('übernimmt eine ganze Zahl größer 1', () => {
    expect(benutzerverwaltungSuche({ seite: 3 }).seite).toBe(3)
  })

  it('übernimmt eine Seite als Text aus der URL', () => {
    expect(benutzerverwaltungSuche({ seite: '3' }).seite).toBe(3)
  })

  it.each([1, 0, -2, 1.5, 'x', 2_147_483_648])('lässt seite=%j entfallen (Seite 1)', (seite) => {
    expect(benutzerverwaltungSuche({ seite }).seite).toBeUndefined()
  })
})

describe('benutzerverwaltungSuche: robust', () => {
  it('liefert ohne Parameter nur leere Werte', () => {
    expect(benutzerverwaltungSuche({})).toEqual({})
  })

  it('wirft bei ungewöhnlichen Werten nicht', () => {
    expect(() =>
      benutzerverwaltungSuche({ reiter: {}, von: [], bis: null, aktion: ['Rolle'], benutzer: 5, seite: {} }),
    ).not.toThrow()
  })

  it('übernimmt keine unbekannten Parameter', () => {
    const schluessel = Object.keys(benutzerverwaltungSuche({ name: 'Test Betrachter', email: 'x@test.local' }))

    expect(schluessel.filter((s) => s === 'name' || s === 'email')).toEqual([])
  })
})
