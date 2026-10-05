import { describe, expect, it } from 'vitest'
import { testDatei } from '../../../../test/fakeApi'
import { validiereCoin } from './validiereCoin'

// AK-31: clientseitige Prüfung wie AK-2 bis AK-5 sowie AK-10/AK-11.

const gueltig = {
  name: 'Coin Alpha',
  herausgeber: 'Herausgeber Beta',
  auflage: '',
  beschreibung: '',
  bild: null as File | null,
}

function pruefe(teil: Partial<typeof gueltig>) {
  return validiereCoin({ ...gueltig, ...teil })
}

const FORMAT_MELDUNG = 'Nur JPEG, PNG oder WebP erlaubt.'
const GROESSE_MELDUNG = 'Bild ist zu groß (max. 5 MB).'

describe('validiereCoin – gültige Eingaben', () => {
  it('liefert keine Fehler für Name und Herausgeber ohne optionale Felder', () => {
    expect(pruefe({})).toEqual({})
  })

  it('liefert keine Fehler, wenn alle Felder gültig gefüllt sind', () => {
    expect(pruefe({ auflage: '250', beschreibung: 'Text', bild: testDatei('image/png', 1024) })).toEqual({})
  })
})

describe('validiereCoin – Name (AK-2, AK-6)', () => {
  it.each(['', '   ', '\t'])('meldet Fehler für leeren Namen %j', (name) => {
    expect(pruefe({ name }).name).toBeTruthy()
  })

  it('akzeptiert einen Namen mit 200 Zeichen', () => {
    expect(pruefe({ name: 'n'.repeat(200) }).name).toBeUndefined()
  })

  it('meldet Fehler für einen Namen mit 201 Zeichen', () => {
    expect(pruefe({ name: 'n'.repeat(201) }).name).toBeTruthy()
  })

  it('prüft die Länge des Namens nach dem Trimmen', () => {
    expect(pruefe({ name: `  ${'n'.repeat(200)}  ` }).name).toBeUndefined()
  })
})

describe('validiereCoin – Herausgeber (AK-3, AK-6)', () => {
  it.each(['', '    '])('meldet Fehler für leeren Herausgeber %j', (herausgeber) => {
    expect(pruefe({ herausgeber }).herausgeber).toBeTruthy()
  })

  it('akzeptiert einen Herausgeber mit 200 Zeichen', () => {
    expect(pruefe({ herausgeber: 'h'.repeat(200) }).herausgeber).toBeUndefined()
  })

  it('meldet Fehler für einen Herausgeber mit 201 Zeichen', () => {
    expect(pruefe({ herausgeber: 'h'.repeat(201) }).herausgeber).toBeTruthy()
  })

  it('prüft die Länge des Herausgebers nach dem Trimmen', () => {
    expect(pruefe({ herausgeber: ` ${'h'.repeat(200)} ` }).herausgeber).toBeUndefined()
  })
})

describe('validiereCoin – Auflage (AK-4)', () => {
  it.each(['', '   '])('akzeptiert leere Auflage %j', (auflage) => {
    expect(pruefe({ auflage }).auflage).toBeUndefined()
  })

  it.each(['1', '1000000', '250'])('akzeptiert Auflage %s', (auflage) => {
    expect(pruefe({ auflage }).auflage).toBeUndefined()
  })

  it.each(['0', '-1', '1000001', 'abc', '1.5', '1,5', '12abc'])('meldet Fehler für Auflage %j', (auflage) => {
    expect(pruefe({ auflage }).auflage).toBeTruthy()
  })
})

describe('validiereCoin – Beschreibung (AK-5)', () => {
  it('akzeptiert leere Beschreibung', () => {
    expect(pruefe({ beschreibung: '   ' }).beschreibung).toBeUndefined()
  })

  it('akzeptiert eine Beschreibung mit 2000 Zeichen', () => {
    expect(pruefe({ beschreibung: 'b'.repeat(2000) }).beschreibung).toBeUndefined()
  })

  it('meldet Fehler für eine Beschreibung mit 2001 Zeichen', () => {
    expect(pruefe({ beschreibung: 'b'.repeat(2001) }).beschreibung).toBeTruthy()
  })

  it('prüft die Länge der Beschreibung nach dem Trimmen', () => {
    expect(pruefe({ beschreibung: `   ${'b'.repeat(2000)}   ` }).beschreibung).toBeUndefined()
  })
})

describe('validiereCoin – Motivbild (AK-10, AK-11)', () => {
  it('akzeptiert fehlendes Bild', () => {
    expect(pruefe({ bild: null }).bild).toBeUndefined()
  })

  it.each(['image/jpeg', 'image/png', 'image/webp'])('akzeptiert Dateityp %s', (typ) => {
    expect(pruefe({ bild: testDatei(typ, 2048) }).bild).toBeUndefined()
  })

  it.each(['image/gif', 'image/svg+xml', 'image/bmp', 'image/heic', 'text/plain', ''])(
    'meldet „Nur JPEG, PNG oder WebP erlaubt.“ für Dateityp %j',
    (typ) => {
      expect(pruefe({ bild: testDatei(typ, 2048) }).bild).toBe(FORMAT_MELDUNG)
    },
  )

  it('akzeptiert ein Bild mit genau 5 MiB', () => {
    expect(pruefe({ bild: testDatei('image/jpeg', 5_242_880) }).bild).toBeUndefined()
  })

  it('meldet „Bild ist zu groß (max. 5 MB).“ für 5 MiB plus ein Byte', () => {
    expect(pruefe({ bild: testDatei('image/jpeg', 5_242_881) }).bild).toBe(GROESSE_MELDUNG)
  })

  it('meldet Fehler für eine leere Bilddatei', () => {
    expect(pruefe({ bild: testDatei('image/png', 0) }).bild).toBeTruthy()
  })
})

describe('validiereCoin – mehrere Fehler (AK-7)', () => {
  it('meldet alle ungültigen Felder gemeinsam', () => {
    const fehler = pruefe({
      name: '',
      herausgeber: '',
      auflage: '0',
      beschreibung: 'b'.repeat(2001),
      bild: testDatei('image/gif', 10),
    })

    expect(Object.keys(fehler).sort()).toEqual(['auflage', 'beschreibung', 'bild', 'herausgeber', 'name'])
  })
})
