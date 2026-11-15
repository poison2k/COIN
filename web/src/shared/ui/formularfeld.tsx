import { CircleAlertIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field'

// Formularfeld (design-fundament, Abschnitt 5, AK-13): verknüpft Label, Hilfetext und Fehler mit dem Feld. Fehler
// stehen in aria-describedby vor dem Hilfetext und beginnen für Screenreader mit „Fehler:“. Pflicht (ADR-0039 Punkt 3):
// sichtbar „(Pflicht)“ (aria-hidden), für Screenreader „(Pflichtfeld)“ (sr-only), dazu `required`.

/** Attribute, die das Formularfeld an das eigentliche Eingabeelement weitergibt. */
export interface FeldAttribute {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
  required: true | undefined
  onBlur?: () => void
}

export interface FormularfeldProps {
  label: ReactNode
  hilfetext?: ReactNode
  fehler?: ReactNode
  pflicht?: boolean
  /** Feste Id des Eingabeelements (z. B. aus `useFormular`), sonst eine eindeutige Id. */
  id?: string
  /** Verlassen des Felds (Validierung beim Verlassen, ADR-0039). */
  onBlur?: () => void
  className?: string
  children: (feld: FeldAttribute) => ReactNode
}

export function Formularfeld({
  label,
  hilfetext,
  fehler,
  pflicht = false,
  id: festeId,
  onBlur,
  className,
  children,
}: FormularfeldProps) {
  const eigeneId = useId()
  const id = festeId ?? eigeneId
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
    ...(onBlur ? { onBlur } : {}),
  }

  return (
    <Field data-invalid={hatFehler || undefined} className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {pflicht && (
          <>
            <span aria-hidden="true" className="font-normal text-muted-foreground">
              (Pflicht)
            </span>
            <span className="sr-only">{' (Pflichtfeld)'}</span>
          </>
        )}
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
