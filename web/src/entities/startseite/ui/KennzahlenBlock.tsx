import { useId } from 'react'
import { formatiereZahl } from '@/shared/lib/format'
import { KennzahlKarte, KennzahlRaster } from '@/shared/ui/kennzahl-karte'
import type { Kennzahlen } from '../model/types'
import { Ueberschrift, type Ebene } from './Ueberschrift'

export interface KennzahlenBlockProps {
  kennzahlen: Kennzahlen
  ebene: Ebene
}

/**
 * Kennzahlen (startseite-listen-pruefung, Abschnitt 4.1, AK-5): Region mit Überschrift ohne äußere Blockkarte, vier
 * Kennzahlkarten in einer `dl` (1/2/4 Spalten), Zahlen im Format `de-DE`.
 */
export function KennzahlenBlock({ kennzahlen, ebene }: KennzahlenBlockProps) {
  const id = useId()
  const werte: Array<[string, number]> = [
    ['Coins', kennzahlen.coins],
    ['Exemplare gesamt', kennzahlen.exemplare],
    ['Ausgegeben', kennzahlen.ausgegeben],
    ['Verfügbar', kennzahlen.verfuegbar],
  ]
  return (
    <section aria-labelledby={id} className="grid content-start gap-4">
      <Ueberschrift id={id} ebene={ebene} className="text-xl">
        Kennzahlen
      </Ueberschrift>
      <KennzahlRaster spalten={4}>
        {werte.map(([begriff, wert]) => (
          <KennzahlKarte key={begriff} begriff={begriff} wert={formatiereZahl(wert)} groesse="gross" />
        ))}
      </KennzahlRaster>
    </section>
  )
}
