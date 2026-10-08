import { Badge } from '@/shared/ui/badge'
import type { ExemplarStatus } from '../model/types'

export interface ExemplarStatusBadgeProps {
  status: ExemplarStatus
}

/** Status eines Exemplars als Badge mit Text, nicht nur Farbe (AK-20, AK-30). */
export function ExemplarStatusBadge({ status }: ExemplarStatusBadgeProps) {
  return status === 'ausgegeben' ? (
    <Badge variant="secondary">ausgegeben</Badge>
  ) : (
    <Badge variant="outline">verfügbar</Badge>
  )
}
