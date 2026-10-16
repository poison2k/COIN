import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ladeCoin, type Coin } from '@/entities/coin'
import { CoinBearbeitenFormular } from '@/features/coin-bearbeiten'
import { MotivbildHochladen } from '@/features/motivbild-hochladen'
import type { ApiErgebnis } from '@/shared/api'
import { ROUTEN } from '@/shared/config'
import { istGuid } from '@/shared/lib/guid'
import { buttonVariants } from '@/shared/ui/button'
import { ZertifikatsvorlageVerwalten } from '@/widgets/zertifikatsvorlage'

export interface CoinBearbeitenSeiteProps {
  /** Id aus der URL; keine GUID → „Coin nicht gefunden“ ohne API-Aufruf. */
  coinId: string
  /** Nach dem Speichern der Stammdaten; die Navigation zur Detailseite übernimmt die Route. */
  onGespeichert: (coin: Coin) => void
}

const NICHT_GEFUNDEN: ApiErgebnis<Coin> = { art: 'nichtGefunden' }

/**
 * Seite „Coin bearbeiten“ (/coins/{id}/bearbeiten, zertifikatsvorlagen AK-26 bis AK-30): Stammdaten, Motivbild und
 * Zertifikatsvorlage. Lädt zuerst den Coin; die Vorlage erst, wenn er existiert. Rendert kein eigenes <main>.
 */
export function CoinBearbeitenSeite({ coinId, onGespeichert }: CoinBearbeitenSeiteProps) {
  const gueltig = istGuid(coinId)
  const [geladen, setGeladen] = useState<{ id: string; ergebnis: ApiErgebnis<Coin> } | null>(null)
  // Nach dem Bild-Upload: Coin aus der Antwort übernehmen (gilt nur für dieselbe Id).
  const [aktualisiert, setAktualisiert] = useState<Coin | null>(null)
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
  const geladenerCoin = ergebnis?.art === 'ok' ? ergebnis.daten : null
  const coin = geladenerCoin && aktualisiert?.id === geladenerCoin.id ? aktualisiert : geladenerCoin

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
        <h1 className="text-2xl font-semibold">Coin nicht gefunden</h1>
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
    <div className="mx-auto grid w-full max-w-5xl gap-8 p-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Coin bearbeiten</h1>
        <p className="break-words text-muted-foreground">{coin.name}</p>
      </div>

      <section aria-labelledby="coin-bearbeiten-stammdaten" className="grid gap-4">
        <h2 id="coin-bearbeiten-stammdaten" className="text-lg font-semibold">
          Stammdaten
        </h2>
        <CoinBearbeitenFormular key={geladenerCoin?.id} coin={coin} onGespeichert={onGespeichert} />
        <Link
          to={ROUTEN.coinDetail}
          params={{ coinId: coin.id }}
          className={buttonVariants({ variant: 'outline', className: 'justify-self-start' })}
        >
          Abbrechen
        </Link>
      </section>

      <section aria-labelledby="coin-bearbeiten-motivbild" className="grid gap-4">
        <h2 id="coin-bearbeiten-motivbild" className="text-lg font-semibold">
          Motivbild
        </h2>
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
        <MotivbildHochladen coin={coin} onGespeichert={setAktualisiert} />
      </section>

      <ZertifikatsvorlageVerwalten coinId={coin.id} />
    </div>
  )
}
