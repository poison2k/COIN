import { useRef, useState } from 'react'
import { aenderungFehlertext, type BenutzerEintrag } from '@/entities/benutzer'
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

/** Benutzer deaktivieren (mit Bestätigung) oder reaktivieren (ohne Dialog), AK-28. */
export function StatusAendern({ benutzer, deaktiviert, beschreibungId, onGeaendert, onFehler }: StatusAendernProps) {
  const [dialogOffen, setDialogOffen] = useState(false)
  const [sendet, setSendet] = useState(false)
  // Synchroner Schutz gegen Mehrfachsendung (AK-49): Zwei Klicks vor dem nächsten Rendern sehen den State noch nicht.
  const sendetGerade = useRef(false)
  const ausloeser = useRef<HTMLButtonElement>(null)
  const abbrechen = useRef<HTMLButtonElement>(null)

  async function aendern(aktiv: boolean) {
    if (sendetGerade.current) return
    sendetGerade.current = true
    setSendet(true)
    try {
      const ergebnis = await setzeStatus(benutzer.id, aktiv)
      setDialogOffen(false)
      if (ergebnis.art === 'ok') onGeaendert(ergebnis.daten)
      else onFehler(aenderungFehlertext(ergebnis))
    } finally {
      sendetGerade.current = false
      setSendet(false)
    }
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
          if (sendetGerade.current) return
          if (reaktivieren) void aendern(true)
          else setDialogOffen(true)
        }}
      >
        {reaktivieren ? 'Reaktivieren' : 'Deaktivieren'}
      </Button>
      <AlertDialog
        open={dialogOffen}
        onOpenChange={(offen) => {
          // Escape, „Abbrechen“ und Klick außerhalb schließen während der Anfrage nicht (AK-48).
          if (!sendetGerade.current) setDialogOffen(offen)
        }}
      >
        <AlertDialogContent initialFocus={abbrechen} finalFocus={ausloeser} aria-busy={sendet}>
          <AlertDialogHeader>
            <AlertDialogTitle>Benutzer deaktivieren?</AlertDialogTitle>
            <AlertDialogDescription>
              {`${benutzer.name} kann sich danach nicht mehr in C.O.I.N. anmelden. Den öffentlichen Katalog kann er weiterhin sehen.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <p role="status" className="text-sm text-muted-foreground empty:sr-only sm:mr-auto sm:self-center">
              {sendet ? 'Änderung wird gespeichert …' : ''}
            </p>
            <AlertDialogCancel ref={abbrechen} disabled={sendet} focusableWhenDisabled>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              onClick={() => void aendern(false)}
              disabled={sendet}
              focusableWhenDisabled
            >
              Deaktivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
