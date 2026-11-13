import { Link } from '@tanstack/react-router'
import { CoinFormular, type CoinFormularProps } from '@/features/coin-anlegen'
import { StandardvorlageHerunterladen } from '@/features/standardvorlage-herunterladen'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Seitenkopf } from '@/shared/ui/seitenkopf'

export type CoinAnlegenSeiteProps = Pick<CoinFormularProps, 'onAngelegt'>

/**
 * Seite „Coin hinzufügen“ (/coins/neu, katalog-seiten AK-21 bis AK-24): Formular und „Abbrechen“, darunter der
 * Abschnitt „Zertifikatsvorlage“ mit dem Download der Standardvorlage (zertifikatsvorlagen, AK-31). Wohin es nach dem
 * Anlegen geht, entscheidet die Route über `onAngelegt`. Rendert kein eigenes <main>.
 */
export function CoinAnlegenSeite({ onAngelegt }: CoinAnlegenSeiteProps) {
  return (
    <div className="grid min-w-0 gap-6">
      <Seitenkopf titel="Coin hinzufügen" />
      <Card className="max-w-reading">
        <CardContent className="grid gap-6">
          <CoinFormular onAngelegt={onAngelegt} />
          <Link
            to={ROUTEN.coinListe}
            className={buttonVariants({ variant: 'outline', className: 'justify-self-start' })}
          >
            Abbrechen
          </Link>
        </CardContent>
      </Card>
      <Card className="max-w-reading">
        <CardContent>
          <section aria-labelledby="coin-anlegen-vorlage" className="grid gap-3">
            <h2 id="coin-anlegen-vorlage" className="text-xl font-semibold">
              Zertifikatsvorlage
            </h2>
            <p>
              Laden Sie die Standardvorlage herunter, um daraus in Word eine Urkunde zu gestalten. Die fertige Vorlage
              laden Sie nach dem Anlegen auf der Seite „Coin bearbeiten“ hoch.
            </p>
            <StandardvorlageHerunterladen />
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
