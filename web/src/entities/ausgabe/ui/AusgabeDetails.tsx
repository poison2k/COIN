import type { ReactNode } from 'react'
import { formatiereKalenderdatum, formatiereTag } from '@/shared/lib/format'
import { ausgabeStatusText } from '../model/status'
import type { Ausgabe } from '../model/types'

export interface AusgabeDetailsProps {
  ausgabe: Ausgabe
}

function Eintrag({ begriff, children, className }: { begriff: string; children: ReactNode; className?: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="font-medium text-muted-foreground">{begriff}</dt>
      <dd className={className ?? 'break-words'}>{children}</dd>
    </div>
  )
}

/**
 * Angaben einer Ausgabe als Beschreibungsliste (zertifikat-erzeugen, AK-28): Zertifikatsnummer, Empfänger, Dienstgrad
 * und Dienststelle (nur wenn vorhanden), Datum, Gelegenheit, Begründung (Zeilenumbrüche sichtbar), Ausgebende Stelle,
 * Erfasst und Status wie in der Historie. Alle Werte als Text, nie als HTML.
 */
export function AusgabeDetails({ ausgabe }: AusgabeDetailsProps) {
  const { empfaenger } = ausgabe
  return (
    <dl className="grid gap-3">
      <Eintrag begriff="Zertifikatsnummer" className="font-mono tabular-nums">
        {ausgabe.zertifikatsnummer}
      </Eintrag>
      <Eintrag begriff="Empfänger">{empfaenger.name}</Eintrag>
      {empfaenger.dienstgrad !== null && <Eintrag begriff="Dienstgrad">{empfaenger.dienstgrad}</Eintrag>}
      {empfaenger.dienststelle !== null && <Eintrag begriff="Dienststelle">{empfaenger.dienststelle}</Eintrag>}
      <Eintrag begriff="Datum">
        <time dateTime={ausgabe.datum}>{formatiereKalenderdatum(ausgabe.datum)}</time>
      </Eintrag>
      <Eintrag begriff="Gelegenheit">{ausgabe.gelegenheit}</Eintrag>
      <Eintrag begriff="Begründung" className="break-words whitespace-pre-line">
        {ausgabe.begruendung}
      </Eintrag>
      <Eintrag begriff="Ausgebende Stelle">{ausgabe.ausgebendeStelle}</Eintrag>
      <Eintrag begriff="Erfasst">
        <span className="block">{ausgabe.erfasstVon.name}</span>
        <time className="block text-muted-foreground" dateTime={ausgabe.erfasstAm}>
          {formatiereTag(ausgabe.erfasstAm)}
        </time>
      </Eintrag>
      <Eintrag begriff="Status">{ausgabeStatusText(ausgabe)}</Eintrag>
    </dl>
  )
}
