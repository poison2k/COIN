import { CircleAlertIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field'

// Formularfeld (design-fundament, Abschnitt 5, AK-13): verknüpft Label, Hilfetext und Fehler mit dem Feld. Fehler
// stehen in aria-describedby vor dem Hilfetext und beginnen für Screenreader mit „Fehler:“; Pflicht als Text.

/** Attribute, die das Formularfeld an das eigentliche Eingabeelement weitergibt. */
export interface FeldAttribute {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
  required: true | undefined
}

export interface FormularfeldProps {
  label: ReactNode
  hilfetext?: ReactNode
  fehler?: ReactNode
  pflicht?: boolean
  className?: string
  children: (feld: FeldAttribute) => ReactNode
}

export function Formularfeld({ label, hilfetext, fehler, pflicht = false, className, children }: FormularfeldProps) {
  const id = useId()
  const hilfeId = `${id}-hilfe`
  const fehlerId = `${id}-fehler`
  const hatFehler = fehler !== undefined && fehler !== null && fehler !== ''
  const hatHilfe = hilfetext !== undefined && hilfetext !== null && hilfetext !== ''
  const beschreibung = [hatFehler ? fehlerId : null, hatHilfe ? hilfeId : null].filter(Boolean).join(' ')

  const feld: FeldAttribute = {
    id,
    'aria-describedby': beschreibung === '' ? undefined : beschreibung,
    'aria-invalid': hatFehler ? true : undefined,
    required: pflicht ? true : undefined,
  }

  return (
    <Field data-invalid={hatFehler || undefined} className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {pflicht && <span className="font-normal text-muted-foreground">(Pflicht)</span>}
      </FieldLabel>
      {children(feld)}
      {hatHilfe && <FieldDescription id={hilfeId}>{hilfetext}</FieldDescription>}
      {hatFehler && (
        <FieldError id={fehlerId} role={undefined} className="flex items-start gap-1.5">
          <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="sr-only">Fehler: </span>
            {fehler}
          </span>
        </FieldError>
      )}
    </Field>
  )
}
