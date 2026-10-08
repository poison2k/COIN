import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import type { Ausgabe } from '@/entities/ausgabe'
import type { Coin } from '@/entities/coin'
import type { KennzahlenDaten } from '@/entities/exemplar'
import type { KeinZugriffGrund } from '@/shared/api'
import { heuteInBerlin } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import { Textarea } from '@/shared/ui/textarea'
import { erfasseAusgabe } from '../api/erfasseAusgabe'
import {
  FELD_REIHENFOLGE,
  validiereAusgabe,
  type AusgabeEingaben,
  type AusgabeFehler,
  type AusgabeFeld,
  type ExemplarWahl,
} from '../model/validiereAusgabe'

const TEXT_KEIN_FREI = 'Alle Exemplare dieses Coins sind ausgegeben.'
const TEXT_AUFLAGE_UNBEKANNT =
  'Für diesen Coin ist keine Auflage erfasst. Ausgaben sind erst nach dem Festlegen der Auflage möglich.'
const TEXT_AUSGEGEBEN_OHNE_NUMMER = 'Das gewählte Exemplar wurde gerade ausgegeben. Bitte erneut speichern.'
const TEXT_KEIN_ZUGRIFF = 'Sie sind nicht berechtigt, Ausgaben zu erfassen.'
const TEXT_DEAKTIVIERT = 'Ihr Benutzerkonto ist deaktiviert.'
const TEXT_NICHT_ANGEMELDET = 'Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …'
const TEXT_NICHT_GEFUNDEN = 'Der Coin wurde nicht gefunden.'
const TEXT_SERVER_VALIDIERUNG = 'Die Eingaben wurden vom Server abgelehnt. Bitte prüfen.'
const TEXT_ALLGEMEINER_FEHLER = 'Die Ausgabe konnte nicht gespeichert werden. Bitte später erneut versuchen.'

const SERVER_FELDER = new Set<string>(FELD_REIHENFOLGE)

function keinZugriffText(grund: KeinZugriffGrund): string {
  return grund === 'deaktiviert' ? TEXT_DEAKTIVIERT : TEXT_KEIN_ZUGRIFF
}

function textOderNull(wert: string): string | null {
  const text = wert.trim()
  return text === '' ? null : text
}

/** Kennzeichnung eines Pflichtfelds im Label: sichtbar „*“, für Screenreader „(Pflichtfeld)“ (AK-27). */
function Pflicht() {
  return (
    <>
      <span aria-hidden="true" className="text-destructive">
        *
      </span>
      <span className="sr-only">(Pflichtfeld)</span>
    </>
  )
}

export interface AusgabeFormularProps {
  coin: Coin
  kennzahlen: KennzahlenDaten
  /** Nach 201 mit der gespeicherten Ausgabe; die Seite navigiert danach (AK-28). */
  onErfasst: (ausgabe: Ausgabe) => void
}

/** Formular „Ausgabe erfassen“ (coin-ausgaben AK-27 bis AK-29). */
export function AusgabeFormular({ coin, kennzahlen, onErfasst }: AusgabeFormularProps) {
  const auflage = kennzahlen.auflage ?? coin.auflage ?? 0
  const [heute] = useState(() => heuteInBerlin())
  const [werte, setWerte] = useState<AusgabeEingaben>(() => ({
    wahl: 'naechste',
    exemplarNummer: '',
    empfaengerName: '',
    empfaengerDienstgrad: '',
    empfaengerDienststelle: '',
    datum: heute,
    gelegenheit: '',
    begruendung: '',
    ausgebendeStelle: '',
  }))
  const [fehler, setFehler] = useState<AusgabeFehler>({})
  const [alarm, setAlarm] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)
  const sendetRef = useRef(false)
  const basis = useId()

  const id = (feld: AusgabeFeld) => `${basis}-${feld}`
  const fehlerId = (feld: AusgabeFeld) => `${basis}-${feld}-fehler`
  const legendeId = `${basis}-exemplar`
  const gelegenheitHinweisId = `${basis}-gelegenheit-hinweis`

  function aendere(feld: AusgabeFeld) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const wert = e.target.value
      setWerte((alt) => ({ ...alt, [feld]: wert }))
    }
  }

  function aendereWahl(wahl: unknown) {
    if (wahl === 'naechste' || wahl === 'nummer') setWerte((alt) => ({ ...alt, wahl: wahl as ExemplarWahl }))
  }

  function fokussiereErstenFehler(neu: AusgabeFehler) {
    const erstes = FELD_REIHENFOLGE.find((feld) => neu[feld])
    if (erstes) document.getElementById(id(erstes))?.focus()
  }

  function zeigeFehler(neu: AusgabeFehler) {
    setFehler(neu)
    fokussiereErstenFehler(neu)
  }

  async function absenden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sendetRef.current) return

    const pruefung = validiereAusgabe(werte, { auflage, heute })
    if (Object.keys(pruefung).length > 0) {
      setAlarm(null)
      zeigeFehler(pruefung)
      return
    }

    sendetRef.current = true
    setSendet(true)
    setAlarm(null)
    setFehler({})
    const nummer = werte.wahl === 'nummer' ? Number(werte.exemplarNummer.trim()) : null
    try {
      const ergebnis = await erfasseAusgabe(coin.id, {
        exemplarNummer: nummer,
        empfaengerName: werte.empfaengerName.trim(),
        empfaengerDienstgrad: textOderNull(werte.empfaengerDienstgrad),
        empfaengerDienststelle: textOderNull(werte.empfaengerDienststelle),
        datum: werte.datum,
        gelegenheit: werte.gelegenheit.trim(),
        begruendung: werte.begruendung.trim(),
        ausgebendeStelle: werte.ausgebendeStelle.trim(),
      })

      switch (ergebnis.art) {
        case 'ok':
          onErfasst(ergebnis.daten)
          return
        case 'validierung': {
          const feldFehler: AusgabeFehler = {}
          for (const [schluessel, meldungen] of Object.entries(ergebnis.fehler)) {
            if (SERVER_FELDER.has(schluessel) && meldungen.length > 0)
              feldFehler[schluessel as AusgabeFeld] = meldungen.join(' ')
          }
          if (Object.keys(feldFehler).length === 0) setAlarm(TEXT_SERVER_VALIDIERUNG)
          zeigeFehler(feldFehler)
          return
        }
        case 'konflikt':
          if (ergebnis.code === 'exemplar_ausgegeben' && nummer !== null) {
            zeigeFehler({ exemplarNummer: `Exemplar Nr. ${nummer} ist bereits ausgegeben.` })
          } else if (ergebnis.code === 'exemplar_ausgegeben') {
            setAlarm(TEXT_AUSGEGEBEN_OHNE_NUMMER)
          } else if (ergebnis.code === 'auflage_unbekannt') {
            setAlarm(TEXT_AUFLAGE_UNBEKANNT)
          } else {
            setAlarm(TEXT_KEIN_FREI)
          }
          return
        case 'keinZugriff':
          setAlarm(keinZugriffText(ergebnis.grund))
          return
        case 'nichtAngemeldet':
          setAlarm(TEXT_NICHT_ANGEMELDET)
          return
        case 'nichtGefunden':
          setAlarm(TEXT_NICHT_GEFUNDEN)
          return
        default:
          setAlarm(TEXT_ALLGEMEINER_FEHLER)
      }
    } finally {
      sendetRef.current = false
      setSendet(false)
    }
  }

  function feldAttribute(feld: AusgabeFeld, hinweisId?: string) {
    const beschreibung = [hinweisId, fehler[feld] ? fehlerId(feld) : undefined].filter(Boolean).join(' ')
    return {
      id: id(feld),
      value: werte[feld],
      onChange: aendere(feld),
      'aria-invalid': fehler[feld] ? true : undefined,
      'aria-describedby': beschreibung || undefined,
    }
  }

  function feldFehler(feld: AusgabeFeld) {
    return fehler[feld] ? (
      <p id={fehlerId(feld)} className="text-sm text-destructive">
        {fehler[feld]}
      </p>
    ) : null
  }

  function Feld({ feld, label, children }: { feld: AusgabeFeld; label: ReactNode; children: ReactNode }) {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id(feld)}>{label}</Label>
        {children}
        {feldFehler(feld)}
      </div>
    )
  }

  return (
    <form className="grid max-w-xl gap-4" onSubmit={absenden} noValidate>
      <fieldset className="grid gap-2">
        <legend id={legendeId} className="mb-2 text-sm font-medium">
          Exemplar
        </legend>
        <RadioGroup aria-labelledby={legendeId} value={werte.wahl} onValueChange={aendereWahl}>
          <div className="flex items-center gap-2">
            <RadioGroupItem id={`${basis}-wahl-naechste`} value="naechste" />
            <Label htmlFor={`${basis}-wahl-naechste`} className="font-normal">
              Nächstes freies Exemplar
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem id={`${basis}-wahl-nummer`} value="nummer" />
            <Label htmlFor={`${basis}-wahl-nummer`} className="font-normal">
              Bestimmte Nummer
            </Label>
          </div>
        </RadioGroup>
        <div className="grid gap-1.5 pl-6">
          <Label htmlFor={id('exemplarNummer')}>
            Exemplar-Nummer
            {werte.wahl === 'nummer' && (
              <>
                {' '}
                <Pflicht />
              </>
            )}
          </Label>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={auflage}
            className="w-40"
            disabled={werte.wahl !== 'nummer'}
            {...feldAttribute('exemplarNummer')}
          />
          {feldFehler('exemplarNummer')}
        </div>
      </fieldset>

      {Feld({
        feld: 'empfaengerName',
        label: (
          <>
            Name des Empfängers <Pflicht />
          </>
        ),
        children: <Input type="text" maxLength={200} {...feldAttribute('empfaengerName')} />,
      })}
      {Feld({
        feld: 'empfaengerDienstgrad',
        label: 'Dienstgrad (optional)',
        children: <Input type="text" maxLength={100} {...feldAttribute('empfaengerDienstgrad')} />,
      })}
      {Feld({
        feld: 'empfaengerDienststelle',
        label: 'Dienststelle (optional)',
        children: <Input type="text" maxLength={200} {...feldAttribute('empfaengerDienststelle')} />,
      })}
      {Feld({
        feld: 'datum',
        label: (
          <>
            Datum <Pflicht />
          </>
        ),
        children: <Input type="date" max={heute} className="w-48" {...feldAttribute('datum')} />,
      })}
      {Feld({
        feld: 'gelegenheit',
        label: (
          <>
            Gelegenheit <Pflicht />
          </>
        ),
        children: (
          <>
            <Input type="text" maxLength={200} {...feldAttribute('gelegenheit', gelegenheitHinweisId)} />
            <p id={gelegenheitHinweisId} className="text-sm text-muted-foreground">
              z. B. Truppenbesuch, Verabschiedung
            </p>
          </>
        ),
      })}
      {Feld({
        feld: 'begruendung',
        label: (
          <>
            Begründung <Pflicht />
          </>
        ),
        children: <Textarea rows={4} maxLength={2000} {...feldAttribute('begruendung')} />,
      })}
      {Feld({
        feld: 'ausgebendeStelle',
        label: (
          <>
            Ausgebende Stelle oder Person <Pflicht />
          </>
        ),
        children: <Input type="text" maxLength={200} {...feldAttribute('ausgebendeStelle')} />,
      })}

      {alarm && (
        <p role="alert" className="text-destructive">
          {alarm}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={sendet}>
          Ausgabe speichern
        </Button>
      </div>
    </form>
  )
}
