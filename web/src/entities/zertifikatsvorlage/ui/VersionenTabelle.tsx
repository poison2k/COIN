import type { ReactNode } from 'react'
import { Badge } from '@/shared/ui/badge'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { groesseAnzeige, zeitpunktAnzeige, type VorlagenVersion } from '../model/types'

export interface VersionenTabelleProps {
  /** Versionen in der Reihenfolge der API (neueste zuerst). */
  versionen: VorlagenVersion[]
  /** Aktion je Zeile (z. B. „Herunterladen“); ohne Aktion fehlt die Spalte. */
  aktion?: (version: VorlagenVersion) => ReactNode
}

/** Versionen der Zertifikatsvorlage (zertifikatsvorlagen, AK-30); Status als Text-Badge, kein „Aktivieren“ (F6). */
export function VersionenTabelle({ versionen, aktion }: VersionenTabelleProps) {
  return (
    <Table>
      <TableCaption className="sr-only">Versionen der Zertifikatsvorlage</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Version</TableHead>
          <TableHead scope="col">Hochgeladen am</TableHead>
          <TableHead scope="col">Hochgeladen von</TableHead>
          <TableHead scope="col">Größe</TableHead>
          <TableHead scope="col">Status</TableHead>
          {aktion && (
            <TableHead scope="col">
              <span className="sr-only">Aktionen</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {versionen.map((version) => (
          <TableRow key={version.version}>
            <TableCell>{version.version}</TableCell>
            <TableCell>
              <time dateTime={version.hochgeladenAm}>{zeitpunktAnzeige(version.hochgeladenAm)}</time>
            </TableCell>
            <TableCell>{version.hochgeladenVon.name}</TableCell>
            <TableCell>{groesseAnzeige(version.groesseBytes)}</TableCell>
            <TableCell>{version.aktiv && <Badge>aktiv</Badge>}</TableCell>
            {aktion && <TableCell className="text-right">{aktion(version)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
