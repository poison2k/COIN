import { Link } from '@tanstack/react-router'
import { ROUTEN } from '@/shared/config'
import { formatiereZahl } from '@/shared/lib/format'
import { Rangliste } from '@/shared/ui/rangliste'
import { Leerzustand } from '@/shared/ui/zustaende'
import type { AusgegebenerCoin } from '../model/types'
import { BlockAbschnitt } from './BlockAbschnitt'
import type { Ebene } from './Ueberschrift'

export interface MeistausgegebeneBlockProps {
  eintraege: AusgegebenerCoin[]
  ebene: Ebene
}

/** „Meistausgegebene Coins“ (AK-7) als Rangliste mit „{n} ausgegeben“; nie Empfängerdaten. */
export function MeistausgegebeneBlock({ eintraege, ebene }: MeistausgegebeneBlockProps) {
  return (
    <BlockAbschnitt titel="Meistausgegebene Coins" ebene={ebene}>
      {eintraege.length === 0 ? (
        <Leerzustand titel="Noch keine Coins ausgegeben." titelEbene={ebene === 3 ? 4 : 3} />
      ) : (
        <Rangliste
          eintraege={eintraege.map((coin, index) => ({
            id: coin.id,
            rang: index + 1,
            inhalt: (
              <Link
                to={ROUTEN.coinDetail}
                params={{ coinId: coin.id }}
                className="inline-flex min-h-10 items-center font-medium break-words text-primary underline underline-offset-4"
              >
                {coin.name}
              </Link>
            ),
            wert: <span className="text-sm">{`${formatiereZahl(coin.ausgegeben)} ausgegeben`}</span>,
          }))}
        />
      )}
    </BlockAbschnitt>
  )
}
