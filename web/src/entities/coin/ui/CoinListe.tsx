import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import type { Coin } from '../model/types'

const datumsFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

function formatiereDatum(iso: string): string {
  const datum = new Date(iso)
  return Number.isNaN(datum.getTime()) ? '' : datumsFormat.format(datum)
}

export interface CoinListeProps {
  coins: Coin[]
}

/** Katalogliste als Tabelle (AK-28). Inhalte werden als Text gerendert, nie als HTML. */
export function CoinListe({ coins }: CoinListeProps) {
  if (coins.length === 0) {
    return <p className="text-muted-foreground">Noch keine Coins erfasst.</p>
  }

  return (
    <Table>
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
          <TableRow key={coin.id}>
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
            <TableCell>{coin.name}</TableCell>
            <TableCell>{coin.herausgeber}</TableCell>
            <TableCell>{coin.auflage ?? 'unbekannt'}</TableCell>
            <TableCell>{formatiereDatum(coin.erstelltAm)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
