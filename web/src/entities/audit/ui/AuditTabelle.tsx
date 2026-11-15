import { formatiereZeitpunkt, formatiereZeitpunktMitSekunden } from '@/shared/lib/format'
import { DatenTabelle, type DatenSpalte } from '@/shared/ui/daten-tabelle'
import { SYSTEM_ANZEIGE, wertAnzeige, type AuditEintrag } from '../model/types'

export interface AuditTabelleProps {
  /** Einträge in der Reihenfolge der API (neueste zuerst). */
  eintraege: AuditEintrag[]
}

const SPALTEN: ReadonlyArray<DatenSpalte<AuditEintrag>> = [
  {
    id: 'zeitpunkt',
    titel: 'Zeitpunkt',
    breite: 'mittel',
    karte: 'titel',
    // Europe/Berlin mit „Uhr“, im title mit Sekunden (startseite-listen-pruefung AK-30, R7).
    zelle: (eintrag) => (
      <time dateTime={eintrag.zeitpunkt} title={formatiereZeitpunktMitSekunden(eintrag.zeitpunkt) || undefined}>
        {formatiereZeitpunkt(eintrag.zeitpunkt) || eintrag.zeitpunkt}
      </time>
    ),
  },
  {
    id: 'akteur',
    titel: 'Geändert von',
    breite: 'breit',
    karte: 'feld',
    zelle: (eintrag) => eintrag.akteur?.name ?? SYSTEM_ANZEIGE,
  },
  { id: 'benutzer', titel: 'Benutzer', breite: 'breit', karte: 'feld', zelle: (eintrag) => eintrag.benutzer.name },
  { id: 'art', titel: 'Änderung', breite: 'mittel', karte: 'feld', zelle: (eintrag) => eintrag.art },
  { id: 'alt', titel: 'Vorher', breite: 'mittel', karte: 'feld', zelle: (eintrag) => wertAnzeige(eintrag.alt) },
  { id: 'neu', titel: 'Nachher', breite: 'mittel', karte: 'feld', zelle: (eintrag) => wertAnzeige(eintrag.neu) },
]

/**
 * Tabelle des Audit-Logs mit deutscher Anzeige der Werte (rollen-benutzerverwaltung AK-31), ohne E-Mails und Ids.
 * Feste Serversortierung „Zeitpunkt“ absteigend, Karten unter 768 px (formulare-detailseiten AK-30/AK-31).
 */
export function AuditTabelle({ eintraege }: AuditTabelleProps) {
  return (
    <DatenTabelle
      beschriftung="Audit-Log"
      zeilen={eintraege}
      schluessel={(eintrag) => eintrag.id}
      spalten={SPALTEN}
      sortierung={{ spalte: 'zeitpunkt', richtung: 'absteigend' }}
      kartenUnter="md"
    />
  )
}
