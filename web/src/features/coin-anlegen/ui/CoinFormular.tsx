import { useEffect, useRef, useState, type ChangeEvent, type ReactNode, type FormEvent } from 'react'
import {
  ERLAUBTE_BILDTYPEN,
  HINWEIS_BILD_FORMATE,
  HINWEIS_BILD_METADATEN,
  MELDUNG_BILD_FORMAT,
  MELDUNG_BILD_ZU_GROSS,
  ladeBildHoch,
  legeCoinAn,
  parseAuflage,
  validiereBild,
  type Coin,
} from '@/entities/coin'
import type { ApiErgebnis, KeinZugriffGrund } from '@/shared/api'
import { useFormular, useSendeSperre, type Formularfehler } from '@/shared/lib/formular'
import { Aktionsleiste } from '@/shared/ui/aktionsleiste'
import { Aktionsmeldung } from '@/shared/ui/aktionsmeldung'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Fehlerzusammenfassung } from '@/shared/ui/fehlerzusammenfassung'
import { FormularAbschnitt } from '@/shared/ui/formular-abschnitt'
import { Formularfeld } from '@/shared/ui/formularfeld'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { validiereCoin, type CoinEingaben, type CoinFeld } from '../model/validiereCoin'

const TEXT_ERFOLG = 'Coin wurde angelegt.'
const TEXT_TEILERFOLG = 'Coin wurde angelegt, das Bild konnte nicht gespeichert werden:'
const TEXT_KONFLIKT = 'Ein Coin mit diesem Namen und Herausgeber existiert bereits.'
const TEXT_ALLGEMEINER_FEHLER = 'Der Coin konnte nicht angelegt werden. Bitte später erneut versuchen.'
const TEXT_SERVER_VALIDIERUNG = 'Die Eingaben wurden vom Server abgelehnt. Bitte prüfen.'
const TEXT_KEIN_ZUGRIFF = 'Sie sind nicht berechtigt, Coins zu erfassen.'
const TEXT_DEAKTIVIERT = 'Ihr Benutzerkonto ist deaktiviert.'
const TEXT_NICHT_ANGEMELDET = 'Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …'
const HILFE_AUFLAGE = 'Ganze Zahl von 1 bis 1.000.000. Ohne Angabe sind noch keine Ausgaben möglich.'
const HILFE_BESCHREIBUNG = 'Höchstens 2.000 Zeichen.'

const LEERE_WERTE: CoinEingaben = { name: '', herausgeber: '', auflage: '', beschreibung: '', bild: null }
const REIHENFOLGE: ReadonlyArray<CoinFeld> = ['name', 'herausgeber', 'auflage', 'beschreibung', 'bild']
const LABEL: Readonly<Record<CoinFeld, string>> = {
  name: 'Name',
  herausgeber: 'Herausgeber',
  auflage: 'Auflage (optional)',
  beschreibung: 'Beschreibung (optional)',
  bild: 'Motivbild (optional)',
}

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
  'min-h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive dark:bg-input/30'

type Meldung = { art: 'erfolg' | 'hinweis' | 'fehler' | 'teilerfolg'; text: string }

function serverFehler(fehler: Record<string, string[]>): Formularfehler<CoinEingaben> {
  const ergebnis: Formularfehler<CoinEingaben> = {}
  for (const [schluessel, meldungen] of Object.entries(fehler)) {
    const feld = SERVER_FELDER[schluessel]
    if (feld && meldungen.length > 0) ergebnis[feld] = meldungen.join(' ')
  }
  return ergebnis
}

function grundFuerBildFehler(ergebnis: Exclude<ApiErgebnis<Coin>, { art: 'ok' }>): string {
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
  /** „Abbrechen“ (Link der Seite) links in der Aktionsleiste. */
  abbrechen?: ReactNode
  /** Meldet, ob Eingaben vom Ausgangszustand abweichen (Verlassen-Warnung der Seite, ADR-0040). */
  onGeaendert?: (geaendert: boolean) => void
}

/**
 * Formular „Coin anlegen“ inkl. Motivbild (katalog-seiten AK-30 bis AK-35) nach dem Formularmuster (ADR-0039):
 * Abschnitte „Stammdaten“ und „Motivbild“, Fehler beim Verlassen und Absenden, Zusammenfassung ab zwei Fehlern,
 * Meldungen oben, Aktionsleiste mit Ladezustand.
 */
export function CoinFormular({ onAngelegt, abbrechen, onGeaendert }: CoinFormularProps) {
  const [vorschau, setVorschau] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<Meldung | null>(null)
  /** Angelegter Coin, dessen Bild-Upload fehlgeschlagen ist (AK-34). */
  const [offenerUpload, setOffenerUpload] = useState<Coin | null>(null)
  const { sendet, mitSperre, gesperrt } = useSendeSperre()
  const formular = useFormular<CoinEingaben>({
    ausgangswerte: LEERE_WERTE,
    pruefe: validiereCoin,
    reihenfolge: REIHENFOLGE,
    idPraefix: 'coin',
    onGeaendert,
  })

  const vorschauRef = useRef<string | null>(null)
  const dateiRef = useRef<HTMLInputElement>(null)

  // Object-URL der Vorschau beim Unmount freigeben.
  useEffect(
    () => () => {
      if (vorschauRef.current) URL.revokeObjectURL(vorschauRef.current)
    },
    [],
  )

  function setzeVorschau(datei: File | null) {
    if (vorschauRef.current) URL.revokeObjectURL(vorschauRef.current)
    const url = datei ? URL.createObjectURL(datei) : null
    vorschauRef.current = url
    setVorschau(url)
    if (!datei && dateiRef.current) dateiRef.current.value = ''
  }

  function aendereBild(e: ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0] ?? null
    setzeVorschau(datei)
    formular.setzeWert('bild', datei)
  }

  function entferneBild() {
    setzeVorschau(null)
    formular.setzeWert('bild', null)
  }

  /** Nach Erfolg: Zustand sofort zurücksetzen (keine Verlassen-Warnung), dann melden. */
  function fertig(coin: Coin, bild: AngelegtErgebnis['bild']) {
    setzeVorschau(null)
    formular.zuruecksetzen(LEERE_WERTE)
    setOffenerUpload(null)
    setMeldung({ art: 'erfolg', text: TEXT_ERFOLG })
    onAngelegt(coin, { bild })
  }

  async function ladeHoch(coin: Coin, datei: File, ersterVersuch: boolean) {
    const ergebnis = await ladeBildHoch(coin.id, datei)
    if (ergebnis.art === 'ok') {
      fertig(ergebnis.daten, 'gespeichert')
      return
    }

    // Teilerfolg: Coin existiert, Bild nicht. Textfelder leeren, Bild für die Wiederholung behalten.
    if (ersterVersuch) formular.zuruecksetzen({ ...LEERE_WERTE, bild: datei })
    const grund = grundFuerBildFehler(ergebnis)
    formular.setzeServerFehler({ bild: grund })
    setOffenerUpload(coin)
    setMeldung({ art: 'teilerfolg', text: `${TEXT_TEILERFOLG} ${grund}` })
  }

  function senden(werte: CoinEingaben) {
    return mitSperre(async () => {
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
          formular.setzeServerFehler(feldFehler)
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
      if (werte.bild) {
        await ladeHoch(coin, werte.bild, true)
        return
      }
      fertig(coin, 'gespeichert')
    })
  }

  // Der Handler wird erst im Ereignis gebaut (react-hooks/refs: keine Ref-Zugriffe beim Rendern).
  const absenden = (ereignis?: FormEvent) => formular.absenden(senden)(ereignis)

  async function erneutHochladen() {
    if (!offenerUpload) return
    const bild = formular.werte.bild
    const bildFehler = bild ? validiereBild(bild) : 'Bitte ein Bild auswählen.'
    if (bildFehler || !bild) {
      formular.setzeServerFehler({ bild: bildFehler ?? 'Bitte ein Bild auswählen.' })
      return
    }
    const coin = offenerUpload
    await mitSperre(() => ladeHoch(coin, bild, false))
  }

  /** Teilerfolg: auf das Bild verzichten, ohne weiteren Request (katalog-seiten, AK-23). */
  function ohneBildFortfahren() {
    if (!offenerUpload || gesperrt()) return
    const coin = offenerUpload
    setzeVorschau(null)
    formular.zuruecksetzen(LEERE_WERTE)
    setOffenerUpload(null)
    setMeldung(null)
    onAngelegt(coin, { bild: 'ohne' })
  }

  const zusammenfassung = formular.versucht && formular.fehlerListe.length >= 2
  const name = formular.feld('name')
  const herausgeber = formular.feld('herausgeber')
  const auflage = formular.feld('auflage')
  const beschreibung = formular.feld('beschreibung')
  const bild = formular.feld('bild')

  return (
    <form className="grid max-w-reading gap-6" onSubmit={absenden} noValidate>
      {zusammenfassung && (
        <Fehlerzusammenfassung
          fehler={formular.fehlerListe.map((f) => ({ feldId: f.feldId, label: LABEL[f.feld], text: f.text }))}
        />
      )}
      <Aktionsmeldung
        meldung={
          meldung?.art === 'erfolg' || meldung?.art === 'hinweis' ? { art: meldung.art, text: meldung.text } : null
        }
      />
      {(meldung?.art === 'fehler' || meldung?.art === 'teilerfolg') && (
        <Alert variant="destructive">
          <AlertDescription className="grid justify-items-start gap-2">
            <p>{meldung.text}</p>
            {meldung.art === 'teilerfolg' && offenerUpload && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={erneutHochladen} laedt={sendet}>
                  Bild erneut hochladen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={ohneBildFortfahren}
                  disabled={sendet}
                  focusableWhenDisabled
                >
                  Ohne Bild fortfahren
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <FormularAbschnitt titel="Stammdaten" spalten={2}>
        <Formularfeld label="Name" pflicht id={name.id} fehler={name.fehler} onBlur={name.onBlur}>
          {(feld) => <Input {...feld} type="text" value={name.value} onChange={name.onChange} />}
        </Formularfeld>
        <Formularfeld
          label="Herausgeber"
          pflicht
          id={herausgeber.id}
          fehler={herausgeber.fehler}
          onBlur={herausgeber.onBlur}
        >
          {(feld) => <Input {...feld} type="text" value={herausgeber.value} onChange={herausgeber.onChange} />}
        </Formularfeld>
        <Formularfeld
          label={LABEL.auflage}
          hilfetext={HILFE_AUFLAGE}
          id={auflage.id}
          fehler={auflage.fehler}
          onBlur={auflage.onBlur}
        >
          {(feld) => (
            <Input
              {...feld}
              type="text"
              inputMode="numeric"
              className="md:max-w-48"
              value={auflage.value}
              onChange={auflage.onChange}
            />
          )}
        </Formularfeld>
        <Formularfeld
          label={LABEL.beschreibung}
          hilfetext={HILFE_BESCHREIBUNG}
          id={beschreibung.id}
          fehler={beschreibung.fehler}
          onBlur={beschreibung.onBlur}
          className="md:col-span-2"
        >
          {(feld) => <Textarea {...feld} rows={4} value={beschreibung.value} onChange={beschreibung.onChange} />}
        </Formularfeld>
      </FormularAbschnitt>

      <FormularAbschnitt titel="Motivbild">
        <Formularfeld
          label={LABEL.bild}
          hilfetext={
            <>
              <span className="block">{HINWEIS_BILD_FORMATE}</span>
              <span className="block">{HINWEIS_BILD_METADATEN}</span>
            </>
          }
          id={bild.id}
          fehler={bild.fehler}
          onBlur={bild.onBlur}
        >
          {(feld) => (
            <input
              {...feld}
              ref={dateiRef}
              type="file"
              className={DATEIFELD_KLASSEN}
              accept={ERLAUBTE_BILDTYPEN.join(',')}
              onChange={aendereBild}
            />
          )}
        </Formularfeld>
        {vorschau && (
          <div className="flex flex-wrap items-center gap-4">
            <img src={vorschau} alt="Vorschau des Motivbilds" className="max-h-32 max-w-32 object-contain" />
            <Button type="button" variant="outline" onClick={entferneBild} disabled={sendet}>
              Bild entfernen
            </Button>
          </div>
        )}
      </FormularAbschnitt>

      <Aktionsleiste>
        {abbrechen}
        <Button type="submit" laedt={sendet}>
          Coin anlegen
        </Button>
      </Aktionsleiste>
    </form>
  )
}
