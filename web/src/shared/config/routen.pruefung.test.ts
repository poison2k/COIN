import { describe, expect, it } from 'vitest'
import { ROUTEN } from './routen'

// Feature hologrammnummer, AK-28 (Abschnitt 8): Pfad der Seite „Zertifikat prüfen“.

describe('ROUTEN.pruefung', () => {
  it('ist /pruefung', () => {
    expect((ROUTEN as Record<string, string>).pruefung).toBe('/pruefung')
  })
})
