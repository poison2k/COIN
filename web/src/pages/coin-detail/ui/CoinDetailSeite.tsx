import { Link } from '@tanstack/react-router'
import { PencilIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CoinStammdaten, ladeCoin, type Coin } from '@/entities/coin'
import type { ExemplarStatus } from '@/entities/exemplar'
import { AusgabenHistorie } from '@/widgets/ausgaben-historie'
import { CoinExemplare } from '@/widgets/coin-exemplare'
import type { ApiErgebnis } from '@/shared/api'
import { istGuid } from '@/shared/lib/guid'
import { ROUTEN } from '@/shared/config'
import { buttonVariants } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Seitenkopf } from '@/shared/ui/seitenkopf'
import { Fehlerzustand, Ladeanzeige, Leerzustand } from '@/shared/ui/zustaende'

/** Meldung nach dem Anlegen: mit gespeichertem (oder ohne gewähltes) Bild bzw. bewusst ohne Motivbild. */
export type CoinAngelegtMeldung = 'mitBild' | 'ohneBild'

/** Meldung nach dem Speichern auf „Coin bearbeiten“ (zertifikatsvorlagen, AK-28). */
export type CoinGeaendertMeldung = 'coinGeaendert'

/** Meldung nach dem Erfassen einer Ausgabe; nur die Nummer, nie der Empfänger (coin-ausgaben AK-28). */
export interface AusgabeErfasstMeldung {
  art: 'ausgabeErfasst'
  nummer: number
}

export type CoinDetailMeldung = CoinAngelegtMeldung | CoinGeaendertMeldung | AusgabeErfasstMeldung

/** Welche Abschnitte und Aktionen die Seite zeigt; abgeleitet aus den Berechtigungen (ADR-0021). */
export interface CoinDetailBerechtigungen {
  /** Abschnitt „Exemplare“ (coins.read). */
  exemplare: boolean
  /** Abschnitt „Ausgabehistorie“ (issues.read). */
  historie: boolean
  /** „Ausgabe erfassen“, „Stornieren“ und „Zertifikat herunterladen“ (issues.write). */
  erfassen: boolean
  /** „Auflage ändern“ (coins.write). */
  auflage: boolean
  /** Link „Bearbeiten“ zur Seite „Coin bearbeiten“ (coins.write, zertifikatsvorlagen AK-27). */
  bearbeiten: boolean
}

export interface CoinDetailSeiteProps {
  /** Id aus der URL; keine GUID → „Coin nicht gefunden“ ohne API-Aufruf (katalog-seiten, AK-8). */
  coinId: string
  /** Erfolgsmeldung direkt nach dem Anlegen (AK-22/AK-23) bzw. nach dem Erfassen einer Ausgabe (coin-ausgaben AK-28). */
  meldung?: CoinDetailMeldung
  berechtigungen: CoinDetailBerechtigungen
  /** Filter der Exemplare aus der URL. */
  status?: ExemplarStatus
  /** Seite der Exemplare aus der URL. */
  seite: number
  onStatus: (status?: ExemplarStatus) => void
  onSeite: (seite: number) => void
}

const MELDUNGEN: Record<CoinAngelegtMeldung | CoinGeaendertMeldung, string> = {
  mitBild: 'Coin wurde angelegt.',
  ohneBild: 'Coin wurde ohne Motivbild angelegt.',
  coinGeaendert: 'Änderungen wurden gespeichert.',
}

function meldungsText(meldung: CoinDetailMeldung): string {
  return typeof meldung === 'string' ? MELDUNGEN[meldung] : `Exemplar Nr. ${meldung.nummer} wurde ausgegeben.`
}

const NICHT_GEFUNDEN: ApiErgebnis<Coin> = { art: 'nichtGefunden' }

/**
 * Detailseite eines Coins (/coins/{id}, katalog-seiten AK-17 bis AK-20, coin-ausgaben AK-20 bis AK-25): Stammdaten,
 * Motivbild und je nach Berechtigung die Abschnitte „Exemplare“ und „Ausgabehistorie“. Ohne Berechtigung fehlen die
 * Abschnitte samt Request. Rendert kein eigenes <main>.
 */
export function CoinDetailSeite({
  coinId,
  meldung,
  berechtigungen,
  status,
  seite,
  onStatus,
  onSeite,
}: CoinDetailSeiteProps) {
  const gueltig = istGuid(coinId)
  const [geladen, setGeladen] = useState<{ id: string; ergebnis: ApiErgebnis<Coin> } | null>(null)
  // „Erneut versuchen“ lädt mit neuem Versuch genau einmal neu; Schlüssel = Coin-Id und Versuch.
  const [versuch, setVersuch] = useState(0)
  const schluessel = `${coinId}#${versuch}`
  // Nach „Auflage ändern“: Stammdaten aus der Antwort übernehmen (gilt nur für dieselbe Id).
  const [geaendert, setGeaendert] = useState<Coin | null>(null)
  // Nach einem Storno die Kennzahlen neu laden.
  const [exemplareNeuLaden, setExemplareNeuLaden] = useState(0)
  const ueberschrift = useRef<HTMLHeadingElement>(null)
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
  const coin = geladenerCoin && geaendert?.id === geladenerCoin.id ? geaendert : geladenerCoin

  // Nach dem Anlegen den Fokus auf die Überschrift setzen, damit Screenreader die neue Seite ansagen (AK-22).
  const coinDa = coin !== null
  useEffect(() => {
    if (coinDa && meldung) ueberschrift.current?.focus()
  }, [coinDa, meldung])

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
      <div className="grid gap-2">
        <Seitenkopf
          titel={coin.name}
          titelRef={ueberschrift}
          titelFokussierbar
          aktionen={
            berechtigungen.bearbeiten && (
              <Link
                to={ROUTEN.coinBearbeiten}
                params={{ coinId: coin.id }}
                className={buttonVariants({ variant: 'outline' })}
              >
                <PencilIcon aria-hidden="true" />
                Bearbeiten
              </Link>
            )
          }
        />
        {meldung && (
          <p role="status" className="text-success">
            {meldungsText(meldung)}
          </p>
        )}
      </div>

      <Card>
        <CardContent>
          <CoinStammdaten coin={coin} />
        </CardContent>
      </Card>

      {berechtigungen.exemplare && (
        <Card>
          <CardContent>
            <CoinExemplare
              coinId={coin.id}
              status={status}
              seite={seite}
              neuLaden={exemplareNeuLaden}
              darfErfassen={berechtigungen.erfassen}
              darfAuflageAendern={berechtigungen.auflage}
              onStatus={onStatus}
              onSeite={onSeite}
              onAuflageGeaendert={setGeaendert}
            />
          </CardContent>
        </Card>
      )}

      {berechtigungen.historie && (
        <Card>
          <CardContent>
            <AusgabenHistorie
              coinId={coin.id}
              darfStornieren={berechtigungen.erfassen}
              darfZertifikat={berechtigungen.erfassen}
              onGeaendert={() => setExemplareNeuLaden((n) => n + 1)}
            />
          </CardContent>
        </Card>
      )}

      <Link to={ROUTEN.coinListe} className={buttonVariants({ variant: 'outline', className: 'justify-self-start' })}>
        Zurück zum Katalog
      </Link>
    </div>
  )
}
