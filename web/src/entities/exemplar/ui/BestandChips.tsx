import { Badge } from '@/shared/ui/badge'
import type { Kennzahlen } from '../model/types'

export interface BestandChipsProps {
  kennzahlen: Kennzahlen
}

/**
 * Bestand als Status-Chip (formulare-detailseiten, Abschnitt 4.5, F4): bei bekannter Auflage genau einer von
 * „Exemplare verfügbar“ und „Alle Exemplare ausgegeben“; ohne Auflage keiner. Der Text trägt die Bedeutung.
 */
export function BestandChips({ kennzahlen }: BestandChipsProps) {
  if (kennzahlen.auflage === null) return null
  return kennzahlen.verfuegbar > 0 ? (
    <Badge variant="success">Exemplare verfügbar</Badge>
  ) : (
    <Badge variant="neutral">Alle Exemplare ausgegeben</Badge>
  )
}
