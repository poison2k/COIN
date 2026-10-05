import { describe, expect, it } from 'vitest'
import { darfKatalogSchreiben } from '../index'

// AK-19, AK-33: Nur Administrator und Sachbearbeiter dürfen den Katalog schreiben.

describe('darfKatalogSchreiben', () => {
  it.each(['Administrator', 'Sachbearbeiter'] as const)('erlaubt %s', (rolle) => {
    expect(darfKatalogSchreiben(rolle)).toBe(true)
  })

  it.each(['Betrachter', 'keine'] as const)('verbietet %s', (rolle) => {
    expect(darfKatalogSchreiben(rolle)).toBe(false)
  })
})
