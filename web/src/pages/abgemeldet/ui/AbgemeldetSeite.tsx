import { Link } from '@tanstack/react-router'
import { AnmeldenButton } from '@/features/anmeldung'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'

/** Seite „Abgemeldet“ (/abgemeldet), Ziel nach dem Abmelden beim Identitätsanbieter (AK-31). */
export function AbgemeldetSeite() {
  return (
    <div className="mx-auto grid w-full max-w-5xl p-6">
      <Card className="max-w-2xl">
        <CardContent className="grid justify-items-start gap-4">
          <h1 className="text-2xl font-semibold">Abgemeldet</h1>
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
