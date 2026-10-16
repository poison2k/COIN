import { useRef, useState } from 'react'
import type { VorlagenStatus } from '@/entities/zertifikatsvorlage'
import type { ApiErgebnis } from '@/shared/api'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
import { setzeVorlageZurueck } from '../api/setzeVorlageZurueck'

function fehlertext(ergebnis: Exclude<ApiErgebnis<VorlagenStatus>, { art: 'ok' }>): string {
  switch (ergebnis.art) {
    case 'nichtGefunden':
      return 'Der Coin wurde nicht gefunden.'
    case 'keinZugriff':
      return ergebnis.grund === 'deaktiviert'
        ? 'Ihr Benutzerkonto ist deaktiviert.'
        : 'Sie sind nicht berechtigt, Zertifikatsvorlagen zurückzusetzen.'
    case 'nichtAngemeldet':
      return 'Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …'
    default:
      return 'Die Vorlage konnte nicht zurückgesetzt werden. Bitte später erneut versuchen.'
  }
}

export interface VorlageZuruecksetzenProps {
  coinId: string
  /** Nach 200 mit dem neuen Status. Den Fokus übernimmt danach der Aufrufer (Statusmeldung). */
  onZurueckgesetzt: (status: VorlagenStatus) => void
}

/**
 * Button „Auf Standardvorlage zurücksetzen“ mit Bestätigungsdialog (zertifikatsvorlagen, AK-20, AK-30). Escape und
 * „Abbrechen“ schließen ohne Request und geben den Fokus an den Button zurück.
 */
export function VorlageZuruecksetzen({ coinId, onZurueckgesetzt }: VorlageZuruecksetzenProps) {
  const [offen, setOffen] = useState(false)
  const [alarm, setAlarm] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)
  // Synchroner Schutz gegen Mehrfachsendung.
  const sendetGerade = useRef(false)
  // Nach Erfolg gibt der Dialog den Fokus nicht an den (dann entfernten) Button zurück.
  const erfolgreich = useRef(false)
  const ausloeser = useRef<HTMLButtonElement>(null)

  function oeffnen() {
    erfolgreich.current = false
    setAlarm(null)
    setOffen(true)
  }

  async function zuruecksetzen() {
    if (sendetGerade.current) return
    sendetGerade.current = true
    setSendet(true)
    setAlarm(null)
    try {
      const ergebnis = await setzeVorlageZurueck(coinId)
      if (ergebnis.art === 'ok') {
        erfolgreich.current = true
        setOffen(false)
        onZurueckgesetzt(ergebnis.daten)
        return
      }
      setAlarm(fehlertext(ergebnis))
    } finally {
      sendetGerade.current = false
      setSendet(false)
    }
  }

  return (
    <>
      <Button ref={ausloeser} type="button" variant="outline" onClick={oeffnen}>
        Auf Standardvorlage zurücksetzen
      </Button>
      <AlertDialog
        open={offen}
        onOpenChange={(neu) => {
          // Escape und „Abbrechen“ schließen während der Anfrage nicht.
          if (sendetGerade.current) return
          setOffen(neu)
        }}
      >
        <AlertDialogContent finalFocus={() => (erfolgreich.current ? false : ausloeser.current)} aria-busy={sendet}>
          <AlertDialogHeader>
            <AlertDialogTitle>Auf Standardvorlage zurücksetzen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die eigene Vorlage bleibt als Version gespeichert. Künftig wird die Standardvorlage verwendet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {alarm && (
            <p role="alert" className="text-sm text-destructive">
              {alarm}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendet} focusableWhenDisabled>
              Abbrechen
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void zuruecksetzen()}
              disabled={sendet}
              focusableWhenDisabled
            >
              Zurücksetzen
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
