import { UserCheckIcon, UserXIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { aenderungFehlertext, type BenutzerEintrag } from '@/entities/benutzer'
import { useSendeSperre } from '@/shared/lib/formular'
import { Bestaetigungsdialog } from '@/shared/ui/bestaetigungsdialog'
import { Button } from '@/shared/ui/button'
import { setzeStatus } from '../api/status-aendern'

export interface StatusAendernProps {
  benutzer: BenutzerEintrag
  /** Gesperrt, z. B. für das eigene Konto (AK-29). Die eigentliche Prüfung macht das Backend. */
  deaktiviert: boolean
  /** Id eines Elements, das den Button beschreibt (z. B. warum er gesperrt ist). */
  beschreibungId?: string
  onGeaendert: (benutzer: BenutzerEintrag) => void
  onFehler: (meldung: string) => void
}

/**
 * Benutzer deaktivieren (mit Bestätigung über den `Bestaetigungsdialog`, formulare-detailseiten AK-18) oder
 * reaktivieren (ohne Dialog), rollen-benutzerverwaltung AK-28. Texte unverändert (F5).
 */
export function StatusAendern({ benutzer, deaktiviert, beschreibungId, onGeaendert, onFehler }: StatusAendernProps) {
  const [dialogOffen, setDialogOffen] = useState(false)
  // Synchroner Schutz gegen Mehrfachsendung (AK-49): Zwei Klicks vor dem nächsten Rendern sehen den State noch nicht.
  const { sendet, mitSperre, gesperrt } = useSendeSperre()
  const ausloeser = useRef<HTMLButtonElement>(null)

  function aendern(aktiv: boolean) {
    void mitSperre(async () => {
      const ergebnis = await setzeStatus(benutzer.id, aktiv)
      setDialogOffen(false)
      if (ergebnis.art === 'ok') onGeaendert(ergebnis.daten)
      else onFehler(aenderungFehlertext(ergebnis))
    })
  }

  // Ein einziger Button für beide Zustände: Das DOM-Element bleibt nach dem Statuswechsel erhalten und behält den
  // Fokus (AK-35). Während der Anfrage bleibt er fokussierbar (aria-disabled statt disabled), sonst setzt der Browser
  // den Fokus auf body.
  const reaktivieren = !benutzer.aktiv
  return (
    <>
      <Button
        ref={ausloeser}
        type="button"
        variant="outline"
        size="sm"
        aria-label={`${benutzer.name} ${reaktivieren ? 'reaktivieren' : 'deaktivieren'}`}
        aria-describedby={beschreibungId}
        disabled={deaktiviert || sendet}
        focusableWhenDisabled={!deaktiviert}
        className="aria-disabled:opacity-50"
        onClick={() => {
          if (gesperrt()) return
          if (reaktivieren) aendern(true)
          else setDialogOffen(true)
        }}
      >
        {reaktivieren ? <UserCheckIcon aria-hidden="true" /> : <UserXIcon aria-hidden="true" />}
        {/* Neben der Seitenleiste (768–1279 px) nur das Symbol, damit die Benutzertabelle passt (AK-30). */}
        <span className="md:max-xl:sr-only">{reaktivieren ? 'Reaktivieren' : 'Deaktivieren'}</span>
      </Button>
      <Bestaetigungsdialog
        offen={dialogOffen}
        onOffenAendern={setDialogOffen}
        titel="Benutzer deaktivieren?"
        folge={`${benutzer.name} kann sich danach nicht mehr in C.O.I.N. anmelden. Den öffentlichen Katalog kann er weiterhin sehen.`}
        bestaetigen="Deaktivieren"
        variante="gefaehrlich"
        laedt={sendet}
        ladeText="Änderung wird gespeichert …"
        onBestaetigen={() => aendern(false)}
        ausloeserRef={ausloeser}
      />
    </>
  )
}
