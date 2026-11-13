import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { AusgabeDetails, ladeAusgabe, type Ausgabe } from '@/entities/ausgabe'
import { ladeCoin, type Coin } from '@/entities/coin'
import { HologrammnummerAendern } from '@/features/hologrammnummer-aendern'
import { ZertifikatHerunterladen } from '@/features/zertifikat-herunterladen'
import type { ApiErgebnis } from '@/shared/api'
import { ROUTEN } from '@/shared/config'
import { formatiereZahl } from '@/shared/lib/format'
import { istGuid } from '@/shared/lib/guid'
import { buttonVariants } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Seitenkopf } from '@/shared/ui/seitenkopf'
import { Fehlerzustand, Ladeanzeige, Leerzustand } from '@/shared/ui/zustaende'

export interface AusgabeDetailSeiteProps {
  /** Ids aus der URL; keine GUID → „Ausgabe nicht gefunden“ ohne API-Aufruf (AK-27). */
  coinId: string
  ausgabeId: string
  /** Button „Zertifikat herunterladen“ (issues.write, AK-28, AK-29). */
  darfZertifikat: boolean
  /** Button „Hologrammnummer ergänzen/korrigieren“ (issues.write, hologrammnummer AK-27); ohne Angabe nicht sichtbar. */
  darfHologramm?: boolean
}

interface Geladen {
  /** Coin und Ausgabe, zu denen das Ergebnis gehört. */
  ids: string
  /** Ladevorgang (Ids und Zähler für das Neuladen). */
  schluessel: string
  coin: ApiErgebnis<Coin>
  ausgabe: ApiErgebnis<Ausgabe>
}

const LAYOUT = 'grid min-w-0 gap-6'
const ZURUECK = buttonVariants({ variant: 'outline', className: 'justify-self-start' })

/**
 * Seite „Ausgabe“ (/coins/{id}/ausgaben/{ausgabeId}, zertifikat-erzeugen AK-27 bis AK-30): Überschrift mit Exemplar,
 * Coin-Name als Link, Angaben der Ausgabe, mit `darfHologramm` das Ergänzen/Korrigieren der Hologrammnummer
 * (hologrammnummer AK-27) und, mit `darfZertifikat`, der Download. Nach 409 `ausgabe_storniert` lädt
 * die Seite neu und zeigt bis dahin den bisherigen Stand (der Alarm am Button bleibt sichtbar). Ohne Router-Hooks,
 * kein eigenes <main>.
 */
export function AusgabeDetailSeite({
  coinId,
  ausgabeId,
  darfZertifikat,
  darfHologramm = false,
}: AusgabeDetailSeiteProps) {
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
      <Leerzustand
        titel="Ausgabe nicht gefunden"
        titelEbene={1}
        beschreibung="Diese Ausgabe gibt es nicht."
        aktion={
          coinBekannt ? (
            <Link to={ROUTEN.coinDetail} params={{ coinId }} className={ZURUECK}>
              Zurück zum Coin
            </Link>
          ) : (
            <Link to={ROUTEN.coinListe} className={buttonVariants()}>
              Zum Katalog
            </Link>
          )
        }
      />
    )
  }

  if (anzeige === null) {
    return <Ladeanzeige text="Ausgabe wird geladen …" form="karte" />
  }

  if (anzeige.ausgabe.art !== 'ok') {
    return (
      <div className={LAYOUT}>
        <Seitenkopf titel="Ausgabe" />
        <Fehlerzustand
          meldung="Die Ausgabe konnte nicht geladen werden. Bitte später erneut versuchen."
          onErneutVersuchen={() => setNeuLaden((n) => n + 1)}
        />
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
      <Seitenkopf
        titel={`Ausgabe von Exemplar Nr. ${formatiereZahl(ausgabe.exemplarNummer)}`}
        beschreibung={
          coin && (
            <Link
              to={ROUTEN.coinDetail}
              params={{ coinId }}
              className="rounded-sm text-lg break-words text-primary underline underline-offset-4 outline-none hover:text-primary-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              {coin.name}
            </Link>
          )
        }
      />

      <Card>
        <CardContent>
          <AusgabeDetails ausgabe={ausgabe} />
        </CardContent>
      </Card>

      {darfHologramm && (
        <HologrammnummerAendern
          coinId={coinId}
          ausgabe={ausgabe}
          onGeaendert={(neu) =>
            setGeladen((alt) => (alt && alt.ids === ids ? { ...alt, ausgabe: { art: 'ok', daten: neu } } : alt))
          }
          onNeuLaden={() => setNeuLaden((n) => n + 1)}
        />
      )}

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
