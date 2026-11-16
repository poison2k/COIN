import { LayoutGridIcon, TableIcon } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'

// Ansichtsumschalter (startseite-listen-pruefung, Abschnitt 4.2 und 4.6, ADR-0043 Punkt 2): freigegebener Ersatz für
// `toggle-group` aus zwei Buttons mit `aria-pressed` in einer beschrifteten Gruppe. Sichtbarer Text = zugänglicher
// Name, Icons dekorativ, jedes Element ≥ 40 × 40 px. Ein Klick auf das gewählte Element lässt die Wahl bestehen.

export type Ansicht = 'tabelle' | 'karten'

export interface AnsichtsumschalterProps {
  wert: Ansicht
  onWert: (wert: Ansicht) => void
  /** Name der Gruppe (Standard „Ansicht“). */
  beschriftung?: string
  className?: string
}

const ELEMENTE = [
  { wert: 'tabelle', text: 'Tabelle', Icon: TableIcon },
  { wert: 'karten', text: 'Karten', Icon: LayoutGridIcon },
] as const

export function Ansichtsumschalter({ wert, onWert, beschriftung = 'Ansicht', className }: AnsichtsumschalterProps) {
  return (
    <div
      role="group"
      aria-label={beschriftung}
      className={cn('inline-flex w-fit items-center gap-1 rounded-lg border bg-muted p-1', className)}
    >
      {ELEMENTE.map(({ wert: elementWert, text, Icon }) => {
        const gewaehlt = wert === elementWert
        return (
          <Button
            key={elementWert}
            type="button"
            variant={gewaehlt ? 'outline' : 'ghost'}
            aria-pressed={gewaehlt}
            className={cn('border-transparent', gewaehlt && 'border-input bg-background shadow-xs')}
            onClick={() => {
              if (!gewaehlt) onWert(elementWert)
            }}
          >
            <Icon aria-hidden="true" />
            {text}
          </Button>
        )
      })}
    </div>
  )
}
