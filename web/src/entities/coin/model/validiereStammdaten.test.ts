import { describe, expect, it } from 'vitest'
import { validiereStammdaten } from '../index'

// Feature zertifikatsvorlagen, AK-28 und Abschnitt 7: gemeinsame Prüfung der Stammdaten in entities/coin (aus
// features/coin-anlegen verschoben, genutzt von „Coin hinzufügen“ und „Coin bearbeiten“). Gleiche Regeln und Texte
// wie bisher validiereCoin (katalog-seiten AK-31); die Bildprüfung bleibt in features/coin-anlegen.
// Neu: Option auflagePflicht (Bearbeiten eines Coins mit Auflage, AK-22 „auflage: null nur ohne bisherige Auflage“).

const gueltig = { name: 'Coin Alpha', herausgeber: 'Herausgeber Beta', auflage: '', beschreibung: '' }

function pruefe(teil: Partial<typeof gueltig>, optionen?: { auflagePflicht?: boolean }) {
  return validiereStammdaten({ ...gueltig, ...teil }, optionen)
}

describe('validiereStammdaten – gültige Eingaben', () => {
  it('liefert keine Fehler für Name und Herausgeber ohne optionale Felder', () => {
    expect(pruefe({})).toEqual({})
  })

  it('liefert keine Fehler, wenn alle Felder gültig gefüllt sind', () => {
    expect(pruefe({ auflage: '250', beschreibung: 'Text' })).toEqual({})
  })
})

describe('validiereStammdaten – Name', () => {
  it.each(['', '   ', '\t'])('meldet „Name ist erforderlich.“ für %j', (name) => {
    expect(pruefe({ name }).name).toBe('Name ist erforderlich.')
  })

  it('akzeptiert einen Namen mit 200 Zeichen', () => {
    expect(pruefe({ name: 'n'.repeat(200) }).name).toBeUndefined()
  })

  it('meldet „Name darf höchstens 200 Zeichen lang sein.“ für 201 Zeichen', () => {
    expect(pruefe({ name: 'n'.repeat(201) }).name).toBe('Name darf höchstens 200 Zeichen lang sein.')
  })

  it('prüft die Länge des Namens nach dem Trimmen', () => {
    expect(pruefe({ name: `  ${'n'.repeat(200)}  ` }).name).toBeUndefined()
  })
})

describe('validiereStammdaten – Herausgeber', () => {
  it.each(['', '    '])('meldet „Herausgeber ist erforderlich.“ für %j', (herausgeber) => {
    expect(pruefe({ herausgeber }).herausgeber).toBe('Herausgeber ist erforderlich.')
  })

  it('meldet „Herausgeber darf höchstens 200 Zeichen lang sein.“ für 201 Zeichen', () => {
    expect(pruefe({ herausgeber: 'h'.repeat(201) }).herausgeber).toBe(
      'Herausgeber darf höchstens 200 Zeichen lang sein.',
    )
  })

  it('prüft die Länge des Herausgebers nach dem Trimmen', () => {
    expect(pruefe({ herausgeber: ` ${'h'.repeat(200)} ` }).herausgeber).toBeUndefined()
  })
})

describe('validiereStammdaten – Auflage', () => {
  it.each(['', '   '])('akzeptiert leere Auflage %j ohne auflagePflicht', (auflage) => {
    expect(pruefe({ auflage }).auflage).toBeUndefined()
  })

  it.each(['1', '1000000', '250'])('akzeptiert Auflage %s', (auflage) => {
    expect(pruefe({ auflage }).auflage).toBeUndefined()
  })

  it.each(['0', '-1', '1000001'])('meldet „Auflage muss zwischen 1 und 1000000 liegen.“ für %s', (auflage) => {
    expect(pruefe({ auflage }).auflage).toBe('Auflage muss zwischen 1 und 1000000 liegen.')
  })

  it.each(['abc', '1.5', '1,5', '12abc'])('meldet „Auflage muss eine ganze Zahl sein.“ für %j', (auflage) => {
    expect(pruefe({ auflage }).auflage).toBe('Auflage muss eine ganze Zahl sein.')
  })

  it.each(['', '  '])('meldet mit auflagePflicht „Auflage ist erforderlich.“ für %j', (auflage) => {
    expect(pruefe({ auflage }, { auflagePflicht: true }).auflage).toBe('Auflage ist erforderlich.')
  })

  it('akzeptiert mit auflagePflicht eine gültige Auflage', () => {
    expect(pruefe({ auflage: '12' }, { auflagePflicht: true }).auflage).toBeUndefined()
  })

  it('prüft mit auflagePflicht weiterhin den Bereich', () => {
    expect(pruefe({ auflage: '0' }, { auflagePflicht: true }).auflage).toBe(
      'Auflage muss zwischen 1 und 1000000 liegen.',
    )
  })
})

describe('validiereStammdaten – Beschreibung', () => {
  it('akzeptiert leere Beschreibung', () => {
    expect(pruefe({ beschreibung: '   ' }).beschreibung).toBeUndefined()
  })

  it('meldet „Beschreibung darf höchstens 2000 Zeichen lang sein.“ für 2001 Zeichen', () => {
    expect(pruefe({ beschreibung: 'b'.repeat(2001) }).beschreibung).toBe(
      'Beschreibung darf höchstens 2000 Zeichen lang sein.',
    )
  })

  it('prüft die Länge der Beschreibung nach dem Trimmen', () => {
    expect(pruefe({ beschreibung: `   ${'b'.repeat(2000)}   ` }).beschreibung).toBeUndefined()
  })
})

describe('validiereStammdaten – mehrere Fehler', () => {
  it('meldet alle ungültigen Felder gemeinsam und kennt kein Feld „bild“', () => {
    const fehler = pruefe({ name: '', herausgeber: '', auflage: '0', beschreibung: 'b'.repeat(2001) })

    expect(Object.keys(fehler).sort()).toEqual(['auflage', 'beschreibung', 'herausgeber', 'name'])
  })
})
