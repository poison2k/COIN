import { describe, expect, it } from 'vitest'
import {
  infotextBlock,
  kennzahlenBlock,
  kopfBlock,
  meistausgegebenBlock,
  neuesteBlock,
  STANDARD_REIHENFOLGE,
  type Block,
  type BlockArt,
} from '../../../../test/startseite'
import { bildeZeilen } from '../index'

// Feature startseite-listen-pruefung, AK-1 (Abschnitt 4.1, ADR-0043 Punkt 1): `bildeZeilen(bloecke)` teilt die aktiven
// Blöcke in Konfigurationsreihenfolge in Zeilen. `kopf`, `infotext` und `kennzahlen` stehen allein; `neueste` und
// `meistausgegeben` teilen sich eine Zeile nur, wenn sie direkt aufeinander folgen (in beliebiger Reihenfolge). Die
// Reihenfolge über alle Zeilen ist die übergebene. Geprüft für alle 325 nicht leeren geordneten Teilmengen und die
// leere Menge. Vertrag des Tests: `bildeZeilen(bloecke: Block[]): Block[][]` (Zeilen aus den übergebenen Blöcken).

const BLOCK: Record<BlockArt, () => Block> = {
  kopf: () => kopfBlock(),
  infotext: () => infotextBlock(),
  kennzahlen: () => kennzahlenBlock(),
  neueste: () => neuesteBlock(),
  meistausgegeben: () => meistausgegebenBlock(),
}

const PAAR: ReadonlySet<BlockArt> = new Set(['neueste', 'meistausgegeben'])

/** Alle geordneten Teilmengen (Variationen ohne Wiederholung) der Länge 1 bis 5. */
function geordneteTeilmengen(arten: readonly BlockArt[]): BlockArt[][] {
  const ergebnis: BlockArt[][] = []
  const erweitere = (bisher: BlockArt[]) => {
    for (const art of arten) {
      if (bisher.includes(art)) continue
      const neu = [...bisher, art]
      ergebnis.push(neu)
      erweitere(neu)
    }
  }
  erweitere([])
  return ergebnis
}

/** Erwartete Zeilen laut 4.1 (Referenz des Tests). */
function erwarteteZeilen(arten: BlockArt[]): BlockArt[][] {
  const zeilen: BlockArt[][] = []
  for (let i = 0; i < arten.length; i++) {
    const art = arten[i]
    const naechste = arten[i + 1]
    if (PAAR.has(art) && naechste !== undefined && PAAR.has(naechste) && naechste !== art) {
      zeilen.push([art, naechste])
      i++
    } else {
      zeilen.push([art])
    }
  }
  return zeilen
}

/** Zeilen als Arten (der Test vergleicht nur die Blockart je Zelle). */
function alsArten(zeilen: unknown): BlockArt[][] {
  expect(Array.isArray(zeilen), 'bildeZeilen liefert ein Array von Zeilen').toBe(true)
  return (zeilen as unknown[]).map((zeile) => {
    expect(Array.isArray(zeile), 'jede Zeile ist ein Array von Blöcken').toBe(true)
    return (zeile as Array<{ art: BlockArt }>).map((block) => block.art)
  })
}

const ALLE = geordneteTeilmengen(STANDARD_REIHENFOLGE)

describe('bildeZeilen (AK-1)', () => {
  it('prüft genau 325 nicht leere geordnete Teilmengen (Selbsttest)', () => {
    expect(ALLE).toHaveLength(325)
    expect(new Set(ALLE.map((t) => t.join(','))).size).toBe(325)
  })

  it('bildet aus der leeren Menge keine Zeile', () => {
    expect(alsArten(bildeZeilen([]))).toEqual([])
  })

  it.each(ALLE.map((arten) => [arten.join(', '), arten] as const))(
    'bildet die Zeilen für [%s] nach 4.1',
    (_, arten) => {
      const zeilen = alsArten(bildeZeilen(arten.map((art) => BLOCK[art]())))

      expect(zeilen).toEqual(erwarteteZeilen(arten))
    },
  )

  it('behält über alle Zeilen die übergebene Reihenfolge, für jede Teilmenge', () => {
    for (const arten of ALLE) {
      expect(alsArten(bildeZeilen(arten.map((art) => BLOCK[art]()))).flat(), arten.join(', ')).toEqual(arten)
    }
  })

  it('lässt kopf, infotext und kennzahlen in jeder Teilmenge allein in ihrer Zeile', () => {
    for (const arten of ALLE) {
      const zeilen = alsArten(bildeZeilen(arten.map((art) => BLOCK[art]())))
      for (const zeile of zeilen) {
        if (zeile.some((art) => !PAAR.has(art))) expect(zeile, arten.join(', ')).toHaveLength(1)
      }
    }
  })

  it('setzt höchstens zwei Blöcke in eine Zeile', () => {
    for (const arten of ALLE) {
      for (const zeile of alsArten(bildeZeilen(arten.map((art) => BLOCK[art]())))) {
        expect(zeile.length, arten.join(', ')).toBeLessThanOrEqual(2)
      }
    }
  })

  it('liefert die übergebenen Blockobjekte unverändert in den Zeilen', () => {
    const bloecke = [kopfBlock(), neuesteBlock(), meistausgegebenBlock()]

    const zeilen = bildeZeilen(bloecke) as unknown as Block[][]

    expect(zeilen.flat()).toEqual(bloecke)
    expect(zeilen.flat()[1]).toBe(bloecke[1])
  })

  // Beispiele aus Abschnitt 4.1 und 11.2 (lesbare Einzelfälle zusätzlich zur vollständigen Prüfung).
  it.each<[string, BlockArt[], BlockArt[][]]>([
    [
      'Standardreihenfolge (Fall 1)',
      ['kopf', 'infotext', 'kennzahlen', 'neueste', 'meistausgegeben'],
      [['kopf'], ['infotext'], ['kennzahlen'], ['neueste', 'meistausgegeben']],
    ],
    [
      'ohne Kennzahlen und Infotext (Fall 2)',
      ['kopf', 'neueste', 'meistausgegeben'],
      [['kopf'], ['neueste', 'meistausgegeben']],
    ],
    [
      'getrennte Paarblöcke (Fall 3)',
      ['kopf', 'neueste', 'kennzahlen', 'meistausgegeben'],
      [['kopf'], ['neueste'], ['kennzahlen'], ['meistausgegeben']],
    ],
    [
      'Kennzahlen und Meistausgegebene (Fall 4)',
      ['kennzahlen', 'meistausgegeben'],
      [['kennzahlen'], ['meistausgegeben']],
    ],
    ['nur Neueste (Fall 5)', ['neueste'], [['neueste']]],
    ['Paar in umgekehrter Reihenfolge', ['meistausgegeben', 'neueste'], [['meistausgegeben', 'neueste']]],
    [
      'Kennzahlen und Infotext getrennt (Ist-Stand mit Lücken)',
      ['kennzahlen', 'infotext', 'neueste'],
      [['kennzahlen'], ['infotext'], ['neueste']],
    ],
  ])('bildet für %s die erwarteten Zeilen', (_, arten, erwartet) => {
    expect(alsArten(bildeZeilen(arten.map((art) => BLOCK[art]())))).toEqual(erwartet)
  })
})
