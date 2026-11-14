import { formatiereZahl } from '@/shared/lib/format'
import { DatenTabelle, type DatenSpalte } from '@/shared/ui/daten-tabelle'
import type { Exemplar } from '../model/types'
import { ExemplarStatusBadge } from './ExemplarStatusBadge'

export interface ExemplarTabelleProps {
  exemplare: Exemplar[]
}

const SPALTEN: ReadonlyArray<DatenSpalte<Exemplar>> = [
  {
    id: 'nummer',
    titel: 'Nr.',
    breite: 'schmal',
    ausrichtung: 'rechts',
    karte: 'titel',
    zelle: (exemplar) => formatiereZahl(exemplar.nummer),
    kartenZelle: (exemplar) => `Nr. ${formatiereZahl(exemplar.nummer)}`,
  },
  {
    id: 'status',
    titel: 'Status',
    breite: 'rest',
    karte: 'feld',
    zelle: (exemplar) => (
      <>
        {/* Leerzeichen trennt Nummer und Status auch im reinen Text der Zeile (Screenreader, Kopieren). */}{' '}
        <ExemplarStatusBadge status={exemplar.status} />
      </>
    ),
  },
]

/**
 * Exemplare mit Nummer und Status (coin-ausgaben AK-20), ohne Ausgabedaten. Feste Serversortierung „Nr.“ aufsteigend
 * (formulare-detailseiten AK-31), Karten unter 768 px (AK-30).
 */
export function ExemplarTabelle({ exemplare }: ExemplarTabelleProps) {
  return (
    <DatenTabelle
      beschriftung="Exemplare"
      zeilen={exemplare}
      schluessel={(exemplar) => String(exemplar.nummer)}
      spalten={SPALTEN}
      sortierung={{ spalte: 'nummer', richtung: 'aufsteigend' }}
    />
  )
}
