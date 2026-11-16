import type { ComponentType, ReactNode, SVGProps } from 'react'
import { cn } from '@/shared/lib/cn'
import { Card, CardContent } from '@/shared/ui/card'

// Ergebniskarte (startseite-listen-pruefung, Abschnitt 4.3 und 4.6, AK-23/24): Karte mit Rahmen in der Statusfarbe und
// Kopf auf der zugehörigen *-subtle-Fläche (Icon im Kreis, Titel als Überschrift, Standard h2). Titel und Icon
// unterscheiden die Ergebnisse, die Farbe kommt nur hinzu. Das Icon ist dekorativ.

export type ErgebnisTon = 'erfolg' | 'gefahr' | 'warnung' | 'neutral'

export interface ErgebniskarteProps {
  ton: ErgebnisTon
  /** Icon-Komponente (z. B. aus lucide-react); wird mit aria-hidden gezeigt. */
  icon: ComponentType<SVGProps<SVGSVGElement>>
  titel: ReactNode
  titelEbene?: 2 | 3
  /** Inhalt unter dem Kopf (z. B. „Geprüfte Nummer: …“ oder ein Datensatz). */
  kopfzusatz?: ReactNode
  children?: ReactNode
  className?: string
}

const TON: Readonly<Record<ErgebnisTon, { rahmen: string; flaeche: string; text: string }>> = {
  erfolg: { rahmen: 'border-success', flaeche: 'bg-success-subtle', text: 'text-success' },
  gefahr: { rahmen: 'border-destructive', flaeche: 'bg-destructive-subtle', text: 'text-destructive' },
  warnung: { rahmen: 'border-warning', flaeche: 'bg-warning-subtle', text: 'text-warning' },
  neutral: { rahmen: 'border-muted-foreground', flaeche: 'bg-muted', text: 'text-muted-foreground' },
}

export function Ergebniskarte({
  ton,
  icon: Icon,
  titel,
  titelEbene = 2,
  kopfzusatz,
  children,
  className,
}: ErgebniskarteProps) {
  const farbe = TON[ton]
  const Ueberschrift = `h${titelEbene}` as const
  return (
    <Card data-ton={ton} className={cn('gap-0 border-2 py-0 md:py-0', farbe.rahmen, className)}>
      <div className={cn('flex items-start gap-4 p-4 md:p-6', farbe.flaeche)}>
        <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-full bg-card', farbe.text)}>
          <Icon aria-hidden="true" className="size-8" />
        </span>
        <div className="grid min-w-0 gap-1">
          <Ueberschrift className={cn('text-xl font-semibold md:text-2xl', farbe.text)}>{titel}</Ueberschrift>
          {kopfzusatz && <div className="text-foreground">{kopfzusatz}</div>}
        </div>
      </div>
      {children && <CardContent className="py-4 md:py-6">{children}</CardContent>}
    </Card>
  )
}
