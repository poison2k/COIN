import { Link } from '@tanstack/react-router'
import type { Benutzer } from '@/entities/benutzer'
import { AbmeldenButton } from '@/features/anmeldung'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'

/** Warum kein Zugriff besteht: noch keine Rolle (AK-29) oder Konto deaktiviert (rollen-benutzerverwaltung, AK-32). */
export type KeinZugriffSeiteProps = { grund?: 'keineRolle'; benutzer: Benutzer } | { grund: 'deaktiviert' }

/** Seite „Kein Zugriff“ (/kein-zugriff). Rendert kein eigenes <main>. */
export function KeinZugriffSeite(props: KeinZugriffSeiteProps) {
  return (
    <div className="mx-auto grid w-full max-w-5xl p-6">
      <Card className="max-w-2xl">
        <CardContent className="grid justify-items-start gap-4">
          <h1 className="text-2xl font-semibold">Kein Zugriff</h1>
          {props.grund === 'deaktiviert' ? (
            <p>
              Ihr Benutzerkonto ist deaktiviert. Den Coin-Katalog können Sie weiterhin ansehen. Wenden Sie sich bei
              Fragen an einen Administrator.
            </p>
          ) : (
            <p>
              Sie sind als {props.benutzer.name} angemeldet, Ihrem Konto ist aber noch keine Rolle zugewiesen. Den
              Coin-Katalog können Sie weiterhin ansehen. Für weitere Funktionen wenden Sie sich bitte an einen
              Administrator.
            </p>
          )}
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
