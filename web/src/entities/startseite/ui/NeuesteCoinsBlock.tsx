import { Link } from '@tanstack/react-router'
import { ROUTEN } from '@/shared/config'
import { Leerzustand } from '@/shared/ui/zustaende'
import type { NeuerCoin } from '../model/types'
import { BlockAbschnitt } from './BlockAbschnitt'
import type { Ebene } from './Ueberschrift'

export interface NeuesteCoinsBlockProps {
  eintraege: NeuerCoin[]
  ebene: Ebene
}

/**
 * „Neueste Coins“ (AK-6): Kacheln mit dekorativem Motivbild (48 px), Name als Link (≥ 40 px), Herausgeber darunter.
 * Spalten nach Breite der Blockkarte (Container-Query): 1, ab 24rem 2, ab 48rem 3 (24 statt 28rem, damit die Paarzeile ab 1024 px zweispaltig bleibt).
 */
export function NeuesteCoinsBlock({ eintraege, ebene }: NeuesteCoinsBlockProps) {
  return (
    <BlockAbschnitt titel="Neueste Coins" ebene={ebene}>
      {eintraege.length === 0 ? (
        <Leerzustand titel="Noch keine Coins im Katalog." titelEbene={ebene === 3 ? 4 : 3} />
      ) : (
        <div className="@container">
          <ul className="grid gap-3 @sm:grid-cols-2 @3xl:grid-cols-3">
            {eintraege.map((coin) => (
              <li key={coin.id} className="flex min-w-0 items-center gap-3 rounded-lg border p-3">
                {coin.bildUrl ? (
                  <img
                    src={coin.bildUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="size-12 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span aria-hidden="true" className="size-12 shrink-0 rounded-md border bg-muted" />
                )}
                <span className="grid min-w-0">
                  <Link
                    to={ROUTEN.coinDetail}
                    params={{ coinId: coin.id }}
                    className="inline-flex min-h-10 items-center font-medium break-words text-primary underline underline-offset-4"
                  >
                    {coin.name}
                  </Link>
                  <span className="text-sm break-words text-muted-foreground">{coin.herausgeber}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </BlockAbschnitt>
  )
}
