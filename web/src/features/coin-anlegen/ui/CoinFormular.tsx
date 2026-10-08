import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ladeBildHoch, legeCoinAn, type Coin } from '@/entities/coin'
import type { ApiErgebnis, KeinZugriffGrund } from '@/shared/api'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import {
  ERLAUBTE_BILDTYPEN,
  MELDUNG_FORMAT,
  MELDUNG_ZU_GROSS,
  parseAuflage,
  validiereBild,
  validiereCoin,
  type CoinFehler,
  type CoinFeld,
} from '../model/validiereCoin'

const TEXT_ERFOLG = 'Coin wurde angelegt.'
const TEXT_TEILERFOLG = 'Coin wurde angelegt, das Bild konnte nicht gespeichert werden:'
const TEXT_KONFLIKT = 'Ein Coin mit diesem Namen und Herausgeber existiert bereits.'
const TEXT_ALLGEMEINER_FEHLER = 'Der Coin konnte nicht angelegt werden. Bitte später erneut versuchen.'
const TEXT_SERVER_VALIDIERUNG = 'Die Eingaben wurden vom Server abgelehnt. Bitte prüfen.'
const TEXT_KEIN_ZUGRIFF = 'Sie sind nicht berechtigt, Coins zu erfassen.'
const TEXT_DEAKTIVIERT = 'Ihr Benutzerkonto ist deaktiviert.'
const TEXT_NICHT_ANGEMELDET = 'Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …'

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

/** Styling des nativen Dateifelds wie Input (das Dateifeld bleibt ein natives <input type="file">). */
const DATEIFELD_KLASSEN =
  'w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive dark:bg-input/30'

type Meldung = { art: 'erfolg' | 'hinweis' | 'fehler' | 'teilerfolg'; text: string }

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
    case 'keinZugriff':
      return keinZugriffText(ergebnis.grund)
    case 'nichtAngemeldet':
      return 'Ihre Anmeldung ist abgelaufen.'
    default:
      return 'Der Server war nicht erreichbar. Bitte erneut versuchen.'
  }
}

/** 403: deaktiviertes Konto oder fehlende Berechtigung (rollen-benutzerverwaltung, AK-33). */
function keinZugriffText(grund: KeinZugriffGrund): string {
  return grund === 'deaktiviert' ? TEXT_DEAKTIVIERT : TEXT_KEIN_ZUGRIFF
}

function ohneBildFehler(fehler: CoinFehler): CoinFehler {
  const kopie = { ...fehler }
  delete kopie.bild
  return kopie
}

/** Was mit dem Motivbild geschehen ist: gespeichert (bzw. keins gewählt) oder bewusst ohne Bild fortgefahren. */
export interface AngelegtErgebnis {
  bild: 'gespeichert' | 'ohne'
}

export interface CoinFormularProps {
  /**
   * Wird genau einmal aufgerufen, wenn nichts mehr offen ist (katalog-seiten, AK-22/AK-23): nach dem Anlegen ohne Bild,
   * nach erfolgreichem Bild-Upload (`gespeichert`) oder nach „Ohne Bild fortfahren“ beim Teilerfolg (`ohne`).
   */
  onAngelegt: (coin: Coin, ergebnis: AngelegtErgebnis) => void
}

/** Formular „Coin anlegen“ inkl. Motivbild (AK-30 bis AK-35). */
export function CoinFormular({ onAngelegt }: CoinFormularProps) {
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
      onAngelegt(ergebnis.daten, { bild: 'gespeichert' })
      setWerte(LEERE_WERTE)
      setzeBild(null)
      setFehler({})
      setOffenerUpload(null)
      setMeldung({ art: 'erfolg', text: TEXT_ERFOLG })
      return
    }

    // Teilerfolg: Coin existiert, Bild nicht. Textfelder leeren, Bild für die Wiederholung behalten.
    if (ersterVersuch) setWerte(LEERE_WERTE)
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
        case 'keinZugriff':
          setMeldung({ art: 'fehler', text: keinZugriffText(ergebnis.grund) })
          return
        case 'nichtAngemeldet':
          // Die App entfernt die Sitzung und startet die Anmeldung (AK-27); die Eingaben gehen dabei verloren.
          setMeldung({ art: 'hinweis', text: TEXT_NICHT_ANGEMELDET })
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

      onAngelegt(coin, { bild: 'gespeichert' })
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

  /** Teilerfolg: auf das Bild verzichten, ohne weiteren Request (katalog-seiten, AK-23). */
  function ohneBildFortfahren() {
    if (!offenerUpload || sendetRef.current) return
    const coin = offenerUpload
    setOffenerUpload(null)
    setzeBild(null)
    setFehler({})
    setMeldung(null)
    onAngelegt(coin, { bild: 'ohne' })
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
      <p id={`coin-${feld}-fehler`} className="text-sm text-destructive">
        {fehler[feld]}
      </p>
    ) : null
  }

  return (
    <form className="grid max-w-lg gap-4" onSubmit={absenden} noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="coin-name">Name</Label>
        <Input type="text" value={werte.name} onChange={aendereText('name')} {...feldAttribute('name')} />
        {feldFehler('name')}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="coin-herausgeber">Herausgeber</Label>
        <Input
          type="text"
          value={werte.herausgeber}
          onChange={aendereText('herausgeber')}
          {...feldAttribute('herausgeber')}
        />
        {feldFehler('herausgeber')}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="coin-auflage">Auflage (optional)</Label>
        <Input
          type="text"
          inputMode="numeric"
          value={werte.auflage}
          onChange={aendereText('auflage')}
          {...feldAttribute('auflage')}
        />
        {feldFehler('auflage')}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="coin-beschreibung">Beschreibung (optional)</Label>
        <Textarea
          rows={4}
          value={werte.beschreibung}
          onChange={aendereText('beschreibung')}
          {...feldAttribute('beschreibung')}
        />
        {feldFehler('beschreibung')}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="coin-bild">Motivbild (optional)</Label>
        <input
          ref={dateiRef}
          type="file"
          className={DATEIFELD_KLASSEN}
          accept={ERLAUBTE_BILDTYPEN.join(',')}
          onChange={aendereBild}
          {...feldAttribute('bild', 'coin-bild-formate coin-bild-hinweis')}
        />
        <p id="coin-bild-formate" className="text-sm text-muted-foreground">
          JPEG, PNG oder WebP, höchstens 5 MB.
        </p>
        <p id="coin-bild-hinweis" className="text-sm text-muted-foreground">
          Bitte nur Bilder ohne personenbezogene Metadaten hochladen.
        </p>
        {feldFehler('bild')}
        {vorschau && (
          <div className="flex items-center gap-4">
            <img src={vorschau} alt="Vorschau des Motivbilds" className="max-h-32 max-w-32 object-contain" />
            <Button type="button" variant="outline" onClick={entferneBild} disabled={sendet}>
              Bild entfernen
            </Button>
          </div>
        )}
      </div>

      <Button type="submit" className="justify-self-start" disabled={sendet}>
        Coin anlegen
      </Button>

      {meldung?.art === 'erfolg' && (
        <p role="status" className="text-success">
          {meldung.text}
        </p>
      )}
      {meldung?.art === 'hinweis' && <p role="status">{meldung.text}</p>}
      {(meldung?.art === 'fehler' || meldung?.art === 'teilerfolg') && (
        <div role="alert" className="grid justify-items-start gap-2 text-destructive">
          <p>{meldung.text}</p>
          {meldung.art === 'teilerfolg' && offenerUpload && (
            <Button
              type="button"
              variant="outline"
              className="text-foreground"
              onClick={erneutHochladen}
              disabled={sendet}
            >
              Bild erneut hochladen
            </Button>
          )}
          {meldung.art === 'teilerfolg' && offenerUpload && (
            <Button
              type="button"
              variant="outline"
              className="text-foreground"
              onClick={ohneBildFortfahren}
              disabled={sendet}
            >
              Ohne Bild fortfahren
            </Button>
          )}
        </div>
      )}
    </form>
  )
}
