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
  // Laufende Anfragen je Id wiederverwenden (z. B. im StrictMode), damit es je genau einen Request gibt.
  const anfrage = useRef<{ id: string; ergebnis: Promise<Geladen> } | null>(null)

  useEffect(() => {
    if (!gueltig) return
    if (anfrage.current?.id !== coinId) {
      anfrage.current = {
        id: coinId,
        ergebnis: Promise.all([ladeCoin(coinId), ladeExemplare(coinId, { seite: 1 })]).then(([coin, exemplare]) => ({
          id: coinId,
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
  }, [coinId, gueltig])

  const aktuell = geladen?.id === coinId ? geladen : null
  const nichtGefunden = !gueltig || aktuell?.coin.art === 'nichtGefunden' || aktuell?.exemplare.art === 'nichtGefunden'
  const zurueck = { to: ROUTEN.coinDetail, params: { coinId } } as const

  if (nichtGefunden) {
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

  if (aktuell === null) {
    return (
      <div className="mx-auto grid w-full max-w-5xl p-6">
        <p role="status">Coin wird geladen …</p>
      </div>
    )
  }

  if (aktuell.coin.art !== 'ok' || aktuell.exemplare.art !== 'ok') {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-4 p-6">
        <h1 className="text-2xl font-semibold">Ausgabe erfassen</h1>
        <p role="alert" className="text-destructive">
          Der Coin konnte nicht geladen werden. Bitte später erneut versuchen.
        </p>
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
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Ausgabe erfassen</h1>
        <p className="text-lg break-words">{coin.name}</p>
        {kennzahlen.auflage !== null && (
          <p className="text-muted-foreground">
            {`Verfügbar: ${formatiereZahl(kennzahlen.verfuegbar)} von ${formatiereZahl(kennzahlen.auflage)}`}
          </p>
        )}
      </div>

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
    </div>
  )
}
