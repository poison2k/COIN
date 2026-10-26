import { Link } from '@tanstack/react-router'
import { ROUTEN } from '@/shared/config'
import { formatiereZahl } from '@/shared/lib/format'
import type { AusgegebenerCoin } from '../model/types'
import { BlockAbschnitt } from './BlockAbschnitt'
import type { Ebene } from './Ueberschrift'

export interface MeistausgegebeneBlockProps {
  eintraege: AusgegebenerCoin[]
  ebene: Ebene
}

/** „Meistausgegebene Coins“ (AK-20, AK-5) als Rangliste `<ol>` mit „{n} ausgegeben“; nie Empfängerdaten. */
export function MeistausgegebeneBlock({ eintraege, ebene }: MeistausgegebeneBlockProps) {
  return (
    <BlockAbschnitt titel="Meistausgegebene Coins" ebene={ebene}>
      {eintraege.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Coins ausgegeben.</p>
      ) : (
        <ol className="grid list-decimal gap-2 pl-6">
          {eintraege.map((coin) => (
            <li key={coin.id}>
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Link
                  to={ROUTEN.coinDetail}
                  params={{ coinId: coin.id }}
                  className="font-medium break-words text-primary underline underline-offset-4"
                >
                  {coin.name}
                </Link>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {`${formatiereZahl(coin.ausgegeben)} ausgegeben`}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </BlockAbschnitt>
  )
}
