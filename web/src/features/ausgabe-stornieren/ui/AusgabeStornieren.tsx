import { useRef, useState, type RefObject, type FormEvent } from 'react'
import type { Ausgabe } from '@/entities/ausgabe'
import type { ApiErgebnis } from '@/shared/api'
import { useFormular, useSendeSperre } from '@/shared/lib/formular'
import { Bestaetigungsdialog } from '@/shared/ui/bestaetigungsdialog'
import { Button } from '@/shared/ui/button'
import { Formularfeld } from '@/shared/ui/formularfeld'
import { Textarea } from '@/shared/ui/textarea'
import { storniereAusgabe } from '../api/storniereAusgabe'

const GRUND_MAX = 500
const TEXT_GRUND_FEHLT = 'Bitte einen Grund für das Storno angeben.'
const TEXT_HINWEIS = 'Bitte keine Personendaten in den Grund schreiben. Höchstens 500 Zeichen.'

interface Werte {
  grund: string
}

const AUSGANG: Werte = { grund: '' }

function pruefe(werte: Werte): Partial<Record<keyof Werte, string>> {
  return werte.grund.trim() === '' ? { grund: TEXT_GRUND_FEHLT } : {}
}

function fehlertext(ergebnis: Exclude<ApiErgebnis<Ausgabe>, { art: 'ok' }>): string {
  switch (ergebnis.art) {
    case 'konflikt':
      return 'Diese Ausgabe ist bereits storniert.'
    case 'nichtGefunden':
      return 'Die Ausgabe wurde nicht gefunden.'
    case 'keinZugriff':
      return ergebnis.grund === 'deaktiviert'
        ? 'Ihr Benutzerkonto ist deaktiviert.'
        : 'Sie sind nicht berechtigt, Ausgaben zu stornieren.'
    case 'nichtAngemeldet':
      return 'Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …'
    case 'validierung':
      return ergebnis.fehler.grund?.join(' ') ?? 'Die Eingabe wurde vom Server abgelehnt.'
    default:
      return 'Die Ausgabe konnte nicht storniert werden. Bitte später erneut versuchen.'
  }
}

export interface AusgabeStornierenProps {
  coinId: string
  ausgabe: Ausgabe
  /** Nach 200 mit der stornierten Ausgabe. Den Fokus übernimmt danach der Aufrufer (z. B. eine Statusmeldung). */
  onStorniert: (ausgabe: Ausgabe) => void
  /** Nach einem Fehler (z. B. 409), damit der Aufrufer neu laden kann. */
  onFehler?: () => void
  /** Der Dialog wurde ohne Storno geschlossen (Abbrechen, Escape). */
  onGeschlossen?: () => void
  /** Darstellung des Auslösers: in Tabellen sekundär (Standard), im Seitenkopf gefährlich. */
  variante?: 'sekundaer' | 'gefaehrlich'
}

/**
 * Button „Stornieren“ mit Bestätigungsdialog und Pflichtfeld „Grund“ (coin-ausgaben AK-24, formulare-detailseiten
 * AK-17/AK-18). Titel, Beschreibung und Buttonnamen bleiben wortgleich (F5); der Hinweis „keine Personendaten“ steht
 * in der Beschreibung des Felds (F6).
 */
export function AusgabeStornieren({
  coinId,
  ausgabe,
  onStorniert,
  onFehler,
  onGeschlossen,
  variante = 'sekundaer',
}: AusgabeStornierenProps) {
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
  const formular = useFormular<Werte>({ ausgangswerte: AUSGANG, pruefe, reihenfolge: ['grund'] })
  const grund = formular.feld('grund')

  function oeffnen() {
    erfolgreich.current = false
    formular.zuruecksetzen(AUSGANG)
    setAlarm(null)
    setOffen(true)
  }

  function senden(werte: Werte) {
    return mitSperre(async () => {
      setAlarm(null)
      const ergebnis = await storniereAusgabe(coinId, ausgabe.id, werte.grund.trim())
      if (ergebnis.art === 'ok') {
        erfolgreich.current = true
        setOffen(false)
        onStorniert(ergebnis.daten)
        return
      }
      if (ergebnis.art === 'validierung' && ergebnis.fehler.grund) {
        formular.setzeServerFehler({ grund: ergebnis.fehler.grund.join(' ') })
      } else {
        setAlarm(fehlertext(ergebnis))
      }
      onFehler?.()
    })
  }

  // Der Handler wird erst im Ereignis gebaut (react-hooks/refs: keine Ref-Zugriffe beim Rendern).
  const stornieren = (ereignis?: FormEvent) => formular.absenden(senden)(ereignis)

  return (
    <>
      <Button
        ref={ausloeser}
        type="button"
        variant={variante === 'gefaehrlich' ? 'destructive' : 'outline'}
        size="sm"
        aria-label={`Ausgabe von Exemplar Nr. ${ausgabe.exemplarNummer} stornieren`}
        onClick={oeffnen}
      >
        Stornieren
      </Button>
      <Bestaetigungsdialog
        offen={offen}
        onOffenAendern={(neu) => {
          setOffen(neu)
          if (!neu) onGeschlossen?.()
        }}
        titel="Ausgabe stornieren?"
        folge={`Die Ausgabe von Exemplar Nr. ${ausgabe.exemplarNummer} bleibt in der Historie sichtbar. Das Exemplar ist danach wieder verfügbar.`}
        bestaetigen="Stornieren"
        variante="gefaehrlich"
        laedt={sendet}
        fehler={alarm}
        onBestaetigen={() => stornieren()}
        ausloeserRef={fokusZiel}
      >
        <Formularfeld
          label="Grund"
          pflicht
          hilfetext={TEXT_HINWEIS}
          id={grund.id}
          fehler={grund.fehler}
          onBlur={grund.onBlur}
        >
          {(feld) => (
            <Textarea {...feld} rows={3} maxLength={GRUND_MAX} value={grund.value} onChange={grund.onChange} />
          )}
        </Formularfeld>
      </Bestaetigungsdialog>
    </>
  )
}
