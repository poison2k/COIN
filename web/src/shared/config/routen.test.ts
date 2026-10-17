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

  it('enthält /coins/neu für „Coin hinzufügen“ (katalog-seiten, AK-7)', () => {
    expect(ROUTEN.coinNeu).toBe('/coins/neu')
  })

  it('enthält /coins/$coinId für die Detailseite (katalog-seiten, AK-7)', () => {
    expect(ROUTEN.coinDetail).toBe('/coins/$coinId')
  })

  it('enthält /coins/$coinId/bearbeiten für „Coin bearbeiten“ (zertifikatsvorlagen, AK-26)', () => {
    expect(ROUTEN.coinBearbeiten).toBe('/coins/$coinId/bearbeiten')
  })

  it('enthält /coins/$coinId/ausgaben/$ausgabeId für die Seite „Ausgabe“ (zertifikat-erzeugen, AK-27)', () => {
    expect(ROUTEN.ausgabeDetail).toBe('/coins/$coinId/ausgaben/$ausgabeId')
  })

  it('behält /coins/$coinId/ausgaben/neu für „Ausgabe erfassen“ (zertifikat-erzeugen, AK-27)', () => {
    expect(ROUTEN.coinAusgabeNeu).toBe('/coins/$coinId/ausgaben/neu')
  })
})
