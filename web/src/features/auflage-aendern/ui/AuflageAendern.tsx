import { useRef, useState } from 'react'
import { aendereAuflage, type Coin } from '@/entities/coin'
import type { ApiErgebnis } from '@/shared/api'
import { useFormular, useSendeSperre } from '@/shared/lib/formular'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Formularfeld } from '@/shared/ui/formularfeld'
import { Input } from '@/shared/ui/input'

const AUFLAGE_MAX = 1_000_000
const TEXT_ERFORDERLICH = 'Auflage ist erforderlich.'
const TEXT_BEREICH = `Auflage muss zwischen 1 und ${AUFLAGE_MAX} liegen.`
const HILFE =
  'Beim Senken werden die Exemplare über der neuen Auflage gelöscht. Senken ist nur bis zur höchsten je ausgegebenen Nummer möglich.'

interface Werte {
  auflage: string
}

function pruefe(werte: Werte): Partial<Record<keyof Werte, string>> {
  const text = werte.auflage.trim()
  if (text === '') return { auflage: TEXT_ERFORDERLICH }
  const zahl = /^\d+$/.test(text) ? Number(text) : Number.NaN
  return zahl >= 1 && zahl <= AUFLAGE_MAX ? {} : { auflage: TEXT_BEREICH }
}

function fehlertext(ergebnis: Exclude<ApiErgebnis<Coin>, { art: 'ok' | 'validierung' }>): string {
  switch (ergebnis.art) {
    case 'konflikt':
      return ergebnis.detail ?? 'Die Auflage kann nicht so weit gesenkt werden.'
    case 'nichtGefunden':
      return 'Der Coin wurde nicht gefunden.'
    case 'keinZugriff':
      return ergebnis.grund === 'deaktiviert'
        ? 'Ihr Benutzerkonto ist deaktiviert.'
        : 'Sie sind nicht berechtigt, die Auflage zu ändern.'
    case 'nichtAngemeldet':
      return 'Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …'
    default:
      return 'Die Auflage konnte nicht geändert werden. Bitte später erneut versuchen.'
  }
}

export interface AuflageAendernProps {
  coinId: string
  /** Aktuelle Auflage zum Vorbelegen; `null` = unbekannt. */
  auflage: number | null
  /** Nach 200 mit dem geänderten Coin. */
  onGeaendert: (coin: Coin) => void
}

/**
 * Button „Auflage ändern“ mit Dialog (coin-ausgaben AK-25, F3/F4) nach dem Formularmuster (ADR-0039): Pflichtfeld mit
 * Hilfetext zum Senken, Fehler beim Verlassen und Absenden, Ladezustand am Speichern-Button. Der Dialog warnt beim
 * Schließen nicht (formulare-detailseiten A3).
 */
export function AuflageAendern({ coinId, auflage, onGeaendert }: AuflageAendernProps) {
  const [offen, setOffen] = useState(false)
  const [alarm, setAlarm] = useState<string | null>(null)
  const { sendet, mitSperre, gesperrt } = useSendeSperre()
  const feldRef = useRef<HTMLInputElement>(null)
  const ausloeser = useRef<HTMLButtonElement>(null)
  const startwert = auflage === null ? '' : String(auflage)
  const formular = useFormular<Werte>({ ausgangswerte: { auflage: startwert }, pruefe, reihenfolge: ['auflage'] })
  const feld = formular.feld('auflage')

  function oeffnen() {
    formular.zuruecksetzen({ auflage: startwert })
    setAlarm(null)
    setOffen(true)
  }

  const speichern = formular.absenden((werte) =>
    mitSperre(async () => {
      setAlarm(null)
      const ergebnis = await aendereAuflage(coinId, Number(werte.auflage.trim()), { konfliktDetail: true })
      if (ergebnis.art === 'ok') {
        setOffen(false)
        onGeaendert(ergebnis.daten)
      } else if (ergebnis.art === 'validierung') {
        const meldung = ergebnis.fehler.auflage?.join(' ')
        if (meldung) formular.setzeServerFehler({ auflage: meldung })
        else setAlarm('Die Eingabe wurde vom Server abgelehnt. Bitte prüfen.')
      } else {
        setAlarm(fehlertext(ergebnis))
      }
    }),
  )

  return (
    <>
      <Button ref={ausloeser} type="button" variant="outline" onClick={oeffnen}>
        Auflage ändern
      </Button>
      <Dialog
        open={offen}
        onOpenChange={(neu) => {
          if (!gesperrt()) setOffen(neu)
        }}
      >
        <DialogContent initialFocus={feldRef} finalFocus={ausloeser} showCloseButton={false} aria-busy={sendet}>
          <form className="grid gap-4" noValidate onSubmit={speichern}>
            <DialogHeader>
              <DialogTitle>Auflage ändern</DialogTitle>
              <DialogDescription>
                Eine Senkung ist nur bis zur höchsten jemals ausgegebenen Exemplar-Nummer möglich.
              </DialogDescription>
            </DialogHeader>
            <Formularfeld
              label="Auflage"
              pflicht
              hilfetext={HILFE}
              id={feld.id}
              fehler={feld.fehler}
              onBlur={feld.onBlur}
            >
              {(attribute) => (
                <Input
                  {...attribute}
                  ref={feldRef}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={AUFLAGE_MAX}
                  value={feld.value}
                  onChange={feld.onChange}
                />
              )}
            </Formularfeld>
            {alarm && (
              <p role="alert" className="text-sm text-destructive">
                {alarm}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={sendet} focusableWhenDisabled />}>
                Abbrechen
              </DialogClose>
              <Button type="submit" laedt={sendet}>
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
