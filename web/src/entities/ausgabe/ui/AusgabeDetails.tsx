import type { ReactNode } from 'react'
import { formatiereKalenderdatum, formatiereTag } from '@/shared/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { ausgabeStatusText } from '../model/status'
import type { Ausgabe } from '../model/types'

export interface AusgabeDetailsProps {
  ausgabe: Ausgabe
  /** Aktion neben der Hologrammnummer (z. B. „Hologrammnummer ergänzen/korrigieren“). */
  hologrammAktion?: ReactNode
}

function Eintrag({ begriff, children, className }: { begriff: string; children: ReactNode; className?: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="font-medium text-muted-foreground">{begriff}</dt>
      <dd className={className ?? 'min-w-0 break-words'}>{children}</dd>
    </div>
  )
}

function Abschnitt({ titel, children, className }: { titel: string; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle ebene={2}>{titel}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/**
 * Angaben einer Ausgabe als Beschreibungslisten (zertifikat-erzeugen, AK-28) in den Abschnitten „Zertifikat“,
 * „Empfängerdaten“ und „Ausgabedaten“ (formulare-detailseiten AK-26): Zertifikatsnummer, Hologrammnummer (Anzeigeform
 * oder „Keine erfasst“, hologrammnummer AK-27), Empfänger, Dienstgrad und Dienststelle (nur wenn vorhanden), Datum,
 * Gelegenheit, Begründung (Zeilenumbrüche sichtbar), Ausgebende Stelle, Erfasst und Status wie in der Historie. Die
 * Begriffe stehen in der bisherigen Reihenfolge. Alle Werte als Text, nie als HTML. Ab 1024 px stehen Empfänger- und
 * Ausgabedaten nebeneinander.
 */
export function AusgabeDetails({ ausgabe, hologrammAktion }: AusgabeDetailsProps) {
  const { empfaenger } = ausgabe
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Abschnitt titel="Zertifikat" className="lg:col-span-2">
        <dl className="grid gap-3">
          <Eintrag begriff="Zertifikatsnummer" className="font-mono tabular-nums">
            {ausgabe.zertifikatsnummer}
          </Eintrag>
          <Eintrag
            begriff="Hologrammnummer"
            className={ausgabe.hologrammnummer === null ? 'min-w-0' : 'min-w-0 font-mono break-words'}
          >
            {ausgabe.hologrammnummer ?? <span className="text-muted-foreground">Keine erfasst</span>}
          </Eintrag>
        </dl>
        {hologrammAktion && <div className="mt-4">{hologrammAktion}</div>}
      </Abschnitt>
      <Abschnitt titel="Empfängerdaten">
        <dl className="grid gap-3">
          <Eintrag begriff="Empfänger">{empfaenger.name}</Eintrag>
          {empfaenger.dienstgrad !== null && <Eintrag begriff="Dienstgrad">{empfaenger.dienstgrad}</Eintrag>}
          {empfaenger.dienststelle !== null && <Eintrag begriff="Dienststelle">{empfaenger.dienststelle}</Eintrag>}
        </dl>
      </Abschnitt>
      <Abschnitt titel="Ausgabedaten">
        <dl className="grid gap-3">
          <Eintrag begriff="Datum">
            <time dateTime={ausgabe.datum}>{formatiereKalenderdatum(ausgabe.datum)}</time>
          </Eintrag>
          <Eintrag begriff="Gelegenheit">{ausgabe.gelegenheit}</Eintrag>
          <Eintrag begriff="Begründung" className="min-w-0 break-words whitespace-pre-line">
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
      </Abschnitt>
    </div>
  )
}
