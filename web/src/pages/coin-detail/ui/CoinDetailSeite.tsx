import { Link } from '@tanstack/react-router'
import { PencilIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CoinStammdaten, ladeCoin, type Coin } from '@/entities/coin'
import { BestandChips, Kennzahlen, type ExemplarStatus } from '@/entities/exemplar'
import { AuflageAendern } from '@/features/auflage-aendern'
import { AusgabenHistorie } from '@/widgets/ausgaben-historie'
import { CoinExemplare, useExemplare } from '@/widgets/coin-exemplare'
import { ZertifikatsvorlageVerwalten } from '@/widgets/zertifikatsvorlage'
import type { ApiErgebnis } from '@/shared/api'
import { istGuid } from '@/shared/lib/guid'
import { ROUTEN } from '@/shared/config'
import { Badge } from '@/shared/ui/badge'
import { buttonVariants } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { KennzahlKarte, KennzahlRaster } from '@/shared/ui/kennzahl-karte'
import { Seitenkopf } from '@/shared/ui/seitenkopf'
import { Skeleton } from '@/shared/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { VerlassenWarnung } from '@/shared/ui/verlassen-warnung'
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

/** Reiter der Detailseite (formulare-detailseiten, Abschnitt 4.5, ADR-0042); Wert des URL-Parameters `reiter`. */
export type CoinDetailReiter = 'stammdaten' | 'exemplare' | 'ausgaben' | 'vorlage'

/** Welche Abschnitte und Aktionen die Seite zeigt; abgeleitet aus den Berechtigungen (ADR-0021). */
export interface CoinDetailBerechtigungen {
  /** Kennzahlen und Reiter „Exemplare“ (coins.read). */
  exemplare: boolean
  /** Reiter „Ausgaben“ (issues.read). */
  historie: boolean
  /** „Ausgabe erfassen“, „Stornieren“ und „Zertifikat herunterladen“ (issues.write). */
  erfassen: boolean
  /** „Auflage ändern“ (coins.write). */
  auflage: boolean
  /** Link „Bearbeiten“ zur Seite „Coin bearbeiten“ (coins.write, zertifikatsvorlagen AK-27). */
  bearbeiten: boolean
  /** Reiter „Zertifikatsvorlage“ (coins.write, formulare-detailseiten F2). */
  vorlage?: boolean
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
  /** Reiter aus der URL; unbekannt oder nicht erlaubt = Standard (AK-23). */
  reiter?: CoinDetailReiter
  /** Reiterwechsel; die Route schreibt den Wert per `replace` in die URL. */
  onReiter?: (reiter: CoinDetailReiter) => void
}

const MELDUNGEN: Record<CoinAngelegtMeldung | CoinGeaendertMeldung, string> = {
  mitBild: 'Coin wurde angelegt.',
  ohneBild: 'Coin wurde ohne Motivbild angelegt.',
  coinGeaendert: 'Änderungen wurden gespeichert.',
}

const REITER_TITEL: Readonly<Record<CoinDetailReiter, string>> = {
  stammdaten: 'Stammdaten',
  exemplare: 'Exemplare',
  ausgaben: 'Ausgaben',
  vorlage: 'Zertifikatsvorlage',
}

const TEXT_VORLAGE_VERLASSEN = 'Die ausgewählte Vorlage ist nicht hochgeladen. Seite trotzdem verlassen?'

function meldungsText(meldung: CoinDetailMeldung): string {
  return typeof meldung === 'string' ? MELDUNGEN[meldung] : `Exemplar Nr. ${meldung.nummer} wurde ausgegeben.`
}

function istReiter(wert: unknown): wert is CoinDetailReiter {
  return wert === 'stammdaten' || wert === 'exemplare' || wert === 'ausgaben' || wert === 'vorlage'
}

/** Ein Reiterwechsel blockiert nur, wenn sich der Reiter in der URL ändert (Verlassen-Warnung, AK-13). */
function reiterWechsel(von: { search: Record<string, unknown> }, nach: { search: Record<string, unknown> }) {
  return von.search.reiter !== nach.search.reiter
}

const NICHT_GEFUNDEN: ApiErgebnis<Coin> = { art: 'nichtGefunden' }

/**
 * Detailseite eines Coins (/coins/{id}, katalog-seiten AK-17 bis AK-20, coin-ausgaben AK-20 bis AK-25,
 * formulare-detailseiten AK-19 bis AK-25): Kopf mit Status-Chips und Aktionen, Kennzahlenkarten (coins.read) und Reiter
 * „Stammdaten“, „Exemplare“, „Ausgaben“, „Zertifikatsvorlage“ je nach Berechtigung. Ohne coins.read gibt es keine
 * Reiterleiste; Inhalte nicht gewählter Reiter sind nicht im DOM. Rendert kein eigenes <main>.
 */
export function CoinDetailSeite({
  coinId,
  meldung,
  berechtigungen,
  status,
  seite,
  onStatus,
  onSeite,
  reiter,
  onReiter,
}: CoinDetailSeiteProps) {
  const gueltig = istGuid(coinId)
  const [geladen, setGeladen] = useState<{ id: string; ergebnis: ApiErgebnis<Coin> } | null>(null)
  // „Erneut versuchen“ lädt mit neuem Versuch genau einmal neu; Schlüssel = Coin-Id und Versuch.
  const [versuch, setVersuch] = useState(0)
  const schluessel = `${coinId}#${versuch}`
  // Nach „Auflage ändern“: Stammdaten aus der Antwort übernehmen (gilt nur für dieselbe Id).
  const [geaendert, setGeaendert] = useState<Coin | null>(null)
  // Nach einem Storno oder „Auflage ändern“ die Kennzahlen neu laden.
  const [exemplareNeuLaden, setExemplareNeuLaden] = useState(0)
  const [auflageMeldung, setAuflageMeldung] = useState<string | null>(null)
  const [vorlageGeaendert, setVorlageGeaendert] = useState(false)
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

  // Genau eine Anfrage auf …/exemplare je Filter/Seite für Kennzahlen und Reiter „Exemplare“ (AK-21), nur mit coins.read
  // und erst, wenn der Coin existiert.
  const exemplare = useExemplare({
    coinId,
    status,
    seite,
    neuLaden: exemplareNeuLaden,
    aktiv: berechtigungen.exemplare && geladenerCoin !== null,
  })
  const kennzahlen = exemplare.anzeige?.art === 'ok' ? exemplare.anzeige.daten.kennzahlen : null

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

  const erlaubt: CoinDetailReiter[] = ['stammdaten']
  if (berechtigungen.exemplare) erlaubt.push('exemplare')
  if (berechtigungen.exemplare && berechtigungen.historie) erlaubt.push('ausgaben')
  if (berechtigungen.exemplare && berechtigungen.vorlage) erlaubt.push('vorlage')
  const standard: CoinDetailReiter =
    typeof meldung === 'object' && meldung.art === 'ausgabeErfasst' && erlaubt.includes('ausgaben')
      ? 'ausgaben'
      : berechtigungen.exemplare
        ? 'exemplare'
        : 'stammdaten'
  const aktiverReiter: CoinDetailReiter = reiter && erlaubt.includes(reiter) ? reiter : standard
  const mitReitern = erlaubt.length >= 2

  function auflageGeaendert(neu: Coin) {
    setGeaendert(neu)
    setAuflageMeldung('Auflage wurde geändert.')
    setExemplareNeuLaden((n) => n + 1)
  }

  const darfErfassen =
    berechtigungen.erfassen && kennzahlen !== null && kennzahlen.auflage !== null && kennzahlen.verfuegbar > 0
  const aktionen = (berechtigungen.auflage || berechtigungen.bearbeiten || darfErfassen) && (
    <>
      {berechtigungen.auflage && (
        <AuflageAendern coinId={coin.id} auflage={kennzahlen?.auflage ?? coin.auflage} onGeaendert={auflageGeaendert} />
      )}
      {berechtigungen.bearbeiten && (
        <Link
          to={ROUTEN.coinBearbeiten}
          params={{ coinId: coin.id }}
          className={buttonVariants({ variant: 'outline' })}
        >
          <PencilIcon aria-hidden="true" />
          Bearbeiten
        </Link>
      )}
      {darfErfassen && (
        <Link to={ROUTEN.coinAusgabeNeu} params={{ coinId: coin.id }} className={buttonVariants()}>
          Ausgabe erfassen
        </Link>
      )}
    </>
  )

  const chips = (coin.auflage === null || (berechtigungen.exemplare && kennzahlen !== null)) && (
    <span className="flex flex-wrap gap-2">
      {coin.auflage === null && <Badge variant="warning">Auflage unbekannt</Badge>}
      {berechtigungen.exemplare && kennzahlen !== null && coin.auflage !== null && (
        <BestandChips kennzahlen={kennzahlen} />
      )}
    </span>
  )

  const statusText = auflageMeldung ?? (meldung ? meldungsText(meldung) : null)

  function inhalt(art: CoinDetailReiter) {
    if (coin === null) return null
    switch (art) {
      case 'stammdaten':
        return (
          <Card>
            <CardContent className="grid gap-4">
              <h2 className="text-lg font-semibold tracking-tight">Stammdaten</h2>
              <CoinStammdaten coin={coin} />
            </CardContent>
          </Card>
        )
      case 'exemplare':
        return (
          <Card>
            <CardContent>
              <CoinExemplare
                coinId={coin.id}
                status={status}
                seite={seite}
                neuLaden={exemplareNeuLaden}
                darfErfassen={false}
                darfAuflageAendern={false}
                onStatus={onStatus}
                onSeite={onSeite}
                daten={exemplare}
                kennzahlenZeigen={false}
                onErneutVersuchen={() => setExemplareNeuLaden((n) => n + 1)}
              />
            </CardContent>
          </Card>
        )
      case 'ausgaben':
        return (
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
        )
      case 'vorlage':
        return (
          <Card>
            <CardContent>
              <ZertifikatsvorlageVerwalten coinId={coin.id} onGeaendert={setVorlageGeaendert} />
            </CardContent>
          </Card>
        )
    }
  }

  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid gap-3">
        <Seitenkopf
          titel={coin.name}
          titelRef={ueberschrift}
          titelFokussierbar
          beschreibung={chips || undefined}
          aktionen={aktionen || undefined}
        />
        {/* Immer gerendert, damit Screenreader den später eingefügten Text als Änderung der Live-Region ansagen. */}
        <p role="status" className="text-success empty:sr-only">
          {statusText ?? ''}
        </p>
      </div>

      {berechtigungen.exemplare && (kennzahlen !== null || exemplare.ergebnis === null) && (
        <section aria-label="Kennzahlen" aria-busy={kennzahlen === null || undefined}>
          {kennzahlen !== null ? (
            <Kennzahlen kennzahlen={kennzahlen} balken />
          ) : (
            <KennzahlRaster>
              {['Auflage', 'Ausgegeben', 'Verfügbar'].map((begriff) => (
                <KennzahlKarte
                  key={begriff}
                  begriff={begriff}
                  wert={
                    <>
                      <Skeleton aria-hidden="true" className="h-8 w-16" />
                      <span className="sr-only">wird geladen</span>
                    </>
                  }
                />
              ))}
            </KennzahlRaster>
          )}
        </section>
      )}

      {mitReitern ? (
        <Tabs
          value={aktiverReiter}
          onValueChange={(neu) => {
            if (istReiter(neu) && neu !== aktiverReiter) onReiter?.(neu)
          }}
          className="min-w-0 gap-4"
        >
          <TabsList aria-label="Bereiche des Coins" className="max-w-full flex-wrap justify-start">
            {erlaubt.map((art) => (
              <TabsTrigger key={art} value={art} className="flex-none">
                {REITER_TITEL[art]}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={aktiverReiter} className="min-w-0 text-base">
            {inhalt(aktiverReiter)}
          </TabsContent>
        </Tabs>
      ) : (
        inhalt('stammdaten')
      )}

      <VerlassenWarnung
        aktiv={vorlageGeaendert && aktiverReiter === 'vorlage'}
        beschreibung={TEXT_VORLAGE_VERLASSEN}
        blockiere={reiterWechsel}
      />

      <Link to={ROUTEN.coinListe} className={buttonVariants({ variant: 'outline', className: 'justify-self-start' })}>
        Zurück zum Katalog
      </Link>
    </div>
  )
}
