import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

// Formularabschnitt (formulare-detailseiten, Abschnitt 4.1, ADR-0039 Punkt 4): `<fieldset>` mit `<legend>`, darin eine
// Überschrift der angegebenen Ebene. Zweispaltig erst ab 768 px; lange Felder belegen mit `md:col-span-2` die volle
// Breite (Aufgabe des Aufrufers).

export interface FormularAbschnittProps {
  titel: ReactNode
  ebene?: 2 | 3
  beschreibung?: ReactNode
  spalten?: 1 | 2
  className?: string
  children: ReactNode
}

export function FormularAbschnitt({
  titel,
  ebene = 2,
  beschreibung,
  spalten = 1,
  className,
  children,
}: FormularAbschnittProps) {
  const Ueberschrift = `h${ebene}` as const
  return (
    <fieldset data-slot="formular-abschnitt" className={cn('m-0 grid min-w-0 gap-4 border-0 p-0', className)}>
      <legend className="float-left mb-4 w-full p-0">
        <Ueberschrift className={cn('font-semibold tracking-tight', ebene === 2 ? 'text-lg' : 'text-base')}>
          {titel}
        </Ueberschrift>
      </legend>
      {beschreibung && <p className="clear-both -mt-2 text-sm text-muted-foreground">{beschreibung}</p>}
      <div className={cn('clear-both grid min-w-0 gap-4', spalten === 2 && 'md:grid-cols-2')}>{children}</div>
    </fieldset>
  )
}
