import type { Coin } from '../api/types'

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
    return <p>Noch keine Coins erfasst.</p>
  }

  return (
    <table className="coin-liste">
      <thead>
        <tr>
          <th scope="col">Bild</th>
          <th scope="col">Name</th>
          <th scope="col">Herausgeber</th>
          <th scope="col">Auflage</th>
          <th scope="col">Erfasst am</th>
        </tr>
      </thead>
      <tbody>
        {coins.map((coin) => (
          <tr key={coin.id}>
            <td>
              {coin.bildUrl ? (
                <img
                  className="coin-vorschau"
                  src={coin.bildUrl}
                  alt={`Motiv: ${coin.name}`}
                  loading="lazy"
                  width={64}
                  height={64}
                />
              ) : (
                <span className="kein-bild">Kein Bild</span>
              )}
            </td>
            <td>{coin.name}</td>
            <td>{coin.herausgeber}</td>
            <td>{coin.auflage ?? 'unbekannt'}</td>
            <td>{formatiereDatum(coin.erstelltAm)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
