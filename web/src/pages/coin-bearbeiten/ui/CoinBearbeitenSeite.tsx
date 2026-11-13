import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ladeCoin, type Coin } from '@/entities/coin'
import { CoinBearbeitenFormular } from '@/features/coin-bearbeiten'
import { MotivbildHochladen } from '@/features/motivbild-hochladen'
import type { ApiErgebnis } from '@/shared/api'
import { ROUTEN } from '@/shared/config'
import { istGuid } from '@/shared/lib/guid'
import { buttonVariants } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Seitenkopf } from '@/shared/ui/seitenkopf'
import { Fehlerzustand, Ladeanzeige, Leerzustand } from '@/shared/ui/zustaende'
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
  // „Erneut versuchen“ lädt mit neuem Versuch genau einmal neu; Schlüssel = Coin-Id und Versuch.
  const [versuch, setVersuch] = useState(0)
  const schluessel = `${coinId}#${versuch}`
  // Nach dem Bild-Upload: Coin aus der Antwort übernehmen (gilt nur für dieselbe Id).
  const [aktualisiert, setAktualisiert] = useState<Coin | null>(null)
  // Laufende Anfrage je Id wiederverwenden (z. B. im StrictMode), damit es genau einen Request gibt.
  const anfrage = useRef<{ id: string; ergebnis: Promise<ApiErgebnis<Coin>> } | null>(null)

  useEffect(() => {
    if (!gueltig) return
    if (anfrage.current?.id !== schluessel) anfrage.current = { id: schluessel, ergebnis: ladeCoin(coinId) }
    let aktiv = true
    void anfrage.current.ergebnis.then((ergebnis) => {
      if (aktiv) setGeladen({ id: schluessel, ergebnis })
    })
    return () => {
      aktiv = false
    }
  }, [coinId, gueltig, schluessel])

  const ergebnis = !gueltig ? NICHT_GEFUNDEN : geladen?.id === schluessel ? geladen.ergebnis : null
  const geladenerCoin = ergebnis?.art === 'ok' ? ergebnis.daten : null
  const coin = geladenerCoin && aktualisiert?.id === geladenerCoin.id ? aktualisiert : geladenerCoin

  if (ergebnis === null) {
    return <Ladeanzeige text="Coin wird geladen …" form="karte" />
  }

  if (ergebnis.art === 'nichtGefunden') {
    return (
      <Leerzustand
        titel="Coin nicht gefunden"
        titelEbene={1}
        beschreibung="Diesen Coin gibt es nicht im Katalog."
        aktion={
          <Link to={ROUTEN.coinListe} className={buttonVariants()}>
            Zum Katalog
          </Link>
        }
      />
    )
  }

  if (coin === null) {
    return (
      <Fehlerzustand
        meldung="Der Coin konnte nicht geladen werden. Bitte später erneut versuchen."
        onErneutVersuchen={() => setVersuch((n) => n + 1)}
      />
    )
  }

  return (
    <div className="grid min-w-0 gap-6">
      <Seitenkopf titel="Coin bearbeiten" beschreibung={coin.name} />

      <Card>
        <CardContent>
          <section aria-labelledby="coin-bearbeiten-stammdaten" className="grid gap-4">
            <h2 id="coin-bearbeiten-stammdaten" className="text-xl font-semibold">
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
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <section aria-labelledby="coin-bearbeiten-motivbild" className="grid gap-4">
            <h2 id="coin-bearbeiten-motivbild" className="text-xl font-semibold">
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
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <ZertifikatsvorlageVerwalten coinId={coin.id} />
        </CardContent>
      </Card>
    </div>
  )
}
