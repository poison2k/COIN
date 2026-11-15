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
import { VerlassenWarnung } from '@/shared/ui/verlassen-warnung'
import { Fehlerzustand, Ladeanzeige, Leerzustand } from '@/shared/ui/zustaende'

export interface CoinBearbeitenSeiteProps {
  /** Id aus der URL; keine GUID → „Coin nicht gefunden“ ohne API-Aufruf. */
  coinId: string
  /** Nach dem Speichern der Stammdaten; die Navigation zur Detailseite übernimmt die Route. */
  onGespeichert: (coin: Coin) => void
}

const NICHT_GEFUNDEN: ApiErgebnis<Coin> = { art: 'nichtGefunden' }

/** Verlassen-Warnung bei ungespeicherten Stammdaten (mit oder ohne offenes Motivbild). */
const TEXT_VERLASSEN_STAMMDATEN = 'Die Änderungen am Coin sind nicht gespeichert. Seite trotzdem verlassen?'
/** Verlassen-Warnung, wenn nur noch ein gewähltes, nicht hochgeladenes Motivbild offen ist (G1). */
const TEXT_VERLASSEN_MOTIVBILD =
  'Das ausgewählte Motivbild ist noch nicht hochgeladen. Wenn Sie die Seite verlassen, geht die Auswahl verloren.'

/**
 * Seite „Coin bearbeiten“ (/coins/{id}/bearbeiten, zertifikatsvorlagen AK-26 bis AK-30): Stammdaten und Motivbild.
 * Die Zertifikatsvorlage steht im Reiter „Zertifikatsvorlage“ der Detailseite (formulare-detailseiten F2). Ungespeicherte
 * Stammdaten oder ein gewähltes, nicht hochgeladenes Motivbild sichern das Verlassen ab (AK-13). Rendert kein eigenes
 * <main>.
 */
export function CoinBearbeitenSeite({ coinId, onGespeichert }: CoinBearbeitenSeiteProps) {
  const gueltig = istGuid(coinId)
  const [geladen, setGeladen] = useState<{ id: string; ergebnis: ApiErgebnis<Coin> } | null>(null)
  // „Erneut versuchen“ lädt mit neuem Versuch genau einmal neu; Schlüssel = Coin-Id und Versuch.
  const [versuch, setVersuch] = useState(0)
  const schluessel = `${coinId}#${versuch}`
  // Nach dem Bild-Upload: Coin aus der Antwort übernehmen (gilt nur für dieselbe Id).
  const [aktualisiert, setAktualisiert] = useState<Coin | null>(null)
  // Verlassen-Warnung: geänderte Stammdaten oder ein gewähltes, noch nicht hochgeladenes Motivbild (AK-13).
  const [stammdatenGeaendert, setStammdatenGeaendert] = useState(false)
  const [motivbildGeaendert, setMotivbildGeaendert] = useState(false)
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

      {/* overflow-visible: Die Aktionsleiste klebt unter 768 px am Viewport (sticky), nicht an der Karte. */}
      <Card className="overflow-visible">
        <CardContent>
          <CoinBearbeitenFormular
            key={geladenerCoin?.id}
            coin={coin}
            onGespeichert={onGespeichert}
            onGeaendert={setStammdatenGeaendert}
            abbrechen={
              <Link
                to={ROUTEN.coinDetail}
                params={{ coinId: coin.id }}
                className={buttonVariants({ variant: 'outline' })}
              >
                Abbrechen
              </Link>
            }
          />
        </CardContent>
      </Card>
      <VerlassenWarnung
        aktiv={stammdatenGeaendert || motivbildGeaendert}
        beschreibung={stammdatenGeaendert ? TEXT_VERLASSEN_STAMMDATEN : TEXT_VERLASSEN_MOTIVBILD}
      />

      <Card>
        <CardContent>
          <section aria-labelledby="coin-bearbeiten-motivbild" className="grid gap-4">
            <h2 id="coin-bearbeiten-motivbild" className="text-lg font-semibold tracking-tight">
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
            <MotivbildHochladen coin={coin} onGespeichert={setAktualisiert} onGeaendert={setMotivbildGeaendert} />
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
