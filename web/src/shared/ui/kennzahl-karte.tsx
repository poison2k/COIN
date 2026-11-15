import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Progress } from '@/shared/ui/progress'

// Kennzahlkarte (formulare-detailseiten, Abschnitt 4.5, 4.8, AK-21): `KennzahlRaster` ist die Beschreibungsliste, je
// `KennzahlKarte` ein Begriff mit Wert (die `dd` enthält nur den Wert). Mit `anteil` folgt ein Fortschrittsbalken
// außerhalb der `dd` als weitere Definition (role="definition", axe „definition-list“) mit eigenem `aria-valuetext`.
// Ab 640 px dreispaltig; mit `spalten={4}` ab 640 px zwei- und ab 1024 px vierspaltig, `groesse="gross"` zeigt den
// Wert in text-3xl (startseite-listen-pruefung, Abschnitt 4.6).

export interface KennzahlRasterProps {
  children: ReactNode
  /** 3 (Standard): ab 640 px drei Spalten; 4: ab 640 px zwei, ab 1024 px vier Spalten. */
  spalten?: 3 | 4
  className?: string
}

const SPALTEN: Readonly<Record<3 | 4, string>> = {
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
}

export function KennzahlRaster({ children, spalten = 3, className }: KennzahlRasterProps) {
  return <dl className={cn('grid gap-4', SPALTEN[spalten], className)}>{children}</dl>
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
  /** Größe des Werts: normal (text-2xl, Standard) oder gross (text-3xl). */
  groesse?: 'normal' | 'gross'
  className?: string
}

export function KennzahlKarte({ begriff, wert, anteil, groesse = 'normal', className }: KennzahlKarteProps) {
  return (
    <div
      className={cn('grid content-start gap-2 rounded-xl border bg-card p-4 text-card-foreground shadow-xs', className)}
    >
      <dt className="text-sm text-muted-foreground">{begriff}</dt>
      <dd className={cn('font-semibold tabular-nums', groesse === 'gross' ? 'text-3xl' : 'text-2xl')}>{wert}</dd>
      {/* Zweite Definition des Begriffs (role="definition"): in der dl zulässig, die dd bleibt die reine Zahl. */}
      {anteil && (
        <div role="definition">
          <Progress value={anteil.wert} max={anteil.von} aria-label={begriff} aria-valuetext={anteil.text} />
        </div>
      )}
    </div>
  )
}
