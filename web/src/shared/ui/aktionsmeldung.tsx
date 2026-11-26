import type { ReactNode, Ref } from 'react'
import { cn } from '@/shared/lib/cn'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'

// Aktionsmeldung (nacharbeiten-audit-filter, Abschnitt 4.8, ADR-0047 Punkt 1): Meldung nach einer Aktion auf Basis von
// `Alert`. `fehler`/`warnung` erscheinen als Banner mit role="alert" und werden beim Erscheinen eingefügt.
// `erfolg`/`hinweis` stehen in einem dauerhaft vorhandenen role="status"-Container; das Banner darin hat role="none",
// damit es keine zweite Live-Region gibt. Das Icon kommt aus `Alert` (aria-hidden), die Bedeutung trägt der Text.

export type AktionsmeldungArt = 'fehler' | 'warnung' | 'erfolg' | 'hinweis'

export interface AktionsmeldungInhalt {
  art: AktionsmeldungArt
  text: ReactNode
  titel?: ReactNode
}

export interface AktionsmeldungProps {
  meldung: AktionsmeldungInhalt | null
  /** Weitere Bedienelemente im Banner (z. B. „Neu laden“). */
  aktion?: ReactNode
  /** Ref auf das sichtbare Banner (nicht den Status-Container). */
  ref?: Ref<HTMLDivElement>
  /** Per Skript fokussierbar (`tabIndex={-1}`) mit sichtbarem Fokusring, ohne eigenen Tab-Stopp. */
  fokussierbar?: boolean
  className?: string
}

const VARIANTE = {
  fehler: 'destructive',
  warnung: 'warning',
  erfolg: 'success',
  hinweis: 'info',
} as const

export function Aktionsmeldung({ meldung, aktion, ref, fokussierbar = false, className }: AktionsmeldungProps) {
  const live = meldung !== null && (meldung.art === 'fehler' || meldung.art === 'warnung')

  const banner = meldung && (
    <Alert
      ref={ref}
      variant={VARIANTE[meldung.art]}
      // Im Status-Container ohne eigene Rolle: `none`, bei fokussierbarem Banner gar keine (axe presentation-role-conflict).
      role={live ? 'alert' : fokussierbar ? undefined : 'none'}
      tabIndex={fokussierbar ? -1 : undefined}
      className={cn(fokussierbar && 'outline-none focus-visible:ring-3 focus-visible:ring-ring', className)}
    >
      {meldung.titel && <AlertTitle>{meldung.titel}</AlertTitle>}
      <AlertDescription>{meldung.text}</AlertDescription>
      {aktion && <div className="col-start-2 mt-3 flex flex-wrap items-center gap-2">{aktion}</div>}
    </Alert>
  )

  return (
    <>
      {live && banner}
      <div role="status" className="empty:sr-only">
        {!live && banner}
      </div>
    </>
  )
}
