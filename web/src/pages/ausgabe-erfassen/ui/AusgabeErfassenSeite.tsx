import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { Ausgabe } from '@/entities/ausgabe'
import { ladeCoin, type Coin } from '@/entities/coin'
import { ladeExemplare, type ExemplarSeite } from '@/entities/exemplar'
import { AusgabeFormular } from '@/features/ausgabe-erfassen'
import type { ApiErgebnis } from '@/shared/api'
import { ROUTEN } from '@/shared/config'
import { formatiereZahl } from '@/shared/lib/format'
import { istGuid } from '@/shared/lib/guid'
import { buttonVariants } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Seitenkopf } from '@/shared/ui/seitenkopf'
import { Fehlerzustand, Ladeanzeige, Leerzustand } from '@/shared/ui/zustaende'

const TEXT_AUFLAGE_UNBEKANNT =
  'Für diesen Coin ist keine Auflage erfasst. Ausgaben sind erst nach dem Festlegen der Auflage möglich.'
const TEXT_KEIN_FREI = 'Alle Exemplare dieses Coins sind ausgegeben.'

export interface AusgabeErfassenSeiteProps {
  /** Id aus der URL; keine GUID → „Coin nicht gefunden“ ohne API-Aufruf (AK-26). */
  coinId: string
  /** Nach 201; die Route navigiert zur Detailseite (AK-28). */
  onErfasst: (ausgabe: Ausgabe) => void
}

interface Geladen {
  id: string
  coin: ApiErgebnis<Coin>
  exemplare: ApiErgebnis<ExemplarSeite>
}

/**
 * Seite „Ausgabe erfassen“ (/coins/{id}/ausgaben/neu, coin-ausgaben AK-26 bis AK-29): lädt Coin und Kennzahlen und
 * zeigt das Formular oder den Grund, warum keine Ausgabe möglich ist. Ohne Router-Hooks, kein eigenes <main>.
 */
export function AusgabeErfassenSeite({ coinId, onErfasst }: AusgabeErfassenSeiteProps) {
  const gueltig = istGuid(coinId)
  const [geladen, setGeladen] = useState<Geladen | null>(null)
  // „Erneut versuchen“ lädt mit neuem Versuch genau einmal neu; Schlüssel = Coin-Id und Versuch.
  const [versuch, setVersuch] = useState(0)
  const schluessel = `${coinId}#${versuch}`
  // Laufende Anfragen je Id wiederverwenden (z. B. im StrictMode), damit es je genau einen Request gibt.
  const anfrage = useRef<{ id: string; ergebnis: Promise<Geladen> } | null>(null)

  useEffect(() => {
    if (!gueltig) return
    if (anfrage.current?.id !== schluessel) {
      anfrage.current = {
        id: schluessel,
        ergebnis: Promise.all([ladeCoin(coinId), ladeExemplare(coinId, { seite: 1 })]).then(([coin, exemplare]) => ({
          id: schluessel,
          coin,
          exemplare,
        })),
      }
    }
    let aktiv = true
    void anfrage.current.ergebnis.then((ergebnis) => {
      if (aktiv) setGeladen(ergebnis)
    })
    return () => {
      aktiv = false
    }
  }, [coinId, gueltig, schluessel])

  const aktuell = geladen?.id === schluessel ? geladen : null
  const nichtGefunden = !gueltig || aktuell?.coin.art === 'nichtGefunden' || aktuell?.exemplare.art === 'nichtGefunden'
  const zurueck = { to: ROUTEN.coinDetail, params: { coinId } } as const

  if (nichtGefunden) {
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

  if (aktuell === null) {
    return <Ladeanzeige text="Coin wird geladen …" form="karte" />
  }

  if (aktuell.coin.art !== 'ok' || aktuell.exemplare.art !== 'ok') {
    return (
      <div className="grid min-w-0 gap-6">
        <Seitenkopf titel="Ausgabe erfassen" />
        <Fehlerzustand
          meldung="Der Coin konnte nicht geladen werden. Bitte später erneut versuchen."
          onErneutVersuchen={() => setVersuch((n) => n + 1)}
        />
        <Link {...zurueck} className={buttonVariants({ variant: 'outline', className: 'justify-self-start' })}>
          Zurück zum Coin
        </Link>
      </div>
    )
  }

  const coin = aktuell.coin.daten
  const { kennzahlen } = aktuell.exemplare.daten
  const grund =
    kennzahlen.auflage === null ? TEXT_AUFLAGE_UNBEKANNT : kennzahlen.verfuegbar === 0 ? TEXT_KEIN_FREI : null

  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid gap-1">
        <Seitenkopf titel="Ausgabe erfassen" />
        <p className="text-lg break-words">{coin.name}</p>
        {kennzahlen.auflage !== null && (
          <p className="text-muted-foreground">
            {`Verfügbar: ${formatiereZahl(kennzahlen.verfuegbar)} von ${formatiereZahl(kennzahlen.auflage)}`}
          </p>
        )}
      </div>

      <Card className="max-w-reading">
        <CardContent className="grid gap-6">
          {grund ? (
            <>
              <p>{grund}</p>
              <Link {...zurueck} className={buttonVariants({ variant: 'outline', className: 'justify-self-start' })}>
                Zurück zum Coin
              </Link>
            </>
          ) : (
            <>
              <AusgabeFormular coin={coin} kennzahlen={kennzahlen} onErfasst={onErfasst} />
              <Link {...zurueck} className={buttonVariants({ variant: 'outline', className: 'justify-self-start' })}>
                Abbrechen
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
