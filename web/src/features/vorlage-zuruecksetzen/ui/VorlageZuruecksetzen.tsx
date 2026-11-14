import { useRef, useState, type RefObject } from 'react'
import type { VorlagenStatus } from '@/entities/zertifikatsvorlage'
import type { ApiErgebnis } from '@/shared/api'
import { useSendeSperre } from '@/shared/lib/formular'
import { Bestaetigungsdialog } from '@/shared/ui/bestaetigungsdialog'
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
 * Button „Auf Standardvorlage zurücksetzen“ mit Bestätigungsdialog (zertifikatsvorlagen, AK-20, AK-30;
 * formulare-detailseiten AK-17/AK-18). Escape und „Abbrechen“ schließen ohne Request und geben den Fokus an den Button
 * zurück. Texte unverändert (F5).
 */
export function VorlageZuruecksetzen({ coinId, onZurueckgesetzt }: VorlageZuruecksetzenProps) {
  const [offen, setOffen] = useState(false)
  const [alarm, setAlarm] = useState<string | null>(null)
  const { sendet, mitSperre } = useSendeSperre()
  // Nach Erfolg gibt der Dialog den Fokus nicht an den (dann entfernten) Button zurück.
  const erfolgreich = useRef(false)
  const ausloeser = useRef<HTMLButtonElement>(null)
  const fokusZiel: RefObject<HTMLElement | null> = {
    get current() {
      return erfolgreich.current ? null : ausloeser.current
    },
  }

  function oeffnen() {
    erfolgreich.current = false
    setAlarm(null)
    setOffen(true)
  }

  function zuruecksetzen() {
    void mitSperre(async () => {
      setAlarm(null)
      const ergebnis = await setzeVorlageZurueck(coinId)
      if (ergebnis.art === 'ok') {
        erfolgreich.current = true
        setOffen(false)
        onZurueckgesetzt(ergebnis.daten)
        return
      }
      setAlarm(fehlertext(ergebnis))
    })
  }

  return (
    <>
      <Button ref={ausloeser} type="button" variant="outline" onClick={oeffnen}>
        Auf Standardvorlage zurücksetzen
      </Button>
      <Bestaetigungsdialog
        offen={offen}
        onOffenAendern={setOffen}
        titel="Auf Standardvorlage zurücksetzen?"
        folge="Die eigene Vorlage bleibt als Version gespeichert. Künftig wird die Standardvorlage verwendet."
        bestaetigen="Zurücksetzen"
        variante="gefaehrlich"
        laedt={sendet}
        fehler={alarm}
        onBestaetigen={zuruecksetzen}
        ausloeserRef={fokusZiel}
      />
    </>
  )
}
