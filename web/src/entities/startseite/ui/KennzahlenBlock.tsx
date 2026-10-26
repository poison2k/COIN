import { formatiereZahl } from '@/shared/lib/format'
import type { Kennzahlen } from '../model/types'
import { BlockAbschnitt } from './BlockAbschnitt'
import type { Ebene } from './Ueberschrift'

export interface KennzahlenBlockProps {
  kennzahlen: Kennzahlen
  ebene: Ebene
}

/** Kennzahlen als `<dl>` (AK-20, AK-3), Zahlen im Format `de-DE`. */
export function KennzahlenBlock({ kennzahlen, ebene }: KennzahlenBlockProps) {
  const werte: Array<[string, number]> = [
    ['Coins', kennzahlen.coins],
    ['Exemplare gesamt', kennzahlen.exemplare],
    ['Ausgegeben', kennzahlen.ausgegeben],
    ['Verfügbar', kennzahlen.verfuegbar],
  ]
  return (
    <BlockAbschnitt titel="Kennzahlen" ebene={ebene}>
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2">
        {werte.map(([begriff, wert]) => (
          <div key={begriff} className="contents">
            <dt className="text-muted-foreground">{begriff}</dt>
            <dd className="text-right text-lg font-semibold tabular-nums">{formatiereZahl(wert)}</dd>
          </div>
        ))}
      </dl>
    </BlockAbschnitt>
  )
}
