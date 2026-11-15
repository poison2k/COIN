import { useState, type ReactNode } from 'react'
import {
  aendereCoin,
  parseAuflage,
  validiereStammdaten,
  type Coin,
  type StammdatenEingaben,
  type StammdatenFeld,
} from '@/entities/coin'
import { useFormular, useSendeSperre, type Formularfehler } from '@/shared/lib/formular'
import { Aktionsleiste } from '@/shared/ui/aktionsleiste'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Fehlerzusammenfassung } from '@/shared/ui/fehlerzusammenfassung'
import { FormularAbschnitt } from '@/shared/ui/formular-abschnitt'
import { Formularfeld } from '@/shared/ui/formularfeld'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'

const HINWEIS_AUFLAGE =
  'Die Auflage kann nur bis zur höchsten bereits ausgegebenen Exemplar-Nummer gesenkt werden. Beim Senken werden die Exemplare über der neuen Auflage gelöscht.'
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

function serverFehler(fehler: Record<string, string[]>): Formularfehler<StammdatenEingaben> {
  const ergebnis: Formularfehler<StammdatenEingaben> = {}
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
  /** „Abbrechen“ (Link der Seite) links in der Aktionsleiste. */
  abbrechen?: ReactNode
  /** Meldet, ob Eingaben vom Ausgangszustand abweichen (Verlassen-Warnung der Seite, ADR-0040). */
  onGeaendert?: (geaendert: boolean) => void
}

/**
 * Formular „Stammdaten“ auf „Coin bearbeiten“ (zertifikatsvorlagen, AK-22/AK-28) nach dem Formularmuster (ADR-0039):
 * vorbelegt, gleiche Prüfung und Texte wie beim Anlegen; eine gesetzte Auflage ist Pflicht. Fehler bleiben am Feld,
 * Eingaben bleiben erhalten.
 */
export function CoinBearbeitenFormular({ coin, onGespeichert, abbrechen, onGeaendert }: CoinBearbeitenFormularProps) {
  const auflagePflicht = coin.auflage !== null
  const [ausgang] = useState(() => startWerte(coin))
  const [meldung, setMeldung] = useState<Meldung | null>(null)
  const { sendet, mitSperre } = useSendeSperre()
  const formular = useFormular<StammdatenEingaben>({
    ausgangswerte: ausgang,
    pruefe: (werte) => validiereStammdaten(werte, { auflagePflicht }),
    reihenfolge: FELDER,
    onGeaendert,
  })

  const labels: Readonly<Record<StammdatenFeld, string>> = {
    name: 'Name',
    herausgeber: 'Herausgeber',
    auflage: auflagePflicht ? 'Auflage' : 'Auflage (optional)',
    beschreibung: 'Beschreibung (optional)',
  }

  const absenden = formular.absenden((werte) =>
    mitSperre(async () => {
      setMeldung(null)
      const ergebnis = await aendereCoin(coin.id, {
        name: werte.name.trim(),
        herausgeber: werte.herausgeber.trim(),
        auflage: parseAuflage(werte.auflage) ?? null,
        beschreibung: werte.beschreibung.trim() || null,
      })

      switch (ergebnis.art) {
        case 'ok':
          formular.zuruecksetzen()
          onGespeichert(ergebnis.daten)
          return
        case 'validierung': {
          const feldFehler = serverFehler(ergebnis.fehler)
          if (Object.keys(feldFehler).length === 0) setMeldung({ art: 'fehler', text: TEXT_SERVER_VALIDIERUNG })
          else formular.setzeServerFehler(feldFehler)
          return
        }
        case 'konflikt':
          if (ergebnis.code === 'auflage_zu_klein') {
            formular.setzeServerFehler({ auflage: ergebnis.detail ?? 'Die Auflage ist zu klein.' })
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
    }),
  )

  const name = formular.feld('name')
  const herausgeber = formular.feld('herausgeber')
  const auflage = formular.feld('auflage')
  const beschreibung = formular.feld('beschreibung')

  return (
    <form className="grid max-w-reading gap-6" onSubmit={absenden} noValidate>
      {formular.versucht && formular.fehlerListe.length >= 2 && (
        <Fehlerzusammenfassung
          fehler={formular.fehlerListe.map((f) => ({ feldId: f.feldId, label: labels[f.feld], text: f.text }))}
        />
      )}
      {meldung?.art === 'hinweis' && <p role="status">{meldung.text}</p>}
      {meldung?.art === 'fehler' && (
        <Alert variant="destructive">
          <AlertDescription>{meldung.text}</AlertDescription>
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
          label={labels.auflage}
          pflicht={auflagePflicht}
          hilfetext={HINWEIS_AUFLAGE}
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
          label={labels.beschreibung}
          id={beschreibung.id}
          fehler={beschreibung.fehler}
          onBlur={beschreibung.onBlur}
          className="md:col-span-2"
        >
          {(feld) => <Textarea {...feld} rows={4} value={beschreibung.value} onChange={beschreibung.onChange} />}
        </Formularfeld>
      </FormularAbschnitt>

      <Aktionsleiste>
        {abbrechen}
        <Button type="submit" laedt={sendet}>
          Änderungen speichern
        </Button>
      </Aktionsleiste>
    </form>
  )
}
