import type { ReactNode } from 'react'
import { formatiereKalenderdatum, formatiereTag, formatiereZahl } from '@/shared/lib/format'
import { DatenTabelle, type DatenSpalte } from '@/shared/ui/daten-tabelle'
import { ausgabeStatusText } from '../model/status'
import type { Ausgabe } from '../model/types'

export interface AusgabenTabelleProps {
  /** Ausgaben in der Reihenfolge der API (neueste zuerst). */
  ausgaben: Ausgabe[]
  /**
   * Inhalt der Spalte „Zertifikat“ vor „Status“ (zertifikat-erzeugen, AK-24), z. B. Link und Download-Button; ohne
   * Angabe gibt es die Spalte nicht.
   */
  zertifikat?: (ausgabe: Ausgabe) => ReactNode
  /** Optionale Aktion je Ausgabe (z. B. „Stornieren“); `null` = keine. */
  aktion?: (ausgabe: Ausgabe) => ReactNode
  /** Titel der Karte (Kartenansicht), z. B. der Link zur Ausgabe-Seite; Standard „Nr. {n}“. */
  kartenTitel?: (ausgabe: Ausgabe) => ReactNode
  /** Inhalt der Spalte „Zertifikat“ in der Karte (bei den Aktionen); ohne Angabe fehlt er dort. */
  zertifikatKarte?: (ausgabe: Ausgabe) => ReactNode
  /** Mausklick in die Zeile öffnet den Link der Zeile (formulare-detailseiten AK-32). */
  zeilenklick?: boolean
}

function empfaenger(ausgabe: Ausgabe) {
  return (
    <>
      <span className="block font-medium">{ausgabe.empfaenger.name}</span>
      {ausgabe.empfaenger.dienstgrad !== null && (
        <span className="block text-muted-foreground">{ausgabe.empfaenger.dienstgrad}</span>
      )}
      {ausgabe.empfaenger.dienststelle !== null && (
        <span className="block text-muted-foreground">{ausgabe.empfaenger.dienststelle}</span>
      )}
    </>
  )
}

function erfasst(ausgabe: Ausgabe) {
  return (
    <>
      <span className="block">{ausgabe.erfasstVon.name}</span>
      <time className="block text-muted-foreground" dateTime={ausgabe.erfasstAm}>
        {formatiereTag(ausgabe.erfasstAm)}
      </time>
    </>
  )
}

/**
 * Ausgabehistorie eines Coins (coin-ausgaben AK-22). Alle Freitexte als Text, nie als HTML. Feste Serversortierung
 * „Erfasst“ absteigend, Karten unter 1024 px (formulare-detailseiten, Abschnitt 4.7.1).
 */
export function AusgabenTabelle({
  ausgaben,
  zertifikat,
  aktion,
  kartenTitel,
  zertifikatKarte,
  zeilenklick = false,
}: AusgabenTabelleProps) {
  const spalten: Array<DatenSpalte<Ausgabe>> = [
    {
      id: 'nummer',
      titel: 'Nr.',
      breite: 'schmal',
      ausrichtung: 'rechts',
      karte: 'titel',
      zelle: (ausgabe) => formatiereZahl(ausgabe.exemplarNummer),
      kartenZelle: kartenTitel ?? ((ausgabe) => `Nr. ${formatiereZahl(ausgabe.exemplarNummer)}`),
    },
    { id: 'empfaenger', titel: 'Empfänger', breite: 'breit', karte: 'feld', zelle: empfaenger },
    {
      id: 'datum',
      titel: 'Datum',
      breite: 'schmal',
      karte: 'feld',
      zelle: (ausgabe) => <time dateTime={ausgabe.datum}>{formatiereKalenderdatum(ausgabe.datum)}</time>,
    },
    { id: 'gelegenheit', titel: 'Gelegenheit', breite: 'breit', karte: 'feld', zelle: (a) => a.gelegenheit },
    { id: 'begruendung', titel: 'Begründung', breite: 'breit', karte: 'feld', zelle: (a) => a.begruendung },
    {
      id: 'stelle',
      titel: 'Ausgebende Stelle',
      breite: 'breit',
      karte: 'feld',
      zelle: (a) => a.ausgebendeStelle,
    },
    { id: 'erfasst', titel: 'Erfasst', breite: 'breit', karte: 'feld', zelle: erfasst },
  ]
  if (zertifikat) {
    spalten.push({
      id: 'zertifikat',
      titel: 'Zertifikat',
      breite: 'schmal',
      karte: zertifikatKarte ? 'aktion' : 'aus',
      zelle: zertifikat,
      kartenZelle: zertifikatKarte,
    })
  }
  spalten.push({ id: 'status', titel: 'Status', breite: 'mittel', karte: 'feld', zelle: ausgabeStatusText })
  if (aktion) {
    spalten.push({
      id: 'aktion',
      titel: 'Aktionen',
      titelVersteckt: true,
      breite: 'schmal',
      karte: 'aktion',
      zelle: aktion,
    })
  }

  return (
    <DatenTabelle
      beschriftung="Ausgabehistorie"
      zeilen={ausgaben}
      schluessel={(ausgabe) => ausgabe.id}
      spalten={spalten}
      sortierung={{ spalte: 'erfasst', richtung: 'absteigend' }}
      zeilenklick={zeilenklick}
      kartenUnter="lg"
    />
  )
}
