import { useId, useRef, useState } from 'react'
import type { Ausgabe } from '@/entities/ausgabe'
import type { ApiErgebnis } from '@/shared/api'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import { storniereAusgabe } from '../api/storniereAusgabe'

const GRUND_MAX = 500
const TEXT_GRUND_FEHLT = 'Bitte einen Grund für das Storno angeben.'
const TEXT_HINWEIS = 'Bitte keine Personendaten in den Grund schreiben.'

function fehlertext(ergebnis: Exclude<ApiErgebnis<Ausgabe>, { art: 'ok' }>): string {
  switch (ergebnis.art) {
    case 'konflikt':
      return 'Diese Ausgabe ist bereits storniert.'
    case 'nichtGefunden':
      return 'Die Ausgabe wurde nicht gefunden.'
    case 'keinZugriff':
      return ergebnis.grund === 'deaktiviert'
        ? 'Ihr Benutzerkonto ist deaktiviert.'
        : 'Sie sind nicht berechtigt, Ausgaben zu stornieren.'
    case 'nichtAngemeldet':
      return 'Ihre Anmeldung ist abgelaufen. Sie werden zur Anmeldung weitergeleitet …'
    case 'validierung':
      return ergebnis.fehler.grund?.join(' ') ?? 'Die Eingabe wurde vom Server abgelehnt.'
    default:
      return 'Die Ausgabe konnte nicht storniert werden. Bitte später erneut versuchen.'
  }
}

export interface AusgabeStornierenProps {
  coinId: string
  ausgabe: Ausgabe
  /** Nach 200 mit der stornierten Ausgabe. Den Fokus übernimmt danach der Aufrufer (z. B. eine Statusmeldung). */
  onStorniert: (ausgabe: Ausgabe) => void
  /** Nach einem Fehler (z. B. 409), damit der Aufrufer neu laden kann. */
  onFehler?: () => void
  /** Der Dialog wurde ohne Storno geschlossen (Abbrechen, Escape). */
  onGeschlossen?: () => void
}

/**
 * Button „Stornieren“ mit Bestätigungsdialog und Pflichtfeld „Grund“ (coin-ausgaben AK-24). Der Hinweis „keine
 * Personendaten“ ist per `aria-describedby` mit dem Feld verbunden (F6).
 */
export function AusgabeStornieren({ coinId, ausgabe, onStorniert, onFehler, onGeschlossen }: AusgabeStornierenProps) {
  const [offen, setOffen] = useState(false)
  const [grund, setGrund] = useState('')
  const [feldFehler, setFeldFehler] = useState<string | null>(null)
  const [alarm, setAlarm] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)
  // Synchroner Schutz gegen Mehrfachsendung: Zwei Klicks vor dem nächsten Rendern sehen den State noch nicht.
  const sendetGerade = useRef(false)
  // Nach Erfolg gibt der Dialog den Fokus nicht an den (dann entfernten) Button zurück.
  const erfolgreich = useRef(false)
  const ausloeser = useRef<HTMLButtonElement>(null)
  const feld = useRef<HTMLTextAreaElement>(null)
  const basis = useId()
  const formularId = `${basis}-formular`
  const feldId = `${basis}-grund`
  const hinweisId = `${basis}-hinweis`
  const fehlerId = `${basis}-fehler`

  function oeffnen() {
    erfolgreich.current = false
    setGrund('')
    setFeldFehler(null)
    setAlarm(null)
    setOffen(true)
  }

  async function stornieren() {
    if (sendetGerade.current) return
    const text = grund.trim()
    if (text === '') {
      setFeldFehler(TEXT_GRUND_FEHLT)
      feld.current?.focus()
      return
    }

    sendetGerade.current = true
    setSendet(true)
    setAlarm(null)
    setFeldFehler(null)
    try {
      const ergebnis = await storniereAusgabe(coinId, ausgabe.id, text)
      if (ergebnis.art === 'ok') {
        erfolgreich.current = true
        setOffen(false)
        onStorniert(ergebnis.daten)
        return
      }
      setAlarm(fehlertext(ergebnis))
      onFehler?.()
    } finally {
      sendetGerade.current = false
      setSendet(false)
    }
  }

  const beschreibung = [hinweisId, feldFehler ? fehlerId : undefined].filter(Boolean).join(' ')

  return (
    <>
      <Button
        ref={ausloeser}
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Ausgabe von Exemplar Nr. ${ausgabe.exemplarNummer} stornieren`}
        onClick={oeffnen}
      >
        Stornieren
      </Button>
      <AlertDialog
        open={offen}
        onOpenChange={(neu) => {
          // Escape und „Abbrechen“ schließen während der Anfrage nicht.
          if (sendetGerade.current) return
          setOffen(neu)
          if (!neu) onGeschlossen?.()
        }}
      >
        <AlertDialogContent
          initialFocus={feld}
          finalFocus={() => (erfolgreich.current ? false : ausloeser.current)}
          aria-busy={sendet}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Ausgabe stornieren?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Die Ausgabe von Exemplar Nr. ${ausgabe.exemplarNummer} bleibt in der Historie sichtbar. Das Exemplar ist danach wieder verfügbar.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            id={formularId}
            className="grid gap-1.5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void stornieren()
            }}
          >
            <Label htmlFor={feldId}>
              Grund{' '}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
              <span className="sr-only">(Pflichtfeld)</span>
            </Label>
            <Textarea
              ref={feld}
              id={feldId}
              rows={3}
              maxLength={GRUND_MAX}
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
              aria-invalid={feldFehler ? true : undefined}
              aria-describedby={beschreibung}
            />
            <p id={hinweisId} className="text-sm text-muted-foreground">
              {TEXT_HINWEIS}
            </p>
            {feldFehler && (
              <p id={fehlerId} className="text-sm text-destructive">
                {feldFehler}
              </p>
            )}
          </form>
          {alarm && (
            <p role="alert" className="text-sm text-destructive">
              {alarm}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendet} focusableWhenDisabled>
              Abbrechen
            </AlertDialogCancel>
            <Button type="submit" form={formularId} variant="destructive" disabled={sendet} focusableWhenDisabled>
              Stornieren
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
