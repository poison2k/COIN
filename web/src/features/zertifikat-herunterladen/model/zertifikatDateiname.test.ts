import { describe, expect, it } from 'vitest'
import { zertifikatDateiname } from './zertifikatDateiname'

// Feature zertifikat-erzeugen, AK-25 (Rev. 2): Der Dateiname kommt aus Content-Disposition, nur wenn er
// ^Zertifikat_C[0-9]{4,}-[0-9]{4,7}\.docx$ entspricht; sonst Zertifikat_{zertifikatsnummer}.docx aus den geladenen
// Daten; entspricht die Nummer nicht ^C[0-9]{4,}-[0-9]{4,7}$, dann Zertifikat.docx.
// Aufruf: zertifikatDateiname(ausHeader, zertifikatsnummer).

describe('zertifikatDateiname', () => {
  it.each(['Zertifikat_C0042-0012.docx', 'Zertifikat_C10000-12345.docx', 'Zertifikat_C0001-1000000.docx'])(
    'übernimmt den gültigen Namen „%s“ aus dem Header',
    (name) => {
      expect(zertifikatDateiname(name, 'C0042-0012')).toBe(name)
    },
  )

  it('nimmt den Header-Namen auch dann, wenn er von der geladenen Nummer abweicht', () => {
    expect(zertifikatDateiname('Zertifikat_C0042-0013.docx', 'C0042-0012')).toBe('Zertifikat_C0042-0013.docx')
  })

  it.each([
    ['../x.docx'],
    ['Zertifikat_a.exe'],
    ['Zertifikat_C0042-0012-2.docx'],
    ['Zertifikat_C042-0012.docx'],
    ['Zertifikat_C0042-012.docx'],
    ['Zertifikat_C0042-12345678.docx'],
    ['zertifikat_C0042-0012.docx'],
    ['Zertifikat_C0042-0012.docx.exe'],
    ['Zertifikat_C0042-0012.DOCX'],
    ['../Zertifikat_C0042-0012.docx'],
    ['Zertifikat_C0042-0012 .docx'],
    [''],
  ])('verwirft den Header-Namen „%s“ und bildet ihn aus der Nummer', (name) => {
    expect(zertifikatDateiname(name, 'C0042-0012')).toBe('Zertifikat_C0042-0012.docx')
  })

  it('bildet den Namen aus der Nummer, wenn der Header fehlt', () => {
    expect(zertifikatDateiname(null, 'C0042-0012')).toBe('Zertifikat_C0042-0012.docx')
  })

  it('bildet den Namen aus der Nummer, wenn der Header undefined ist', () => {
    expect(zertifikatDateiname(undefined, 'C10000-12345')).toBe('Zertifikat_C10000-12345.docx')
  })

  it.each(['../C0042-0012', 'C0042-0012-2', 'c0042-0012', 'C42-12', 'C0042-12345678', '', 'C0042-0012/..'])(
    'liefert Zertifikat.docx bei fehlendem Header und ungültiger Nummer „%s“',
    (nummer) => {
      expect(zertifikatDateiname(null, nummer)).toBe('Zertifikat.docx')
    },
  )

  it('liefert Zertifikat.docx bei ungültigem Header und ungültiger Nummer', () => {
    expect(zertifikatDateiname('../x.docx', '<script>')).toBe('Zertifikat.docx')
  })
})
