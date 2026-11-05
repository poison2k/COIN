import { describe, expect, it } from 'vitest'
import { HOLOGRAMMNUMMER_MAX, pruefeHologrammnummer } from '../index'

// Feature hologrammnummer, AK-1 und AK-26 (Abschnitt 4, ADR-0033 Punkt 4): pruefeHologrammnummer(eingabe) liefert
// { art: 'leer' } | { art: 'ok', anzeige, normalform } | { art: 'fehler', meldung } mit derselben Logik wie
// Hologrammnummer.Pruefen im Backend. Die Testvektoren aus Abschnitt 4.2 sind dieselben wie in
// tests/Coin.UnitTests/Ausgaben/HologrammnummerTests.cs.

const ZEICHENFEHLER = 'Die Hologrammnummer darf nur Buchstaben (A–Z), Ziffern, Leerzeichen und Bindestriche enthalten.'
const LAENGENFEHLER = 'Die Hologrammnummer darf höchstens 40 Zeichen lang sein.'
const LEERFEHLER = 'Die Hologrammnummer muss mindestens einen Buchstaben oder eine Ziffer enthalten.'

const GUELTIG: Array<[string, string, string]> = [
  ['ab 12-34', 'AB 12-34', 'AB1234'],
  ['AB1234', 'AB1234', 'AB1234'],
  ['  AB– 12  34 ', 'AB- 12 34', 'AB1234'],
  ['ＡＢ１２３４', 'AB1234', 'AB1234'],
  ['AB​12­34', 'AB1234', 'AB1234'],
  ['ab\t12\n34', 'AB 12 34', 'AB1234'],
  ['AB−12', 'AB-12', 'AB12'],
  ['A'.repeat(40), 'A'.repeat(40), 'A'.repeat(40)],
  ['A-'.repeat(20), 'A-'.repeat(20), 'A'.repeat(20)],
]

describe('pruefeHologrammnummer – gültige Vektoren (Abschnitt 4.2)', () => {
  it.each(GUELTIG)('„%s“ ergibt die Anzeigeform „%s“', (eingabe, anzeige) => {
    expect(pruefeHologrammnummer(eingabe)).toMatchObject({ art: 'ok', anzeige })
  })

  it.each(GUELTIG)('„%s“ ergibt die Normalform (Anzeige „%s“, Normalform „%s“)', (eingabe, _anzeige, normalform) => {
    expect(pruefeHologrammnummer(eingabe)).toMatchObject({ art: 'ok', normalform })
  })

  it('liefert für eine gültige Nummer genau art, anzeige und normalform', () => {
    expect(pruefeHologrammnummer('ab 12-34')).toEqual({ art: 'ok', anzeige: 'AB 12-34', normalform: 'AB1234' })
  })
})

describe('pruefeHologrammnummer – Fehler (Abschnitt 4.2)', () => {
  it.each(['AB/1234', 'AB.1234', 'Ä1234', 'AB_1'])('meldet für „%s“ den Zeichenfehler', (eingabe) => {
    expect(pruefeHologrammnummer(eingabe)).toEqual({ art: 'fehler', meldung: ZEICHENFEHLER })
  })

  it.each(['- -', '--'])('meldet für „%s“ den Fehler „leer nach Normalisierung“', (eingabe) => {
    expect(pruefeHologrammnummer(eingabe)).toEqual({ art: 'fehler', meldung: LEERFEHLER })
  })

  it.each(['', '   '])('liefert für „%s“ keine Nummer', (eingabe) => {
    expect(pruefeHologrammnummer(eingabe)).toEqual({ art: 'leer' })
  })

  it('meldet für 41 Zeichen den Längenfehler', () => {
    expect(pruefeHologrammnummer('A'.repeat(41))).toEqual({ art: 'fehler', meldung: LAENGENFEHLER })
  })

  it('meldet für mehr als 200 Zeichen roh den Längenfehler, auch wenn nach dem Trimmen wenig bleibt', () => {
    expect(pruefeHologrammnummer(' '.repeat(201) + 'A')).toEqual({ art: 'fehler', meldung: LAENGENFEHLER })
  })

  it('normalisiert genau 200 Zeichen roh noch', () => {
    expect(pruefeHologrammnummer(' '.repeat(199) + 'A')).toEqual({ art: 'ok', anzeige: 'A', normalform: 'A' })
  })
})

describe('pruefeHologrammnummer – Prüfreihenfolge (Abschnitt 4.1)', () => {
  it('meldet den Zeichenfehler vor dem Längenfehler', () => {
    expect(pruefeHologrammnummer('A'.repeat(41) + '/')).toEqual({ art: 'fehler', meldung: ZEICHENFEHLER })
  })

  it('meldet den Längenfehler vor „leer nach Normalisierung“', () => {
    expect(pruefeHologrammnummer('-'.repeat(41))).toEqual({ art: 'fehler', meldung: LAENGENFEHLER })
  })

  it('meldet die Rohlänge vor dem Zeichenfehler', () => {
    expect(pruefeHologrammnummer('/'.repeat(201))).toEqual({ art: 'fehler', meldung: LAENGENFEHLER })
  })
})

describe('pruefeHologrammnummer – weitere Unicode-Varianten (Abschnitt 4.1, Schritt 3)', () => {
  it.each([
    ['AB 1234', 'AB 1234'],
    ['AB 1234', 'AB 1234'],
    ['AB　1234', 'AB 1234'],
    ['AB\r\n1234', 'AB 1234'],
  ])('macht aus dem Leerraum in „%s“ ein Leerzeichen', (eingabe, anzeige) => {
    expect(pruefeHologrammnummer(eingabe)).toMatchObject({ art: 'ok', anzeige })
  })

  it.each(['AB‐1234', 'AB‑1234', 'AB—1234', 'AB―1234', 'AB﹣1234', 'AB－1234'])(
    'macht aus dem Strichzeichen in „%s“ einen Bindestrich',
    (eingabe) => {
      expect(pruefeHologrammnummer(eingabe)).toMatchObject({ art: 'ok', anzeige: 'AB-1234' })
    },
  )

  it.each(['AB‌1234', 'AB‍1234', 'AB⁠1234', '﻿AB1234'])('lässt das Formatzeichen in „%s“ entfallen', (eingabe) => {
    expect(pruefeHologrammnummer(eingabe)).toMatchObject({ art: 'ok', anzeige: 'AB1234' })
  })

  it('fasst Leerzeichen zusammen, Bindestriche nicht', () => {
    expect(pruefeHologrammnummer('AB   -   12--3')).toMatchObject({
      art: 'ok',
      anzeige: 'AB - 12--3',
      normalform: 'AB123',
    })
  })

  it('ergibt für dieselbe Nummer in zwei Schreibweisen dieselbe Normalform', () => {
    expect(pruefeHologrammnummer('ab 12-34')).toMatchObject({ normalform: 'AB1234' })
    expect(pruefeHologrammnummer('AB1234')).toMatchObject({ normalform: 'AB1234' })
  })
})

describe('HOLOGRAMMNUMMER_MAX', () => {
  it('ist 40', () => {
    expect(HOLOGRAMMNUMMER_MAX).toBe(40)
  })
})
