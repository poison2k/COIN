import { describe, expect, it } from 'vitest'
import { validiereAusgabe, type AusgabeEingaben } from './validiereAusgabe'

// Feature coin-ausgaben, AK-27: clientseitige Prüfung mit denselben Texten wie AK-7. Liefert nur Einträge für
// ungültige Felder (Schlüssel wie im Request). `heute` ist das heutige Datum nach Europe/Berlin (JJJJ-MM-TT).

const KONTEXT = { auflage: 150, heute: '2026-10-08' }

const gueltig: AusgabeEingaben = {
  wahl: 'naechste',
  exemplarNummer: '',
  empfaengerName: 'Max Beispiel',
  empfaengerDienstgrad: '',
  empfaengerDienststelle: '',
  datum: '2026-10-01',
  gelegenheit: 'Truppenbesuch',
  begruendung: 'Herausragende Leistung',
  ausgebendeStelle: 'Kommandeur Beispielbataillon 1',
}

function pruefe(teil: Partial<AusgabeEingaben>, kontext = KONTEXT) {
  return validiereAusgabe({ ...gueltig, ...teil }, kontext)
}

describe('validiereAusgabe – gültige Eingaben', () => {
  it('liefert keine Fehler für alle Pflichtfelder ohne optionale Felder', () => {
    expect(pruefe({})).toEqual({})
  })

  it('liefert keine Fehler mit Dienstgrad, Dienststelle und bestimmter Nummer', () => {
    expect(
      pruefe({ wahl: 'nummer', exemplarNummer: '12', empfaengerDienstgrad: 'Hauptmann', empfaengerDienststelle: 'X' }),
    ).toEqual({})
  })

  it('ignoriert die Exemplar-Nummer bei „Nächstes freies Exemplar“', () => {
    expect(pruefe({ wahl: 'naechste', exemplarNummer: '9999' })).toEqual({})
  })
})

describe('validiereAusgabe – Pflichtfelder (AK-7)', () => {
  it.each([
    ['empfaengerName', 'Name des Empfängers ist erforderlich.'],
    ['gelegenheit', 'Gelegenheit ist erforderlich.'],
    ['begruendung', 'Begründung ist erforderlich.'],
    ['ausgebendeStelle', 'Ausgebende Stelle ist erforderlich.'],
    ['datum', 'Datum ist erforderlich.'],
  ] as const)('meldet für leeres %s „%s“', (feld, meldung) => {
    expect(pruefe({ [feld]: '' })).toEqual({ [feld]: meldung })
  })

  it.each(['empfaengerName', 'gelegenheit', 'begruendung', 'ausgebendeStelle'] as const)(
    'behandelt %s aus Leerzeichen als leer',
    (feld) => {
      expect(pruefe({ [feld]: '   ' })[feld]).toBeTruthy()
    },
  )

  it('meldet alle fehlenden Pflichtfelder gemeinsam', () => {
    const fehler = pruefe({ empfaengerName: '', datum: '', gelegenheit: '', begruendung: '', ausgebendeStelle: '' })

    expect(Object.keys(fehler).sort()).toEqual([
      'ausgebendeStelle',
      'begruendung',
      'datum',
      'empfaengerName',
      'gelegenheit',
    ])
  })

  it('verlangt die Exemplar-Nummer bei „Bestimmte Nummer“', () => {
    expect(pruefe({ wahl: 'nummer', exemplarNummer: '' }).exemplarNummer).toBeTruthy()
  })
})

describe('validiereAusgabe – Längen (AK-7)', () => {
  it.each([
    ['empfaengerName', 200, 'Name des Empfängers darf höchstens 200 Zeichen lang sein.'],
    ['empfaengerDienstgrad', 100, 'Dienstgrad darf höchstens 100 Zeichen lang sein.'],
    ['empfaengerDienststelle', 200, 'Dienststelle darf höchstens 200 Zeichen lang sein.'],
    ['gelegenheit', 200, 'Gelegenheit darf höchstens 200 Zeichen lang sein.'],
    ['begruendung', 2000, 'Begründung darf höchstens 2000 Zeichen lang sein.'],
    ['ausgebendeStelle', 200, 'Ausgebende Stelle darf höchstens 200 Zeichen lang sein.'],
  ] as const)('meldet für %s mit %i + 1 Zeichen den Text aus AK-7', (feld, max, meldung) => {
    expect(pruefe({ [feld]: 'x'.repeat(max + 1) })).toEqual({ [feld]: meldung })
  })

  it.each([
    ['empfaengerName', 200],
    ['empfaengerDienstgrad', 100],
    ['empfaengerDienststelle', 200],
    ['gelegenheit', 200],
    ['begruendung', 2000],
    ['ausgebendeStelle', 200],
  ] as const)('akzeptiert %s mit genau %i Zeichen', (feld, max) => {
    expect(pruefe({ [feld]: 'x'.repeat(max) })).toEqual({})
  })

  it('prüft die Länge nach dem Trimmen', () => {
    expect(pruefe({ empfaengerName: `  ${'n'.repeat(200)}  ` })).toEqual({})
  })
})

describe('validiereAusgabe – Datum (AK-7, F8)', () => {
  it('akzeptiert heute', () => {
    expect(pruefe({ datum: '2026-10-08' })).toEqual({})
  })

  it('meldet morgen als „Das Datum darf nicht in der Zukunft liegen.“', () => {
    expect(pruefe({ datum: '2026-10-09' })).toEqual({ datum: 'Das Datum darf nicht in der Zukunft liegen.' })
  })

  it('akzeptiert ein weit zurückliegendes Datum (keine Untergrenze)', () => {
    expect(pruefe({ datum: '1960-01-01' })).toEqual({})
  })

  it('richtet sich nach dem übergebenen Tag „heute“', () => {
    expect(pruefe({ datum: '2026-10-09' }, { auflage: 150, heute: '2026-10-09' })).toEqual({})
  })
})

describe('validiereAusgabe – Exemplar-Nummer (AK-7, AK-27)', () => {
  it.each(['0', '151', '-1', '1.5', 'abc'])('meldet %j als außerhalb von 1 bis Auflage', (nummer) => {
    expect(pruefe({ wahl: 'nummer', exemplarNummer: nummer })).toEqual({
      exemplarNummer: 'Exemplar-Nummer muss zwischen 1 und 150 liegen.',
    })
  })

  it.each(['1', '150'])('akzeptiert die Grenze %s', (nummer) => {
    expect(pruefe({ wahl: 'nummer', exemplarNummer: nummer })).toEqual({})
  })

  it('verwendet die Auflage des Coins in der Meldung', () => {
    expect(pruefe({ wahl: 'nummer', exemplarNummer: '11' }, { auflage: 10, heute: '2026-10-08' })).toEqual({
      exemplarNummer: 'Exemplar-Nummer muss zwischen 1 und 10 liegen.',
    })
  })
})
