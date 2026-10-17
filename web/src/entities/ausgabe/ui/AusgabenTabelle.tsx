import type { ReactNode } from 'react'
import { formatiereKalenderdatum, formatiereTag, formatiereZahl } from '@/shared/lib/format'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
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
}

/** Ausgabehistorie eines Coins (AK-22). Alle Freitexte als Text, nie als HTML. */
export function AusgabenTabelle({ ausgaben, zertifikat, aktion }: AusgabenTabelleProps) {
  return (
    <Table>
      <TableCaption className="sr-only">Ausgabehistorie</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Nr.</TableHead>
          <TableHead scope="col">Empfänger</TableHead>
          <TableHead scope="col">Datum</TableHead>
          <TableHead scope="col">Gelegenheit</TableHead>
          <TableHead scope="col">Begründung</TableHead>
          <TableHead scope="col">Ausgebende Stelle</TableHead>
          <TableHead scope="col">Erfasst</TableHead>
          {zertifikat && <TableHead scope="col">Zertifikat</TableHead>}
          <TableHead scope="col">Status</TableHead>
          {aktion && (
            <TableHead scope="col">
              <span className="sr-only">Aktionen</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {ausgaben.map((ausgabe) => (
          <TableRow key={ausgabe.id}>
            <TableCell className="tabular-nums">{formatiereZahl(ausgabe.exemplarNummer)}</TableCell>
            <TableCell className="whitespace-normal">
              <span className="block font-medium">{ausgabe.empfaenger.name}</span>
              {ausgabe.empfaenger.dienstgrad !== null && (
                <span className="block text-muted-foreground">{ausgabe.empfaenger.dienstgrad}</span>
              )}
              {ausgabe.empfaenger.dienststelle !== null && (
                <span className="block text-muted-foreground">{ausgabe.empfaenger.dienststelle}</span>
              )}
            </TableCell>
            <TableCell>
              <time dateTime={ausgabe.datum}>{formatiereKalenderdatum(ausgabe.datum)}</time>
            </TableCell>
            <TableCell className="whitespace-normal">{ausgabe.gelegenheit}</TableCell>
            <TableCell className="whitespace-normal">{ausgabe.begruendung}</TableCell>
            <TableCell className="whitespace-normal">{ausgabe.ausgebendeStelle}</TableCell>
            <TableCell className="whitespace-normal">
              <span className="block">{ausgabe.erfasstVon.name}</span>
              <time className="block text-muted-foreground" dateTime={ausgabe.erfasstAm}>
                {formatiereTag(ausgabe.erfasstAm)}
              </time>
            </TableCell>
            {zertifikat && <TableCell>{zertifikat(ausgabe)}</TableCell>}
            <TableCell className="whitespace-normal">{ausgabeStatusText(ausgabe)}</TableCell>
            {aktion && <TableCell>{aktion(ausgabe)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
