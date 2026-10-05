import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ladeBildHoch, legeCoinAn, type ApiErgebnis } from '../api/coins'
import type { Coin } from '../api/types'
import {
  ERLAUBTE_BILDTYPEN,
  MELDUNG_FORMAT,
  MELDUNG_ZU_GROSS,
  parseAuflage,
  validiereBild,
  validiereCoin,
  type CoinFehler,
  type CoinFeld,
} from './validiereCoin'

const TEXT_ERFOLG = 'Coin wurde angelegt.'
const TEXT_TEILERFOLG = 'Coin wurde angelegt, das Bild konnte nicht gespeichert werden:'
const TEXT_KONFLIKT = 'Ein Coin mit diesem Namen und Herausgeber existiert bereits.'
const TEXT_ALLGEMEINER_FEHLER = 'Der Coin konnte nicht angelegt werden. Bitte später erneut versuchen.'
const TEXT_SERVER_VALIDIERUNG = 'Die Eingaben wurden vom Server abgelehnt. Bitte prüfen.'

const LEERE_WERTE = { name: '', herausgeber: '', auflage: '', beschreibung: '' }
type TextFeld = keyof typeof LEERE_WERTE

/** Abbildung der Server-Feldnamen auf Formularfelder; „datei“ ist das Bildfeld. */
const SERVER_FELDER: Record<string, CoinFeld> = {
  name: 'name',
  herausgeber: 'herausgeber',
  auflage: 'auflage',
  beschreibung: 'beschreibung',
  datei: 'bild',
}

type Meldung = { art: 'erfolg' | 'fehler' | 'teilerfolg'; text: string }

function serverFehler(fehler: Record<string, string[]>): CoinFehler {
  const ergebnis: CoinFehler = {}
  for (const [schluessel, meldungen] of Object.entries(fehler)) {
    const feld = SERVER_FELDER[schluessel]
    if (feld && meldungen.length > 0) ergebnis[feld] = meldungen.join(' ')
  }
  return ergebnis
}

function grundFuerBildFehler(ergebnis: Exclude<ApiErgebnis<Coin>, { art: 'ok' }>): string {
  switch (ergebnis.art) {
    case 'zuGross':
      return MELDUNG_ZU_GROSS
    case 'formatUngueltig':
      return MELDUNG_FORMAT
    case 'validierung':
      return ergebnis.fehler.datei?.join(' ') || 'Die Datei wurde vom Server abgelehnt.'
    case 'nichtGefunden':
      return 'Der Coin wurde nicht gefunden.'
    default:
      return 'Der Server war nicht erreichbar. Bitte erneut versuchen.'
  }
}

function ohneBildFehler(fehler: CoinFehler): CoinFehler {
  const kopie = { ...fehler }
  delete kopie.bild
  return kopie
}

export interface CoinFormularProps {
  /** Wird mit dem gespeicherten Coin aufgerufen (nach Anlegen und nach erfolgreichem Bild-Upload). */
  onGespeichert: (coin: Coin) => void
}

/** Formular „Coin anlegen“ inkl. Motivbild (AK-30 bis AK-35). */
export function CoinFormular({ onGespeichert }: CoinFormularProps) {
  const [werte, setWerte] = useState(LEERE_WERTE)
  const [bild, setBild] = useState<File | null>(null)
  const [vorschau, setVorschau] = useState<string | null>(null)
  const [fehler, setFehler] = useState<CoinFehler>({})
  const [meldung, setMeldung] = useState<Meldung | null>(null)
  const [sendet, setSendet] = useState(false)
  /** Angelegter Coin, dessen Bild-Upload fehlgeschlagen ist (AK-34). */
  const [offenerUpload, setOffenerUpload] = useState<Coin | null>(null)

  const sendetRef = useRef(false)
  const vorschauRef = useRef<string | null>(null)
  const dateiRef = useRef<HTMLInputElement>(null)

  // Object-URL der Vorschau beim Unmount freigeben.
  useEffect(
    () => () => {
      if (vorschauRef.current) URL.revokeObjectURL(vorschauRef.current)
    },
    [],
  )

  function setzeBild(datei: File | null) {
    if (vorschauRef.current) URL.revokeObjectURL(vorschauRef.current)
    const url = datei ? URL.createObjectURL(datei) : null
    vorschauRef.current = url
    setVorschau(url)
    setBild(datei)
    if (!datei && dateiRef.current) dateiRef.current.value = ''
  }

  function aendereText(feld: TextFeld) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const wert = e.target.value
      setWerte((alt) => ({ ...alt, [feld]: wert }))
    }
  }

  function aendereBild(e: ChangeEvent<HTMLInputElement>) {
    setzeBild(e.target.files?.[0] ?? null)
    setFehler(ohneBildFehler)
  }

  function entferneBild() {
    setzeBild(null)
    setFehler(ohneBildFehler)
  }

  async function ladeHoch(coin: Coin, datei: File, ersterVersuch: boolean) {
    const ergebnis = await ladeBildHoch(coin.id, datei)
    if (ergebnis.art === 'ok') {
      onGespeichert(ergebnis.daten)
      setWerte(LEERE_WERTE)
      setzeBild(null)
      setFehler({})
      setOffenerUpload(null)
      setMeldung({ art: 'erfolg', text: TEXT_ERFOLG })
      return
    }

    // Teilerfolg: Coin existiert, Bild nicht. Textfelder leeren, Bild für die Wiederholung behalten.
    if (ersterVersuch) {
      onGespeichert(coin)
      setWerte(LEERE_WERTE)
    }
    const grund = grundFuerBildFehler(ergebnis)
    setFehler({ bild: grund })
    setOffenerUpload(coin)
    setMeldung({ art: 'teilerfolg', text: `${TEXT_TEILERFOLG} ${grund}` })
  }

  async function mitSperre(aktion: () => Promise<void>) {
    if (sendetRef.current) return
    sendetRef.current = true
    setSendet(true)
    try {
      await aktion()
    } finally {
      sendetRef.current = false
      setSendet(false)
    }
  }

  async function absenden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sendetRef.current) return

    const pruefung = validiereCoin({ ...werte, bild })
    setFehler(pruefung)
    if (Object.keys(pruefung).length > 0) {
      setMeldung(null)
      return
    }

    await mitSperre(async () => {
      setMeldung(null)
      setOffenerUpload(null)
      const ergebnis = await legeCoinAn({
        name: werte.name.trim(),
        herausgeber: werte.herausgeber.trim(),
        auflage: parseAuflage(werte.auflage) ?? null,
        beschreibung: werte.beschreibung.trim() || null,
      })

      switch (ergebnis.art) {
        case 'ok':
          break
        case 'validierung': {
          const feldFehler = serverFehler(ergebnis.fehler)
          setFehler(feldFehler)
          if (Object.keys(feldFehler).length === 0) setMeldung({ art: 'fehler', text: TEXT_SERVER_VALIDIERUNG })
          return
        }
        case 'konflikt':
          setMeldung({ art: 'fehler', text: TEXT_KONFLIKT })
          return
        default:
          setMeldung({ art: 'fehler', text: TEXT_ALLGEMEINER_FEHLER })
          return
      }

      const coin = ergebnis.daten
      if (bild) {
        await ladeHoch(coin, bild, true)
        return
      }

      onGespeichert(coin)
      setWerte(LEERE_WERTE)
      setFehler({})
      setMeldung({ art: 'erfolg', text: TEXT_ERFOLG })
    })
  }

  async function erneutHochladen() {
    if (!offenerUpload) return
    const bildFehler = bild ? validiereBild(bild) : 'Bitte ein Bild auswählen.'
    if (bildFehler) {
      setFehler({ bild: bildFehler })
      return
    }
    const coin = offenerUpload
    const datei = bild as File
    await mitSperre(() => ladeHoch(coin, datei, false))
  }

  function feldAttribute(feld: CoinFeld, zusatzBeschreibung?: string) {
    const fehlerId = `coin-${feld}-fehler`
    const beschreibung = [zusatzBeschreibung, fehler[feld] ? fehlerId : undefined].filter(Boolean).join(' ')
    return {
      id: `coin-${feld}`,
      'aria-invalid': fehler[feld] ? true : undefined,
      'aria-describedby': beschreibung || undefined,
    }
  }

  function feldFehler(feld: CoinFeld) {
    return fehler[feld] ? (
      <p id={`coin-${feld}-fehler`} className="feld-fehler">
        {fehler[feld]}
      </p>
    ) : null
  }

  return (
    <form className="coin-formular" onSubmit={absenden} noValidate>
      <div className="feld">
        <label htmlFor="coin-name">Name</label>
        <input type="text" value={werte.name} onChange={aendereText('name')} {...feldAttribute('name')} />
        {feldFehler('name')}
      </div>

      <div className="feld">
        <label htmlFor="coin-herausgeber">Herausgeber</label>
        <input
          type="text"
          value={werte.herausgeber}
          onChange={aendereText('herausgeber')}
          {...feldAttribute('herausgeber')}
        />
        {feldFehler('herausgeber')}
      </div>

      <div className="feld">
        <label htmlFor="coin-auflage">Auflage (optional)</label>
        <input
          type="text"
          inputMode="numeric"
          value={werte.auflage}
          onChange={aendereText('auflage')}
          {...feldAttribute('auflage')}
        />
        {feldFehler('auflage')}
      </div>

      <div className="feld">
        <label htmlFor="coin-beschreibung">Beschreibung (optional)</label>
        <textarea
          rows={4}
          value={werte.beschreibung}
          onChange={aendereText('beschreibung')}
          {...feldAttribute('beschreibung')}
        />
        {feldFehler('beschreibung')}
      </div>

      <div className="feld">
        <label htmlFor="coin-bild">Motivbild (optional)</label>
        <input
          ref={dateiRef}
          type="file"
          accept={ERLAUBTE_BILDTYPEN.join(',')}
          onChange={aendereBild}
          {...feldAttribute('bild', 'coin-bild-formate coin-bild-hinweis')}
        />
        <p id="coin-bild-formate" className="hinweis">
          JPEG, PNG oder WebP, höchstens 5 MB.
        </p>
        <p id="coin-bild-hinweis" className="hinweis">
          Bitte nur Bilder ohne personenbezogene Metadaten hochladen.
        </p>
        {feldFehler('bild')}
        {vorschau && (
          <div className="vorschau">
            <img src={vorschau} alt="Vorschau des Motivbilds" />
            <button type="button" onClick={entferneBild} disabled={sendet}>
              Bild entfernen
            </button>
          </div>
        )}
      </div>

      <button type="submit" disabled={sendet}>
        Coin anlegen
      </button>

      {meldung?.art === 'erfolg' && (
        <p role="status" className="meldung erfolg">
          {meldung.text}
        </p>
      )}
      {meldung && meldung.art !== 'erfolg' && (
        <div role="alert" className="meldung fehler">
          <p>{meldung.text}</p>
          {meldung.art === 'teilerfolg' && offenerUpload && (
            <button type="button" onClick={erneutHochladen} disabled={sendet}>
              Bild erneut hochladen
            </button>
          )}
        </div>
      )}
    </form>
  )
}
