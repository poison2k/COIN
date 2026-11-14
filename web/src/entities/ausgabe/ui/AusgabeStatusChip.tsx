import { Badge } from '@/shared/ui/badge'
import type { Ausgabe } from '../model/types'

export interface AusgabeStatusChipProps {
  ausgabe: Ausgabe
}

/** Status-Chip einer Ausgabe (formulare-detailseiten, Abschnitt 4.6): „aktiv“ bzw. „storniert“, der Text trägt die Bedeutung. */
export function AusgabeStatusChip({ ausgabe }: AusgabeStatusChipProps) {
  return ausgabe.storno === null ? (
    <Badge variant="success">aktiv</Badge>
  ) : (
    <Badge variant="destructive">storniert</Badge>
  )
}
