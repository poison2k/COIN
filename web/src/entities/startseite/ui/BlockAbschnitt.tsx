import { useId, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Ueberschrift, type Ebene } from './Ueberschrift'

export interface BlockAbschnittProps {
  titel: string
  ebene: Ebene
  className?: string
  children: ReactNode
}

/** Block als Karte `<section aria-labelledby>` mit Überschrift (AK-21); füllt die Höhe seiner Rasterzelle. */
export function BlockAbschnitt({ titel, ebene, className, children }: BlockAbschnittProps) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'grid h-full content-start gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-xs md:p-6',
        className,
      )}
    >
      <Ueberschrift id={id} ebene={ebene} className="text-xl">
        {titel}
      </Ueberschrift>
      {children}
    </section>
  )
}
