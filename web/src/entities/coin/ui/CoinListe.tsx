import { Link } from '@tanstack/react-router'
import { ROUTEN } from '@/shared/config'
import { useZeilenklick } from '@/shared/lib/hooks'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import type { Coin } from '../model/types'
import { formatiereAuflage, formatiereDatum } from './format'

export interface CoinListeProps {
  coins: Coin[]
}

/**
 * Katalogliste als Tabelle (AK-28). Inhalte werden als Text gerendert, nie als HTML. Ein Mausklick irgendwo in der Zeile
 * öffnet die Detailseite über den Namens-Link (katalog-seiten AK-15; Logik in `useZeilenklick`, ADR-0041 Punkt 6).
 */
export function CoinListe({ coins }: CoinListeProps) {
  const { zeileGeklickt, linkGeklickt } = useZeilenklick()
  if (coins.length === 0) {
    return <p className="text-muted-foreground">Noch keine Coins erfasst.</p>
  }

  return (
    <Table>
      <TableCaption className="sr-only">Coins</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Bild</TableHead>
          <TableHead scope="col">Name</TableHead>
          <TableHead scope="col">Herausgeber</TableHead>
          <TableHead scope="col">Auflage</TableHead>
          <TableHead scope="col">Erfasst am</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {coins.map((coin) => (
          <TableRow key={coin.id} className="cursor-pointer" onClick={zeileGeklickt}>
            <TableCell>
              {coin.bildUrl ? (
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
              )}
            </TableCell>
            <TableCell>
              <Link
                to={ROUTEN.coinDetail}
                params={{ coinId: coin.id }}
                onClick={linkGeklickt}
                className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
              >
                {coin.name}
              </Link>
            </TableCell>
            <TableCell>{coin.herausgeber}</TableCell>
            <TableCell>{formatiereAuflage(coin.auflage)}</TableCell>
            <TableCell>{formatiereDatum(coin.erstelltAm)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
