import { useRef, useState } from 'react'
import { aenderungFehlertext, ROLLEN_ANZEIGE, type BenutzerEintrag, type Rolle } from '@/entities/benutzer'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { weiseRolleZu } from '../api/rolle-zuweisen'

const ROLLEN: readonly Rolle[] = ['Administrator', 'Sachbearbeiter', 'Betrachter', 'keine']
const EINTRAEGE = ROLLEN.map((rolle) => ({ value: rolle, label: ROLLEN_ANZEIGE[rolle] }))

export interface RolleZuweisenProps {
  benutzer: BenutzerEintrag
  /** Gesperrt, z. B. für das eigene Konto (AK-29). Die eigentliche Prüfung macht das Backend. */
  deaktiviert: boolean
  /** Id eines Elements, das die Auswahl beschreibt (z. B. warum sie gesperrt ist). */
  beschreibungId?: string
  onGeaendert: (benutzer: BenutzerEintrag) => void
  onFehler: (meldung: string) => void
}

/**
 * Rolle eines Benutzers ändern (AK-27): Auswahl je Zeile, danach Bestätigung im Dialog. Abbrechen oder Escape setzen
 * die Auswahl zurück und senden nichts; der Fokus kehrt zur Auswahl zurück.
 */
export function RolleZuweisen({ benutzer, deaktiviert, beschreibungId, onGeaendert, onFehler }: RolleZuweisenProps) {
  const [neu, setNeu] = useState<Rolle | null>(null)
  const [sendet, setSendet] = useState(false)
  // Synchroner Schutz gegen Mehrfachsendung (AK-49): Zwei Klicks vor dem nächsten Rendern sehen den State noch nicht.
  const sendetGerade = useRef(false)
  const ausloeser = useRef<HTMLButtonElement>(null)
  const abbrechen = useRef<HTMLButtonElement>(null)

  function waehle(wert: Rolle | null) {
    if (wert && wert !== benutzer.rolle) setNeu(wert)
  }

  function offenGeaendert(offen: boolean) {
    // Escape, „Abbrechen“ und Klick außerhalb schließen während der Anfrage nicht (AK-48).
    if (!offen && !sendetGerade.current) setNeu(null)
  }

  async function bestaetigen() {
    if (!neu || sendetGerade.current) return
    sendetGerade.current = true
    setSendet(true)
    try {
      const ergebnis = await weiseRolleZu(benutzer.id, neu)
      setNeu(null)
      if (ergebnis.art === 'ok') onGeaendert(ergebnis.daten)
      else onFehler(aenderungFehlertext(ergebnis))
    } finally {
      sendetGerade.current = false
      setSendet(false)
    }
  }

  return (
    <>
      <Select<Rolle> items={EINTRAEGE} value={neu ?? benutzer.rolle} onValueChange={waehle} disabled={deaktiviert}>
        <SelectTrigger
          ref={ausloeser}
          aria-label={`Rolle von ${benutzer.name}`}
          aria-describedby={beschreibungId}
          className="min-w-40"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EINTRAEGE.map((eintrag) => (
            <SelectItem key={eintrag.value} value={eintrag.value}>
              {eintrag.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog open={neu !== null} onOpenChange={offenGeaendert}>
        <AlertDialogContent initialFocus={abbrechen} finalFocus={ausloeser} aria-busy={sendet}>
          <AlertDialogHeader>
            <AlertDialogTitle>Rolle ändern?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Rolle von ${benutzer.name}: ${ROLLEN_ANZEIGE[benutzer.rolle]} → ${neu ? ROLLEN_ANZEIGE[neu] : ''}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <p role="status" className="text-sm text-muted-foreground empty:sr-only sm:mr-auto sm:self-center">
              {sendet ? 'Änderung wird gespeichert …' : ''}
            </p>
            <AlertDialogCancel ref={abbrechen} disabled={sendet} focusableWhenDisabled>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction type="button" onClick={() => void bestaetigen()} disabled={sendet} focusableWhenDisabled>
              Rolle ändern
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
