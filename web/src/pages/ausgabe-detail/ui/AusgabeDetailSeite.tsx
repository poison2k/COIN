import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { AusgabeDetails, AusgabeStatusChip, AusgabeVerlauf, ladeAusgabe, type Ausgabe } from '@/entities/ausgabe'
import { ladeCoin, type Coin } from '@/entities/coin'
import { AusgabeStornieren } from '@/features/ausgabe-stornieren'
import { HologrammnummerAendern } from '@/features/hologrammnummer-aendern'
import { ZertifikatHerunterladen } from '@/features/zertifikat-herunterladen'
import type { ApiErgebnis } from '@/shared/api'
import { ROUTEN } from '@/shared/config'
import { formatiereZahl } from '@/shared/lib/format'
import { istGuid } from '@/shared/lib/guid'
import { Aktionsmeldung } from '@/shared/ui/aktionsmeldung'
import { buttonVariants } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Seitenkopf } from '@/shared/ui/seitenkopf'
import { Fehlerzustand, Inhaltsbereich, Ladeanzeige, Leerzustand } from '@/shared/ui/zustaende'

export interface AusgabeDetailSeiteProps {
  /** Ids aus der URL; keine GUID → „Ausgabe nicht gefunden“ ohne API-Aufruf (AK-27). */
  coinId: string
  ausgabeId: string
  /** Button „Zertifikat herunterladen“ (issues.write, AK-28, AK-29). */
  darfZertifikat: boolean
  /** Button „Hologrammnummer ergänzen/korrigieren“ (issues.write, hologrammnummer AK-27); ohne Angabe nicht sichtbar. */
  darfHologramm?: boolean
  /** Button „Stornieren“ bei aktiver Ausgabe (issues.write, formulare-detailseiten AK-28); ohne Angabe nicht sichtbar. */
  darfStornieren?: boolean
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
 * Seite „Ausgabe“ (/coins/{id}/ausgaben/{ausgabeId}, zertifikat-erzeugen AK-27 bis AK-30, formulare-detailseiten
 * AK-26 bis AK-28): Kopf mit Exemplar, Coin-Name als Link, Status-Chip und den Aktionen „Zertifikat herunterladen“
 * (`darfZertifikat`) und „Stornieren“ (`darfStornieren`, nur aktive Ausgaben); Abschnitte „Zertifikat“ (mit
 * `darfHologramm` das Ergänzen/Korrigieren der Hologrammnummer), „Empfängerdaten“, „Ausgabedaten“ und „Verlauf“. Nach
 * 409 `ausgabe_storniert` lädt die Seite neu und zeigt bis dahin den bisherigen Stand (der Alarm am Button bleibt
 * sichtbar); nach einem Storno zeigt sie die Antwort ohne Neuladen. Ohne Router-Hooks, kein eigenes <main>.
 */
function AusgabeDetailSeiteInhalt({
  coinId,
  ausgabeId,
  darfZertifikat,
  darfHologramm = false,
  darfStornieren = false,
}: AusgabeDetailSeiteProps) {
  const gueltig = istGuid(coinId) && istGuid(ausgabeId)
  const [neuLaden, setNeuLaden] = useState(0)
  const [geladen, setGeladen] = useState<Geladen | null>(null)
  // Laufende Anfragen je Schlüssel wiederverwenden (z. B. im StrictMode), damit es je genau einen Request gibt.
  const anfrage = useRef<{ schluessel: string; ergebnis: Promise<Geladen> } | null>(null)
  const [stornoMeldung, setStornoMeldung] = useState(false)
  const meldungRef = useRef<HTMLDivElement>(null)

  // Nach dem Storno die Statusmeldung fokussieren („Stornieren“ entfällt, AK-28).
  useEffect(() => {
    if (stornoMeldung) meldungRef.current?.focus()
  }, [stornoMeldung])

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
          // Beim Neuladen zeigt die Seite nur die Ladeanzeige, das h1 wird ausgehängt; Ziel ist der Inhaltsbereich (ADR-0047).
          fokusUeberschrift={false}
        />
        <Link to={ROUTEN.coinDetail} params={{ coinId }} className={ZURUECK}>
          Zurück zum Coin
        </Link>
      </div>
    )
  }

  const ausgabe = anzeige.ausgabe.daten
  const coin = anzeige.coin.art === 'ok' ? anzeige.coin.daten : null
  const aktiv = ausgabe.storno === null

  function uebernehmen(neu: Ausgabe) {
    setGeladen((alt) => (alt && alt.ids === ids ? { ...alt, ausgabe: { art: 'ok', daten: neu } } : alt))
  }

  function storniert(neu: Ausgabe) {
    uebernehmen(neu)
    setStornoMeldung(true)
  }

  const aktionen = (darfZertifikat || (darfStornieren && aktiv)) && (
    <>
      {darfZertifikat && (
        <ZertifikatHerunterladen
          coinId={coinId}
          ausgabe={ausgabe}
          variante="seite"
          onStorniertErkannt={() => setNeuLaden((n) => n + 1)}
        />
      )}
      {darfStornieren && aktiv && (
        <AusgabeStornieren coinId={coinId} ausgabe={ausgabe} onStorniert={storniert} variante="gefaehrlich" />
      )}
    </>
  )

  return (
    <div className={LAYOUT}>
      <div className="grid gap-3">
        <Seitenkopf
          titel={`Ausgabe von Exemplar Nr. ${formatiereZahl(ausgabe.exemplarNummer)}`}
          beschreibung={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {coin && (
                <Link
                  to={ROUTEN.coinDetail}
                  params={{ coinId }}
                  className="rounded-sm text-lg break-words text-primary underline underline-offset-4 outline-none hover:text-primary-hover focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {coin.name}
                </Link>
              )}
              <AusgabeStatusChip ausgabe={ausgabe} />
            </span>
          }
          aktionen={aktionen || undefined}
        />
        <Aktionsmeldung
          ref={meldungRef}
          fokussierbar
          meldung={stornoMeldung ? { art: 'erfolg', text: 'Die Ausgabe wurde storniert.' } : null}
        />
      </div>

      <AusgabeDetails
        ausgabe={ausgabe}
        hologrammAktion={
          darfHologramm && (
            <HologrammnummerAendern
              coinId={coinId}
              ausgabe={ausgabe}
              onGeaendert={uebernehmen}
              onNeuLaden={() => setNeuLaden((n) => n + 1)}
            />
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle ebene={2}>Verlauf</CardTitle>
        </CardHeader>
        <CardContent>
          <AusgabeVerlauf ausgabe={ausgabe} />
        </CardContent>
      </Card>

      <Link to={ROUTEN.coinDetail} params={{ coinId }} className={ZURUECK}>
        Zurück zum Coin
      </Link>
    </div>
  )
}

/** Seite in einem stabilen Inhaltsbereich: Fokusziel nach „Erneut versuchen“ mit sichtbarem Fokusring (ADR-0047). */
export function AusgabeDetailSeite(props: AusgabeDetailSeiteProps) {
  return (
    <Inhaltsbereich>
      <AusgabeDetailSeiteInhalt {...props} />
    </Inhaltsbereich>
  )
}
