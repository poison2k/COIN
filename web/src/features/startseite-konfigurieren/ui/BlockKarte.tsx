import { useId, type ReactNode } from 'react'
import { BLOCK_NAMEN, type BlockArt } from '@/entities/startseite'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { Label } from '@/shared/ui/label'
import { Switch } from '@/shared/ui/switch'
import { VerschiebenButtons } from './VerschiebenButtons'

export interface BlockKarteProps {
  art: BlockArt
  aktiv: boolean
  position: number
  anzahlBloecke: number
  onSchalten: (an: boolean) => void
  onVerschieben: (richtung: -1 | 1) => void
  buttonRef: (richtung: -1 | 1, element: HTMLButtonElement | null) => void
  /** Während des Speicherns: Schalter und Verschieben-Buttons gesperrt. */
  gesperrt?: boolean
  children?: ReactNode
}

/** Karte eines Blocks (AK-27): h2 mit Blockname, Switch „{Block} anzeigen“ vor den Verschieben-Buttons
 * (Tab-Reihenfolge), Felder. */
export function BlockKarte({
  art,
  aktiv,
  position,
  anzahlBloecke,
  onSchalten,
  onVerschieben,
  buttonRef,
  gesperrt = false,
  children,
}: BlockKarteProps) {
  const basis = useId()
  const name = BLOCK_NAMEN[art]
  const schalterId = `${basis}-schalter`
  const beschriftungId = `${basis}-schalter-text`

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">{name}</h2>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id={schalterId}
              checked={aktiv}
              onCheckedChange={(an) => onSchalten(an)}
              disabled={gesperrt}
              aria-labelledby={beschriftungId}
            />
            <Label id={beschriftungId} htmlFor={schalterId}>
              {`${name} anzeigen`}
            </Label>
          </div>
          <VerschiebenButtons
            name={name}
            amAnfang={position === 1}
            amEnde={position === anzahlBloecke}
            onVerschieben={onVerschieben}
            buttonRef={buttonRef}
            gesperrt={gesperrt}
          />
        </div>
        {children}
      </CardContent>
    </Card>
  )
}
