import { Link } from '@tanstack/react-router'
import type { Benutzer } from '@/entities/benutzer'
import { AbmeldenButton } from '@/features/anmeldung'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'

export interface KeinZugriffSeiteProps {
  benutzer: Benutzer
}

/** Seite „Kein Zugriff“ (/kein-zugriff): angemeldet, aber noch ohne Rolle (AK-29). Rendert kein eigenes <main>. */
export function KeinZugriffSeite({ benutzer }: KeinZugriffSeiteProps) {
  return (
    <div className="mx-auto grid w-full max-w-5xl p-6">
      <Card className="max-w-2xl">
        <CardContent className="grid justify-items-start gap-4">
          <h1 className="text-2xl font-semibold">Kein Zugriff</h1>
          <p>
            Sie sind als {benutzer.name} angemeldet, Ihrem Konto ist aber noch keine Rolle zugewiesen. Den Coin-Katalog
            können Sie weiterhin ansehen. Für weitere Funktionen wenden Sie sich bitte an einen Administrator.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to={ROUTEN.coinListe} className={buttonVariants()}>
              Zum Coin-Katalog
            </Link>
            <AbmeldenButton />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
