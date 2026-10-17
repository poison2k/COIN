import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { AusgabeDetails, ladeAusgabe, type Ausgabe } from '@/entities/ausgabe'
import { ladeCoin, type Coin } from '@/entities/coin'
import { ZertifikatHerunterladen } from '@/features/zertifikat-herunterladen'
import type { ApiErgebnis } from '@/shared/api'
import { ROUTEN } from '@/shared/config'
import { formatiereZahl } from '@/shared/lib/format'
import { istGuid } from '@/shared/lib/guid'
import { buttonVariants } from '@/shared/ui/button'

export interface AusgabeDetailSeiteProps {
  /** Ids aus der URL; keine GUID → „Ausgabe nicht gefunden“ ohne API-Aufruf (AK-27). */
  coinId: string
  ausgabeId: string
  /** Button „Zertifikat herunterladen“ (issues.write, AK-28, AK-29). */
  darfZertifikat: boolean
}

interface Geladen {
  /** Coin und Ausgabe, zu denen das Ergebnis gehört. */
  ids: string
  /** Ladevorgang (Ids und Zähler für das Neuladen). */
  schluessel: string
  coin: ApiErgebnis<Coin>
  ausgabe: ApiErgebnis<Ausgabe>
}

const LAYOUT = 'mx-auto grid w-full max-w-5xl gap-6 p-6'
const ZURUECK = buttonVariants({ variant: 'outline', className: 'justify-self-start' })

/**
 * Seite „Ausgabe“ (/coins/{id}/ausgaben/{ausgabeId}, zertifikat-erzeugen AK-27 bis AK-30): Überschrift mit Exemplar,
 * Coin-Name als Link, Angaben der Ausgabe und, mit `darfZertifikat`, der Download. Nach 409 `ausgabe_storniert` lädt
 * die Seite neu und zeigt bis dahin den bisherigen Stand (der Alarm am Button bleibt sichtbar). Ohne Router-Hooks,
 * kein eigenes <main>.
 */
export function AusgabeDetailSeite({ coinId, ausgabeId, darfZertifikat }: AusgabeDetailSeiteProps) {
  const gueltig = istGuid(coinId) && istGuid(ausgabeId)
  const [neuLaden, setNeuLaden] = useState(0)
  const [geladen, setGeladen] = useState<Geladen | null>(null)
  // Laufende Anfragen je Schlüssel wiederverwenden (z. B. im StrictMode), damit es je genau einen Request gibt.
  const anfrage = useRef<{ schluessel: string; ergebnis: Promise<Geladen> } | null>(null)

  const ids = JSON.stringify([coinId, ausgabeId])
  const schluessel = JSON.stringify([coinId, ausgabeId, neuLaden])

  useEffect(() => {
    if (!gueltig) return
    if (anfrage.current?.schluessel !== schluessel) {
      anfrage.current = {
        schluessel,
        ergebnis: Promise.all([ladeCoin(coinId), ladeAusgabe(coinId, ausgabeId)]).then(([coin, ausgabe]) => ({
          ids,
          schluessel,
          coin,
          ausgabe,
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
  }, [schluessel, ids, coinId, ausgabeId, gueltig])

  const aktuell = geladen?.schluessel === schluessel ? geladen : null
  // Beim Neuladen bleibt der bisherige Stand derselben Ausgabe stehen.
  const anzeige = aktuell ?? (geladen?.ids === ids && geladen.ausgabe.art === 'ok' ? geladen : null)
  const nichtGefunden = !gueltig || anzeige?.ausgabe.art === 'nichtGefunden'

  if (nichtGefunden) {
    const coinBekannt = gueltig && anzeige?.coin.art === 'ok'
    return (
      <div className={`${LAYOUT} justify-items-start`}>
        <h1 className="text-2xl font-semibold">Ausgabe nicht gefunden</h1>
        <p>Diese Ausgabe gibt es nicht.</p>
        {coinBekannt ? (
          <Link to={ROUTEN.coinDetail} params={{ coinId }} className={ZURUECK}>
            Zurück zum Coin
          </Link>
        ) : (
          <Link to={ROUTEN.coinListe} className={buttonVariants()}>
            Zum Katalog
          </Link>
        )}
      </div>
    )
  }

  if (anzeige === null) {
    return (
      <div className={LAYOUT}>
        <p role="status">Ausgabe wird geladen …</p>
      </div>
    )
  }

  if (anzeige.ausgabe.art !== 'ok') {
    return (
      <div className={LAYOUT}>
        <h1 className="text-2xl font-semibold">Ausgabe</h1>
        <p role="alert" className="text-destructive">
          Die Ausgabe konnte nicht geladen werden. Bitte später erneut versuchen.
        </p>
        <Link to={ROUTEN.coinDetail} params={{ coinId }} className={ZURUECK}>
          Zurück zum Coin
        </Link>
      </div>
    )
  }

  const ausgabe = anzeige.ausgabe.daten
  const coin = anzeige.coin.art === 'ok' ? anzeige.coin.daten : null

  return (
    <div className={LAYOUT}>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{`Ausgabe von Exemplar Nr. ${formatiereZahl(ausgabe.exemplarNummer)}`}</h1>
        {coin && (
          <p className="text-lg break-words">
            <Link
              to={ROUTEN.coinDetail}
              params={{ coinId }}
              className="rounded-sm underline underline-offset-4 outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {coin.name}
            </Link>
          </p>
        )}
      </div>

      <AusgabeDetails ausgabe={ausgabe} />

      {darfZertifikat && (
        <ZertifikatHerunterladen
          coinId={coinId}
          ausgabe={ausgabe}
          variante="seite"
          onStorniertErkannt={() => setNeuLaden((n) => n + 1)}
        />
      )}

      <Link to={ROUTEN.coinDetail} params={{ coinId }} className={ZURUECK}>
        Zurück zum Coin
      </Link>
    </div>
  )
}
