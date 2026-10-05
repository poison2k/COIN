import { Link } from '@tanstack/react-router'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'

// Deutsche Not-Found- und Fehlerkomponente des Routers (AK-17).

export function NichtGefunden() {
  return (
    <div className="mx-auto grid w-full max-w-5xl justify-items-start gap-4 p-6">
      <p>Seite nicht gefunden.</p>
      <Link to={ROUTEN.start} className={buttonVariants({ variant: 'outline' })}>
        Zur Startseite
      </Link>
    </div>
  )
}

/** Zeigt bewusst keine Fehlermeldung oder technischen Details an. */
export function Fehler() {
  return (
    <div role="alert" className="mx-auto grid w-full max-w-5xl justify-items-start gap-4 p-6">
      <p>Es ist ein unerwarteter Fehler aufgetreten. Bitte die Seite neu laden.</p>
      <Link to={ROUTEN.start} className={buttonVariants({ variant: 'outline' })}>
        Zur Startseite
      </Link>
    </div>
  )
}
