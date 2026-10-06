import { useRef, useState } from 'react'
import { ROLLEN_ANZEIGE, type BenutzerEintrag, type Rolle } from '@/entities/benutzer'
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
import { fehlertext } from '../model/fehlertext'

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
  const ausloeser = useRef<HTMLButtonElement>(null)
  const abbrechen = useRef<HTMLButtonElement>(null)

  function waehle(wert: Rolle | null) {
    if (wert && wert !== benutzer.rolle) setNeu(wert)
  }

  function offenGeaendert(offen: boolean) {
    if (!offen && !sendet) setNeu(null)
  }

  async function bestaetigen() {
    if (!neu || sendet) return
    setSendet(true)
    const ergebnis = await weiseRolleZu(benutzer.id, neu)
    setSendet(false)
    setNeu(null)
    if (ergebnis.art === 'ok') onGeaendert(ergebnis.daten)
    else onFehler(fehlertext(ergebnis))
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
        <AlertDialogContent initialFocus={abbrechen} finalFocus={ausloeser}>
          <AlertDialogHeader>
            <AlertDialogTitle>Rolle ändern?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Rolle von ${benutzer.name}: ${ROLLEN_ANZEIGE[benutzer.rolle]} → ${neu ? ROLLEN_ANZEIGE[neu] : ''}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={abbrechen} disabled={sendet}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction type="button" onClick={bestaetigen} disabled={sendet}>
              Rolle ändern
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
