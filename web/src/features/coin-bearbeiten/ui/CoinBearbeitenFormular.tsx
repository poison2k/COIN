import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  aendereCoin,
  parseAuflage,
  validiereStammdaten,
  type Coin,
  type StammdatenEingaben,
  type StammdatenFehler,
  type StammdatenFeld,
} from '@/entities/coin'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'

const HINWEIS_AUFLAGE = 'Die Auflage kann nur bis zur höchsten bereits ausgegebenen Exemplar-Nummer gesenkt werden.'
const TEXT_KONFLIKT = 'Ein Coin mit diesem Namen und Herausgeber existiert bereits.'
const TEXT_SERVER_VALIDIERUNG = 'Die Eingaben wurden vom Server abgelehnt. Bitte prüfen.'
const TEXT_KEIN_ZUGRIFF = 'Sie sind nicht berechtigt, Coins zu bearbeiten.'
const TEXT_DEAKTIVIERT = 'Ihr Benutzerkonto ist deaktiviert.'
const TEXT_NICHT_ANGEMELDET = 'Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …'
const TEXT_NICHT_GEFUNDEN = 'Der Coin wurde nicht gefunden.'
const TEXT_ALLGEMEINER_FEHLER = 'Die Änderungen konnten nicht gespeichert werden. Bitte später erneut versuchen.'

/** Reihenfolge der Felder im Formular (Fokus auf das erste fehlerhafte Feld). */
const FELDER: StammdatenFeld[] = ['name', 'herausgeber', 'auflage', 'beschreibung']

type Meldung = { art: 'fehler' | 'hinweis'; text: string }

function startWerte(coin: Coin): StammdatenEingaben {
  return {
    name: coin.name,
    herausgeber: coin.herausgeber,
    auflage: coin.auflage === null ? '' : String(coin.auflage),
    beschreibung: coin.beschreibung ?? '',
  }
}

function serverFehler(fehler: Record<string, string[]>): StammdatenFehler {
  const ergebnis: StammdatenFehler = {}
  for (const feld of FELDER) {
    const meldungen = fehler[feld]
    if (meldungen && meldungen.length > 0) ergebnis[feld] = meldungen.join(' ')
  }
  return ergebnis
}

export interface CoinBearbeitenFormularProps {
  coin: Coin
  /** Nach 200 mit dem gespeicherten Coin; die Navigation übernimmt der Aufrufer. */
  onGespeichert: (coin: Coin) => void
}

/**
 * Formular „Stammdaten“ auf „Coin bearbeiten“ (zertifikatsvorlagen, AK-22/AK-28): vorbelegt, gleiche Prüfung und
 * Texte wie beim Anlegen; eine gesetzte Auflage ist Pflicht. Fehler bleiben am Feld, Eingaben bleiben erhalten.
 */
export function CoinBearbeitenFormular({ coin, onGespeichert }: CoinBearbeitenFormularProps) {
  const [werte, setWerte] = useState(() => startWerte(coin))
  const [fehler, setFehler] = useState<StammdatenFehler>({})
  const [meldung, setMeldung] = useState<Meldung | null>(null)
  const [sendet, setSendet] = useState(false)
  // Feld, das nach einer Prüfung den Fokus erhält (erstes fehlerhaftes Feld).
  const [fokusFeld, setFokusFeld] = useState<{ feld: StammdatenFeld } | null>(null)
  const sendetGerade = useRef(false)
  const basis = useId()
  const auflagePflicht = coin.auflage !== null

  useEffect(() => {
    if (fokusFeld) document.getElementById(`${basis}-${fokusFeld.feld}`)?.focus()
  }, [fokusFeld, basis])

  function zeigeFehler(neu: StammdatenFehler) {
    setFehler(neu)
    const erstes = FELDER.find((f) => neu[f])
    if (erstes) setFokusFeld({ feld: erstes })
  }

  function aendere(feld: StammdatenFeld) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const wert = e.target.value
      setWerte((alt) => ({ ...alt, [feld]: wert }))
    }
  }

  async function absenden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sendetGerade.current) return

    const pruefung = validiereStammdaten(werte, { auflagePflicht })
    if (Object.keys(pruefung).length > 0) {
      setMeldung(null)
      zeigeFehler(pruefung)
      return
    }

    sendetGerade.current = true
    setSendet(true)
    setMeldung(null)
    setFehler({})
    try {
      const ergebnis = await aendereCoin(coin.id, {
        name: werte.name.trim(),
        herausgeber: werte.herausgeber.trim(),
        auflage: parseAuflage(werte.auflage) ?? null,
        beschreibung: werte.beschreibung.trim() || null,
      })

      switch (ergebnis.art) {
        case 'ok':
          onGespeichert(ergebnis.daten)
          return
        case 'validierung': {
          const feldFehler = serverFehler(ergebnis.fehler)
          if (Object.keys(feldFehler).length === 0) setMeldung({ art: 'fehler', text: TEXT_SERVER_VALIDIERUNG })
          else zeigeFehler(feldFehler)
          return
        }
        case 'konflikt':
          if (ergebnis.code === 'auflage_zu_klein') {
            zeigeFehler({ auflage: ergebnis.detail ?? 'Die Auflage ist zu klein.' })
          } else {
            setMeldung({ art: 'fehler', text: TEXT_KONFLIKT })
          }
          return
        case 'keinZugriff':
          setMeldung({ art: 'fehler', text: ergebnis.grund === 'deaktiviert' ? TEXT_DEAKTIVIERT : TEXT_KEIN_ZUGRIFF })
          return
        case 'nichtAngemeldet':
          setMeldung({ art: 'hinweis', text: TEXT_NICHT_ANGEMELDET })
          return
        case 'nichtGefunden':
          setMeldung({ art: 'fehler', text: TEXT_NICHT_GEFUNDEN })
          return
        default:
          setMeldung({ art: 'fehler', text: TEXT_ALLGEMEINER_FEHLER })
          return
      }
    } finally {
      sendetGerade.current = false
      setSendet(false)
    }
  }

  function feldAttribute(feld: StammdatenFeld, zusatzBeschreibung?: string) {
    const fehlerId = `${basis}-${feld}-fehler`
    const beschreibung = [zusatzBeschreibung, fehler[feld] ? fehlerId : undefined].filter(Boolean).join(' ')
    return {
      id: `${basis}-${feld}`,
      'aria-invalid': fehler[feld] ? true : undefined,
      'aria-describedby': beschreibung || undefined,
    }
  }

  function feldFehler(feld: StammdatenFeld) {
    return fehler[feld] ? (
      <p id={`${basis}-${feld}-fehler`} className="text-sm text-destructive">
        {fehler[feld]}
      </p>
    ) : null
  }

  const hinweisAuflageId = `${basis}-auflage-hinweis`

  return (
    <form className="grid max-w-lg gap-4" onSubmit={absenden} noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor={`${basis}-name`}>Name</Label>
        <Input type="text" value={werte.name} onChange={aendere('name')} {...feldAttribute('name')} />
        {feldFehler('name')}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${basis}-herausgeber`}>Herausgeber</Label>
        <Input
          type="text"
          value={werte.herausgeber}
          onChange={aendere('herausgeber')}
          {...feldAttribute('herausgeber')}
        />
        {feldFehler('herausgeber')}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${basis}-auflage`}>{auflagePflicht ? 'Auflage' : 'Auflage (optional)'}</Label>
        <Input
          type="text"
          inputMode="numeric"
          required={auflagePflicht}
          value={werte.auflage}
          onChange={aendere('auflage')}
          {...feldAttribute('auflage', hinweisAuflageId)}
        />
        <p id={hinweisAuflageId} className="text-sm text-muted-foreground">
          {HINWEIS_AUFLAGE}
        </p>
        {feldFehler('auflage')}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${basis}-beschreibung`}>Beschreibung (optional)</Label>
        <Textarea
          rows={4}
          value={werte.beschreibung}
          onChange={aendere('beschreibung')}
          {...feldAttribute('beschreibung')}
        />
        {feldFehler('beschreibung')}
      </div>

      <Button type="submit" className="justify-self-start" disabled={sendet}>
        Änderungen speichern
      </Button>

      {meldung?.art === 'hinweis' && <p role="status">{meldung.text}</p>}
      {meldung?.art === 'fehler' && (
        <p role="alert" className="text-destructive">
          {meldung.text}
        </p>
      )}
    </form>
  )
}
