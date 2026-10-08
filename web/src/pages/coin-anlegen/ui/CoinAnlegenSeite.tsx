import { Link } from '@tanstack/react-router'
import { CoinFormular, type CoinFormularProps } from '@/features/coin-anlegen'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'

export type CoinAnlegenSeiteProps = Pick<CoinFormularProps, 'onAngelegt'>

/**
 * Seite „Coin hinzufügen“ (/coins/neu, katalog-seiten AK-21 bis AK-24): Formular und „Abbrechen“. Wohin es nach dem
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
    </div>
  )
}
