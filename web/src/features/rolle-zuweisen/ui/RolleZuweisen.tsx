import { useRef, useState } from 'react'
import { aenderungFehlertext, ROLLEN_ANZEIGE, type BenutzerEintrag, type Rolle } from '@/entities/benutzer'
import { useSendeSperre } from '@/shared/lib/formular'
import { Bestaetigungsdialog } from '@/shared/ui/bestaetigungsdialog'
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
  // Zuletzt gewählte Rolle für den Dialogtext, auch während er sich schließt.
  const [angezeigt, setAngezeigt] = useState<Rolle | null>(null)
  // Synchroner Schutz gegen Mehrfachsendung (AK-49): Zwei Klicks vor dem nächsten Rendern sehen den State noch nicht.
  const { sendet, mitSperre } = useSendeSperre()
  const ausloeser = useRef<HTMLButtonElement>(null)

  function waehle(wert: Rolle | null) {
    if (wert && wert !== benutzer.rolle) {
      setNeu(wert)
      setAngezeigt(wert)
    }
  }

  function offenGeaendert(offen: boolean) {
    // Escape, „Abbrechen“ und Klick außerhalb schließen während der Anfrage nicht (AK-48, Bestaetigungsdialog).
    if (!offen) setNeu(null)
  }

  function bestaetigen() {
    const rolle = neu
    if (!rolle) return
    void mitSperre(async () => {
      const ergebnis = await weiseRolleZu(benutzer.id, rolle)
      setNeu(null)
      if (ergebnis.art === 'ok') onGeaendert(ergebnis.daten)
      else onFehler(aenderungFehlertext(ergebnis))
    })
  }

  return (
    <>
      <Select<Rolle> items={EINTRAEGE} value={neu ?? benutzer.rolle} onValueChange={waehle} disabled={deaktiviert}>
        <SelectTrigger
          ref={ausloeser}
          aria-label={`Rolle von ${benutzer.name}`}
          aria-describedby={beschreibungId}
          className="min-w-36 xl:min-w-40"
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

      <Bestaetigungsdialog
        offen={neu !== null}
        onOffenAendern={offenGeaendert}
        titel="Rolle ändern?"
        folge={`Rolle von ${benutzer.name}: ${ROLLEN_ANZEIGE[benutzer.rolle]} → ${angezeigt ? ROLLEN_ANZEIGE[angezeigt] : ''}`}
        bestaetigen="Rolle ändern"
        variante="primaer"
        laedt={sendet}
        ladeText="Änderung wird gespeichert …"
        onBestaetigen={bestaetigen}
        ausloeserRef={ausloeser}
      />
    </>
  )
}
