import { useState, type ReactNode } from 'react'
import { HOLOGRAMMNUMMER_MAX, pruefeHologrammnummer, type Ausgabe } from '@/entities/ausgabe'
import type { Coin } from '@/entities/coin'
import type { KennzahlenDaten } from '@/entities/exemplar'
import type { KeinZugriffGrund } from '@/shared/api'
import { useFormular, useSendeSperre, type Formularfehler } from '@/shared/lib/formular'
import { formatiereZahl, heuteInBerlin } from '@/shared/lib/format'
import { Aktionsleiste } from '@/shared/ui/aktionsleiste'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Fehlerzusammenfassung } from '@/shared/ui/fehlerzusammenfassung'
import { FormularAbschnitt } from '@/shared/ui/formular-abschnitt'
import { Formularfeld } from '@/shared/ui/formularfeld'
import { Input } from '@/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import { Textarea } from '@/shared/ui/textarea'
import { erfasseAusgabe } from '../api/erfasseAusgabe'
import {
  FELD_REIHENFOLGE,
  validiereAusgabe,
  type AusgabeEingaben,
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
const TEXT_HOLOGRAMM_VERGEBEN = 'Diese Hologrammnummer ist bereits vergeben.'
const HINWEIS_HOLOGRAMM =
  'Nummer des Hologramm-Stickers auf dem Zertifikat. Leerzeichen und Bindestriche sind erlaubt. Kleinbuchstaben werden zu Großbuchstaben. Erlaubt sind A–Z und 0–9, höchstens 40 Zeichen. Die Nummer darf nur einmal vergeben sein.'
const HINWEIS_GELEGENHEIT = 'z. B. Truppenbesuch, Verabschiedung'

const SERVER_FELDER = new Set<string>(FELD_REIHENFOLGE)

const LABEL: Readonly<Record<AusgabeFeld, string>> = {
  exemplarNummer: 'Exemplar-Nummer',
  empfaengerName: 'Name des Empfängers',
  empfaengerDienstgrad: 'Dienstgrad (optional)',
  empfaengerDienststelle: 'Dienststelle (optional)',
  datum: 'Datum',
  gelegenheit: 'Gelegenheit',
  begruendung: 'Begründung',
  ausgebendeStelle: 'Ausgebende Stelle oder Person',
  hologrammnummer: 'Hologrammnummer (optional)',
}

/** Auswahl mit Beschriftung als Klickfläche von mindestens 40 px Höhe (AK-38). */
const WAHL_KLASSEN = 'flex min-h-10 w-fit cursor-pointer items-center gap-3 rounded-md pr-2 text-sm'

function keinZugriffText(grund: KeinZugriffGrund): string {
  return grund === 'deaktiviert' ? TEXT_DEAKTIVIERT : TEXT_KEIN_ZUGRIFF
}

function textOderNull(wert: string): string | null {
  const text = wert.trim()
  return text === '' ? null : text
}

export interface AusgabeFormularProps {
  coin: Coin
  kennzahlen: KennzahlenDaten
  /** Nach 201 mit der gespeicherten Ausgabe; die Seite navigiert danach (AK-28). */
  onErfasst: (ausgabe: Ausgabe) => void
  /** „Abbrechen“ (Link der Seite) links in der Aktionsleiste. */
  abbrechen?: ReactNode
  /** Meldet, ob Eingaben vom Ausgangszustand abweichen (Verlassen-Warnung der Seite, ADR-0040). */
  onGeaendert?: (geaendert: boolean) => void
}

/**
 * Formular „Ausgabe erfassen“ (coin-ausgaben AK-27 bis AK-29), mit optionaler Hologrammnummer (hologrammnummer AK-26),
 * nach dem Formularmuster (ADR-0039): Abschnitte „Exemplar“, „Empfänger“, „Ausgabe“ und „Zertifikat“.
 */
export function AusgabeFormular({ coin, kennzahlen, onErfasst, abbrechen, onGeaendert }: AusgabeFormularProps) {
  const auflage = kennzahlen.auflage ?? coin.auflage ?? 0
  const [heute] = useState(() => heuteInBerlin())
  const [ausgang] = useState<AusgabeEingaben>(() => ({
    wahl: 'naechste',
    exemplarNummer: '',
    empfaengerName: '',
    empfaengerDienstgrad: '',
    empfaengerDienststelle: '',
    datum: heute,
    gelegenheit: '',
    begruendung: '',
    ausgebendeStelle: '',
    hologrammnummer: '',
  }))
  const [alarm, setAlarm] = useState<string | null>(null)
  const { sendet, mitSperre } = useSendeSperre()
  const formular = useFormular<AusgabeEingaben>({
    ausgangswerte: ausgang,
    pruefe: (werte) => validiereAusgabe(werte, { auflage, heute }),
    reihenfolge: FELD_REIHENFOLGE,
    onGeaendert,
  })
  const { werte } = formular

  function aendereWahl(wahl: unknown) {
    if (wahl === 'naechste' || wahl === 'nummer') formular.setzeWert('wahl', wahl as ExemplarWahl)
  }

  const absenden = formular.absenden((eingaben) =>
    mitSperre(async () => {
      setAlarm(null)
      const nummer = eingaben.wahl === 'nummer' ? Number(eingaben.exemplarNummer.trim()) : null
      const hologramm = pruefeHologrammnummer(eingaben.hologrammnummer ?? '')
      const ergebnis = await erfasseAusgabe(coin.id, {
        exemplarNummer: nummer,
        empfaengerName: eingaben.empfaengerName.trim(),
        empfaengerDienstgrad: textOderNull(eingaben.empfaengerDienstgrad),
        empfaengerDienststelle: textOderNull(eingaben.empfaengerDienststelle),
        datum: eingaben.datum,
        gelegenheit: eingaben.gelegenheit.trim(),
        begruendung: eingaben.begruendung.trim(),
        ausgebendeStelle: eingaben.ausgebendeStelle.trim(),
        // Ohne Nummer fehlt das Feld (Server: null); der bisherige Request bleibt unverändert.
        ...(hologramm.art === 'ok' ? { hologrammnummer: hologramm.anzeige } : {}),
      })

      switch (ergebnis.art) {
        case 'ok':
          formular.zuruecksetzen()
          onErfasst(ergebnis.daten)
          return
        case 'validierung': {
          const feldFehler: Formularfehler<AusgabeEingaben> = {}
          for (const [schluessel, meldungen] of Object.entries(ergebnis.fehler)) {
            if (SERVER_FELDER.has(schluessel) && meldungen.length > 0)
              feldFehler[schluessel as AusgabeFeld] = meldungen.join(' ')
          }
          if (Object.keys(feldFehler).length === 0) setAlarm(TEXT_SERVER_VALIDIERUNG)
          else formular.setzeServerFehler(feldFehler)
          return
        }
        case 'konflikt':
          if (ergebnis.code === 'hologrammnummer_vergeben') {
            formular.setzeServerFehler({ hologrammnummer: TEXT_HOLOGRAMM_VERGEBEN })
          } else if (ergebnis.code === 'exemplar_ausgegeben' && nummer !== null) {
            formular.setzeServerFehler({ exemplarNummer: `Exemplar Nr. ${nummer} ist bereits ausgegeben.` })
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
    }),
  )

  const nummer = formular.feld('exemplarNummer')
  const name = formular.feld('empfaengerName')
  const dienstgrad = formular.feld('empfaengerDienstgrad')
  const dienststelle = formular.feld('empfaengerDienststelle')
  const datum = formular.feld('datum')
  const gelegenheit = formular.feld('gelegenheit')
  const begruendung = formular.feld('begruendung')
  const stelle = formular.feld('ausgebendeStelle')
  const hologramm = formular.feld('hologrammnummer')
  const nummerPflicht = werte.wahl === 'nummer'

  return (
    <form className="grid max-w-reading gap-6" onSubmit={absenden} noValidate>
      {formular.versucht && formular.fehlerListe.length >= 2 && (
        <Fehlerzusammenfassung
          fehler={formular.fehlerListe.map((f) => ({
            feldId: f.feldId,
            label: LABEL[f.feld as AusgabeFeld],
            text: f.text,
          }))}
        />
      )}
      {alarm && (
        <Alert variant="destructive">
          <AlertDescription>{alarm}</AlertDescription>
        </Alert>
      )}

      <FormularAbschnitt titel="Exemplar">
        <RadioGroup aria-label="Exemplar" value={werte.wahl} onValueChange={aendereWahl} className="gap-0">
          <label className={WAHL_KLASSEN}>
            <RadioGroupItem value="naechste" />
            Nächstes freies Exemplar
          </label>
          <label className={WAHL_KLASSEN}>
            <RadioGroupItem value="nummer" />
            Bestimmte Nummer
          </label>
        </RadioGroup>
        <Formularfeld
          label={LABEL.exemplarNummer}
          pflicht={nummerPflicht}
          hilfetext={`Zwischen 1 und ${formatiereZahl(auflage)}.`}
          id={nummer.id}
          fehler={nummer.fehler}
          onBlur={nummer.onBlur}
          className="pl-7"
        >
          {(feld) => (
            <Input
              {...feld}
              type="number"
              inputMode="numeric"
              min={1}
              max={auflage}
              className="w-40"
              disabled={!nummerPflicht}
              value={nummer.value}
              onChange={nummer.onChange}
            />
          )}
        </Formularfeld>
      </FormularAbschnitt>

      <FormularAbschnitt titel="Empfänger" spalten={2}>
        <Formularfeld
          label={LABEL.empfaengerName}
          pflicht
          id={name.id}
          fehler={name.fehler}
          onBlur={name.onBlur}
          className="md:col-span-2"
        >
          {(feld) => <Input {...feld} type="text" maxLength={200} value={name.value} onChange={name.onChange} />}
        </Formularfeld>
        <Formularfeld
          label={LABEL.empfaengerDienstgrad}
          id={dienstgrad.id}
          fehler={dienstgrad.fehler}
          onBlur={dienstgrad.onBlur}
        >
          {(feld) => (
            <Input {...feld} type="text" maxLength={100} value={dienstgrad.value} onChange={dienstgrad.onChange} />
          )}
        </Formularfeld>
        <Formularfeld
          label={LABEL.empfaengerDienststelle}
          id={dienststelle.id}
          fehler={dienststelle.fehler}
          onBlur={dienststelle.onBlur}
        >
          {(feld) => (
            <Input {...feld} type="text" maxLength={200} value={dienststelle.value} onChange={dienststelle.onChange} />
          )}
        </Formularfeld>
      </FormularAbschnitt>

      <FormularAbschnitt titel="Ausgabe" spalten={2}>
        <Formularfeld label={LABEL.datum} pflicht id={datum.id} fehler={datum.fehler} onBlur={datum.onBlur}>
          {(feld) => (
            <Input {...feld} type="date" max={heute} className="w-48" value={datum.value} onChange={datum.onChange} />
          )}
        </Formularfeld>
        <Formularfeld
          label={LABEL.gelegenheit}
          pflicht
          hilfetext={HINWEIS_GELEGENHEIT}
          id={gelegenheit.id}
          fehler={gelegenheit.fehler}
          onBlur={gelegenheit.onBlur}
        >
          {(feld) => (
            <Input {...feld} type="text" maxLength={200} value={gelegenheit.value} onChange={gelegenheit.onChange} />
          )}
        </Formularfeld>
        <Formularfeld
          label={LABEL.begruendung}
          pflicht
          id={begruendung.id}
          fehler={begruendung.fehler}
          onBlur={begruendung.onBlur}
          className="md:col-span-2"
        >
          {(feld) => (
            <Textarea {...feld} rows={4} maxLength={2000} value={begruendung.value} onChange={begruendung.onChange} />
          )}
        </Formularfeld>
        <Formularfeld
          label={LABEL.ausgebendeStelle}
          pflicht
          id={stelle.id}
          fehler={stelle.fehler}
          onBlur={stelle.onBlur}
          className="md:col-span-2"
        >
          {(feld) => <Input {...feld} type="text" maxLength={200} value={stelle.value} onChange={stelle.onChange} />}
        </Formularfeld>
      </FormularAbschnitt>

      <FormularAbschnitt titel="Zertifikat">
        <Formularfeld
          label={LABEL.hologrammnummer}
          hilfetext={HINWEIS_HOLOGRAMM}
          id={hologramm.id}
          fehler={hologramm.fehler}
          onBlur={hologramm.onBlur}
        >
          {(feld) => (
            <Input
              {...feld}
              type="text"
              maxLength={HOLOGRAMMNUMMER_MAX}
              autoComplete="off"
              spellCheck={false}
              value={hologramm.value ?? ''}
              onChange={hologramm.onChange}
            />
          )}
        </Formularfeld>
      </FormularAbschnitt>

      <Aktionsleiste>
        {abbrechen}
        <Button type="submit" laedt={sendet}>
          Ausgabe speichern
        </Button>
      </Aktionsleiste>
    </form>
  )
}
