import { describe, expect, it } from 'vitest'
import { istGuid } from './guid'

// Feature katalog-seiten, AK-8: /coins/{coinId} ruft die API nur mit einer GUID auf.

describe('istGuid', () => {
  it.each([
    '0199a1b2-0000-7000-8000-000000000001',
    '0199A1B2-0000-7000-8000-00000000000F',
    '00000000-0000-0000-0000-000000000000',
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  ])('erkennt %s als GUID', (text) => {
    expect(istGuid(text)).toBe(true)
  })

  it.each([
    ['abc'],
    ['neu'],
    [''],
    ['0199a1b2-0000-7000-8000-00000000000'],
    ['0199a1b2-0000-7000-8000-0000000000011'],
    ['0199a1b2-0000-7000-8000-00000000000g'],
    [' 0199a1b2-0000-7000-8000-000000000001'],
    ['0199a1b2-0000-7000-8000-000000000001 '],
    ['0199a1b2-0000-7000-8000-000000000001/bild'],
    ['../0199a1b2-0000-7000-8000-000000000001'],
  ])('lehnt „%s“ ab', (text) => {
    expect(istGuid(text)).toBe(false)
  })
})
