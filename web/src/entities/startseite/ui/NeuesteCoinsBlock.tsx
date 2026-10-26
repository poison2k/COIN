import { Link } from '@tanstack/react-router'
import { ROUTEN } from '@/shared/config'
import type { NeuerCoin } from '../model/types'
import { BlockAbschnitt } from './BlockAbschnitt'
import type { Ebene } from './Ueberschrift'

export interface NeuesteCoinsBlockProps {
  eintraege: NeuerCoin[]
  ebene: Ebene
}

/** „Neueste Coins“ (AK-20): Motivbild dekorativ (48 px), Name als Link, Herausgeber darunter. */
export function NeuesteCoinsBlock({ eintraege, ebene }: NeuesteCoinsBlockProps) {
  return (
    <BlockAbschnitt titel="Neueste Coins" ebene={ebene}>
      {eintraege.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Coins im Katalog.</p>
      ) : (
        <ul className="grid gap-3">
          {eintraege.map((coin) => (
            <li key={coin.id} className="flex items-center gap-3">
              {coin.bildUrl ? (
                <img src={coin.bildUrl} alt="" width={48} height={48} className="size-12 rounded-md object-cover" />
              ) : (
                <span aria-hidden="true" className="size-12 shrink-0 rounded-md bg-muted" />
              )}
              <span className="grid min-w-0">
                <Link
                  to={ROUTEN.coinDetail}
                  params={{ coinId: coin.id }}
                  className="font-medium break-words text-primary underline underline-offset-4"
                >
                  {coin.name}
                </Link>
                <span className="text-sm break-words text-muted-foreground">{coin.herausgeber}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </BlockAbschnitt>
  )
}
