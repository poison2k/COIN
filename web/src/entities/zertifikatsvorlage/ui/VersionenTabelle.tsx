import { useState, type ReactNode } from 'react'
import { Badge } from '@/shared/ui/badge'
import { DatenTabelle, type DatenSpalte, type Sortierung } from '@/shared/ui/daten-tabelle'
import { groesseAnzeige, zeitpunktAnzeige, type VorlagenVersion } from '../model/types'

export interface VersionenTabelleProps {
  /** Versionen in der Reihenfolge der API (neueste zuerst). */
  versionen: VorlagenVersion[]
  /** Aktion je Zeile (z. B. „Herunterladen“); ohne Aktion fehlt die Spalte. */
  aktion?: (version: VorlagenVersion) => ReactNode
}

const SPALTEN: ReadonlyArray<DatenSpalte<VorlagenVersion>> = [
  {
    id: 'version',
    titel: 'Version',
    breite: 'schmal',
    ausrichtung: 'rechts',
    karte: 'titel',
    zelle: (version) => version.version,
    kartenZelle: (version) => `Version ${version.version}`,
    sortierwert: (version) => version.version,
  },
  {
    id: 'hochgeladenAm',
    titel: 'Hochgeladen am',
    breite: 'mittel',
    karte: 'feld',
    zelle: (version) => <time dateTime={version.hochgeladenAm}>{zeitpunktAnzeige(version.hochgeladenAm)}</time>,
    sortierwert: (version) => Date.parse(version.hochgeladenAm),
  },
  {
    id: 'hochgeladenVon',
    titel: 'Hochgeladen von',
    breite: 'breit',
    karte: 'feld',
    zelle: (version) => version.hochgeladenVon.name,
  },
  {
    id: 'groesse',
    titel: 'Größe',
    breite: 'schmal',
    ausrichtung: 'rechts',
    karte: 'feld',
    zelle: (version) => groesseAnzeige(version.groesseBytes),
    sortierwert: (version) => version.groesseBytes,
  },
  {
    id: 'status',
    titel: 'Status',
    breite: 'schmal',
    karte: 'feld',
    zelle: (version) => version.aktiv && <Badge>aktiv</Badge>,
  },
]

/**
 * Versionen der Zertifikatsvorlage (zertifikatsvorlagen, AK-30); Status als Text-Badge, kein „Aktivieren“ (F6). Die
 * Liste ist vollständig geladen und clientseitig sortierbar, Standard Version absteigend (formulare-detailseiten
 * AK-31); Karten unter 768 px (AK-30).
 */
export function VersionenTabelle({ versionen, aktion }: VersionenTabelleProps) {
  const [sortierung, setSortierung] = useState<Sortierung>({ spalte: 'version', richtung: 'absteigend' })
  const spalten: ReadonlyArray<DatenSpalte<VorlagenVersion>> = aktion
    ? [
        ...SPALTEN,
        {
          id: 'aktion',
          titel: 'Aktionen',
          titelVersteckt: true,
          breite: 'schmal',
          ausrichtung: 'rechts',
          karte: 'aktion',
          zelle: aktion,
        },
      ]
    : SPALTEN
  return (
    <DatenTabelle
      beschriftung="Versionen der Zertifikatsvorlage"
      zeilen={versionen}
      schluessel={(version) => String(version.version)}
      spalten={spalten}
      sortierung={sortierung}
      onSortierung={setSortierung}
      kartenUnter="md"
    />
  )
}
