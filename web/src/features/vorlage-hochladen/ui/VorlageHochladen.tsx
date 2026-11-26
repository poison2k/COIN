import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { VorlagenStatus } from '@/entities/zertifikatsvorlage'
import type { ApiErgebnis } from '@/shared/api'
import { useFormular, useSendeSperre } from '@/shared/lib/formular'
import { Aktionsleiste } from '@/shared/ui/aktionsleiste'
import { Aktionsmeldung } from '@/shared/ui/aktionsmeldung'
import { Button } from '@/shared/ui/button'
import { FormularAbschnitt } from '@/shared/ui/formular-abschnitt'
import { Formularfeld } from '@/shared/ui/formularfeld'
import { ladeVorlageHoch } from '../api/ladeVorlageHoch'
import { MELDUNG_ZU_GROSS, pruefeVorlagendatei } from '../model/pruefeVorlagendatei'

const ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const HINWEIS_DATEI =
  'Nur Word-Dokumente (.docx) ohne Makros, Kommentare und nachverfolgte Änderungen, höchstens 5 MB. Alle Pflichtplatzhalter müssen enthalten sein.'
const HINWEIS_BEREINIGUNG = 'Autor und weitere Dokumenteigenschaften werden beim Hochladen entfernt.'
const HINWEIS_PLATZHALTER =
  'Platzhalter haben die Form {{Gruppe.Feld}}, z. B. {{Zertifikat.Nummer}}. Die Liste aller Platzhalter steht in der Standardvorlage.'
const TEXT_ABGELEHNT = 'Die Vorlage wurde nicht übernommen:'
const TEXT_KEINE_DATEI = 'Bitte eine Word-Vorlage (.docx) auswählen.'

/** Styling des nativen Dateifelds wie Input (wie im Formular „Coin anlegen“). */
const DATEIFELD_KLASSEN =
  'min-h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive dark:bg-input/30'

/** Ablehnung als Liste von Meldungen (`liste`) oder als einzelner Text. */
type Alarm = { art: 'liste'; meldungen: string[] } | { art: 'text'; text: string }

interface Werte {
  datei: File | null
}

function pruefe(werte: Werte): Partial<Record<keyof Werte, string>> {
  const meldung = werte.datei ? pruefeVorlagendatei(werte.datei) : TEXT_KEINE_DATEI
  return meldung ? { datei: meldung } : {}
}

function alarmFuer(ergebnis: Exclude<ApiErgebnis<VorlagenStatus>, { art: 'ok' }>): Alarm {
  switch (ergebnis.art) {
    case 'validierung': {
      const meldungen = ergebnis.fehler.datei ?? Object.values(ergebnis.fehler).flat()
      return meldungen.length > 0
        ? { art: 'liste', meldungen }
        : { art: 'text', text: 'Die Vorlage wurde vom Server abgelehnt.' }
    }
    case 'zuGross':
      return { art: 'liste', meldungen: [MELDUNG_ZU_GROSS] }
    case 'nichtGefunden':
      return { art: 'text', text: 'Der Coin wurde nicht gefunden.' }
    case 'keinZugriff':
      return {
        art: 'text',
        text:
          ergebnis.grund === 'deaktiviert'
            ? 'Ihr Benutzerkonto ist deaktiviert.'
            : 'Sie sind nicht berechtigt, Zertifikatsvorlagen hochzuladen.',
      }
    case 'nichtAngemeldet':
      return { art: 'text', text: 'Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …' }
    default:
      return { art: 'text', text: 'Die Vorlage konnte nicht hochgeladen werden. Bitte später erneut versuchen.' }
  }
}

export interface VorlageHochladenProps {
  coinId: string
  /** Nach 201 mit dem neuen Vorlagenstatus; die Erfolgsmeldung zeigt der Aufrufer. */
  onHochgeladen: (status: VorlagenStatus) => void
  /** Beim Absenden, bevor der Request startet (Rev. 3): Der Aufrufer entfernt dabei veraltete Meldungen. */
  onUploadBeginnt?: () => void
  /** Meldet, ob eine Datei gewählt, aber nicht hochgeladen ist (Verlassen-Warnung, formulare-detailseiten AK-13). */
  onGeaendert?: (geaendert: boolean) => void
}

/**
 * Upload einer Word-Vorlage (zertifikatsvorlagen, AK-30) im Abschnitt „Neue Version hochladen“ (formulare-detailseiten
 * AK-1): Dateifeld mit Hinweisen, clientseitige Vorprüfung ohne Request (beim Verlassen und Absenden), Sende-Sperre mit
 * Ladezustand; Ablehnungen des Servers als Alarm oben mit Liste aller Meldungen (als Text), Fokus auf den Alarm.
 */
export function VorlageHochladen({ coinId, onHochgeladen, onUploadBeginnt, onGeaendert }: VorlageHochladenProps) {
  const [alarm, setAlarm] = useState<Alarm | null>(null)
  const { sendet, mitSperre } = useSendeSperre()
  const feldRef = useRef<HTMLInputElement>(null)
  const alarmRef = useRef<HTMLDivElement>(null)
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
  }

  function senden({ datei }: Werte) {
    return mitSperre(async () => {
      if (!datei) return
      setAlarm(null)
      onUploadBeginnt?.()
      const ergebnis = await ladeVorlageHoch(coinId, datei)
      if (ergebnis.art === 'ok') {
        formular.zuruecksetzen({ datei: null })
        if (feldRef.current) feldRef.current.value = ''
        onHochgeladen(ergebnis.daten)
        return
      }
      setAlarm(alarmFuer(ergebnis))
    })
  }

  // Der Handler wird erst im Ereignis gebaut (react-hooks/refs: keine Ref-Zugriffe beim Rendern).
  const absenden = (ereignis?: FormEvent) => formular.absenden(senden)(ereignis)

  return (
    <form className="grid max-w-reading gap-4" onSubmit={absenden} noValidate>
      <Aktionsmeldung
        ref={alarmRef}
        fokussierbar
        meldung={
          alarm
            ? {
                art: 'fehler',
                text:
                  alarm.art === 'liste' ? (
                    <>
                      <p>{TEXT_ABGELEHNT}</p>
                      <ul className="list-disc pl-5">
                        {alarm.meldungen.map((meldung, index) => (
                          <li key={index}>{meldung}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>{alarm.text}</p>
                  ),
              }
            : null
        }
      />

      <FormularAbschnitt titel="Neue Version hochladen" ebene={3}>
        <Formularfeld
          label="Word-Vorlage (.docx)"
          hilfetext={
            <>
              <span className="block">{HINWEIS_DATEI}</span>
              <span className="block">{HINWEIS_BEREINIGUNG}</span>
              <span className="block">{HINWEIS_PLATZHALTER}</span>
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
              accept={ACCEPT}
              onChange={waehle}
            />
          )}
        </Formularfeld>
      </FormularAbschnitt>

      <Aktionsleiste fest={false}>
        <Button type="submit" laedt={sendet}>
          Vorlage hochladen
        </Button>
      </Aktionsleiste>
    </form>
  )
}
