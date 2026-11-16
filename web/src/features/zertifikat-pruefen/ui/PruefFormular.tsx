import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { HOLOGRAMMNUMMER_MAX, pruefeHologrammnummer } from '@/entities/ausgabe'
import type { Coin } from '@/entities/coin'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Formularfeld } from '@/shared/ui/formularfeld'
import { Input } from '@/shared/ui/input'
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
const HILFETEXT = 'Leerzeichen und Bindestriche sind erlaubt. Groß- und Kleinschreibung spielt keine Rolle.'

/** Sperre nach 429 ohne lesbares `Retry-After` (Länge des Fensters der Ratenbegrenzung). */
const SPERRE_OHNE_ANGABE_S = 60

interface Gepruft {
  ergebnis: PruefErgebnis
  gepruefteNummer: string
  mitEmpfaenger: boolean
}

interface Alarm {
  text: string
  /** 429: Hinweis statt Fehler (Hinweisbanner warning). */
  art: 'fehler' | 'warnung'
}

export interface PruefFormularProps {
  /** issues.read: Prüfung über …/mit-empfaenger mit Empfängerdaten (AK-31). */
  darfEmpfaenger: boolean
}

/**
 * Formular „Zertifikat prüfen“ (hologrammnummer AK-29 bis AK-33, startseite-listen-pruefung 4.3): „Coin (optional)“ und
 * „Hologrammnummer“ (Pflicht) ab 768 px nebeneinander, darunter „Prüfen“. Enter im Nummernfeld prüft; ungültige
 * Eingaben ohne Request; während der Prüfung und nach 429 bis zum Ablauf der Wartezeit ist der Button gesperrt. Nach
 * jeder abgeschlossenen Prüfung liegt der Fokus im Nummernfeld, nach einem Ergebnis mit markiertem Inhalt (F4). Das
 * Ergebnis steht in einer dauerhaft vorhandenen Live-Region; jede Änderung an Nummer oder Coin blendet ein altes
 * Ergebnis aus. Die Nummer steht nur im Speicher der Komponente (nie in URL oder Storage).
 */
export function PruefFormular({ darfEmpfaenger }: PruefFormularProps) {
  const [coin, setCoin] = useState<Coin | null>(null)
  const [nummer, setNummer] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [alarm, setAlarm] = useState<Alarm | null>(null)
  const [ergebnis, setErgebnis] = useState<Gepruft | null>(null)
  const [sendet, setSendet] = useState(false)
  const [gesperrt, setGesperrt] = useState(false)
  const sendetGerade = useRef(false)
  const gesperrtRef = useRef(false)
  const sperrZeitgeber = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nummerFeld = useRef<HTMLInputElement>(null)
  const pruefenKnopf = useRef<HTMLButtonElement>(null)
  const basis = useId()
  const coinId = `${basis}-coin`
  const nummerId = `${basis}-nummer`

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

  /** Fokus ins Nummernfeld nach jeder abgeschlossenen Prüfung; nach einem Ergebnis den Inhalt markieren (F4). */
  function fokusInsFeld(markieren: boolean) {
    const feld = nummerFeld.current
    if (!feld) return
    // Nur zurückholen, wenn der Fokus noch beim Prüfen liegt (Nummernfeld, „Prüfen“) oder verloren ist (body).
    // Hat der Benutzer während der Anfrage z. B. in die Coin-Auswahl gewechselt, bleibt er dort.
    const aktiv = document.activeElement
    const beimPruefen = aktiv === null || aktiv === document.body || aktiv === feld || aktiv === pruefenKnopf.current
    if (!beimPruefen) return
    feld.focus()
    if (markieren) feld.select()
  }

  async function pruefen(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sendetGerade.current || gesperrtRef.current) return

    const pruefung = pruefeHologrammnummer(nummer)
    if (pruefung.art !== 'ok') {
      setErgebnis(null)
      setAlarm(null)
      setFehler(pruefung.art === 'fehler' ? pruefung.meldung : TEXT_NUMMER_FEHLT)
      fokusInsFeld(false)
      return
    }

    sendetGerade.current = true
    setSendet(true)
    setFehler(null)
    setAlarm(null)
    setErgebnis(null)
    const mitEmpfaenger = darfEmpfaenger
    let markieren = false
    try {
      const antwort = await pruefeHologramm(
        { hologrammnummer: pruefung.anzeige, coinId: coin?.id ?? null },
        { mitEmpfaenger },
      )
      switch (antwort.art) {
        case 'ok':
          setErgebnis({ ergebnis: antwort.daten, gepruefteNummer: pruefung.anzeige, mitEmpfaenger })
          markieren = true
          return
        case 'validierung': {
          const meldung = antwort.fehler.hologrammnummer?.join(' ')
          if (meldung) setFehler(meldung)
          else setAlarm({ text: TEXT_FEHLER, art: 'fehler' })
          return
        }
        case 'zuVieleAnfragen': {
          const sekunden = antwort.wiederholenNachSekunden
          setAlarm({
            text:
              sekunden !== null && sekunden > 0
                ? `${TEXT_ZU_VIELE} Bitte warten Sie ${sekunden} Sekunden.`
                : `${TEXT_ZU_VIELE} Bitte warten Sie einen Moment.`,
            art: 'warnung',
          })
          sperren(sekunden !== null && sekunden > 0 ? sekunden : SPERRE_OHNE_ANGABE_S)
          return
        }
        case 'keinZugriff':
          setAlarm({ text: antwort.grund === 'deaktiviert' ? TEXT_DEAKTIVIERT : TEXT_KEIN_ZUGRIFF, art: 'fehler' })
          return
        case 'nichtAngemeldet':
          setAlarm({ text: TEXT_NICHT_ANGEMELDET, art: 'fehler' })
          return
        default:
          setAlarm({ text: TEXT_FEHLER, art: 'fehler' })
      }
    } finally {
      sendetGerade.current = false
      setSendet(false)
      fokusInsFeld(markieren)
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" noValidate onSubmit={(e) => void pruefen(e)}>
            <Formularfeld id={coinId} label="Coin (optional)" className="content-start">
              {(feld) => (
                <CoinAuswahl
                  id={feld.id}
                  beschreibungId={feld['aria-describedby']}
                  wert={coin}
                  onWert={coinGeaendert}
                />
              )}
            </Formularfeld>
            <Formularfeld
              id={nummerId}
              label="Hologrammnummer"
              pflicht
              hilfetext={HILFETEXT}
              fehler={fehler ?? undefined}
            >
              {(feld) => (
                <Input
                  ref={nummerFeld}
                  {...feld}
                  type="text"
                  className="h-12 font-mono text-lg tracking-wide md:text-lg"
                  maxLength={HOLOGRAMMNUMMER_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="characters"
                  value={nummer}
                  onChange={(e) => {
                    setNummer(e.target.value)
                    setErgebnis(null)
                  }}
                />
              )}
            </Formularfeld>
            <div className="flex justify-end md:col-span-2">
              <Button
                ref={pruefenKnopf}
                type="submit"
                size="lg"
                laedt={sendet}
                disabled={gesperrt}
                focusableWhenDisabled
              >
                Prüfen
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {alarm && (
        <Alert variant={alarm.art === 'warnung' ? 'warning' : 'destructive'} role="alert">
          <AlertDescription>{alarm.text}</AlertDescription>
        </Alert>
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
