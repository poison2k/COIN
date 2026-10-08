import { formatiereZahl } from '@/shared/lib/format'
import type { Kennzahlen as KennzahlenDaten } from '../model/types'

export interface KennzahlenProps {
  kennzahlen: KennzahlenDaten
}

/** Kennzahlen als Beschreibungsliste: Auflage, Ausgegeben, Verfügbar (AK-20). */
export function Kennzahlen({ kennzahlen }: KennzahlenProps) {
  const werte: Array<[string, number | null]> = [
    ['Auflage', kennzahlen.auflage],
    ['Ausgegeben', kennzahlen.ausgegeben],
    ['Verfügbar', kennzahlen.verfuegbar],
  ]
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 sm:flex sm:flex-wrap sm:gap-x-8">
      {werte.map(([begriff, wert]) => (
        <div key={begriff} className="contents sm:block">
          <dt className="text-sm text-muted-foreground">{begriff}</dt>
          <dd className="text-lg font-semibold tabular-nums">{wert === null ? 'unbekannt' : formatiereZahl(wert)}</dd>
        </div>
      ))}
    </dl>
  )
}
