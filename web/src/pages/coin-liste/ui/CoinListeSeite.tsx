import { Link } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'
import { CoinKatalog } from '@/widgets/coin-katalog'

export interface CoinListeSeiteProps {
  /** Suchbegriff aus der URL. */
  suche: string
  /** Seite aus der URL, beginnend bei 1. */
  seite: number
  /** Link „Coin hinzufügen“ anzeigen (nur mit coins.write aus /api/me). */
  darfAnlegen: boolean
  onSuche: (suche: string) => void
  onSeite: (seite: number) => void
}

/**
 * Seite „Katalog“ (/coins) nur zum Ansehen (katalog-seiten, AK-12 bis AK-16): Liste mit Suche und Blättern, mit
 * coins.write zusätzlich der Link „Coin hinzufügen“. Rendert kein eigenes <main>; das Landmark stellt die App-Shell.
 */
export function CoinListeSeite({ suche, seite, darfAnlegen, onSuche, onSeite }: CoinListeSeiteProps) {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Katalog</h1>
        {darfAnlegen && (
          <Link to={ROUTEN.coinNeu} className={buttonVariants()}>
            <PlusIcon aria-hidden="true" />
            Coin hinzufügen
          </Link>
        )}
      </div>
      <CoinKatalog suche={suche} seite={seite} onSuche={onSuche} onSeite={onSeite} />
    </div>
  )
}
