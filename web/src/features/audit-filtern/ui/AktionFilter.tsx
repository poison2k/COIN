import { CircleAlertIcon } from 'lucide-react'
import { useId } from 'react'
import type { AuditAktion } from '@/entities/audit'
import { cn } from '@/shared/lib/cn'
import { Checkbox } from '@/shared/ui/checkbox'
import { FieldDescription, FieldError, FieldLegend, FieldSet } from '@/shared/ui/field'

export interface AktionFilterProps {
  /** Aktionen aus GET /api/audit/aktionen, in API-Reihenfolge. */
  aktionen: ReadonlyArray<AuditAktion>
  /** Gewählte API-Werte. */
  wert: ReadonlyArray<string>
  /** Meldet die gewählten Werte in der Reihenfolge von `aktionen`. */
  onWert: (wert: string[]) => void
  /** Fehler der API (`errors.aktion`). */
  fehler?: string
  /** Die Liste der Aktionen konnte nicht geladen werden. */
  ladefehler?: boolean
  className?: string
}

/**
 * Aktionsfilter des Änderungsprotokolls (nacharbeiten-audit-filter 4.4, A6, A8): Gruppe „Aktion“ mit je einer Checkbox
 * pro Aktion aus der API (Text = `bezeichnung`). Keine fest kodierte Liste im Frontend.
 */
export function AktionFilter({ aktionen, wert, onWert, fehler, ladefehler = false, className }: AktionFilterProps) {
  const fehlerId = useId()
  const ladefehlerId = useId()
  const idBasis = useId()
  const hatFehler = fehler !== undefined && fehler !== ''

  function umschalten(aktion: string, an: boolean) {
    const gewaehlt = new Set(wert)
    if (an) gewaehlt.add(aktion)
    else gewaehlt.delete(aktion)
    const bekannt = aktionen.map((a) => a.wert)
    // API-Reihenfolge; Werte, die die Liste nicht kennt, bleiben dahinter erhalten.
    onWert([...bekannt.filter((w) => gewaehlt.has(w)), ...[...gewaehlt].filter((w) => !bekannt.includes(w))])
  }

  return (
    <FieldSet
      aria-describedby={
        [hatFehler ? fehlerId : null, ladefehler ? ladefehlerId : null].filter(Boolean).join(' ') || undefined
      }
      data-invalid={hatFehler || undefined}
      className={cn('m-0 min-w-0 gap-1 border-0 p-0', className)}
    >
      <FieldLegend variant="label" className="mb-0">
        Aktion
      </FieldLegend>
      {ladefehler && <FieldDescription id={ladefehlerId}>Aktionen konnten nicht geladen werden.</FieldDescription>}
      {aktionen.length > 0 && (
        <div className="flex flex-wrap gap-x-6">
          {aktionen.map((aktion, index) => (
            // Die Beschriftung ist per `for` mit dem Checkbox-Button verbunden und bildet die Klickfläche (≥ 40 px).
            <label
              key={aktion.wert}
              htmlFor={`${idBasis}-${index}`}
              className="flex min-h-10 w-fit min-w-10 items-center gap-3 text-sm"
            >
              <Checkbox
                id={`${idBasis}-${index}`}
                nativeButton
                render={<button type="button" />}
                checked={wert.includes(aktion.wert)}
                onCheckedChange={(an) => umschalten(aktion.wert, an)}
                aria-invalid={hatFehler || undefined}
              />
              {aktion.bezeichnung}
            </label>
          ))}
        </div>
      )}
      {hatFehler && (
        <FieldError id={fehlerId} role={undefined} className="flex items-start gap-1.5">
          <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="sr-only">Fehler: </span>
            {fehler}
          </span>
        </FieldError>
      )}
    </FieldSet>
  )
}
