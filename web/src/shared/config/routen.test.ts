import { describe, expect, it } from 'vitest'
import { ROUTEN } from './routen'

// AK-28: Pfade der neuen Seiten (Feature anmeldung-keycloak). Bestehende Pfade bleiben unverändert.

describe('ROUTEN', () => {
  it('enthält den Rückrufpfad /anmeldung/rueckruf', () => {
    expect(ROUTEN.anmeldungRueckruf).toBe('/anmeldung/rueckruf')
  })

  it('enthält /abgemeldet', () => {
    expect(ROUTEN.abgemeldet).toBe('/abgemeldet')
  })

  it('enthält /kein-zugriff', () => {
    expect(ROUTEN.keinZugriff).toBe('/kein-zugriff')
  })

  it('enthält /benutzerverwaltung (rollen-benutzerverwaltung, AK-25)', () => {
    expect(ROUTEN.benutzerverwaltung).toBe('/benutzerverwaltung')
  })

  it('behält / und /coins', () => {
    expect(ROUTEN.start).toBe('/')
    expect(ROUTEN.coinListe).toBe('/coins')
  })
})
