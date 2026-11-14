import type { ReactNode, Ref } from 'react'
import { cn } from '@/shared/lib/cn'

// Seitenkopf (design-fundament, Abschnitt 5, ADR-0036 Punkt 4, AK-23): optionale Brotkrumen, genau ein h1, optionale
// Beschreibung, Aktionen rechts (unter 640 px darunter). Wurzel ist ein <div>, nie ein <header>.

export interface SeitenkopfProps {
  titel: ReactNode
  beschreibung?: ReactNode
  aktionen?: ReactNode
  brotkrumen?: ReactNode
  titelRef?: Ref<HTMLHeadingElement>
  /** Macht das h1 per Skript fokussierbar (tabIndex -1), z. B. für den Fokus nach Meldungen. */
  titelFokussierbar?: boolean
  className?: string
}

export function Seitenkopf({
  titel,
  beschreibung,
  aktionen,
  brotkrumen,
  titelRef,
  titelFokussierbar = false,
  className,
}: SeitenkopfProps) {
  return (
    <div data-slot="seitenkopf" className={cn('grid min-w-0 gap-2', className)}>
      {brotkrumen}
      {/* Ab 640 px stehen die Aktionen neben dem Titel; reicht der Platz nicht (Titel < 16rem), brechen sie um. */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="grid min-w-0 flex-1 gap-1 sm:basis-64">
          <h1
            ref={titelRef}
            tabIndex={titelFokussierbar ? -1 : undefined}
            className="text-2xl font-semibold tracking-tight break-words outline-none md:text-3xl"
          >
            {titel}
          </h1>
          {beschreibung && <p className="text-base text-muted-foreground">{beschreibung}</p>}
        </div>
        {aktionen && <div className="flex shrink-0 flex-wrap items-center gap-2">{aktionen}</div>}
      </div>
    </div>
  )
}
