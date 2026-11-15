import { useRef, useState } from 'react'
import { HOLOGRAMMNUMMER_MAX, pruefeHologrammnummer, type Ausgabe } from '@/entities/ausgabe'
import type { ApiErgebnis } from '@/shared/api'
import { useFormular, useSendeSperre } from '@/shared/lib/formular'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Fehlerzusammenfassung } from '@/shared/ui/fehlerzusammenfassung'
import { Formularfeld } from '@/shared/ui/formularfeld'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { aendereHologrammnummer } from '../api/aendereHologrammnummer'

const GRUND_MAX = 500
const TEXT_NUMMER_FEHLT = 'Bitte eine Hologrammnummer eingeben.'
const TEXT_GRUND_FEHLT = 'Bitte einen Grund für die Korrektur angeben.'
const TEXT_GRUND_ZU_LANG = `Der Grund darf höchstens ${GRUND_MAX} Zeichen lang sein.`
const HINWEIS_NORMALISIERUNG =
  'Kleinbuchstaben werden zu Großbuchstaben. Erlaubt sind A–Z und 0–9, höchstens 40 Zeichen. Die Nummer darf nur einmal vergeben sein.'
const HINWEIS_PERSONEN = 'Bitte keine Personendaten eintragen.'
const HINWEIS_FREI = 'Die bisherige Nummer wird dadurch wieder frei.'
const TEXT_VERGEBEN = 'Diese Hologrammnummer ist bereits vergeben.'
const TEXT_GEAENDERT = 'Die Hologrammnummer wurde inzwischen geändert. Die Seite wurde neu geladen.'
const TEXT_STORNIERT = 'Die Ausgabe wurde inzwischen storniert. Die Hologrammnummer kann nicht mehr geändert werden.'
const TEXT_GESPEICHERT = 'Hologrammnummer gespeichert.'

type Fehlerantwort = Exclude<ApiErgebnis<Ausgabe>, { art: 'ok' }>

function fehlertext(ergebnis: Fehlerantwort): string {
  switch (ergebnis.art) {
    case 'nichtGefunden':
      return 'Die Ausgabe wurde nicht gefunden.'
    case 'keinZugriff':
      return ergebnis.grund === 'deaktiviert'
        ? 'Ihr Benutzerkonto ist deaktiviert.'
        : 'Sie sind nicht berechtigt, die Hologrammnummer zu ändern.'
    case 'nichtAngemeldet':
      return 'Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …'
    case 'validierung':
      return 'Die Eingaben wurden vom Server abgelehnt. Bitte prüfen.'
    default:
      return 'Die Hologrammnummer konnte nicht gespeichert werden. Bitte später erneut versuchen.'
  }
}

interface Werte {
  nummer: string
  grund: string
}

const LABEL: Readonly<Record<keyof Werte, string>> = { nummer: 'Hologrammnummer', grund: 'Grund der Korrektur' }

/** Prüfregeln des Dialogs (unverändert, hologrammnummer AK-27): Nummer Pflicht, bei Korrektur auch der Grund. */
function pruefeEingaben(werte: Werte, bisherige: string | null): Partial<Record<keyof Werte, string>> {
  const fehler: Partial<Record<keyof Werte, string>> = {}
  const pruefung = pruefeHologrammnummer(werte.nummer)
  if (pruefung.art !== 'ok') {
    fehler.nummer = pruefung.art === 'fehler' ? pruefung.meldung : TEXT_NUMMER_FEHLT
  }
  if (bisherige !== null) {
    // Gleiche Normalform wie bisher: Der Server antwortet 200 ohne Änderung, ein Grund ist dann nicht nötig.
    const aktuell = pruefeHologrammnummer(bisherige)
    const unveraendert = pruefung.art === 'ok' && aktuell.art === 'ok' && aktuell.normalform === pruefung.normalform
    const grund = werte.grund.trim()
    if (!unveraendert && grund === '') fehler.grund = TEXT_GRUND_FEHLT
    else if (!unveraendert && grund.length > GRUND_MAX) fehler.grund = TEXT_GRUND_ZU_LANG
  }
  return fehler
}

export interface HologrammnummerAendernProps {
  coinId: string
  ausgabe: Ausgabe
  /** Nach 200 mit der Ausgabe aus der Antwort. */
  onGeaendert: (ausgabe: Ausgabe) => void
  /** Nach 409 `hologrammnummer_geaendert` oder `ausgabe_storniert`: der Aufrufer lädt die Ausgabe neu. */
  onNeuLaden: () => void
}

/**
 * Button „Hologrammnummer ergänzen“ bzw. „Hologrammnummer korrigieren“ mit Dialog (hologrammnummer AK-27): Pflichtfeld
 * „Hologrammnummer“ (vorbelegt), bei einer Korrektur Pflichtfeld „Grund der Korrektur“ mit Hinweisen. Speichern sendet
 * die gesehene Nummer als `bisherige`. Bei einer stornierten Ausgabe gibt es keinen Button; Entfernen gibt es nicht (H5).
 * Die Statusmeldung nach dem Speichern und Alarme nach einem Neuladen stehen außerhalb des Dialogs.
 */
export function HologrammnummerAendern({ coinId, ausgabe, onGeaendert, onNeuLaden }: HologrammnummerAendernProps) {
  const korrektur = ausgabe.hologrammnummer !== null
  const titel = korrektur ? 'Hologrammnummer korrigieren' : 'Hologrammnummer ergänzen'
  const [offen, setOffen] = useState(false)
  const [dialogAlarm, setDialogAlarm] = useState<string | null>(null)
  const [alarm, setAlarm] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const { sendet, mitSperre, gesperrt } = useSendeSperre()
  const ausloeser = useRef<HTMLButtonElement>(null)
  const nummerFeld = useRef<HTMLInputElement>(null)
  const bisherige = ausgabe.hologrammnummer
  const formular = useFormular<Werte>({
    ausgangswerte: { nummer: bisherige ?? '', grund: '' },
    pruefe: (werte) => pruefeEingaben(werte, bisherige),
    reihenfolge: ['nummer', 'grund'],
  })

  function oeffnen() {
    formular.zuruecksetzen({ nummer: bisherige ?? '', grund: '' })
    setDialogAlarm(null)
    setAlarm(null)
    setStatus('')
    setOffen(true)
  }

  const speichern = formular.absenden((werte) =>
    mitSperre(async () => {
      setDialogAlarm(null)
      const pruefung = pruefeHologrammnummer(werte.nummer)
      if (pruefung.art !== 'ok') return
      const grundText = werte.grund.trim()
      const ergebnis = await aendereHologrammnummer(coinId, ausgabe.id, {
        hologrammnummer: pruefung.anzeige,
        grund: korrektur && grundText !== '' ? grundText : null,
        bisherige,
      })
      if (ergebnis.art === 'ok') {
        setOffen(false)
        setStatus(TEXT_GESPEICHERT)
        onGeaendert(ergebnis.daten)
        return
      }
      if (ergebnis.art === 'konflikt' && ergebnis.code === 'hologrammnummer_vergeben') {
        formular.setzeServerFehler({ nummer: TEXT_VERGEBEN })
        return
      }
      if (
        ergebnis.art === 'konflikt' &&
        (ergebnis.code === 'hologrammnummer_geaendert' || ergebnis.code === 'ausgabe_storniert')
      ) {
        setOffen(false)
        setAlarm(ergebnis.code === 'ausgabe_storniert' ? TEXT_STORNIERT : TEXT_GEAENDERT)
        onNeuLaden()
        return
      }
      if (ergebnis.art === 'validierung') {
        const nummerMeldung = ergebnis.fehler.hologrammnummer?.join(' ')
        const grundMeldung = ergebnis.fehler.grund?.join(' ')
        if (nummerMeldung) {
          formular.setzeServerFehler({ nummer: nummerMeldung })
          return
        }
        if (grundMeldung && korrektur) {
          formular.setzeServerFehler({ grund: grundMeldung })
          return
        }
      }
      setDialogAlarm(fehlertext(ergebnis))
    }),
  )

  const nummer = formular.feld('nummer')
  const grund = formular.feld('grund')
  const storniert = ausgabe.storno !== null

  return (
    <div className="grid justify-items-start gap-2">
      {!storniert && (
        <Button ref={ausloeser} type="button" variant="outline" onClick={oeffnen}>
          {titel}
        </Button>
      )}
      <p role="status" className="text-sm">
        {status}
      </p>
      {alarm && (
        <p role="alert" className="text-sm text-destructive">
          {alarm}
        </p>
      )}
      <Dialog
        open={offen}
        onOpenChange={(neu) => {
          // Während der Anfrage nicht schließen.
          if (gesperrt()) return
          setOffen(neu)
        }}
      >
        <DialogContent initialFocus={nummerFeld} finalFocus={ausloeser} aria-busy={sendet}>
          <DialogHeader>
            <DialogTitle>{titel}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" noValidate onSubmit={speichern}>
            {formular.versucht && formular.fehlerListe.length >= 2 && (
              <Fehlerzusammenfassung
                fehler={formular.fehlerListe.map((f) => ({ feldId: f.feldId, label: LABEL[f.feld], text: f.text }))}
              />
            )}
            <Formularfeld
              label={LABEL.nummer}
              pflicht
              hilfetext={HINWEIS_NORMALISIERUNG}
              id={nummer.id}
              fehler={nummer.fehler}
              onBlur={nummer.onBlur}
            >
              {(feld) => (
                <Input
                  {...feld}
                  ref={nummerFeld}
                  type="text"
                  maxLength={HOLOGRAMMNUMMER_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  value={nummer.value}
                  onChange={nummer.onChange}
                />
              )}
            </Formularfeld>
            {korrektur && (
              <Formularfeld
                label={LABEL.grund}
                pflicht
                hilfetext={
                  <>
                    <span className="block">{HINWEIS_PERSONEN}</span>
                    <span className="block">{HINWEIS_FREI}</span>
                  </>
                }
                id={grund.id}
                fehler={grund.fehler}
                onBlur={grund.onBlur}
              >
                {(feld) => (
                  <Textarea {...feld} rows={3} maxLength={GRUND_MAX} value={grund.value} onChange={grund.onChange} />
                )}
              </Formularfeld>
            )}
            {dialogAlarm && (
              <p role="alert" className="text-sm text-destructive">
                {dialogAlarm}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={sendet} focusableWhenDisabled />}>
                Abbrechen
              </DialogClose>
              <Button type="submit" laedt={sendet}>
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
