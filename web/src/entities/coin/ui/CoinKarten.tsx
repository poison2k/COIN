import { Link } from '@tanstack/react-router'
import { ImageOffIcon } from 'lucide-react'
import { ROUTEN } from '@/shared/config'
import { useZeilenklick } from '@/shared/lib/hooks'
import { Badge } from '@/shared/ui/badge'
import type { Coin } from '../model/types'
import { formatiereAuflage, formatiereDatum } from './format'

export interface CoinKartenProps {
  coins: Coin[]
}

/**
 * Kartenansicht des Katalogs (startseite-listen-pruefung, Abschnitt 4.2, AK-15): Liste „Coins“ mit einer Karte je Coin
 * in API-Reihenfolge. Ein Mausklick in die Karte öffnet die Detailseite über den Link (`useZeilenklick`); Tab-Stopp je
 * Karte ist nur der Link. Spalten nach der Breite der Liste (Container-Query): 1, 2, 3, 4.
 */
export function CoinKarten({ coins }: CoinKartenProps) {
  const { zeileGeklickt, linkGeklickt } = useZeilenklick()
  return (
    <div className="@container">
      <ul aria-label="Coins" className="grid gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
        {coins.map((coin) => (
          <li
            key={coin.id}
            className="flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-sm text-card-foreground shadow-xs"
            onClick={zeileGeklickt}
          >
            <div className="flex aspect-square items-center justify-center border-b bg-muted p-4">
              {coin.bildUrl ? (
                <img
                  className="size-full object-contain"
                  src={coin.bildUrl}
                  alt={`Motiv: ${coin.name}`}
                  loading="lazy"
                  width={256}
                  height={256}
                />
              ) : (
                <span className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOffIcon aria-hidden="true" className="size-8" />
                  Kein Bild
                </span>
              )}
            </div>
            <div className="grid min-w-0 gap-2 p-4">
              <h3 className="text-base font-semibold break-words">
                <Link
                  to={ROUTEN.coinDetail}
                  params={{ coinId: coin.id }}
                  onClick={linkGeklickt}
                  className="inline-flex min-h-10 items-center rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
                >
                  {coin.name}
                </Link>
              </h3>
              <p className="break-words text-muted-foreground">{coin.herausgeber}</p>
              <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1">
                <div className="col-span-2 grid grid-cols-subgrid">
                  <dt className="text-muted-foreground">Auflage</dt>
                  <dd className="tabular-nums">{formatiereAuflage(coin.auflage)}</dd>
                </div>
                <div className="col-span-2 grid grid-cols-subgrid">
                  <dt className="text-muted-foreground">Erfasst am</dt>
                  <dd className="tabular-nums">{formatiereDatum(coin.erstelltAm)}</dd>
                </div>
              </dl>
              {coin.auflage === null && (
                <div>
                  <Badge variant="warning">Auflage unbekannt</Badge>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
