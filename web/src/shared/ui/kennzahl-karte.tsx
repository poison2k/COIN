import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Progress } from '@/shared/ui/progress'

// Kennzahlkarte (formulare-detailseiten, Abschnitt 4.5, 4.8, AK-21): `KennzahlRaster` ist die Beschreibungsliste, je
// `KennzahlKarte` ein Begriff mit Wert (die `dd` enthält nur den Wert). Mit `anteil` folgt ein Fortschrittsbalken
// außerhalb der `dd` als weitere Definition (role="definition", axe „definition-list“) mit eigenem `aria-valuetext`.
// Ab 640 px dreispaltig.

export interface KennzahlRasterProps {
  children: ReactNode
  className?: string
}

export function KennzahlRaster({ children, className }: KennzahlRasterProps) {
  return <dl className={cn('grid gap-4 sm:grid-cols-3', className)}>{children}</dl>
}

export interface KennzahlAnteil {
  wert: number
  von: number
  /** Zugänglicher Text, z. B. „147 von 150 verfügbar (98 %)“. */
  text: string
}

export interface KennzahlKarteProps {
  begriff: string
  wert: ReactNode
  anteil?: KennzahlAnteil
  className?: string
}

export function KennzahlKarte({ begriff, wert, anteil, className }: KennzahlKarteProps) {
  return (
    <div
      className={cn('grid content-start gap-2 rounded-xl border bg-card p-4 text-card-foreground shadow-xs', className)}
    >
      <dt className="text-sm text-muted-foreground">{begriff}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{wert}</dd>
      {/* Zweite Definition des Begriffs (role="definition"): in der dl zulässig, die dd bleibt die reine Zahl. */}
      {anteil && (
        <div role="definition">
          <Progress value={anteil.wert} max={anteil.von} aria-label={begriff} aria-valuetext={anteil.text} />
        </div>
      )}
    </div>
  )
}
