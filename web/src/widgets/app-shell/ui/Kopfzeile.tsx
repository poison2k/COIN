import { RotateCcwIcon } from 'lucide-react'
import type { Benutzer } from '@/entities/benutzer'
import { AbmeldenButton, AnmeldenButton } from '@/features/anmeldung'
import { Button } from '@/shared/ui/button'

/** Anmeldezustand für die Kopfzeile (AK-30, AK-32). */
export type BenutzerZustand =
  | { art: 'pruefe' }
  | { art: 'nichtKonfiguriert' }
  | { art: 'anonym' }
  | { art: 'angemeldet'; benutzer: Benutzer }
  | { art: 'fehler'; erneutVersuchen: () => void }

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
          <span className="sr-only text-sm sm:not-sr-only sm:max-w-48 sm:truncate">
            <span className="sr-only">Angemeldet als </span>
            {zustand.benutzer.name}
          </span>
          <AbmeldenButton variant="ghost" />
        </div>
      )
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
