import type { Block, BlockArt } from '@/entities/startseite'

// Zeilen der Startseite (startseite-listen-pruefung, Abschnitt 4.1, ADR-0043 Punkt 1): `kopf`, `infotext` und
// `kennzahlen` stehen allein. `neueste` und `meistausgegeben` teilen sich eine Zeile, wenn sie direkt aufeinander
// folgen. Die Reihenfolge der Blöcke bleibt die übergebene.

const PAAR: ReadonlySet<BlockArt> = new Set<BlockArt>(['neueste', 'meistausgegeben'])

export function bildeZeilen(bloecke: ReadonlyArray<Block>): Block[][] {
  const zeilen: Block[][] = []
  for (let i = 0; i < bloecke.length; i++) {
    const block = bloecke[i]
    const naechster = bloecke[i + 1]
    if (PAAR.has(block.art) && naechster !== undefined && PAAR.has(naechster.art) && naechster.art !== block.art) {
      zeilen.push([block, naechster])
      i++
    } else {
      zeilen.push([block])
    }
  }
  return zeilen
}
