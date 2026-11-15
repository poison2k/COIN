import { formatiereZahl } from '@/shared/lib/format'
import { KennzahlKarte, KennzahlRaster } from '@/shared/ui/kennzahl-karte'
import type { Kennzahlen as KennzahlenDaten } from '../model/types'
import { verfuegbarText } from '../model/verfuegbarText'

export interface KennzahlenProps {
  kennzahlen: KennzahlenDaten
  /** Fortschrittsbalken in der Karte „Verfügbar“ (nur bei bekannter Auflage; formulare-detailseiten AK-21). */
  balken?: boolean
}

/** Kennzahlen als Karten in einer Beschreibungsliste: Auflage, Ausgegeben, Verfügbar (coin-ausgaben AK-20). */
export function Kennzahlen({ kennzahlen, balken = false }: KennzahlenProps) {
  const { auflage, ausgegeben, verfuegbar } = kennzahlen
  return (
    <KennzahlRaster>
      <KennzahlKarte begriff="Auflage" wert={auflage === null ? 'unbekannt' : formatiereZahl(auflage)} />
      <KennzahlKarte begriff="Ausgegeben" wert={formatiereZahl(ausgegeben)} />
      <KennzahlKarte
        begriff="Verfügbar"
        wert={formatiereZahl(verfuegbar)}
        anteil={
          balken && auflage !== null
            ? { wert: verfuegbar, von: auflage, text: verfuegbarText(verfuegbar, auflage) }
            : undefined
        }
      />
    </KennzahlRaster>
  )
}
