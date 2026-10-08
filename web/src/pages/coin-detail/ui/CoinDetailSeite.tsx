import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { CoinStammdaten, ladeCoin, type Coin } from '@/entities/coin'
import type { ApiErgebnis } from '@/shared/api'
import { istGuid } from '@/shared/lib/guid'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'

/** Meldung nach dem Anlegen: mit gespeichertem (oder ohne gewähltes) Bild bzw. bewusst ohne Motivbild. */
export type CoinAngelegtMeldung = 'mitBild' | 'ohneBild'

export interface CoinDetailSeiteProps {
  /** Id aus der URL; keine GUID → „Coin nicht gefunden“ ohne API-Aufruf (katalog-seiten, AK-8). */
  coinId: string
  /** Erfolgsmeldung direkt nach dem Anlegen (AK-22/AK-23). */
  meldung?: CoinAngelegtMeldung
}

const MELDUNGEN: Record<CoinAngelegtMeldung, string> = {
  mitBild: 'Coin wurde angelegt.',
  ohneBild: 'Coin wurde ohne Motivbild angelegt.',
}

const NICHT_GEFUNDEN: ApiErgebnis<Coin> = { art: 'nichtGefunden' }

/**
 * Detailseite eines Coins (/coins/{id}, katalog-seiten AK-17 bis AK-20): Stammdaten, Motivbild und der Platzhalter
 * „Verleihungen“ (statisch, ohne Daten und ohne Request, AK-19). Rendert kein eigenes <main>.
 */
export function CoinDetailSeite({ coinId, meldung }: CoinDetailSeiteProps) {
  const gueltig = istGuid(coinId)
  const [geladen, setGeladen] = useState<{ id: string; ergebnis: ApiErgebnis<Coin> } | null>(null)
  const ueberschrift = useRef<HTMLHeadingElement>(null)
  // Laufende Anfrage je Id wiederverwenden (z. B. im StrictMode), damit es genau einen Request gibt.
  const anfrage = useRef<{ id: string; ergebnis: Promise<ApiErgebnis<Coin>> } | null>(null)

  useEffect(() => {
    if (!gueltig) return
    if (anfrage.current?.id !== coinId) anfrage.current = { id: coinId, ergebnis: ladeCoin(coinId) }
    let aktiv = true
    void anfrage.current.ergebnis.then((ergebnis) => {
      if (aktiv) setGeladen({ id: coinId, ergebnis })
    })
    return () => {
      aktiv = false
    }
  }, [coinId, gueltig])

  const ergebnis = !gueltig ? NICHT_GEFUNDEN : geladen?.id === coinId ? geladen.ergebnis : null
  const coin = ergebnis?.art === 'ok' ? ergebnis.daten : null

  // Nach dem Anlegen den Fokus auf die Überschrift setzen, damit Screenreader die neue Seite ansagen (AK-22).
  useEffect(() => {
    if (coin && meldung) ueberschrift.current?.focus()
  }, [coin, meldung])

  if (ergebnis === null) {
    return (
      <div className="mx-auto grid w-full max-w-5xl p-6">
        <p role="status">Coin wird geladen …</p>
      </div>
    )
  }

  if (ergebnis.art === 'nichtGefunden') {
    return (
      <div className="mx-auto grid w-full max-w-5xl justify-items-start gap-4 p-6">
        <h1 ref={ueberschrift} tabIndex={-1} className="text-2xl font-semibold outline-none">
          Coin nicht gefunden
        </h1>
        <p>Diesen Coin gibt es nicht im Katalog.</p>
        <Link to={ROUTEN.coinListe} className={buttonVariants()}>
          Zum Katalog
        </Link>
      </div>
    )
  }

  if (coin === null) {
    return (
      <div className="mx-auto grid w-full max-w-5xl p-6">
        <p role="alert" className="text-destructive">
          Der Coin konnte nicht geladen werden. Bitte später erneut versuchen.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-6">
      <div className="grid gap-2">
        <h1 ref={ueberschrift} tabIndex={-1} className="text-2xl font-semibold break-words outline-none">
          {coin.name}
        </h1>
        {meldung && (
          <p role="status" className="text-success">
            {MELDUNGEN[meldung]}
          </p>
        )}
      </div>

      <CoinStammdaten coin={coin} />

      <section aria-labelledby="ueberschrift-verleihungen" className="grid gap-2">
        <h2 id="ueberschrift-verleihungen" className="text-lg font-semibold">
          Verleihungen
        </h2>
        <p className="text-muted-foreground">Dieser Bereich wird in einer späteren Version ergänzt.</p>
      </section>

      <Link to={ROUTEN.coinListe} className={buttonVariants({ variant: 'outline', className: 'justify-self-start' })}>
        Zurück zum Katalog
      </Link>
    </div>
  )
}
