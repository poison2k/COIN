import { Link } from '@tanstack/react-router'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'
import { Fehlerzustand, Leerzustand } from '@/shared/ui/zustaende'

// Deutsche Not-Found- und Fehlerkomponente des Routers (AK-17), als Leer- bzw. Fehlerzustand (design-fundament, AK-35).

export function NichtGefunden() {
  return (
    <Leerzustand
      titel="Seite nicht gefunden."
      titelEbene={1}
      aktion={
        <Link to={ROUTEN.start} className={buttonVariants({ variant: 'outline' })}>
          Zur Startseite
        </Link>
      }
    />
  )
}

/** Zeigt bewusst keine Fehlermeldung oder technischen Details an. */
export function Fehler() {
  return (
    <Fehlerzustand
      meldung="Es ist ein unerwarteter Fehler aufgetreten. Bitte die Seite neu laden."
      aktion={
        <Link to={ROUTEN.start} className={buttonVariants({ variant: 'outline' })}>
          Zur Startseite
        </Link>
      }
    />
  )
}
