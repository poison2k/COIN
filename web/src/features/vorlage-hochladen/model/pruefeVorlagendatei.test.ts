import { describe, expect, it } from 'vitest'
import { testDatei } from '../../../../test/fakeApi'
import { pruefeVorlagendatei } from './pruefeVorlagendatei'

// Feature zertifikatsvorlagen, AK-30: clientseitige Vorprüfung nur auf Endung .docx und Größe, mit den Texten aus
// AK-9/AK-10. Maßgeblich bleibt der Server (Inhalt, Makros, Platzhalter).

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const KEIN_DOCX = 'Die Datei ist kein Word-Dokument im Format .docx.'
const ZU_GROSS = 'Die Vorlage darf höchstens 5 MB groß sein.'
const LEER = 'Die Datei ist leer.'

describe('pruefeVorlagendatei', () => {
  it('akzeptiert eine .docx-Datei', () => {
    expect(pruefeVorlagendatei(testDatei(DOCX, 2048, 'urkunde.docx'))).toBeUndefined()
  })

  it('akzeptiert die Endung in Großbuchstaben', () => {
    expect(pruefeVorlagendatei(testDatei(DOCX, 2048, 'URKUNDE.DOCX'))).toBeUndefined()
  })

  it('prüft die Endung, nicht den vom Browser gemeldeten Typ', () => {
    expect(pruefeVorlagendatei(testDatei('', 2048, 'urkunde.docx'))).toBeUndefined()
  })

  it.each(['urkunde.doc', 'urkunde.docm', 'urkunde.dotx', 'urkunde.pdf', 'urkunde', 'urkunde.docx.exe', 'docx'])(
    'meldet für %j „Die Datei ist kein Word-Dokument im Format .docx.“',
    (name) => {
      expect(pruefeVorlagendatei(testDatei(DOCX, 2048, name))).toBe(KEIN_DOCX)
    },
  )

  it('akzeptiert genau 5 MiB', () => {
    expect(pruefeVorlagendatei(testDatei(DOCX, 5_242_880, 'urkunde.docx'))).toBeUndefined()
  })

  it('meldet für 5 MiB plus ein Byte „Die Vorlage darf höchstens 5 MB groß sein.“', () => {
    expect(pruefeVorlagendatei(testDatei(DOCX, 5_242_881, 'urkunde.docx'))).toBe(ZU_GROSS)
  })

  it('meldet für eine leere Datei „Die Datei ist leer.“', () => {
    expect(pruefeVorlagendatei(testDatei(DOCX, 0, 'urkunde.docx'))).toBe(LEER)
  })
})
