import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

// Rangliste (startseite-listen-pruefung, Abschnitt 4.1 und 4.6, AK-7): <ol> ohne Browser-Nummerierung. Je Eintrag eine
// sichtbare Rangzahl im Kreis (für Screenreader ausgeblendet) und für Screenreader „Platz {rang}“, daneben der Inhalt,
// rechts der Wert als eigenes Element.
// Die Zeilen trennt eine Linie (divide-y); ein Separator-Element zwischen den <li> wäre im <ol> unzulässig.

export interface RanglisteEintrag {
  id: string
  rang: number
  inhalt: ReactNode
  wert: ReactNode
}

export interface RanglisteProps {
  /** Zugänglicher Name der Liste. */
  beschriftung?: string
  eintraege: ReadonlyArray<RanglisteEintrag>
  className?: string
}

export function Rangliste({ beschriftung, eintraege, className }: RanglisteProps) {
  return (
    <ol aria-label={beschriftung} className={cn('grid list-none divide-y', className)}>
      {eintraege.map((eintrag) => (
        <li key={eintrag.id} className="flex items-center gap-3 py-2">
          {/* Sichtbar nur die Zahl im Kreis; Screenreader hören „Platz {rang}“. */}
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-semibold tabular-nums"
          >
            {eintrag.rang}
          </span>
          <span className="sr-only">Platz</span> <span className="sr-only">{eintrag.rang}</span>
          <span className="min-w-0 flex-1 break-words">{eintrag.inhalt}</span>
          <span className="shrink-0 text-right text-muted-foreground tabular-nums">{eintrag.wert}</span>
        </li>
      ))}
    </ol>
  )
}
