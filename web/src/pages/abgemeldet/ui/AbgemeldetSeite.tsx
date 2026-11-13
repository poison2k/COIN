import { Link } from '@tanstack/react-router'
import { AnmeldenButton } from '@/features/anmeldung'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Seitenkopf } from '@/shared/ui/seitenkopf'

/** Seite „Abgemeldet“ (/abgemeldet), Ziel nach dem Abmelden beim Identitätsanbieter (AK-31). */
export function AbgemeldetSeite() {
  return (
    <div className="grid min-w-0 gap-6">
      <Seitenkopf titel="Abgemeldet" />
      <Card className="max-w-reading">
        <CardContent className="grid justify-items-start gap-4">
          <p>Sie wurden abgemeldet.</p>
          <div className="flex flex-wrap items-center gap-2">
            <AnmeldenButton beschriftung="Erneut anmelden" ziel={ROUTEN.start} />
            <Link to={ROUTEN.coinListe} className={buttonVariants({ variant: 'outline' })}>
              Zum Coin-Katalog
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
