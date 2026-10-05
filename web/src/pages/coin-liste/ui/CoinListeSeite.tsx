import { useEffect, useState } from 'react'
import { CoinListe, ladeCoins, type Coin } from '@/entities/coin'
import { CoinFormular } from '@/features/coin-anlegen'

type Zustand = { art: 'laedt' } | { art: 'fehler' } | { art: 'bereit'; coins: Coin[] }

function sortiere(coins: Coin[]): Coin[] {
  return [...coins].sort(
    (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'de') || a.id.localeCompare(b.id),
  )
}

/**
 * Seite „Coin-Liste“ (/coins): Formular „Coin anlegen“ und Katalogliste (AK-28, AK-29, AK-33).
 * Rendert kein eigenes <main>; das Landmark stellt die App-Shell (SidebarInset).
 */
export function CoinListeSeite() {
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
    <div className="mx-auto grid w-full max-w-5xl gap-8 p-6">
      <h1 className="text-2xl font-semibold">Coin-Katalog</h1>

      <section aria-labelledby="ueberschrift-anlegen" className="grid gap-4">
        <h2 id="ueberschrift-anlegen" className="text-lg font-semibold">
          Neuen Coin erfassen
        </h2>
        <CoinFormular onGespeichert={gespeichert} />
      </section>

      <section aria-labelledby="ueberschrift-liste" className="grid gap-4">
        <h2 id="ueberschrift-liste" className="text-lg font-semibold">
          Katalog
        </h2>
        {zustand.art === 'laedt' && <p role="status">Coins werden geladen …</p>}
        {zustand.art === 'fehler' && (
          <p role="alert" className="text-destructive">
            Coins konnten nicht geladen werden. Bitte später erneut versuchen.
          </p>
        )}
        {zustand.art === 'bereit' && <CoinListe coins={zustand.coins} />}
      </section>
    </div>
  )
}
