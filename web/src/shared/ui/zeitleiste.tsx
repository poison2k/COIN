import { CircleCheckIcon, CircleIcon, CircleXIcon } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

// Zeitleiste (formulare-detailseiten, Abschnitt 4.6, 4.8, AK-27): geordnete Liste, älteste zuerst (Reihenfolge des
// Aufrufers), je Eintrag Titel, Zeitpunkt als <time dateTime> und optional eine Beschreibung. Freitexte als Text;
// Symbole sind dekorativ, die Bedeutung trägt der Titel.

export interface ZeitleisteEintrag {
  id: string
  titel: string
  /** ISO-Zeitpunkt für `dateTime`. */
  zeitpunkt: string
  /** Anzeigetext des Zeitpunkts. */
  zeitText: string
  beschreibung?: string
  ton: 'neutral' | 'erfolg' | 'gefahr'
}

export interface ZeitleisteProps {
  beschriftung: string
  eintraege: ReadonlyArray<ZeitleisteEintrag>
  className?: string
}

const SYMBOL = {
  neutral: { Icon: CircleIcon, klasse: 'text-muted-foreground' },
  erfolg: { Icon: CircleCheckIcon, klasse: 'text-success' },
  gefahr: { Icon: CircleXIcon, klasse: 'text-destructive' },
} as const

export function Zeitleiste({ beschriftung, eintraege, className }: ZeitleisteProps) {
  return (
    <ol aria-label={beschriftung} className={cn('grid', className)}>
      {eintraege.map((eintrag, index) => {
        const { Icon, klasse } = SYMBOL[eintrag.ton]
        const letzter = index === eintraege.length - 1
        return (
          <li key={eintrag.id} className="grid grid-cols-[auto_1fr] gap-x-3">
            <span aria-hidden="true" className="flex flex-col items-center">
              <Icon className={cn('size-5 shrink-0', klasse)} />
              {!letzter && <span className="mt-1 w-px flex-1 bg-border" />}
            </span>
            <div className={cn('grid min-w-0 gap-1', !letzter && 'pb-6')}>
              <p className="font-medium">{eintrag.titel}</p>
              <time dateTime={eintrag.zeitpunkt} className="text-sm text-muted-foreground tabular-nums">
                {eintrag.zeitText}
              </time>
              {eintrag.beschreibung && <p className="text-sm break-words">{eintrag.beschreibung}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
