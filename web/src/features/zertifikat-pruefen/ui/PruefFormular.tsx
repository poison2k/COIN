import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { HOLOGRAMMNUMMER_MAX, pruefeHologrammnummer } from '@/entities/ausgabe'
import type { Coin } from '@/entities/coin'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { pruefeHologramm } from '../api/pruefeHologramm'
import type { PruefErgebnis } from '../model/types'
import { CoinAuswahl } from './CoinAuswahl'
import { PruefErgebnisAnzeige } from './PruefErgebnisAnzeige'

const TEXT_ZU_VIELE = 'Sie haben in kurzer Zeit zu viele Prüfungen durchgeführt.'
const TEXT_KEIN_ZUGRIFF = 'Sie sind nicht berechtigt, Zertifikate zu prüfen.'
const TEXT_DEAKTIVIERT = 'Ihr Benutzerkonto ist deaktiviert.'
const TEXT_NICHT_ANGEMELDET = 'Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …'
const TEXT_FEHLER = 'Die Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.'
const TEXT_NUMMER_FEHLT = 'Bitte eine Hologrammnummer eingeben.'

/** Sperre nach 429 ohne lesbares `Retry-After` (Länge des Fensters der Ratenbegrenzung). */
const SPERRE_OHNE_ANGABE_S = 60

interface Gepruft {
  ergebnis: PruefErgebnis
  gepruefteNummer: string
  mitEmpfaenger: boolean
}

export interface PruefFormularProps {
  /** issues.read: Prüfung über …/mit-empfaenger mit Empfängerdaten (AK-31). */
  darfEmpfaenger: boolean
}

/**
 * Formular „Zertifikat prüfen“ (hologrammnummer AK-29 bis AK-33): „Coin (optional)“, „Hologrammnummer“ (Pflicht) und
 * „Prüfen“. Enter im Nummernfeld prüft; ungültige Eingaben ohne Request; während der Prüfung und nach 429 bis zum
 * Ablauf der Wartezeit ist der Button gesperrt. Ergebnis in einer dauerhaft vorhandenen Live-Region; jede Änderung an
 * Nummer oder Coin blendet ein altes Ergebnis aus. Die Nummer steht nur im Speicher der Komponente (nie in URL oder
 * Storage).
 */
export function PruefFormular({ darfEmpfaenger }: PruefFormularProps) {
  const [coin, setCoin] = useState<Coin | null>(null)
  const [nummer, setNummer] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [alarm, setAlarm] = useState<string | null>(null)
  const [ergebnis, setErgebnis] = useState<Gepruft | null>(null)
  const [sendet, setSendet] = useState(false)
  const [gesperrt, setGesperrt] = useState(false)
  const sendetGerade = useRef(false)
  const gesperrtRef = useRef(false)
  const sperrZeitgeber = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nummerFeld = useRef<HTMLInputElement>(null)
  const basis = useId()
  const coinId = `${basis}-coin`
  const nummerId = `${basis}-nummer`
  const fehlerId = `${basis}-nummer-fehler`

  useEffect(
    () => () => {
      if (sperrZeitgeber.current) clearTimeout(sperrZeitgeber.current)
    },
    [],
  )

  function sperren(sekunden: number) {
    gesperrtRef.current = true
    setGesperrt(true)
    if (sperrZeitgeber.current) clearTimeout(sperrZeitgeber.current)
    sperrZeitgeber.current = setTimeout(() => {
      gesperrtRef.current = false
      setGesperrt(false)
      sperrZeitgeber.current = null
    }, sekunden * 1000)
  }

  function coinGeaendert(neu: Coin | null) {
    setCoin(neu)
    setErgebnis(null)
  }

  function zeigeFehler(text: string) {
    setFehler(text)
    nummerFeld.current?.focus()
  }

  async function pruefen(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sendetGerade.current || gesperrtRef.current) return

    const pruefung = pruefeHologrammnummer(nummer)
    if (pruefung.art !== 'ok') {
      setErgebnis(null)
      setAlarm(null)
      zeigeFehler(pruefung.art === 'fehler' ? pruefung.meldung : TEXT_NUMMER_FEHLT)
      return
    }

    sendetGerade.current = true
    setSendet(true)
    setFehler(null)
    setAlarm(null)
    setErgebnis(null)
    const mitEmpfaenger = darfEmpfaenger
    try {
      const antwort = await pruefeHologramm(
        { hologrammnummer: pruefung.anzeige, coinId: coin?.id ?? null },
        { mitEmpfaenger },
      )
      switch (antwort.art) {
        case 'ok':
          setErgebnis({ ergebnis: antwort.daten, gepruefteNummer: pruefung.anzeige, mitEmpfaenger })
          return
        case 'validierung': {
          const meldung = antwort.fehler.hologrammnummer?.join(' ')
          if (meldung) zeigeFehler(meldung)
          else setAlarm(TEXT_FEHLER)
          return
        }
        case 'zuVieleAnfragen': {
          const sekunden = antwort.wiederholenNachSekunden
          setAlarm(
            sekunden !== null && sekunden > 0
              ? `${TEXT_ZU_VIELE} Bitte warten Sie ${sekunden} Sekunden.`
              : `${TEXT_ZU_VIELE} Bitte warten Sie einen Moment.`,
          )
          sperren(sekunden !== null && sekunden > 0 ? sekunden : SPERRE_OHNE_ANGABE_S)
          return
        }
        case 'keinZugriff':
          setAlarm(antwort.grund === 'deaktiviert' ? TEXT_DEAKTIVIERT : TEXT_KEIN_ZUGRIFF)
          return
        case 'nichtAngemeldet':
          setAlarm(TEXT_NICHT_ANGEMELDET)
          return
        default:
          setAlarm(TEXT_FEHLER)
      }
    } finally {
      sendetGerade.current = false
      setSendet(false)
    }
  }

  return (
    <div className="grid gap-6">
      <form className="grid max-w-xl gap-4" noValidate onSubmit={(e) => void pruefen(e)}>
        <div className="grid gap-1.5">
          <Label htmlFor={coinId}>Coin (optional)</Label>
          <CoinAuswahl id={coinId} wert={coin} onWert={coinGeaendert} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={nummerId}>
            Hologrammnummer{' '}
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
            <span className="sr-only">(Pflichtfeld)</span>
          </Label>
          <Input
            ref={nummerFeld}
            id={nummerId}
            type="text"
            maxLength={HOLOGRAMMNUMMER_MAX}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="characters"
            value={nummer}
            onChange={(e) => {
              setNummer(e.target.value)
              setErgebnis(null)
            }}
            aria-invalid={fehler ? true : undefined}
            aria-describedby={fehler ? fehlerId : undefined}
          />
          {fehler && (
            <p id={fehlerId} className="text-sm text-destructive">
              {fehler}
            </p>
          )}
        </div>
        <div>
          <Button type="submit" disabled={sendet || gesperrt} focusableWhenDisabled aria-busy={sendet || undefined}>
            Prüfen
          </Button>
        </div>
      </form>

      {alarm && (
        <p role="alert" className="text-destructive">
          {alarm}
        </p>
      )}

      <div role="status" aria-live="polite">
        {ergebnis && (
          <PruefErgebnisAnzeige
            ergebnis={ergebnis.ergebnis}
            gepruefteNummer={ergebnis.gepruefteNummer}
            mitEmpfaenger={ergebnis.mitEmpfaenger}
          />
        )}
      </div>
    </div>
  )
}
