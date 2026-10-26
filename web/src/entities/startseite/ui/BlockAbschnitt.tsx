import { useId, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Ueberschrift, type Ebene } from './Ueberschrift'

export interface BlockAbschnittProps {
  titel: string
  ebene: Ebene
  className?: string
  children: ReactNode
}

/** Block als `<section aria-labelledby>` mit Überschrift (AK-21). */
export function BlockAbschnitt({ titel, ebene, className, children }: BlockAbschnittProps) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('grid content-start gap-3 rounded-xl border bg-card p-4', className)}>
      <Ueberschrift id={id} ebene={ebene} className="text-lg">
        {titel}
      </Ueberschrift>
      {children}
    </section>
  )
}
