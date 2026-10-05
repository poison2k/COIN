import { Link } from '@tanstack/react-router'
import { AnmeldenButton } from '@/features/anmeldung'
import { ROUTEN } from '@/shared/config'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { buttonVariants } from '@/shared/ui/button'

export interface RueckrufSeiteProps {
  zustand: 'laeuft' | 'fehlgeschlagen'
}

/**
 * Rückkehr vom Identitätsanbieter (/anmeldung/rueckruf, AK-32). Ohne App-Shell, stellt daher selbst das <main>.
 * Fehler werden ohne technische Details angezeigt.
 */
export function RueckrufSeite({ zustand }: RueckrufSeiteProps) {
  return (
    <main className="mx-auto grid w-full max-w-2xl justify-items-start gap-4 p-6">
      {zustand === 'laeuft' ? (
        <>
          <h1 className="sr-only">Anmeldung</h1>
          <p role="status">Anmeldung wird abgeschlossen …</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Anmeldung fehlgeschlagen</h1>
          <Alert variant="destructive">
            <AlertDescription>
              Die Anmeldung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap items-center gap-2">
            <AnmeldenButton beschriftung="Erneut anmelden" ziel={ROUTEN.start} />
            <Link to={ROUTEN.coinListe} className={buttonVariants({ variant: 'outline' })}>
              Zum Coin-Katalog
            </Link>
          </div>
        </>
      )}
    </main>
  )
}
