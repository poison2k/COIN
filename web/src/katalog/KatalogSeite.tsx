import { useEffect, useState } from 'react'
import { ladeCoins } from '../api/coins'
import type { Coin } from '../api/types'
import { CoinFormular } from './CoinFormular'
import { CoinListe } from './CoinListe'

type Zustand = { art: 'laedt' } | { art: 'fehler' } | { art: 'bereit'; coins: Coin[] }

function sortiere(coins: Coin[]): Coin[] {
  return [...coins].sort(
    (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'de') || a.id.localeCompare(b.id),
  )
}

/** Startseite: Formular „Coin anlegen“ und Katalogliste (AK-28, AK-29, AK-33). */
export function KatalogSeite() {
  const [zustand, setZustand] = useState<Zustand>({ art: 'laedt' })

  useEffect(() => {
    let abgebrochen = false
    void ladeCoins().then((ergebnis) => {
      if (abgebrochen) return
      setZustand((alt) => {
        if (ergebnis.art !== 'ok') return { art: 'fehler' }
        // Während des Ladens angelegte Coins nicht verlieren.
        const neu = alt.art === 'bereit' ? alt.coins.filter((c) => !ergebnis.daten.some((d) => d.id === c.id)) : []
        return { art: 'bereit', coins: sortiere([...ergebnis.daten, ...neu]) }
      })
    })
    return () => {
      abgebrochen = true
    }
  }, [])

  function gespeichert(coin: Coin) {
    setZustand((alt) => {
      const vorhandene = alt.art === 'bereit' ? alt.coins.filter((c) => c.id !== coin.id) : []
      return { art: 'bereit', coins: sortiere([...vorhandene, coin]) }
    })
  }

  return (
    <main className="katalog">
      <h1>Coin-Katalog</h1>

      <section aria-labelledby="ueberschrift-anlegen">
        <h2 id="ueberschrift-anlegen">Neuen Coin erfassen</h2>
        <CoinFormular onGespeichert={gespeichert} />
      </section>

      <section aria-labelledby="ueberschrift-liste">
        <h2 id="ueberschrift-liste">Katalog</h2>
        {zustand.art === 'laedt' && <p role="status">Coins werden geladen …</p>}
        {zustand.art === 'fehler' && (
          <p role="alert">Coins konnten nicht geladen werden. Bitte später erneut versuchen.</p>
        )}
        {zustand.art === 'bereit' && <CoinListe coins={zustand.coins} />}
      </section>
    </main>
  )
}
