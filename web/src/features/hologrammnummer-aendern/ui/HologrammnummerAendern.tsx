import { useId, useRef, useState, type FormEvent } from 'react'
import { HOLOGRAMMNUMMER_MAX, pruefeHologrammnummer, type Ausgabe } from '@/entities/ausgabe'
import type { ApiErgebnis } from '@/shared/api'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import { aendereHologrammnummer } from '../api/aendereHologrammnummer'

const GRUND_MAX = 500
const TEXT_NUMMER_FEHLT = 'Bitte eine Hologrammnummer eingeben.'
const TEXT_GRUND_FEHLT = 'Bitte einen Grund für die Korrektur angeben.'
const TEXT_GRUND_ZU_LANG = `Der Grund darf höchstens ${GRUND_MAX} Zeichen lang sein.`
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

/** Kennzeichnung eines Pflichtfelds im Label: sichtbar „*“, für Screenreader „(Pflichtfeld)“. */
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
  const [nummer, setNummer] = useState('')
  const [grund, setGrund] = useState('')
  const [nummerFehler, setNummerFehler] = useState<string | null>(null)
  const [grundFehler, setGrundFehler] = useState<string | null>(null)
  const [dialogAlarm, setDialogAlarm] = useState<string | null>(null)
  const [alarm, setAlarm] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [sendet, setSendet] = useState(false)
  // Synchroner Schutz gegen Mehrfachsendung (zwei Enter vor dem nächsten Rendern).
  const sendetGerade = useRef(false)
  const ausloeser = useRef<HTMLButtonElement>(null)
  const nummerFeld = useRef<HTMLInputElement>(null)
  const grundFeld = useRef<HTMLTextAreaElement>(null)
  const basis = useId()
  const nummerId = `${basis}-nummer`
  const nummerFehlerId = `${basis}-nummer-fehler`
  const grundId = `${basis}-grund`
  const grundFehlerId = `${basis}-grund-fehler`
  const hinweisPersonenId = `${basis}-hinweis-personen`
  const hinweisFreiId = `${basis}-hinweis-frei`

  function oeffnen() {
    setNummer(ausgabe.hologrammnummer ?? '')
    setGrund('')
    setNummerFehler(null)
    setGrundFehler(null)
    setDialogAlarm(null)
    setAlarm(null)
    setStatus('')
    setOffen(true)
  }

  function zeigeNummerFehler(text: string) {
    setNummerFehler(text)
    nummerFeld.current?.focus()
  }

  function zeigeGrundFehler(text: string) {
    setGrundFehler(text)
    grundFeld.current?.focus()
  }

  async function speichern(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (sendetGerade.current) return
    setDialogAlarm(null)
    setNummerFehler(null)
    setGrundFehler(null)

    const pruefung = pruefeHologrammnummer(nummer)
    if (pruefung.art !== 'ok') {
      zeigeNummerFehler(pruefung.art === 'fehler' ? pruefung.meldung : TEXT_NUMMER_FEHLT)
      return
    }
    const bisherige = ausgabe.hologrammnummer
    // Gleiche Normalform wie bisher: Der Server antwortet 200 ohne Änderung, ein Grund ist dann nicht nötig.
    const aktuell = bisherige === null ? null : pruefeHologrammnummer(bisherige)
    const unveraendert = aktuell?.art === 'ok' && aktuell.normalform === pruefung.normalform
    const grundText = grund.trim()
    if (korrektur && !unveraendert) {
      if (grundText === '') {
        zeigeGrundFehler(TEXT_GRUND_FEHLT)
        return
      }
      if (grundText.length > GRUND_MAX) {
        zeigeGrundFehler(TEXT_GRUND_ZU_LANG)
        return
      }
    }

    sendetGerade.current = true
    setSendet(true)
    try {
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
        zeigeNummerFehler(TEXT_VERGEBEN)
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
          zeigeNummerFehler(nummerMeldung)
          return
        }
        if (grundMeldung && korrektur) {
          zeigeGrundFehler(grundMeldung)
          return
        }
      }
      setDialogAlarm(fehlertext(ergebnis))
    } finally {
      sendetGerade.current = false
      setSendet(false)
    }
  }

  const nummerBeschreibung = nummerFehler ? nummerFehlerId : undefined
  const grundBeschreibung = [hinweisPersonenId, hinweisFreiId, grundFehler ? grundFehlerId : undefined]
    .filter(Boolean)
    .join(' ')
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
          if (sendetGerade.current) return
          setOffen(neu)
        }}
      >
        <DialogContent initialFocus={nummerFeld} finalFocus={ausloeser} aria-busy={sendet}>
          <DialogHeader>
            <DialogTitle>{titel}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" noValidate onSubmit={(e) => void speichern(e)}>
            <div className="grid gap-1.5">
              <Label htmlFor={nummerId}>
                Hologrammnummer <Pflicht />
              </Label>
              <Input
                ref={nummerFeld}
                id={nummerId}
                type="text"
                maxLength={HOLOGRAMMNUMMER_MAX}
                autoComplete="off"
                spellCheck={false}
                value={nummer}
                onChange={(e) => setNummer(e.target.value)}
                aria-invalid={nummerFehler ? true : undefined}
                aria-describedby={nummerBeschreibung}
              />
              {nummerFehler && (
                <p id={nummerFehlerId} className="text-sm text-destructive">
                  {nummerFehler}
                </p>
              )}
            </div>
            {korrektur && (
              <div className="grid gap-1.5">
                <Label htmlFor={grundId}>
                  Grund der Korrektur <Pflicht />
                </Label>
                <Textarea
                  ref={grundFeld}
                  id={grundId}
                  rows={3}
                  maxLength={GRUND_MAX}
                  value={grund}
                  onChange={(e) => setGrund(e.target.value)}
                  aria-invalid={grundFehler ? true : undefined}
                  aria-describedby={grundBeschreibung}
                />
                <p id={hinweisPersonenId} className="text-sm text-muted-foreground">
                  {HINWEIS_PERSONEN}
                </p>
                <p id={hinweisFreiId} className="text-sm text-muted-foreground">
                  {HINWEIS_FREI}
                </p>
                {grundFehler && (
                  <p id={grundFehlerId} className="text-sm text-destructive">
                    {grundFehler}
                  </p>
                )}
              </div>
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
              <Button type="submit" disabled={sendet} focusableWhenDisabled>
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
