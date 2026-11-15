import { useId, type ReactNode } from 'react'

/** Abschnitt der Bausteinseite: h2 mit dem Bausteinnamen, optional eine Beschreibung. */
export function Abschnitt({
  titel,
  beschreibung,
  children,
}: {
  titel: string
  beschreibung?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="grid min-w-0 gap-4">
      <div className="grid gap-1">
        <h2 id={id} className="text-xl font-semibold">
          {titel}
        </h2>
        {beschreibung && <p className="text-sm text-muted-foreground">{beschreibung}</p>}
      </div>
      {children}
    </section>
  )
}

export function Zeile({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>
}
