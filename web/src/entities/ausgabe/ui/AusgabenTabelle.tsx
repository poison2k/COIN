import type { ReactNode } from 'react'
import { formatiereKalenderdatum, formatiereTag, formatiereZahl } from '@/shared/lib/format'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import type { Ausgabe } from '../model/types'

export interface AusgabenTabelleProps {
  /** Ausgaben in der Reihenfolge der API (neueste zuerst). */
  ausgaben: Ausgabe[]
  /** Optionale Aktion je Ausgabe (z. B. „Stornieren“); `null` = keine. */
  aktion?: (ausgabe: Ausgabe) => ReactNode
}

/** Status als Text: „aktiv“ oder „storniert am {Datum} von {Name}: {Grund}“ (AK-22). */
function statusText(ausgabe: Ausgabe): string {
  const storno = ausgabe.storno
  return storno ? `storniert am ${formatiereTag(storno.am)} von ${storno.von.name}: ${storno.grund}` : 'aktiv'
}

/** Ausgabehistorie eines Coins (AK-22). Alle Freitexte als Text, nie als HTML. */
export function AusgabenTabelle({ ausgaben, aktion }: AusgabenTabelleProps) {
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
            <TableCell className="whitespace-normal">{statusText(ausgabe)}</TableCell>
            {aktion && <TableCell>{aktion(ausgabe)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
