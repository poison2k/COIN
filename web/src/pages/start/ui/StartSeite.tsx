import { Link } from '@tanstack/react-router'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'

/** Startseite (/) mit Begrüßung und Einstieg in den Katalog (AK-13, katalog-seiten AK-25). */
export function StartSeite() {
  return (
    <div className="mx-auto grid w-full max-w-5xl justify-items-start gap-4 p-6">
      <h1 className="text-2xl font-semibold">Willkommen bei C.O.I.N.</h1>
      <p className="text-muted-foreground">
        C.O.I.N. verwaltet die Gedenk-Coins der Bundeswehr: den Katalog der Coins, ihre nummerierten Exemplare und die
        Echtheitszertifikate.
      </p>
      <Link to={ROUTEN.coinListe} className={buttonVariants()}>
        Zum Katalog
      </Link>
    </div>
  )
}
