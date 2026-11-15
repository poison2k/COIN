import type { MouseEvent, Ref } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'

// Fehlerzusammenfassung (formulare-detailseiten, Abschnitt 4.1, ADR-0039 Punkt 2): oben im Formular, role="alert",
// je Feldfehler ein Link „<Label>: <Meldung>“, der das Feld fokussiert, ohne die URL zu ändern. Links verweisen nur auf
// Feld-Ids (Abschnitt 6), Befunde ohne Feldbezug stehen als Text darunter.

export const ZUSAMMENFASSUNG_STANDARDTITEL = 'Bitte die markierten Eingaben prüfen.'

export interface Feldbefund {
  feldId: string
  label: string
  text: string
}

export interface FehlerzusammenfassungProps {
  titel?: string
  fehler: ReadonlyArray<Feldbefund>
  weitere?: ReadonlyArray<string>
  className?: string
  ref?: Ref<HTMLDivElement>
}

function fokussiereFeld(ereignis: MouseEvent<HTMLAnchorElement>, feldId: string) {
  ereignis.preventDefault()
  const feld = document.getElementById(feldId)
  feld?.focus()
  feld?.scrollIntoView?.({ block: 'center' })
}

export function Fehlerzusammenfassung({
  titel = ZUSAMMENFASSUNG_STANDARDTITEL,
  fehler,
  weitere = [],
  className,
  ref,
}: FehlerzusammenfassungProps) {
  return (
    <Alert ref={ref} variant="destructive" className={className} tabIndex={-1}>
      <AlertTitle>{titel}</AlertTitle>
      <AlertDescription>
        {fehler.length > 0 && (
          <ul className="grid gap-1">
            {fehler.map((befund) => (
              <li key={befund.feldId}>
                <a
                  href={`#${befund.feldId}`}
                  className="inline-flex min-h-10 items-center text-destructive underline underline-offset-3 hover:text-foreground"
                  onClick={(ereignis) => fokussiereFeld(ereignis, befund.feldId)}
                >
                  {`${befund.label}: ${befund.text}`}
                </a>
              </li>
            ))}
          </ul>
        )}
        {weitere.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </AlertDescription>
    </Alert>
  )
}
