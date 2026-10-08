import { useId, useRef, useState, type FormEvent } from 'react'
import { aendereAuflage, type Coin } from '@/entities/coin'
import type { ApiErgebnis } from '@/shared/api'
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
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

const AUFLAGE_MAX = 1_000_000
const TEXT_ERFORDERLICH = 'Auflage ist erforderlich.'
const TEXT_BEREICH = `Auflage muss zwischen 1 und ${AUFLAGE_MAX} liegen.`

function pruefe(wert: string): string | null {
  const text = wert.trim()
  if (text === '') return TEXT_ERFORDERLICH
  const zahl = /^\d+$/.test(text) ? Number(text) : Number.NaN
  return zahl >= 1 && zahl <= AUFLAGE_MAX ? null : TEXT_BEREICH
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

/** Button „Auflage ändern“ mit Dialog (coin-ausgaben AK-25, F3/F4). */
export function AuflageAendern({ coinId, auflage, onGeaendert }: AuflageAendernProps) {
  const [offen, setOffen] = useState(false)
  const [wert, setWert] = useState('')
  const [feldFehler, setFeldFehler] = useState<string | null>(null)
  const [alarm, setAlarm] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)
  const sendetGerade = useRef(false)
  const feld = useRef<HTMLInputElement>(null)
  const ausloeser = useRef<HTMLButtonElement>(null)
  const basis = useId()
  const feldId = `${basis}-auflage`
  const fehlerId = `${basis}-fehler`

  function oeffnen() {
    setWert(auflage === null ? '' : String(auflage))
    setFeldFehler(null)
    setAlarm(null)
    setOffen(true)
  }

  async function speichern(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sendetGerade.current) return
    const fehler = pruefe(wert)
    if (fehler) {
      setFeldFehler(fehler)
      setAlarm(null)
      feld.current?.focus()
      return
    }

    sendetGerade.current = true
    setSendet(true)
    setFeldFehler(null)
    setAlarm(null)
    try {
      const ergebnis = await aendereAuflage(coinId, Number(wert.trim()), { konfliktDetail: true })
      if (ergebnis.art === 'ok') {
        setOffen(false)
        onGeaendert(ergebnis.daten)
      } else if (ergebnis.art === 'validierung') {
        const meldung = ergebnis.fehler.auflage?.join(' ')
        if (meldung) {
          setFeldFehler(meldung)
          feld.current?.focus()
        } else {
          setAlarm('Die Eingabe wurde vom Server abgelehnt. Bitte prüfen.')
        }
      } else {
        setAlarm(fehlertext(ergebnis))
      }
    } finally {
      sendetGerade.current = false
      setSendet(false)
    }
  }

  return (
    <>
      <Button ref={ausloeser} type="button" variant="outline" size="sm" onClick={oeffnen}>
        Auflage ändern
      </Button>
      <Dialog
        open={offen}
        onOpenChange={(neu) => {
          if (!sendetGerade.current) setOffen(neu)
        }}
      >
        <DialogContent initialFocus={feld} finalFocus={ausloeser} showCloseButton={false} aria-busy={sendet}>
          <form className="grid gap-4" noValidate onSubmit={speichern}>
            <DialogHeader>
              <DialogTitle>Auflage ändern</DialogTitle>
              <DialogDescription>
                Eine Senkung ist nur bis zur höchsten jemals ausgegebenen Exemplar-Nummer möglich.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor={feldId}>
                Auflage{' '}
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
                <span className="sr-only">(Pflichtfeld)</span>
              </Label>
              <Input
                ref={feld}
                id={feldId}
                type="number"
                inputMode="numeric"
                min={1}
                max={AUFLAGE_MAX}
                value={wert}
                onChange={(e) => setWert(e.target.value)}
                aria-invalid={feldFehler ? true : undefined}
                aria-describedby={feldFehler ? fehlerId : undefined}
              />
              {feldFehler && (
                <p id={fehlerId} className="text-sm text-destructive">
                  {feldFehler}
                </p>
              )}
            </div>
            {alarm && (
              <p role="alert" className="text-sm text-destructive">
                {alarm}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={sendet} focusableWhenDisabled />}>
                Abbrechen
              </DialogClose>
              <Button type="submit" disabled={sendet} focusableWhenDisabled>
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
