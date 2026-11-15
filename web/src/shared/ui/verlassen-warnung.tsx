import type { ReactNode } from 'react'
import { useVerlassenWarnung, type NavigationsOrt } from '@/shared/lib/hooks'
import { Bestaetigungsdialog } from '@/shared/ui/bestaetigungsdialog'

// Verlassen-Warnung (formulare-detailseiten, Abschnitt 4.3, ADR-0040): Bestätigungsdialog „Ungespeicherte Änderungen“
// mit „Bleiben“ (Anfangsfokus, auch Escape) und „Verlassen“. `VerlassenWarnung` blockiert die Navigation, solange
// `aktiv`; `VerlassenDialog` ist nur der Dialog (z. B. für die Bausteinseite ohne Navigation).

export const VERLASSEN_TITEL = 'Ungespeicherte Änderungen'

export interface VerlassenDialogProps {
  offen: boolean
  beschreibung: ReactNode
  onBleiben: () => void
  onVerlassen: () => void
}

export function VerlassenDialog({ offen, beschreibung, onBleiben, onVerlassen }: VerlassenDialogProps) {
  return (
    <Bestaetigungsdialog
      offen={offen}
      onOffenAendern={(neu) => {
        if (!neu) onBleiben()
      }}
      titel={VERLASSEN_TITEL}
      folge={beschreibung}
      abbrechen="Bleiben"
      bestaetigen="Verlassen"
      variante="primaer"
      onBestaetigen={onVerlassen}
    />
  )
}

export interface VerlassenWarnungProps {
  aktiv: boolean
  beschreibung: ReactNode
  /** Blockiert zusätzlich Navigationen ohne Pfadwechsel (z. B. Reiterwechsel per Suchparameter). */
  blockiere?: (von: NavigationsOrt, nach: NavigationsOrt) => boolean
}

export function VerlassenWarnung({ aktiv, beschreibung, blockiere }: VerlassenWarnungProps) {
  const { blockiert, bleiben, verlassen } = useVerlassenWarnung({ aktiv, blockiere })
  return <VerlassenDialog offen={blockiert} beschreibung={beschreibung} onBleiben={bleiben} onVerlassen={verlassen} />
}
