import { Badge } from '@/shared/ui/badge'

export interface StatusBadgeProps {
  aktiv: boolean
}

/** Status eines Benutzers als Badge mit Text, nicht nur Farbe (AK-28). */
export function StatusBadge({ aktiv }: StatusBadgeProps) {
  return <Badge variant={aktiv ? 'secondary' : 'destructive'}>{aktiv ? 'Aktiv' : 'Deaktiviert'}</Badge>
}
