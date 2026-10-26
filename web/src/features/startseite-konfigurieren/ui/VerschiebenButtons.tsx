import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { Button } from '@/shared/ui/button'

export interface VerschiebenButtonsProps {
  /** Deutscher Blockname, z. B. „Neueste Coins“. */
  name: string
  amAnfang: boolean
  amEnde: boolean
  onVerschieben: (richtung: -1 | 1) => void
  /** Registriert die Buttons, damit der Fokus nach dem Verschieben auf demselben Button bleibt (AK-28). */
  buttonRef: (richtung: -1 | 1, element: HTMLButtonElement | null) => void
  /** Während des Speicherns gesperrt; `aria-disabled`, damit ein dort liegender Fokus erhalten bleibt. */
  gesperrt?: boolean
}

/**
 * „{Block} nach oben/unten verschieben“ (AK-27, AK-28). Am Rand `aria-disabled` statt `disabled`, damit der Button
 * fokussierbar bleibt; ein Klick ändert dort nichts.
 */
export function VerschiebenButtons({
  name,
  amAnfang,
  amEnde,
  onVerschieben,
  buttonRef,
  gesperrt = false,
}: VerschiebenButtonsProps) {
  const obenGesperrt = amAnfang || gesperrt
  const untenGesperrt = amEnde || gesperrt
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        ref={(element) => buttonRef(-1, element)}
        aria-label={`${name} nach oben verschieben`}
        aria-disabled={obenGesperrt ? true : undefined}
        className="aria-disabled:opacity-50"
        onClick={() => {
          if (!obenGesperrt) onVerschieben(-1)
        }}
      >
        <ArrowUpIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        ref={(element) => buttonRef(1, element)}
        aria-label={`${name} nach unten verschieben`}
        aria-disabled={untenGesperrt ? true : undefined}
        className="aria-disabled:opacity-50"
        onClick={() => {
          if (!untenGesperrt) onVerschieben(1)
        }}
      >
        <ArrowDownIcon aria-hidden="true" />
      </Button>
    </div>
  )
}
