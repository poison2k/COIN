import type { Coin } from '../model/types'
import { formatiereAuflage, formatiereDatum } from './format'

export interface CoinStammdatenProps {
  coin: Coin
}

/**
 * Stammdaten eines Coins für die Detailseite (katalog-seiten, AK-18): Motivbild (höchstens 320 × 320 px) und
 * Beschreibungsliste. Inhalte werden als Text gerendert, nie als HTML.
 */
export function CoinStammdaten({ coin }: CoinStammdatenProps) {
  return (
    <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
      {coin.bildUrl ? (
        <img
          className="block h-auto max-h-80 w-auto max-w-80 rounded-lg border object-contain"
          src={coin.bildUrl}
          alt={`Motiv: ${coin.name}`}
          width={320}
          height={320}
        />
      ) : (
        <p className="text-muted-foreground">Kein Motivbild vorhanden.</p>
      )}
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
        <dt className="font-medium">Herausgeber</dt>
        <dd className="break-words">{coin.herausgeber}</dd>
        <dt className="font-medium">Auflage</dt>
        <dd>{formatiereAuflage(coin.auflage)}</dd>
        <dt className="font-medium">Erfasst am</dt>
        <dd>{formatiereDatum(coin.erstelltAm)}</dd>
        <dt className="font-medium">Beschreibung</dt>
        <dd className="break-words whitespace-pre-line">
          {coin.beschreibung ?? <span className="text-muted-foreground">Keine Beschreibung</span>}
        </dd>
      </dl>
    </div>
  )
}
