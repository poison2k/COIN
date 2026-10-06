import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { SYSTEM_ANZEIGE, wertAnzeige, zeitpunktAnzeige, type AuditEintrag } from '../model/types'

export interface AuditTabelleProps {
  /** Einträge in der Reihenfolge der API (neueste zuerst). */
  eintraege: AuditEintrag[]
}

/** Tabelle des Audit-Logs mit deutscher Anzeige der Werte (AK-31). Ohne E-Mails und Ids. */
export function AuditTabelle({ eintraege }: AuditTabelleProps) {
  return (
    <Table>
      <TableCaption className="sr-only">Audit-Log</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Zeitpunkt</TableHead>
          <TableHead scope="col">Geändert von</TableHead>
          <TableHead scope="col">Benutzer</TableHead>
          <TableHead scope="col">Änderung</TableHead>
          <TableHead scope="col">Vorher</TableHead>
          <TableHead scope="col">Nachher</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {eintraege.map((eintrag) => (
          <TableRow key={eintrag.id}>
            <TableCell>
              <time dateTime={eintrag.zeitpunkt}>{zeitpunktAnzeige(eintrag.zeitpunkt)}</time>
            </TableCell>
            <TableCell>{eintrag.akteur?.name ?? SYSTEM_ANZEIGE}</TableCell>
            <TableCell>{eintrag.benutzer.name}</TableCell>
            <TableCell>{eintrag.art}</TableCell>
            <TableCell>{wertAnzeige(eintrag.alt)}</TableCell>
            <TableCell>{wertAnzeige(eintrag.neu)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
