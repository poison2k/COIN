import { Link } from '@tanstack/react-router'
import { ROUTEN } from '@/shared/config'
import { useZeilenklick } from '@/shared/lib/hooks'
import { Badge } from '@/shared/ui/badge'
import { DatenTabelle, type DatenSpalte } from '@/shared/ui/daten-tabelle'
import type { Coin } from '../model/types'
import { formatiereAuflage, formatiereDatum } from './format'

export interface CoinListeProps {
  coins: Coin[]
}

/** Feste Sortierung der API (Name aufsteigend), nur per aria-sort angezeigt (ADR-0046 Punkt 2). */
const SORTIERUNG = { spalte: 'name', richtung: 'aufsteigend' } as const

function CoinLink({ coin }: { coin: Coin }) {
  // Zustandslos; dieselben Funktionen nutzt die Zeile der DatenTabelle (ADR-0041 Punkt 6).
  const { linkGeklickt } = useZeilenklick()
  return (
    <Link
      to={ROUTEN.coinDetail}
      params={{ coinId: coin.id }}
      onClick={linkGeklickt}
      className="inline-flex min-h-10 items-center rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
    >
      {coin.name}
    </Link>
  )
}

const SPALTEN: ReadonlyArray<DatenSpalte<Coin>> = [
  {
    id: 'bild',
    titel: 'Bild',
    breite: 'schmal',
    karte: 'feld',
    zelle: (coin) =>
      coin.bildUrl ? (
        <img
          className="block size-16 object-contain"
          src={coin.bildUrl}
          alt={`Motiv: ${coin.name}`}
          loading="lazy"
          width={64}
          height={64}
        />
      ) : (
        <span className="text-sm text-muted-foreground">Kein Bild</span>
      ),
  },
  { id: 'name', titel: 'Name', breite: 'mittel', karte: 'titel', zelle: (coin) => <CoinLink coin={coin} /> },
  { id: 'herausgeber', titel: 'Herausgeber', breite: 'breit', karte: 'feld', zelle: (coin) => coin.herausgeber },
  {
    id: 'auflage',
    titel: 'Auflage',
    breite: 'schmal',
    ausrichtung: 'rechts',
    karte: 'feld',
    // Ohne Auflage ein Chip mit genau dem Text „unbekannt“ (startseite-listen-pruefung AK-14, F3).
    zelle: (coin) =>
      coin.auflage === null ? (
        <Badge variant="warning">{formatiereAuflage(null)}</Badge>
      ) : (
        formatiereAuflage(coin.auflage)
      ),
  },
  {
    id: 'erstelltAm',
    titel: 'Erfasst am',
    breite: 'mittel',
    karte: 'feld',
    zelle: (coin) => formatiereDatum(coin.erstelltAm),
  },
]

/**
 * Katalogliste über `DatenTabelle` (AK-28, ADR-0046): Tabelle „Coins“ ab 768 px, darunter Karten. Inhalte werden als
 * Text gerendert, nie als HTML. Ein Mausklick in die Zeile öffnet die Detailseite über den Namens-Link (katalog-seiten
 * AK-15, ADR-0041 Punkt 6).
 */
export function CoinListe({ coins }: CoinListeProps) {
  return (
    <DatenTabelle
      beschriftung="Coins"
      zeilen={coins}
      schluessel={(coin) => coin.id}
      spalten={SPALTEN}
      sortierung={SORTIERUNG}
      zeilenklick
      kartenUnter="md"
      leer="Noch keine Coins erfasst."
    />
  )
}
