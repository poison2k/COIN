import { Link } from '@tanstack/react-router'
import { CoinFormular, type CoinFormularProps } from '@/features/coin-anlegen'
import { StandardvorlageHerunterladen } from '@/features/standardvorlage-herunterladen'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'

export type CoinAnlegenSeiteProps = Pick<CoinFormularProps, 'onAngelegt'>

/**
 * Seite „Coin hinzufügen“ (/coins/neu, katalog-seiten AK-21 bis AK-24): Formular und „Abbrechen“, darunter der
 * Abschnitt „Zertifikatsvorlage“ mit dem Download der Standardvorlage (zertifikatsvorlagen, AK-31). Wohin es nach dem
 * Anlegen geht, entscheidet die Route über `onAngelegt`. Rendert kein eigenes <main>.
 */
export function CoinAnlegenSeite({ onAngelegt }: CoinAnlegenSeiteProps) {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-6">
      <h1 className="text-2xl font-semibold">Coin hinzufügen</h1>
      <CoinFormular onAngelegt={onAngelegt} />
      <Link to={ROUTEN.coinListe} className={buttonVariants({ variant: 'outline', className: 'justify-self-start' })}>
        Abbrechen
      </Link>
      <section aria-labelledby="coin-anlegen-vorlage" className="grid max-w-lg gap-3">
        <h2 id="coin-anlegen-vorlage" className="text-lg font-semibold">
          Zertifikatsvorlage
        </h2>
        <p>
          Laden Sie die Standardvorlage herunter, um daraus in Word eine Urkunde zu gestalten. Die fertige Vorlage laden
          Sie nach dem Anlegen auf der Seite „Coin bearbeiten“ hoch.
        </p>
        <StandardvorlageHerunterladen />
      </section>
    </div>
  )
}
