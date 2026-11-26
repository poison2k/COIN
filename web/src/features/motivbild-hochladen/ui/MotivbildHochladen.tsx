import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  ERLAUBTE_BILDTYPEN,
  HINWEIS_BILD_FORMATE,
  HINWEIS_BILD_METADATEN,
  MELDUNG_BILD_FORMAT,
  MELDUNG_BILD_ZU_GROSS,
  ladeBildHoch,
  validiereBild,
  type Coin,
} from '@/entities/coin'
import type { ApiErgebnis } from '@/shared/api'
import { useFormular, useSendeSperre } from '@/shared/lib/formular'
import { Aktionsleiste } from '@/shared/ui/aktionsleiste'
import { Aktionsmeldung } from '@/shared/ui/aktionsmeldung'
import { Button } from '@/shared/ui/button'
import { Formularfeld } from '@/shared/ui/formularfeld'

const TEXT_ERFOLG = 'Motivbild wurde gespeichert.'
const TEXT_KEINE_DATEI = 'Bitte ein Bild auswählen.'

/** Styling des nativen Dateifelds wie Input (wie im Formular „Coin anlegen“). */
const DATEIFELD_KLASSEN =
  'min-h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive dark:bg-input/30'

/** Fehlertexte wie im Formular „Coin anlegen“; `feld` gehört an das Dateifeld, sonst Meldung oben (AK-8). */
function fehlerFuer(ergebnis: Exclude<ApiErgebnis<Coin>, { art: 'ok' }>): { feld: boolean; text: string } {
  switch (ergebnis.art) {
    case 'zuGross':
      return { feld: true, text: MELDUNG_BILD_ZU_GROSS }
    case 'formatUngueltig':
      return { feld: true, text: MELDUNG_BILD_FORMAT }
    case 'validierung':
      return { feld: true, text: ergebnis.fehler.datei?.join(' ') || 'Die Datei wurde vom Server abgelehnt.' }
    case 'nichtGefunden':
      return { feld: false, text: 'Der Coin wurde nicht gefunden.' }
    case 'keinZugriff':
      return {
        feld: false,
        text:
          ergebnis.grund === 'deaktiviert'
            ? 'Ihr Benutzerkonto ist deaktiviert.'
            : 'Sie sind nicht berechtigt, Motivbilder hochzuladen.',
      }
    case 'nichtAngemeldet':
      return { feld: false, text: 'Ihre Anmeldung ist abgelaufen.' }
    default:
      return { feld: false, text: 'Der Server war nicht erreichbar. Bitte erneut versuchen.' }
  }
}

interface Werte {
  datei: File | null
}

function pruefe({ datei }: Werte): Partial<Record<keyof Werte, string>> {
  const meldung = datei ? validiereBild(datei) : TEXT_KEINE_DATEI
  return meldung ? { datei: meldung } : {}
}

export interface MotivbildHochladenProps {
  coin: Coin
  /** Nach 200 mit dem aktualisierten Coin (neue `bildUrl`). */
  onGespeichert: (coin: Coin) => void
  /** Meldet, ob eine Datei gewählt, aber nicht hochgeladen ist (Verlassen-Warnung, formulare-detailseiten AK-13). */
  onGeaendert?: (geaendert: boolean) => void
}

/**
 * Motivbild ersetzen auf „Coin bearbeiten“ (zertifikatsvorlagen, AK-29, F5) über `PUT /api/coins/{id}/bild` im
 * Formularmuster (formulare-detailseiten 4.1/4.2): Dateifeld als `Formularfeld` mit den Hinweisen vom Anlegen,
 * Vorprüfung ohne Request beim Verlassen und Absenden, Sende-Sperre mit Ladezustand (der Fokus bleibt auf dem Button).
 * Fehler des Servers stehen am Feld; kein Löschen.
 */
export function MotivbildHochladen({ coin, onGespeichert, onGeaendert }: MotivbildHochladenProps) {
  const [erfolg, setErfolg] = useState(false)
  const [alarm, setAlarm] = useState<string | null>(null)
  const alarmRef = useRef<HTMLDivElement>(null)
  const { sendet, mitSperre } = useSendeSperre()
  const feldRef = useRef<HTMLInputElement>(null)
  const formular = useFormular<Werte>({
    ausgangswerte: { datei: null },
    pruefe,
    reihenfolge: ['datei'],
    onGeaendert,
  })
  const feld = formular.feld('datei')

  useEffect(() => {
    if (alarm) alarmRef.current?.focus()
  }, [alarm])

  function waehle(e: ChangeEvent<HTMLInputElement>) {
    formular.setzeWert('datei', e.target.files?.[0] ?? null)
    setErfolg(false)
    // Eine neue Auswahl macht einen alten Alarm (z. B. 403/404) gegenstandslos (G2).
    setAlarm(null)
  }

  function senden({ datei }: Werte) {
    return mitSperre(async () => {
      if (!datei) return
      setErfolg(false)
      setAlarm(null)
      const ergebnis = await ladeBildHoch(coin.id, datei)
      if (ergebnis.art === 'ok') {
        formular.zuruecksetzen({ datei: null })
        if (feldRef.current) feldRef.current.value = ''
        setErfolg(true)
        onGespeichert(ergebnis.daten)
        return
      }
      const fehler = fehlerFuer(ergebnis)
      if (fehler.feld) formular.setzeServerFehler({ datei: fehler.text })
      else setAlarm(fehler.text)
    })
  }

  // Der Handler wird erst im Ereignis gebaut (react-hooks/refs: keine Ref-Zugriffe beim Rendern).
  const absenden = (ereignis?: FormEvent) => {
    setErfolg(false)
    formular.absenden(senden)(ereignis)
  }

  return (
    <form className="grid max-w-reading gap-4" onSubmit={absenden} noValidate>
      <Aktionsmeldung ref={alarmRef} fokussierbar meldung={alarm ? { art: 'fehler', text: alarm } : null} />

      <Formularfeld
        label="Neues Motivbild"
        hilfetext={
          <>
            <span className="block">{HINWEIS_BILD_FORMATE}</span>
            <span className="block">{HINWEIS_BILD_METADATEN}</span>
          </>
        }
        id={feld.id}
        fehler={feld.fehler}
        onBlur={feld.onBlur}
      >
        {(attribute) => (
          <input
            {...attribute}
            ref={feldRef}
            type="file"
            className={DATEIFELD_KLASSEN}
            accept={ERLAUBTE_BILDTYPEN.join(',')}
            onChange={waehle}
          />
        )}
      </Formularfeld>

      <Aktionsleiste fest={false}>
        <Button type="submit" laedt={sendet}>
          Bild hochladen
        </Button>
      </Aktionsleiste>

      <Aktionsmeldung meldung={erfolg ? { art: 'erfolg', text: TEXT_ERFOLG } : null} />
    </form>
  )
}
