import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { VorlagenStatus } from '@/entities/zertifikatsvorlage'
import type { ApiErgebnis } from '@/shared/api'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { ladeVorlageHoch } from '../api/ladeVorlageHoch'
import { MELDUNG_ZU_GROSS, pruefeVorlagendatei } from '../model/pruefeVorlagendatei'

const ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const HINWEIS_DATEI =
  'Nur Word-Dokumente (.docx) ohne Makros, Kommentare und nachverfolgte Änderungen, höchstens 5 MB. Alle Pflichtplatzhalter müssen enthalten sein.'
const HINWEIS_BEREINIGUNG = 'Autor und weitere Dokumenteigenschaften werden beim Hochladen entfernt.'
const TEXT_ABGELEHNT = 'Die Vorlage wurde nicht übernommen:'
const TEXT_KEINE_DATEI = 'Bitte eine Word-Vorlage (.docx) auswählen.'

/** Styling des nativen Dateifelds wie Input (wie im Formular „Coin anlegen“). */
const DATEIFELD_KLASSEN =
  'w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive dark:bg-input/30'

/** Ablehnung als Liste von Meldungen (`liste`) oder als einzelner Text. */
type Alarm = { art: 'liste'; meldungen: string[] } | { art: 'text'; text: string }

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
}

/**
 * Upload einer Word-Vorlage (zertifikatsvorlagen, AK-30): Dateifeld mit Hinweisen, clientseitige Vorprüfung ohne
 * Request, Sende-Sperre; Ablehnungen des Servers als Alarm mit Liste aller Meldungen (als Text), Fokus auf den Alarm.
 */
export function VorlageHochladen({ coinId, onHochgeladen, onUploadBeginnt }: VorlageHochladenProps) {
  const [datei, setDatei] = useState<File | null>(null)
  const [feldFehler, setFeldFehler] = useState<string | null>(null)
  const [alarm, setAlarm] = useState<Alarm | null>(null)
  const [sendet, setSendet] = useState(false)
  // Synchroner Schutz gegen Mehrfachsendung: Zwei Klicks vor dem nächsten Rendern sehen den State noch nicht.
  const sendetGerade = useRef(false)
  const feld = useRef<HTMLInputElement>(null)
  const alarmRef = useRef<HTMLDivElement>(null)
  const basis = useId()
  const feldId = `${basis}-datei`
  const hinweisId = `${basis}-hinweis`
  const bereinigungId = `${basis}-bereinigung`
  const fehlerId = `${basis}-fehler`

  useEffect(() => {
    if (alarm) alarmRef.current?.focus()
  }, [alarm])

  function waehle(e: ChangeEvent<HTMLInputElement>) {
    setDatei(e.target.files?.[0] ?? null)
    setFeldFehler(null)
  }

  async function absenden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sendetGerade.current) return

    const pruefung = datei ? pruefeVorlagendatei(datei) : TEXT_KEINE_DATEI
    if (pruefung || !datei) {
      setFeldFehler(pruefung ?? TEXT_KEINE_DATEI)
      setAlarm(null)
      feld.current?.focus()
      return
    }

    sendetGerade.current = true
    setSendet(true)
    setAlarm(null)
    setFeldFehler(null)
    onUploadBeginnt?.()
    try {
      const ergebnis = await ladeVorlageHoch(coinId, datei)
      if (ergebnis.art === 'ok') {
        setDatei(null)
        if (feld.current) feld.current.value = ''
        onHochgeladen(ergebnis.daten)
        return
      }
      setAlarm(alarmFuer(ergebnis))
    } finally {
      sendetGerade.current = false
      setSendet(false)
    }
  }

  const beschreibung = [hinweisId, bereinigungId, feldFehler ? fehlerId : undefined].filter(Boolean).join(' ')

  return (
    <form className="grid max-w-lg gap-3" onSubmit={absenden} noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor={feldId}>Word-Vorlage (.docx)</Label>
        <input
          ref={feld}
          id={feldId}
          type="file"
          className={DATEIFELD_KLASSEN}
          accept={ACCEPT}
          onChange={waehle}
          aria-invalid={feldFehler ? true : undefined}
          aria-describedby={beschreibung}
        />
        <p id={hinweisId} className="text-sm text-muted-foreground">
          {HINWEIS_DATEI}
        </p>
        <p id={bereinigungId} className="text-sm text-muted-foreground">
          {HINWEIS_BEREINIGUNG}
        </p>
        {feldFehler && (
          <p id={fehlerId} className="text-sm text-destructive">
            {feldFehler}
          </p>
        )}
      </div>

      <Button type="submit" className="justify-self-start" disabled={sendet}>
        Vorlage hochladen
      </Button>

      {alarm && (
        <div ref={alarmRef} role="alert" tabIndex={-1} className="grid gap-1 text-destructive outline-none">
          {alarm.art === 'liste' ? (
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
          )}
        </div>
      )}
    </form>
  )
}
