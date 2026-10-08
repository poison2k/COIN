import { formatiereZahl } from '@/shared/lib/format'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import type { Exemplar } from '../model/types'
import { ExemplarStatusBadge } from './ExemplarStatusBadge'

export interface ExemplarTabelleProps {
  exemplare: Exemplar[]
}

/** Exemplare mit Nummer und Status (AK-20), ohne Ausgabedaten. */
export function ExemplarTabelle({ exemplare }: ExemplarTabelleProps) {
  return (
    <Table>
      <TableCaption className="sr-only">Exemplare</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Nr.</TableHead>
          <TableHead scope="col">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {exemplare.map((exemplar) => (
          <TableRow key={exemplar.nummer}>
            <TableCell className="tabular-nums">{formatiereZahl(exemplar.nummer)}</TableCell>
            <TableCell>
              {/* Leerzeichen trennt Nummer und Status auch im reinen Text der Zeile (Screenreader, Kopieren). */}{' '}
              <ExemplarStatusBadge status={exemplar.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
