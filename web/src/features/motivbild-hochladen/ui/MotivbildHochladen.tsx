import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
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
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'

const TEXT_ERFOLG = 'Motivbild wurde gespeichert.'
const TEXT_KEINE_DATEI = 'Bitte ein Bild auswählen.'

/** Styling des nativen Dateifelds wie Input (wie im Formular „Coin anlegen“). */
const DATEIFELD_KLASSEN =
  'w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive dark:bg-input/30'

/** Fehlertexte wie im Formular „Coin anlegen“. */
function fehlertext(ergebnis: Exclude<ApiErgebnis<Coin>, { art: 'ok' }>): string {
  switch (ergebnis.art) {
    case 'zuGross':
      return MELDUNG_BILD_ZU_GROSS
    case 'formatUngueltig':
      return MELDUNG_BILD_FORMAT
    case 'validierung':
      return ergebnis.fehler.datei?.join(' ') || 'Die Datei wurde vom Server abgelehnt.'
    case 'nichtGefunden':
      return 'Der Coin wurde nicht gefunden.'
    case 'keinZugriff':
      return ergebnis.grund === 'deaktiviert'
        ? 'Ihr Benutzerkonto ist deaktiviert.'
        : 'Sie sind nicht berechtigt, Motivbilder hochzuladen.'
    case 'nichtAngemeldet':
      return 'Ihre Anmeldung ist abgelaufen.'
    default:
      return 'Der Server war nicht erreichbar. Bitte erneut versuchen.'
  }
}

export interface MotivbildHochladenProps {
  coin: Coin
  /** Nach 200 mit dem aktualisierten Coin (neue `bildUrl`). */
  onGespeichert: (coin: Coin) => void
}

/**
 * Motivbild ersetzen auf „Coin bearbeiten“ (zertifikatsvorlagen, AK-29, F5) über `PUT /api/coins/{id}/bild`. Hinweise
 * und Fehlertexte wie beim Anlegen; kein Löschen.
 */
export function MotivbildHochladen({ coin, onGespeichert }: MotivbildHochladenProps) {
  const [datei, setDatei] = useState<File | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [erfolg, setErfolg] = useState(false)
  const [sendet, setSendet] = useState(false)
  const sendetGerade = useRef(false)
  const feld = useRef<HTMLInputElement>(null)
  const basis = useId()
  const feldId = `${basis}-bild`
  const formateId = `${basis}-formate`
  const hinweisId = `${basis}-hinweis`
  const fehlerId = `${basis}-fehler`

  function waehle(e: ChangeEvent<HTMLInputElement>) {
    setDatei(e.target.files?.[0] ?? null)
    setFehler(null)
    setErfolg(false)
  }

  async function absenden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sendetGerade.current) return

    const pruefung = datei ? validiereBild(datei) : TEXT_KEINE_DATEI
    if (pruefung || !datei) {
      setFehler(pruefung ?? TEXT_KEINE_DATEI)
      setErfolg(false)
      feld.current?.focus()
      return
    }

    sendetGerade.current = true
    setSendet(true)
    setFehler(null)
    setErfolg(false)
    try {
      const ergebnis = await ladeBildHoch(coin.id, datei)
      if (ergebnis.art === 'ok') {
        setDatei(null)
        if (feld.current) feld.current.value = ''
        setErfolg(true)
        onGespeichert(ergebnis.daten)
        return
      }
      setFehler(fehlertext(ergebnis))
      feld.current?.focus()
    } finally {
      sendetGerade.current = false
      setSendet(false)
    }
  }

  const beschreibung = [formateId, hinweisId, fehler ? fehlerId : undefined].filter(Boolean).join(' ')

  return (
    <form className="grid max-w-lg gap-3" onSubmit={absenden} noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor={feldId}>Neues Motivbild</Label>
        <input
          ref={feld}
          id={feldId}
          type="file"
          className={DATEIFELD_KLASSEN}
          accept={ERLAUBTE_BILDTYPEN.join(',')}
          onChange={waehle}
          aria-invalid={fehler ? true : undefined}
          aria-describedby={beschreibung}
        />
        <p id={formateId} className="text-sm text-muted-foreground">
          {HINWEIS_BILD_FORMATE}
        </p>
        <p id={hinweisId} className="text-sm text-muted-foreground">
          {HINWEIS_BILD_METADATEN}
        </p>
        {fehler && (
          <p id={fehlerId} className="text-sm text-destructive">
            {fehler}
          </p>
        )}
      </div>

      <Button type="submit" className="justify-self-start" disabled={sendet}>
        Bild hochladen
      </Button>

      {erfolg && (
        <p role="status" className="text-success">
          {TEXT_ERFOLG}
        </p>
      )}
    </form>
  )
}
