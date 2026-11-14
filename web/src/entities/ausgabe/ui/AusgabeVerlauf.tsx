import { formatiereZeitpunkt } from '@/shared/lib/format'
import { Zeitleiste, type ZeitleisteEintrag } from '@/shared/ui/zeitleiste'
import type { Ausgabe } from '../model/types'

export interface AusgabeVerlaufProps {
  ausgabe: Ausgabe
}

/**
 * Verlauf einer Ausgabe (formulare-detailseiten, Abschnitt 4.6, AK-27, F3), älteste zuerst, nur aus vorhandenen
 * Feldern: „Ausgabe erfasst“ und bei Storno „Ausgabe storniert“ mit Grund. Hologramm-Korrekturen liefert die API nicht.
 */
export function AusgabeVerlauf({ ausgabe }: AusgabeVerlaufProps) {
  const eintraege: ZeitleisteEintrag[] = [
    {
      id: 'erfasst',
      titel: 'Ausgabe erfasst',
      zeitpunkt: ausgabe.erfasstAm,
      zeitText: formatiereZeitpunkt(ausgabe.erfasstAm),
      beschreibung: `von ${ausgabe.erfasstVon.name}`,
      ton: 'erfolg',
    },
  ]
  if (ausgabe.storno) {
    eintraege.push({
      id: 'storniert',
      titel: 'Ausgabe storniert',
      zeitpunkt: ausgabe.storno.am,
      zeitText: formatiereZeitpunkt(ausgabe.storno.am),
      beschreibung: `von ${ausgabe.storno.von.name} · Grund: ${ausgabe.storno.grund}`,
      ton: 'gefahr',
    })
  }
  return <Zeitleiste beschriftung="Verlauf der Ausgabe" eintraege={eintraege} />
}
