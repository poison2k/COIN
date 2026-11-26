import { useRef, type ReactNode, type RefObject } from 'react'
import { Aktionsmeldung } from '@/shared/ui/aktionsmeldung'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'

// Bestätigungsdialog (formulare-detailseiten, Abschnitt 4.4, AK-17/AK-18): AlertDialog mit Titel als Frage, Folge als
// Beschreibung, „Abbrechen“ und einem Bestätigungsbutton (gefährlich oder primär). Anfangsfokus auf „Abbrechen“, bei
// Feldern auf dem ersten Feld; der Fokus kehrt zum Auslöser zurück. Während der Anfrage (`laedt`) schließen weder
// Escape noch „Abbrechen“, weitere Klicks auf den Bestätigungsbutton werden verworfen.

const FELDER = 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'

export interface BestaetigungsdialogProps {
  offen: boolean
  onOffenAendern: (offen: boolean) => void
  titel: ReactNode
  folge: ReactNode
  /** Beschriftung des Bestätigungsbuttons. */
  bestaetigen: ReactNode
  /** Beschriftung des Abbrechen-Buttons (Standard „Abbrechen“). */
  abbrechen?: ReactNode
  variante?: 'gefaehrlich' | 'primaer'
  laedt?: boolean
  /** Statusmeldung während der Anfrage (z. B. „Änderung wird gespeichert …“); ohne Angabe keine Statuszeile. */
  ladeText?: string
  fehler?: ReactNode
  onBestaetigen: () => void
  /** Felder im Dialog (z. B. ein Grund). */
  children?: ReactNode
  /**
   * Auslöser, der nach dem Schließen den Fokus zurückbekommt (sofern er noch im DOM ist). Liefert die Ref `null`, setzt
   * der Aufrufer den Fokus selbst (z. B. auf eine Statusmeldung nach Erfolg).
   */
  ausloeserRef?: RefObject<HTMLElement | null>
  /** Ziel, wenn es den Auslöser nicht mehr gibt (z. B. die Statusmeldung nach Erfolg). */
  ersatzFokusRef?: RefObject<HTMLElement | null>
}

export function Bestaetigungsdialog({
  offen,
  onOffenAendern,
  titel,
  folge,
  bestaetigen,
  abbrechen = 'Abbrechen',
  variante = 'gefaehrlich',
  laedt = false,
  ladeText,
  fehler,
  onBestaetigen,
  children,
  ausloeserRef,
  ersatzFokusRef,
}: BestaetigungsdialogProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const abbrechenRef = useRef<HTMLButtonElement>(null)

  const hatFehler = fehler !== undefined && fehler !== null && fehler !== false && fehler !== ''

  return (
    <AlertDialog
      open={offen}
      onOpenChange={(neu) => {
        if (!neu && laedt) return
        onOffenAendern(neu)
      }}
    >
      <AlertDialogContent
        ref={popupRef}
        aria-busy={laedt || undefined}
        initialFocus={() => popupRef.current?.querySelector<HTMLElement>(FELDER) ?? abbrechenRef.current ?? true}
        finalFocus={() => {
          // Ohne Auslöser: Standard von Base UI (zurück zum zuvor fokussierten Element).
          if (!ausloeserRef && !ersatzFokusRef) return true
          const ausloeser = ausloeserRef?.current
          if (ausloeser?.isConnected) return ausloeser
          const ersatz = ersatzFokusRef?.current
          // Gibt es weder Auslöser noch Ersatz (z. B. nach Erfolg), setzt der Aufrufer den Fokus selbst.
          return ersatz?.isConnected ? ersatz : false
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{titel}</AlertDialogTitle>
          <AlertDialogDescription>{folge}</AlertDialogDescription>
        </AlertDialogHeader>
        {children && <div className="grid gap-4">{children}</div>}
        {/* Im Dialog gibt es nur Fehler; die Meldung wird erst dann eingehängt, damit der Fortschritt in der Statuszeile darunter die einzige Status-Region bleibt. */}
        {hatFehler && <Aktionsmeldung meldung={{ art: 'fehler', text: fehler }} />}
        <AlertDialogFooter>
          {ladeText !== undefined && (
            <p role="status" className="text-sm text-muted-foreground empty:sr-only sm:mr-auto sm:self-center">
              {laedt ? ladeText : ''}
            </p>
          )}
          <AlertDialogCancel ref={abbrechenRef} disabled={laedt} focusableWhenDisabled>
            {abbrechen}
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant={variante === 'gefaehrlich' ? 'destructive' : 'default'}
            laedt={laedt}
            onClick={() => {
              if (!laedt) onBestaetigen()
            }}
          >
            {bestaetigen}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
