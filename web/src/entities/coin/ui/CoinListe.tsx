import { Link } from '@tanstack/react-router'
import type { MouseEvent } from 'react'
import { ROUTEN } from '@/shared/config'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import type { Coin } from '../model/types'
import { formatiereAuflage, formatiereDatum } from './format'

export interface CoinListeProps {
  coins: Coin[]
}

/**
 * Klick mit der Maus irgendwo in der Zeile öffnet die Detailseite über den Namens-Link der Zeile (katalog-seiten,
 * AK-15). Die Zeile selbst bleibt ohne Tab-Stopp; per Tastatur ist der Link erreichbar.
 */
function zeileGeklickt(e: MouseEvent<HTMLTableRowElement>) {
  if (e.defaultPrevented || e.button !== 0) return
  if (istFolgeklick(e)) return
  // Mit Zusatztaste (neuer Tab, neues Fenster …) nicht still in diesem Tab navigieren.
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
  if (e.target instanceof Element && e.target.closest('a')) return
  // Markierter Text (z. B. zum Kopieren) löst keine Navigation aus.
  if (window.getSelection()?.toString()) return
  e.currentTarget.querySelector('a')?.click()
}

/**
 * Zweiter (oder weiterer) Klick einer Mehrfachklick-Serie, z. B. eines Doppelklicks auf „Vorherige Seite“, während die
 * Tabelle darunter wächst. Er darf keine Detailseite öffnen. Enter und synthetische Klicks haben `detail` 0.
 */
function istFolgeklick(e: MouseEvent) {
  return e.detail >= 2
}

/** Am Namens-Link: Folgeklicks verwerfen, bevor der Router navigiert; `preventDefault` hält auch den Browser ab. */
function linkGeklickt(e: MouseEvent<HTMLAnchorElement>) {
  if (istFolgeklick(e)) e.preventDefault()
}

/** Katalogliste als Tabelle (AK-28). Inhalte werden als Text gerendert, nie als HTML. */
export function CoinListe({ coins }: CoinListeProps) {
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
                className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
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
