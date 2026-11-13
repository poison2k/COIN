import { RotateCcwIcon } from 'lucide-react'
import { ROLLEN_ANZEIGE, type Benutzer } from '@/entities/benutzer'
import { AbmeldenButton, AnmeldenButton } from '@/features/anmeldung'
import { Button } from '@/shared/ui/button'

/** Anmeldezustand für die Kopfzeile (AK-30, AK-32). */
export type BenutzerZustand =
  | { art: 'pruefe' }
  | { art: 'nichtKonfiguriert' }
  | { art: 'anonym' }
  | { art: 'angemeldet'; benutzer: Benutzer }
  /** Angemeldet, aber das Konto ist deaktiviert (403 benutzer_deaktiviert auf /api/me, AK-32). */
  | { art: 'deaktiviert' }
  | { art: 'fehler'; erneutVersuchen: () => void }

/**
 * Name und Rolle des angemeldeten Benutzers (design-fundament, Abschnitt 6.3, AK-31). Ab 640 px sichtbar, darunter nur
 * für Screenreader. Die Rolle ist reine Anzeige (ROLLEN_ANZEIGE), nie Grundlage für Sichtbarkeit.
 */
function NameUndRolle({ benutzer }: { benutzer: Benutzer }) {
  return (
    <span className="sr-only min-w-0 sm:not-sr-only sm:flex sm:max-w-48 sm:flex-col sm:items-end sm:text-right">
      <span className="truncate text-sm font-medium">
        <span className="sr-only">Angemeldet als </span>
        {benutzer.name}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        <span className="sr-only">, Rolle: </span>
        {ROLLEN_ANZEIGE[benutzer.rolle]}
      </span>
    </span>
  )
}

/** Anmeldebereich der Kopfzeile. Während der Prüfung bleibt er leer, die Seite wird trotzdem angezeigt. */
export function AnmeldeBereich({ zustand }: { zustand: BenutzerZustand }) {
  switch (zustand.art) {
    case 'pruefe':
      return null
    case 'nichtKonfiguriert':
    case 'anonym':
      return <AnmeldenButton />
    case 'angemeldet':
      return (
        <div className="flex min-w-0 items-center gap-2">
          <NameUndRolle benutzer={zustand.benutzer} />
          <AbmeldenButton variant="ghost" />
        </div>
      )
    case 'deaktiviert':
      // Kein Name: /api/me liefert für Deaktivierte keine Benutzerdaten (AK-32).
      return <AbmeldenButton variant="ghost" />
    case 'fehler':
      return (
        <div role="alert" className="flex min-w-0 items-center gap-2 text-sm text-destructive">
          <span className="min-w-0 truncate">Ihre Anmeldung konnte nicht geprüft werden.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-foreground"
            onClick={zustand.erneutVersuchen}
          >
            <RotateCcwIcon aria-hidden="true" />
            Erneut versuchen
          </Button>
        </div>
      )
  }
}
