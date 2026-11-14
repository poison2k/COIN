import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

// Aktionsleiste (formulare-detailseiten, Abschnitt 4.1, ADR-0039 Punkt 4): letztes Element im <form>, „Abbrechen“
// links, Hauptaktion rechts; ab 768 px rechtsbündig. Unter 768 px klebt sie am unteren Rand (`fest`), beide Aktionen
// sind dann gleich breit. Das `scroll-padding` gegen Verdecken steht in `app/styles/index.css`
// (`html:has([data-slot='aktionsleiste'][data-fest])`).

export interface AktionsleisteProps {
  /** Reihenfolge: Abbrechen, Hauptaktion. */
  children: ReactNode
  /** Standard `true`: unter 768 px `sticky bottom-0`. */
  fest?: boolean
  className?: string
}

export function Aktionsleiste({ children, fest = true, className }: AktionsleisteProps) {
  return (
    <div
      data-slot="aktionsleiste"
      data-fest={fest || undefined}
      className={cn(
        'flex flex-wrap items-center gap-2 md:justify-end',
        '*:max-md:min-h-10 *:max-md:flex-1',
        fest &&
          'max-md:sticky max-md:bottom-0 max-md:z-10 max-md:border-t max-md:bg-background max-md:py-3 max-md:in-data-[slot=card]:bg-card',
        className,
      )}
    >
      {children}
    </div>
  )
}
